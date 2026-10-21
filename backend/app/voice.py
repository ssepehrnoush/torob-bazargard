"""Speech to text and text to speech for the assistant, through the same provider as the chat model (BoxAPI on
Liara). Both go through the chat client's gate and rate limit, so voice can never starve or overspend the
shared key.

BoxAPI has no text-to-speech model; `openai/gpt-audio` (a chat model that answers in audio) reads a text aloud
when told to, and its transcript is compared with the text so a reply that is not a faithful reading is dropped.
"""
from __future__ import annotations

import base64
import difflib
import hashlib
import io
import json
import logging
import re
import time
import wave
from collections import OrderedDict, deque

from . import config, llm

log = logging.getLogger("voice")

STT_MODEL = {"boxapi": "openai/gpt-4o-mini-transcribe", "openai": "gpt-4o-mini-transcribe"}
TTS_MODEL = {"boxapi": "openai/gpt-audio", "openai": "gpt-4o-mini-tts"}
TTS_VOICE = "alloy"
TTS_MAX_CHARS = 600
TTS_PER_HOUR = 60  # new readings per hour for the whole app; cached ones are free
STT_MAX_BYTES = 1_500_000
READ_ALOUD = ("You are a voice-over reader, not an assistant. You never answer, comment or ask anything. "
              "You read aloud, word for word, exactly the Persian text between the markers, in a warm natural "
              "Tehrani voice at a lively pace, then stop.")

_tts_cache: OrderedDict[str, bytes] = OrderedDict()
_tts_recent: deque[float] = deque()


def _endpoint():
    eps = config.llm_endpoints()
    if not eps:
        raise llm.LLMUnavailable("no provider configured (or LLM_DISABLED)")
    return eps[0]


def enabled() -> dict:
    eps = config.llm_endpoints()
    return {"stt": bool(eps) and eps[0].name in STT_MODEL, "tts": bool(eps) and eps[0].name in TTS_MODEL}


async def transcribe(audio: bytes, filename: str, content_type: str, lang: str = "fa") -> str:
    ep = _endpoint()
    async with llm._gate:
        await llm._rate_wait()
        t0 = time.monotonic()
        r = await llm.client().post(
            f"{ep.base_url}/audio/transcriptions", headers={"Authorization": f"Bearer {ep.api_key}"},
            data={"model": STT_MODEL[ep.name], "language": lang or "fa"},
            files={"file": (filename, audio, content_type or "application/octet-stream")})
    if r.status_code >= 400:
        raise llm.LLMUnavailable(f"{ep.name} stt HTTP {r.status_code}: {r.text[:200]}")
    text = (r.json().get("text") or "").strip()
    log.info("stt %s %.1fs %d bytes -> %d chars", ep.name, time.monotonic() - t0, len(audio), len(text))
    return text


def clip_text(text: str) -> str:
    """At most TTS_MAX_CHARS, cut at the end of a sentence when possible."""
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= TTS_MAX_CHARS:
        return text
    cut = max(text.rfind(p, 0, TTS_MAX_CHARS) for p in (".", "؟", "!", "،", "؛"))
    return text[: cut + 1 if cut > TTS_MAX_CHARS // 2 else TTS_MAX_CHARS].strip()


def _letters(s: str) -> str:
    return re.sub(r"[^\w]", "", s.replace("ي", "ی").replace("ك", "ک")).lower()


def _wav(pcm: bytes, rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


async def speak(text: str) -> bytes:
    """WAV bytes of the text read aloud (cached by text)."""
    text = clip_text(text)
    if not text:
        raise ValueError("empty text")
    key = hashlib.sha256(text.encode()).hexdigest()
    if key in _tts_cache:
        _tts_cache.move_to_end(key)
        return _tts_cache[key]
    now = time.monotonic()
    while _tts_recent and now - _tts_recent[0] > 3600:
        _tts_recent.popleft()
    if len(_tts_recent) >= TTS_PER_HOUR:
        raise llm.BudgetExceeded("hourly read-aloud cap reached")
    ep = _endpoint()
    async with llm._gate:
        await llm._rate_wait()
        _tts_recent.append(time.monotonic())
        t0 = time.monotonic()
        audio = await (_speak_openai(ep, text) if ep.name == "openai" else _speak_chat_audio(ep, text))
    log.info("tts %s %.1fs %d chars -> %d bytes", ep.name, time.monotonic() - t0, len(text), len(audio))
    _tts_cache[key] = audio
    while len(_tts_cache) > 200:
        _tts_cache.popitem(last=False)
    return audio


async def _speak_openai(ep, text: str) -> bytes:
    r = await llm.client().post(f"{ep.base_url}/audio/speech", headers={"Authorization": f"Bearer {ep.api_key}"},
                                json={"model": TTS_MODEL["openai"], "voice": TTS_VOICE, "input": text, "response_format": "wav"})
    if r.status_code >= 400:
        raise llm.LLMUnavailable(f"openai tts HTTP {r.status_code}: {r.text[:200]}")
    return r.content


async def _speak_chat_audio(ep, text: str) -> bytes:
    body = {"model": TTS_MODEL[ep.name], "modalities": ["text", "audio"], "audio": {"voice": TTS_VOICE, "format": "pcm16"},
            "stream": True, "temperature": 0,
            "messages": [{"role": "system", "content": READ_ALOUD}, {"role": "user", "content": f"<<<{text}>>>"}]}
    # a faithful reading of N words takes well under N/1.3 s; anything far longer is the model talking on its own
    max_bytes = int((len(text.split()) / 1.3 + 6) * 24000 * 2)
    pcm, transcript = bytearray(), []
    async with llm.client().stream("POST", f"{ep.base_url}/chat/completions", json=body,
                                   headers={"Authorization": f"Bearer {ep.api_key}"}) as r:
        if r.status_code >= 400:
            raise llm.LLMUnavailable(f"{ep.name} tts HTTP {r.status_code}: {(await r.aread())[:200]!r}")
        async for line in r.aiter_lines():
            if not line.startswith("data:") or line.strip() == "data: [DONE]":
                continue
            for ch in json.loads(line[5:]).get("choices", []):
                a = (ch.get("delta") or {}).get("audio") or {}
                if a.get("data"):
                    pcm += base64.b64decode(a["data"])
                if a.get("transcript"):
                    transcript.append(a["transcript"])
            if len(pcm) > max_bytes:
                raise llm.LLMUnavailable("reading ran far longer than the text")
    said = "".join(transcript)
    if difflib.SequenceMatcher(None, _letters(said), _letters(text)).ratio() < 0.75:
        raise llm.LLMUnavailable(f"reading did not match the text: {said[:80]}")
    return _wav(bytes(pcm))
