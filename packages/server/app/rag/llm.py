"""Chat completions for the required LLM.

There is no template fallback: if no provider is configured the request fails
loudly instead of returning text assembled from regexes and pretending to be a
medical answer.
"""

from __future__ import annotations

import os
from typing import Literal

import httpx

from app.models import LlmAvailability, LlmProvider

CLOUD: dict[LlmProvider, dict[str, str]] = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "api_key_env": "OPENAI_API_KEY",
        "model_env": "OPENAI_MODEL",
        "default_model": "gpt-4o-mini",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "api_key_env": "DEEPSEEK_API_KEY",
        "model_env": "DEEPSEEK_MODEL",
        "default_model": "deepseek-chat",
    },
}

REQUEST_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "120"))


class LlmUnavailable(RuntimeError):
    """No key for the requested provider — a configuration error (HTTP 503)."""


class LlmRequestError(RuntimeError):
    """The provider answered with an error, a timeout, or empty content (HTTP 502)."""


def _cloud_key_present(provider: LlmProvider) -> bool:
    return bool(os.getenv(CLOUD[provider]["api_key_env"], "").strip())


def llm_availability() -> LlmAvailability:
    return LlmAvailability(
        openai=_cloud_key_present("openai"),
        deepseek=_cloud_key_present("deepseek"),
    )


def resolve_llm_provider(requested: LlmProvider | None) -> LlmProvider:
    if requested is not None:
        if not _cloud_key_present(requested):
            raise LlmUnavailable(
                f"{requested}: missing API key. Add {CLOUD[requested]['api_key_env']} "
                f"to .env at the repo root (or the compose environment)."
            )
        return requested

    for provider in ("openai", "deepseek"):
        if _cloud_key_present(provider):
            return provider

    raise LlmUnavailable(
        "No LLM configured. Set OPENAI_API_KEY or DEEPSEEK_API_KEY in .env at the repo root."
    )


def complete_chat(provider: LlmProvider, system: str, user: str) -> str:
    config = CLOUD[provider]
    api_key = os.getenv(config["api_key_env"], "").strip()
    if not api_key:
        raise LlmUnavailable(f"{provider}: missing API key.")

    model = os.getenv(config["model_env"], "").strip() or config["default_model"]

    try:
        response = httpx.post(
            f"{config['base_url']}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
            timeout=REQUEST_TIMEOUT,
        )
    except httpx.HTTPError as error:
        raise LlmRequestError(f"{provider} request failed: {error}") from error

    if response.status_code >= 400:
        raise LlmRequestError(
            f"{provider} returned HTTP {response.status_code} for model “{model}”."
        )

    try:
        content = response.json().get("choices", [{}])[0].get("message", {}).get("content")
    except ValueError as error:
        raise LlmRequestError(f"{provider} returned a malformed response.") from error

    if not isinstance(content, str) or not content.strip():
        raise LlmRequestError(f"{provider} returned an empty answer.")

    return content.strip()
