"""Active validation for the Portkey gateway + provider configuration."""

from portkey_ai import Portkey

from setta.llm.config_store import (
    LLMConfig,
    LLMProviderConfig,
    infer_provider_headers,
    normalize_gateway_url,
)
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
    providers = []
    seen_scopes: set[tuple[str | None, str]] = set()
    for project_config_id, scoped_provider in _iter_scoped_providers(llm_config):
        scope_key = (project_config_id, scoped_provider.provider_id)
        if scope_key in seen_scopes:
            continue
        seen_scopes.add(scope_key)
        providers.append(
            _test_provider(
                scoped_provider,
                project_config_id=project_config_id,
                fallback_gateway_url=llm_config.gateway_url,
                timeout=timeout,
            )
        )
    return LLMConfigTestResultPayload(gateway=gateway, providers=providers)


def _test_gateway(
    gateway_url: str,
    *,
    timeout: float,
) -> LLMGatewayTestResultPayload:
    health_base_url = _health_base_url(gateway_url)
    candidates = list(_gateway_health_candidates())
    client = Portkey(
        base_url=health_base_url,
        request_timeout=_portkey_timeout_ms(timeout),
    )
    errors: list[str] = []

    for path in candidates:
        ok, detail = _portkey_health_check(client, path)
        url = _combine_url(health_base_url, path)
        if ok:
            return LLMGatewayTestResultPayload(ok=True, url=url)
        errors.append(f"{url}: {detail}")

    message = (
        "; ".join(errors) if errors else "No health endpoint candidates were generated"
    )
    return LLMGatewayTestResultPayload(
        ok=False,
        url=_combine_url(gateway_url, candidates[0]) if candidates else None,
        error=message,
    )


def _test_provider(
    provider: LLMProviderConfig,
    *,
    project_config_id: str | None,
    fallback_gateway_url: str,
    timeout: float,
) -> LLMProviderTestResultPayload:
    base_url = normalize_gateway_url(provider.base_url or fallback_gateway_url)
    headers = infer_provider_headers(provider) or {}
    header_names = {key.lower() for key in headers}
    missing_authorization = not provider.api_key and "authorization" not in header_names

    kwargs: dict[str, object] = {}
    if headers:
        kwargs["extra_headers"] = headers

    client = Portkey(
        api_key=provider.api_key or None,
        base_url=base_url,
        provider=provider.provider_id,
        request_timeout=_portkey_timeout_ms(timeout),
    )

    errors: list[LLMProviderTestErrorPayload] = []
    try:
        client.models.list(**kwargs)
        return LLMProviderTestResultPayload(
            provider_id=provider.provider_id,
            display_name=provider.display_name,
            project_config_id=project_config_id,
            base_url=_normalize_base_url(base_url),
            ok=True,
            errors=[],
        )
    except Exception as exc:  # noqa: BLE001 - surface the raw portkey/openai error message
        errors.append(
            LLMProviderTestErrorPayload(
                code="request_failed",
                message=_trim_error(str(exc)),
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

    return LLMProviderTestResultPayload(
        provider_id=provider.provider_id,
        display_name=provider.display_name,
        project_config_id=project_config_id,
        base_url=_normalize_base_url(base_url),
        ok=False,
        errors=errors,
    )


def _iter_scoped_providers(
    llm_config: LLMConfig,
) -> list[tuple[str | None, LLMProviderConfig]]:
    scoped: list[tuple[str | None, LLMProviderConfig]] = [
        (None, provider) for provider in llm_config.providers
    ]
    for project_config_id, project in llm_config.project_configs.items():
        for provider in project.providers:
            scoped.append((project_config_id, provider))
    return scoped


def _gateway_health_candidates() -> list[str]:
    return [
        "/",
        "/health",
        "/v1/health",
        "/portkey-ai/gateway/health",
    ]


def _portkey_health_check(
    client: Portkey,
    path: str,
) -> tuple[bool, str]:
    try:
        response = client.get(path=path, headers={}, cast_to=None)
    except Exception as exc:  # noqa: BLE001 - surfacing raw connection/timeout errors
        return False, _trim_error(str(exc))

    status = getattr(response, "status_code", None)
    if status is None or 200 <= status < 300:
        return True, ""

    snippet = getattr(response, "text", "") or getattr(response, "reason", "") or ""
    snippet = _trim_error(snippet)
    if snippet:
        return False, f"status {status}: {snippet}"
    return False, f"status {status}"


def _combine_url(base_url: str, path: str) -> str:
    normalized_base = _normalize_base_url(base_url)
    normalized_path = path if path.startswith("/") else f"/{path}"
    if not normalized_base:
        return normalized_path
    return f"{normalized_base}{normalized_path}"


def _normalize_base_url(base_url: str) -> str:
    return base_url.rstrip("/")


def _health_base_url(gateway_url: str) -> str:
    trimmed = gateway_url.rstrip("/")
    if trimmed.endswith("/v1"):
        return trimmed[: -len("/v1")]
    return trimmed


def _portkey_timeout_ms(timeout_seconds: float) -> int:
    return int(timeout_seconds * 1000)


def _trim_error(value: str) -> str:
    value = value.strip()
    if len(value) <= ERROR_SNIPPET_LIMIT:
        return value
    return f"{value[:ERROR_SNIPPET_LIMIT]}..."


__all__ = ["test_llm_config"]
