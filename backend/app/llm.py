"""Minimal OpenAI-compatible chat client with provider fallback (OpenAI <-> BoxAPI)."""
from __future__ import annotations

import json
import logging
import time

import httpx

from . import config

log = logging.getLogger("llm")


class LLMUnavailable(RuntimeError):
    pass


_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(config.LLM_TIMEOUT_S, connect=8.0))
    return _client


def available() -> bool:
    return bool(config.llm_endpoints())


def describe() -> dict:
    eps = config.llm_endpoints()
    return {"providers": [{"name": e.name, "model": e.model} for e in eps], "available": bool(eps)}


async def chat(messages: list[dict], tools: list[dict] | None = None, tool_choice: str | dict | None = None,
               temperature: float | None = None, max_tokens: int | None = None,
               json_mode: bool = False) -> dict:
    """Return the assistant message dict. Tries each configured provider in order."""
    errors = []
    for ep in config.llm_endpoints():
        body: dict = {"model": ep.model, "messages": messages, **ep.extra}
        if tools:
            body["tools"] = tools
            body["parallel_tool_calls"] = True
            if tool_choice:
                body["tool_choice"] = tool_choice
        if temperature is not None and not ep.extra.get("reasoning_effort"):
            body["temperature"] = temperature
        if max_tokens:
            body["max_completion_tokens"] = max_tokens
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        t0 = time.monotonic()
        try:
            r = await client().post(f"{ep.base_url}/chat/completions", json=body,
                                    headers={"Authorization": f"Bearer {ep.api_key}"})
            if r.status_code >= 400:
                raise LLMUnavailable(f"{ep.name} HTTP {r.status_code}: {r.text[:300]}")
            data = r.json()
            msg = data["choices"][0]["message"]
            log.info("llm %s/%s %.1fs tools=%s", ep.name, ep.model, time.monotonic() - t0,
                     [c["function"]["name"] for c in msg.get("tool_calls") or []])
            msg["_provider"] = ep.name
            return msg
        except (httpx.HTTPError, LLMUnavailable, KeyError, ValueError) as e:
            log.warning("llm provider %s failed: %s", ep.name, str(e)[:300])
            errors.append(f"{ep.name}: {type(e).__name__}")
    raise LLMUnavailable("; ".join(errors) or "no LLM provider configured")


async def complete_json(system: str, user: str, max_tokens: int = 800) -> dict:
    msg = await chat([{"role": "system", "content": system}, {"role": "user", "content": user}],
                     json_mode=True, max_tokens=max_tokens)
    try:
        return json.loads(msg.get("content") or "{}")
    except ValueError as e:
        raise LLMUnavailable(f"bad json: {e}") from e
