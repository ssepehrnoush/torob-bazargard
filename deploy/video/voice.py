"""Voice-over for the demo video: one clip per narration line with OpenAI text-to-speech (same model, voice and
speaking style as the Liara demo), silence trimmed and sped up to a brisk pace. The recorder then holds each scene
for as long as its clips, so the video is timed to the voice.

    python -I deploy/video/voice.py            # writes _video/voice/*.wav and manifest.json (cached by text)
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NARRATION = Path(__file__).with_name("narration.json")
OUT = ROOT / "_video" / "voice"
MODEL = "gpt-4o-mini-tts-2025-12-15"
VOICE = "ash"
WPS = 3.3  # target words per second after speed-up (same as the Liara video)
STYLE = ("Speak natural, casual Tehrani Persian, like a young developer presenting his own project to friends and "
         "judges. Warm, friendly and confident, never robotic. Speak quickly, a bit faster than normal conversation, "
         "with only very short pauses between sentences. Read the text exactly as written.")


def key() -> str:
    for line in (ROOT.parent / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("OPENAI_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("OPENAI_API_KEY missing")


def speak(text: str, dest: Path) -> None:
    body = {"model": MODEL, "voice": VOICE, "input": text, "instructions": STYLE, "response_format": "wav"}
    req = urllib.request.Request("https://api.openai.com/v1/audio/speech", data=json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {key()}", "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                dest.write_bytes(r.read())
            return
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == 3:
                raise RuntimeError(f"text-to-speech failed for: {text[:40]} ({e})") from None
            time.sleep(2 * (attempt + 1))


def duration(f: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    OUT.mkdir(parents=True, exist_ok=True)
    mpath = OUT / "manifest.json"
    manifest = json.loads(mpath.read_text(encoding="utf-8")) if mpath.exists() else {}
    scenes = json.loads(NARRATION.read_text(encoding="utf-8"))["scenes"]
    made = 0
    for s in scenes:
        for i, line in enumerate(s["lines"]):
            spoken = line.get("speak", line["text"])
            lid = f"{s['id']}-{i}"
            cid = hashlib.sha1(f"{MODEL}|{VOICE}|{WPS}|{spoken}".encode()).hexdigest()[:12]
            wav = OUT / f"{cid}.wav"
            if manifest.get(lid, {}).get("file") == wav.name and wav.exists():
                continue
            raw, trimmed = OUT / f"{cid}.raw.wav", OUT / f"{cid}.trim.wav"
            speak(spoken, raw)
            # trim silence at both ends, shorten inner pauses to 0.15 s, then speed up (pitch kept) to the target pace
            ffmpeg("-i", str(raw), "-af", "silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:"
                   "stop_duration=0.3:stop_threshold=-45dB:stop_silence=0.15,areverse,"
                   "silenceremove=start_periods=1:start_threshold=-45dB,areverse", str(trimmed))
            words = len(spoken.split())
            tempo = min(1.6, max(1.0, WPS / (words / duration(trimmed))))
            ffmpeg("-i", str(trimmed), "-af", f"atempo={tempo:.3f}", "-ar", "48000", "-ac", "1", str(wav))
            raw.unlink()
            trimmed.unlink()
            manifest[lid] = {"file": wav.name, "dur": round(duration(wav), 3), "tempo": round(tempo, 3), "text": line["text"]}
            mpath.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
            made += 1
            print(f"{lid}: {manifest[lid]['dur']:.1f}s x{tempo:.2f}", flush=True)
    total = sum(v["dur"] for v in manifest.values())
    print(f"voice clips: {made} new, {len(manifest)} total, {total:.0f}s of speech -> {OUT}")


if __name__ == "__main__":
    main()
