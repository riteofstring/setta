from typing import Any

FRONTEND_WEBSOCKET_ID_ERROR_MESSAGE = (
    "frontendWebsocketId must be a non-empty string when provided."
)


def parse_frontend_websocket_id(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError(FRONTEND_WEBSOCKET_ID_ERROR_MESSAGE)
    normalized = value.strip()
    if normalized == "":
        raise ValueError(FRONTEND_WEBSOCKET_ID_ERROR_MESSAGE)
    return normalized


def normalize_frontend_websocket_id(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if normalized == "":
        return None
    return normalized
