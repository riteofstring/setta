from fastapi import HTTPException

FRONTEND_WEBSOCKET_ID_ERROR_MESSAGE = (
    "frontendWebsocketId must be a non-empty string when provided."
)


def normalize_frontend_websocket_id(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if normalized == "":
        return None
    return normalized


def require_frontend_websocket_id(value: str | None) -> str | None:
    normalized = normalize_frontend_websocket_id(value)
    if value is not None and normalized is None:
        raise HTTPException(
            status_code=400,
            detail=FRONTEND_WEBSOCKET_ID_ERROR_MESSAGE,
        )
    return normalized


def validate_frontend_websocket_id_for_model(value: str | None) -> str | None:
    normalized = normalize_frontend_websocket_id(value)
    if value is not None and normalized is None:
        raise ValueError(FRONTEND_WEBSOCKET_ID_ERROR_MESSAGE)
    return normalized
