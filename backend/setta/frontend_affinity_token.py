from typing import Any

FRONTEND_AFFINITY_TOKEN_ERROR_MESSAGE = (
    "frontendAffinityToken must be a non-empty string when provided."
)


def parse_frontend_affinity_token(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError(FRONTEND_AFFINITY_TOKEN_ERROR_MESSAGE)
    normalized = value.strip()
    if normalized == "":
        raise ValueError(FRONTEND_AFFINITY_TOKEN_ERROR_MESSAGE)
    return normalized
