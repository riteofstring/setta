"""Active validation for the Portkey gateway + provider configuration."""

from typing import Iterable

import requests
from requests import RequestException

from setta.llm.config_store import LLMConfig, LLMProviderConfig
from setta.types.llm_config import (
    LLMConfigTestResultPayload,
    LLMGatewayTestResultPayload,
    LLMProviderTestErrorPayload,
    LLMProviderTestResultPayload,
)

REQUEST_TIMEOUT_SECONDS = 5.0
ERROR_SNIPPET_LIMIT = 200


def test_llm_config(
    llm_config: LLMConfig,
    *,
    timeout: float = REQUEST_TIMEOUT_SECONDS,
) -> LLMConfigTestResultPayload:
    """Run connectivity checks for the configured gateway + providers."""

    gateway = _test_gateway(llm_config.gateway_url, timeout=timeout)
    providers = [
        _test_provider(
            provider,
            fallback_gateway_url=llm_config.gateway_url,
            timeout=timeout,
        )
        for provider in llm_config.providers
    ]
    return LLMConfigTestResultPayload(gateway=gateway, providers=providers)


def _test_gateway(
    gateway_url: str,
    *,
    timeout: float,
) -> LLMGatewayTestResultPayload:
    candidates = list(_gateway_health_candidates(gateway_url))
    errors: list[str] = []

    for url in candidates:
        ok, detail = _http_get(url, timeout=timeout)
        if ok:
            return LLMGatewayTestResultPayload(ok=True, url=url)
        errors.append(f"{url}: {detail}")

    if errors:
        message = "; ".join(errors)
    else:
        message = "No health endpoint candidates were generated"

    return LLMGatewayTestResultPayload(
        ok=False,
        url=candidates[0] if candidates else None,
        error=message,
    )


def _test_provider(
    provider: LLMProviderConfig,
    *,
    fallback_gateway_url: str,
    timeout: float,
) -> LLMProviderTestResultPayload:
    base_url = provider.base_url or fallback_gateway_url
    candidates = list(_provider_models_candidates(base_url))
    headers = dict(provider.extra_headers or {})
    header_names = {key.lower() for key in headers}
    if provider.api_key and "authorization" not in header_names:
        headers["Authorization"] = f"Bearer {provider.api_key}"

    missing_authorization = not provider.api_key and "authorization" not in header_names

    errors: list[LLMProviderTestErrorPayload] = []
    for url in candidates:
        ok, detail = _http_get(url, headers=headers or None, timeout=timeout)
        if ok:
            tested_base = _strip_suffix(url, "/models")
            return LLMProviderTestResultPayload(
                provider_id=provider.provider_id,
                display_name=provider.display_name,
                base_url=tested_base,
                ok=True,
                errors=[],
            )
        errors.append(
            LLMProviderTestErrorPayload(
                code="request_failed",
                message=f"{url}: {detail}",
            )
        )

    if missing_authorization:
        errors.insert(
            0,
            LLMProviderTestErrorPayload(
                code="missing_authorization",
                message="Provider API key is empty and no Authorization header is set.",
            ),
        )

    tested_base_url = (
        _strip_suffix(candidates[0], "/models")
        if candidates
        else _normalize_base_url(base_url)
    )
    return LLMProviderTestResultPayload(
        provider_id=provider.provider_id,
        display_name=provider.display_name,
        base_url=tested_base_url,
        ok=False,
        errors=errors,
    )


def _http_get(
    url: str,
    *,
    timeout: float,
    headers: dict[str, str] | None = None,
) -> tuple[bool, str]:
    try:
        response = requests.get(url, headers=headers, timeout=timeout)
    except RequestException as exc:
        return False, str(exc)

    if 200 <= response.status_code < 300:
        return True, ""

    snippet = response.text.strip() or response.reason or ""
    if len(snippet) > ERROR_SNIPPET_LIMIT:
        snippet = f"{snippet[:ERROR_SNIPPET_LIMIT]}..."
    return False, f"status {response.status_code}: {snippet}"


def _gateway_health_candidates(gateway_url: str) -> Iterable[str]:
    normalized = _normalize_base_url(gateway_url)
    if not normalized:
        return []

    urls: list[str] = []
    urls.append(f"{normalized}/health")
    if not normalized.endswith("/v1"):
        urls.append(f"{normalized}/v1/health")
        urls.append(f"{normalized}/portkey-ai/gateway/health")
    else:
        root = normalized[: -len("/v1")]
        if root:
            urls.append(f"{root}/health")
            urls.append(f"{root}/portkey-ai/gateway/health")
    return _dedupe(urls)


def _provider_models_candidates(base_url: str) -> Iterable[str]:
    normalized = _normalize_base_url(base_url)
    if not normalized:
        return []

    urls = [f"{normalized}/models"]
    if normalized.endswith("/v1"):
        root = normalized[: -len("/v1")]
        if root:
            urls.append(f"{root}/models")
    else:
        urls.append(f"{normalized}/v1/models")
    return _dedupe(urls)


def _normalize_base_url(base_url: str) -> str:
    return base_url.rstrip("/")


def _strip_suffix(value: str, suffix: str) -> str:
    if value.endswith(suffix):
        return value[: -len(suffix)]
    return value


def _dedupe(urls: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for url in urls:
        if not url or url in seen:
            continue
        seen.add(url)
        ordered.append(url)
    return ordered


__all__ = ["test_llm_config"]
