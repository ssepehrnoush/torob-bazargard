"""Generate the app's illustrations with the OpenAI image API (run once; outputs are committed).

    python -I deploy/make_images.py                      # all, with the chosen model
    python -I deploy/make_images.py hero                 # one
    python -I deploy/make_images.py --compare OUT_DIR    # every candidate model, side by side in OUT_DIR/index.html

Images are generated large, then resized for a 2x phone screen and saved as webp under ~120 KB.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "img"
RAW = ROOT / "deploy" / "img-raw"  # gitignored

# Picked after --compare: sunburst drew the cleanest shapes and kept to the palette best. "max" only helped the
# inquiry scene; for the others "high" reads better at phone size (fewer small props).
MODEL = "gpt-image-2.5-sunburst"
QUALITY = {"inquiry": "max"}
CANDIDATES = ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare", "gpt-image-2", "gpt-image-1.5"]
MAX_BYTES = 120_000

STYLE = ("Soft 3D illustration like the service icons on torob.com: matte clay-like materials, rounded friendly forms, "
         "gentle studio lighting, soft contact shadows, crisp edges, high detail but calm. Pure white background with "
         "generous empty space around the subject. Strict palette: radish red #E91E33 and dark red #BF0F22 as the main "
         "accent, leaf green #6FBC23 and #519A23 as small accents, slate #1E293B and #64748B for dark details, light slate "
         "#E2E8F0 and #F1F5F9 for neutral surfaces, a small touch of blue #3B82F6. Absolutely no text, letters, numbers, "
         "logos, signage words or watermarks anywhere, including on screens, signs and price tags.")

# Banners sit in frames with a fixed aspect ratio (styles.css / the components); the picture is composed for that
# shape and then framed to it exactly, so object-fit never cuts anything at any screen width.
WIDE = ("Wide panoramic banner composition: arrange everything side by side in one horizontal row across the width, "
        "keep every object inside the middle half of the image height with plain white space above and below, and "
        "let nothing touch any edge. ")

# name: (generation size, output width in px, frame aspect ratio w/h, prompt)
IMAGES = {
    "hero": ("1536x1024", 960, 2.0, WIDE +
             "A miniature isometric corner of a Tehran shopping passage: three small storefronts in light slate with "
             "rounded awnings, the middle shop highlighted with a radish-red awning and tiny shelves of phones and "
             "headphones. A large glossy radish-red map pin floats above the highlighted shop. In the foreground a "
             "smartphone lies at an angle, its screen showing only a simple light map with a dotted route from a small "
             "blue dot to a red pin. A small leaf-green sprout grows from a planter beside the shops. " + STYLE),
    "inquiry": ("1536x1024", 960, 2.4, WIDE +
                "A small shop counter in light slate with a smartphone standing on it. Three rounded speech bubbles float "
                "up from the phone: a radish-red bubble with a white check mark, a white bubble with a small leaf-green "
                "price tag shape (blank, no numbers), and a light slate bubble with a simple clock shape. A second "
                "smartphone in the foreground on the right is connected to the shop phone by a soft dotted line. " + STYLE),
    "empty": ("1024x1024", 480, 1.0,
              "A magnifying glass resting over a small folded paper map in light slate. A dashed circle is drawn on the "
              "map and the area inside the circle is empty. One tiny storefront with a radish-red awning sits far outside "
              "the circle near the edge of the map. Calm and minimal, lots of white space. " + STYLE),
}


def key() -> str:
    for line in (ROOT.parent / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("OPENAI_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("OPENAI_API_KEY missing")


def call(model: str, size: str, prompt: str, quality: str) -> tuple[bytes, dict]:
    body = {"model": model, "prompt": prompt, "size": size, "quality": quality, "output_format": "png", "n": 1}
    req = urllib.request.Request("https://api.openai.com/v1/images/generations", data=json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {key()}", "Content-Type": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                data = json.load(r)
            return base64.b64decode(data["data"][0]["b64_json"]), data.get("usage") or {}
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")[:300]
            if e.code in (429, 500, 502, 503) and attempt < 2:
                time.sleep(20 * (attempt + 1))
                continue
            raise RuntimeError(f"{model} {e.code}: {msg}") from None
    raise RuntimeError("unreachable")


def to_webp(png: bytes, width: int) -> bytes:
    """Resize for a 2x phone screen and squeeze under MAX_BYTES."""
    from PIL import Image  # system Python has Pillow; the backend venv does not need it

    im = Image.open(io.BytesIO(png)).convert("RGB")
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    for q in (86, 82, 78, 74, 70, 64, 58):
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=q, method=6)
        if buf.tell() <= MAX_BYTES:
            break
    return buf.getvalue()


def fit_to_ratio(png: bytes, ratio: float, margin: float = 0.06) -> bytes:
    """Frame the drawing to the banner's aspect ratio without cutting it: find the bounding box of everything that is
    not background white (soft shadows included), add a margin, grow the box to the ratio, and pad with white where
    the box goes past the generated canvas."""
    from PIL import Image

    # the model's "white" carries a faint gray haze around the subject; lift near-white tones to pure white with a
    # smooth ramp (soft shadows stay) so the white padding added below shows no seam on the white card
    lift = [v if v <= 232 else 255 if v >= 248 else round(v + (255 - v) * (v - 232) / 16) for v in range(256)]
    im = Image.open(io.BytesIO(png)).convert("RGB").point(lift * 3)
    mask = im.convert("L").point(lambda v: 255 if v < 250 else 0)
    box = mask.getbbox() or (0, 0, im.width, im.height)
    w, h = box[2] - box[0], box[3] - box[1]
    pad = round(margin * max(w, h))
    w, h = w + 2 * pad, h + 2 * pad
    if w / h < ratio:
        w = round(h * ratio)
    else:
        h = round(w / ratio)
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    left, top = round(cx - w / 2), round(cy - h / 2)
    canvas = Image.new("RGB", (w, h), (255, 255, 255))
    canvas.paste(im, (-left, -top))
    buf = io.BytesIO()
    canvas.save(buf, "PNG")
    return buf.getvalue()


def generate(name: str, model: str, quality: str, out: Path, suffix: str = "") -> str:
    size, width, ratio, prompt = IMAGES[name]
    t0 = time.time()
    png, usage = call(model, size, prompt, quality)
    RAW.mkdir(parents=True, exist_ok=True)
    (RAW / f"{name}{suffix}.png").write_bytes(png)  # full-size original, outside the app bundle, for re-framing
    webp = to_webp(fit_to_ratio(png, ratio), width)
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{name}{suffix}.webp").write_bytes(webp)
    line = f"{name}{suffix}.webp {len(webp) // 1024} KB, {time.time() - t0:.0f}s, tokens {usage.get('output_tokens', '?')}"
    print(line, flush=True)
    return line


def compare(out: Path, quality: str, names: list[str]) -> None:
    jobs = [(n, m) for m in CANDIDATES for n in names]
    with ThreadPoolExecutor(4) as pool:
        futs = {pool.submit(generate, n, m, quality, out, f"--{m}"): (n, m) for n, m in jobs}
        for f, (n, m) in futs.items():
            try:
                f.result()
            except Exception as e:  # one failing model should not stop the comparison
                print(f"FAILED {n} {m}: {e}", flush=True)
    rows = "".join(
        f"<h2>{n}</h2><div class=row>" + "".join(
            f"<figure><img src='{n}--{m}.webp'><figcaption>{m}</figcaption></figure>"
            for m in CANDIDATES if (out / f"{n}--{m}.webp").exists()) + "</div>"
        for n in names)
    (out / "index.html").write_text(
        "<!doctype html><meta charset=utf-8><style>body{font:14px system-ui;margin:24px;background:#f1f5f9}"
        ".row{display:flex;gap:16px;flex-wrap:wrap}figure{margin:0;background:#fff;padding:8px;border-radius:12px}"
        "img{width:420px;display:block}</style>" + rows, encoding="utf-8")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--quality", default=None, help="default: QUALITY per image, else high")
    ap.add_argument("--compare", metavar="OUT_DIR")
    a = ap.parse_args()
    names = a.names or list(IMAGES)
    if a.compare:
        compare(Path(a.compare), a.quality or "high", names)
    else:
        for n in names:
            generate(n, a.model, a.quality or QUALITY.get(n, "high"), OUT)
