"""Generate the app's illustrations with the OpenAI image API (run once; outputs are committed).

    python -I deploy/make_images.py            # all
    python -I deploy/make_images.py hero       # one
"""
from __future__ import annotations

import base64
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "img"

STYLE = ("Flat vector illustration, clean modern Iranian e-commerce app style, soft rounded shapes, white background, "
         "limited palette: radish red #E91E33, leaf green #6FBC23, slate #1E293B, light slate #F1F5F9, sky blue #3B82F6. "
         "No text, no letters, no logos, no watermark.")

IMAGES = {
    "hero": ("1536x1024", "A young Iranian shopper holding a smartphone with a map pin, standing at the entrance of a busy "
                          "multi-floor Tehran shopping passage (pasaj) with small electronics and mobile-phone storefronts, "
                          "a few location pins floating above shops. " + STYLE),
    "empty": ("1024x1024", "A magnifying glass over a simple city map with a dotted radius circle and no pins inside it, "
                           "a small shop far outside the circle. Calm and friendly. " + STYLE),
    "inquiry": ("1536x1024", "A friendly Iranian shopkeeper behind a small electronics shop counter answering a chat message "
                             "on a phone, speech bubbles with check marks floating between the shop and a customer's phone. "
                             + STYLE),
}


def key() -> str:
    for line in (ROOT.parent / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("OPENAI_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("OPENAI_API_KEY missing")


def generate(name: str, size: str, prompt: str) -> None:
    body = {"model": "gpt-image-1", "prompt": prompt, "size": size, "quality": "medium",
            "output_format": "webp", "output_compression": 82, "n": 1}
    req = urllib.request.Request("https://api.openai.com/v1/images/generations", data=json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {key()}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=240) as r:
        data = json.load(r)
    img = base64.b64decode(data["data"][0]["b64_json"])
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{name}.webp").write_bytes(img)
    print(f"{name}.webp {len(img) // 1024} KB")


if __name__ == "__main__":
    for n in sys.argv[1:] or IMAGES:
        size, prompt = IMAGES[n]
        generate(n, size, prompt)
