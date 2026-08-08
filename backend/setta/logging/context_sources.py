"""Helpers for deriving Setta logging context metadata from runtime objects."""

import uuid
from collections.abc import Mapping

from fastapi import Request, WebSocket

from setta.logging.context import LoggingContextInput

_REQUEST_ID_STATE_KEY = "setta_request_id"
_WEBSOCKET_ID_STATE_KEY = "setta_websocket_id"

LoggingContextMapping = Mapping[str, LoggingContextInput]

__all__ = [
    "LoggingContextMapping",
    "build_background_task_context",
    "build_request_context",
    "build_websocket_context",
    "ensure_request_context",
    "ensure_websocket_context",
]


def build_request_context(
    request: Request,
    *,
    extra_values: LoggingContextMapping | None = None,
) -> dict[str, LoggingContextInput]:
    """Return canonical logging metadata for an HTTP request."""

    resolved_request_id = ensure_request_context(request)
    endpoint_name = _resolve_endpoint_name(request)
    context: dict[str, LoggingContextInput] = {
        "request_id": resolved_request_id,
        "method": request.method.upper(),
        "path": request.url.path,
    }
    if endpoint_name:
        context["endpoint"] = endpoint_name
    client_host = request.client.host if request.client else None
    if client_host:
        context["client"] = client_host
    _merge_extra_values(context, extra_values)
    return context


def ensure_request_context(request: Request) -> str:
    """Return a stable request id stored on the Request state object."""

    request_id = getattr(request.state, _REQUEST_ID_STATE_KEY, None)
    if request_id:
        return str(request_id)
    request_id = _generate_token("req")
    setattr(request.state, _REQUEST_ID_STATE_KEY, request_id)
    return request_id


def build_websocket_context(
    websocket: WebSocket,
    *,
    project_config_id: str | None = None,
    extra_values: LoggingContextMapping | None = None,
) -> dict[str, LoggingContextInput]:
    """Return canonical logging metadata for a websocket connection."""

    resolved_websocket_id = ensure_websocket_context(websocket)
    resolved_project_id = project_config_id
    context: dict[str, LoggingContextInput] = {
        "websocket_id": resolved_websocket_id,
        "path": websocket.url.path,
    }
    if resolved_project_id:
        context["project_config_id"] = resolved_project_id
    client_host = websocket.client.host if websocket.client else None
    if client_host:
        context["client"] = client_host
    _merge_extra_values(context, extra_values)
    return context


def ensure_websocket_context(websocket: WebSocket) -> str:
    """Return a websocket id, storing it on the websocket state if needed."""

    stored_id = getattr(websocket.state, _WEBSOCKET_ID_STATE_KEY, None)
    if stored_id:
        return str(stored_id)
    resolved_id = _generate_token("ws")
    setattr(websocket.state, _WEBSOCKET_ID_STATE_KEY, resolved_id)
    return resolved_id


def build_background_task_context(
    *,
    label: str,
    project_config_id: str | None = None,
    request_id: str | None = None,
    websocket_id: str | None = None,
    extra_values: LoggingContextMapping | None = None,
) -> dict[str, LoggingContextInput]:
    """Return context for background jobs or asyncio tasks."""

    context: dict[str, LoggingContextInput] = {
        "task": label,
    }
    if project_config_id:
        context["project_config_id"] = project_config_id
    if request_id:
        context["request_id"] = request_id
    if websocket_id:
        context["websocket_id"] = websocket_id
    _merge_extra_values(context, extra_values)
    return context


def _resolve_endpoint_name(request: Request) -> str | None:
    endpoint = request.scope.get("endpoint")
    if not endpoint:
        return None
    return getattr(endpoint, "__name__", None)


def _merge_extra_values(
    context: dict[str, LoggingContextInput],
    extra_values: LoggingContextMapping | None,
) -> None:
    if not extra_values:
        return
    for key, value in extra_values.items():
        if value is None:
            context.pop(key, None)
            continue
        context[key] = value


def _generate_token(prefix: str) -> str:
    suffix = uuid.uuid4().hex[:12]
    return f"{prefix}-{suffix}"
