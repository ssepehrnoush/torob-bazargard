"""Runtime settings, read from environment variables (and a local .env for development).

Secrets are only ever read here and passed to the HTTP client; they are never logged.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent  # torob/


def _load_dotenv() -> None:
    """Load KEY=VALUE lines from the first .env found, without overriding real env vars."""
    for candidate in (PROJECT_DIR / ".env", PROJECT_DIR.parent / ".env"):
        if not candidate.is_file():
            continue
        for line in candidate.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())
        return


_load_dotenv()

PROVIDERS = {
    # name: (base_url, api-key env var, default model)
    # BoxAPI is an OpenAI-compatible gateway reachable from Iranian data centres (OpenAI is not).
    # gpt-6-sol: the strongest model that still takes function tools on chat/completions (gpt-6.1-sol needs the
    # Responses API); in our scenarios it asked better questions and picked better products than gpt-4.1-mini
    "openai": ("https://api.openai.com/v1", "OPENAI_API_KEY", "gpt-6-sol"),
    "boxapi": ("https://ai.boxapi.ir/ai/v1", "BOXAPI_KEY", "openai/gpt-6-sol"),
}


@dataclass(frozen=True)
class LLMEndpoint:
    name: str
    base_url: str
    api_key: str
    model: str
    extra: dict


def _endpoint(name: str) -> LLMEndpoint | None:
    name = (name or "").strip().lower()
    if name not in PROVIDERS:
        return None
    base, key_var, default_model = PROVIDERS[name]
    key = os.environ.get(key_var, "").strip()
    if not key:
        return None
    model = os.environ.get(f"{name.upper()}_MODEL", "").strip() or default_model
    # GPT-5.x and 6.x only accept function tools on chat/completions with reasoning switched off.
    extra = {"reasoning_effort": "none"} if model.split("/")[-1].startswith(("gpt-5", "gpt-6")) else {}
    return LLMEndpoint(name, os.environ.get(f"{name.upper()}_BASE_URL", base), key, model, extra)


def llm_endpoints() -> list[LLMEndpoint]:
    """Primary provider first, then the fallback (if configured and different).
    LLM_DISABLED=1 is the kill switch: no model is ever called and the app runs rule-based."""
    if os.environ.get("LLM_DISABLED", "").strip().lower() in ("1", "true", "yes"):
        return []
    # the sponsor gateway BoxAPI answers every call; OpenAI is only the backup when BoxAPI fails (out of credit,
    # down). From Iranian data centres OpenAI usually refuses (403), and then the app runs rule-based.
    order = [os.environ.get("LLM_PROVIDER", "boxapi"), os.environ.get("LLM_FALLBACK_PROVIDER", "openai")]
    out: list[LLMEndpoint] = []
    for name in order:
        ep = _endpoint(name)
        if ep and all(e.name != ep.name for e in out):
            out.append(ep)
    return out


DB_PATH = Path(os.environ.get("DB_PATH", str(PROJECT_DIR / "data" / "torob.db")))
STATIC_DIR = Path(os.environ.get("STATIC_DIR", str(PROJECT_DIR / "frontend" / "dist")))
LLM_TIMEOUT_S = float(os.environ.get("LLM_TIMEOUT_S", "45"))
# BoxAPI key limits are 1 concurrent request and ~20/min, shared with another app: stay below them.
LLM_CONCURRENCY = int(os.environ.get("LLM_CONCURRENCY", "1"))
LLM_CALLS_PER_MINUTE = int(os.environ.get("LLM_CALLS_PER_MINUTE", "14"))
LLM_SESSION_CALLS_PER_HOUR = int(os.environ.get("LLM_SESSION_CALLS_PER_HOUR", "60"))
# Current wall-clock can be pinned for demos/tests, e.g. "2026-10-22T11:30" (Tehran time).
FIXED_NOW = os.environ.get("FIXED_NOW", "").strip() or None
