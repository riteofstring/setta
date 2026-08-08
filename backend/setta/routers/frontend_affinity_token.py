from fastapi import HTTPException

from setta.frontend_affinity_token import (
    FRONTEND_AFFINITY_TOKEN_ERROR_MESSAGE,
    parse_frontend_affinity_token,
)


def require_frontend_affinity_token(value: str | None) -> str | None:
    try:
        return parse_frontend_affinity_token(value)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=400,
            detail=FRONTEND_AFFINITY_TOKEN_ERROR_MESSAGE,
        )


def validate_frontend_affinity_token_for_model(value: str | None) -> str | None:
    try:
        return parse_frontend_affinity_token(value)
    except (TypeError, ValueError):
        raise ValueError(FRONTEND_AFFINITY_TOKEN_ERROR_MESSAGE)
