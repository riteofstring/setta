from fastapi import HTTPException

from setta.frontend_websocket_id import (
    FRONTEND_WEBSOCKET_ID_ERROR_MESSAGE,
    parse_frontend_websocket_id,
)


def require_frontend_websocket_id(value: str | None) -> str | None:
    try:
        return parse_frontend_websocket_id(value)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=400,
            detail=FRONTEND_WEBSOCKET_ID_ERROR_MESSAGE,
        )


def validate_frontend_websocket_id_for_model(value: str | None) -> str | None:
    try:
        return parse_frontend_websocket_id(value)
    except (TypeError, ValueError):
        raise ValueError(FRONTEND_WEBSOCKET_ID_ERROR_MESSAGE)
