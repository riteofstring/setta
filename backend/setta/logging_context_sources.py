"""Helpers for deriving Setta logging context metadata from runtime objects."""

import uuid
from collections.abc import Mapping
from typing import Any

from fastapi import Request, WebSocket
from pydantic import BaseModel

from setta.logging_context import LoggingContextInput

_REQUEST_ID_STATE_KEY = "setta_request_id"
_WEBSOCKET_ID_STATE_KEY = "setta_websocket_id"

_PROJECT_PARAM_KEYS: tuple[str, ...] = (
    "project_id",
    "projectId",
    "project",
    "project_config_id",
    "projectConfigId",
)

LoggingContextMapping = Mapping[str, LoggingContextInput]

__all__ = [
    "LoggingContextMapping",
    "build_background_task_context",
    "build_request_context",
    "build_websocket_context",
    "ensure_request_context",
    "ensure_websocket_context",
    "get_project_id_from_payload",
    "ProjectContextModel",
]


class ProjectContextModel(BaseModel):
    """Base request model that exposes project scope metadata."""

    def get_project_config_id_for_context(self) -> str | None:
        """Return the projectConfigId used for logging context."""

        return None


def build_request_context(
    request: Request,
    *,
    project_id: str | None = None,
    extra_values: LoggingContextMapping | None = None,
) -> dict[str, LoggingContextInput]:
    """Return canonical logging metadata for an HTTP request."""

    resolved_request_id = ensure_request_context(request)
    resolved_project_id = project_id or _infer_project_id_from_request(request)
    endpoint_name = _resolve_endpoint_name(request)
    context: dict[str, LoggingContextInput] = {
        "request_id": resolved_request_id,
        "method": request.method.upper(),
        "path": request.url.path,
    }
    if endpoint_name:
        context["endpoint"] = endpoint_name
    if resolved_project_id:
        context["project_id"] = resolved_project_id
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
    websocket_id: str | None = None,
    project_id: str | None = None,
    extra_values: LoggingContextMapping | None = None,
) -> dict[str, LoggingContextInput]:
    """Return canonical logging metadata for a websocket connection."""

    resolved_websocket_id = ensure_websocket_context(websocket, websocket_id)
    resolved_project_id = project_id or _infer_project_id_from_websocket(websocket)
    context: dict[str, LoggingContextInput] = {
        "websocket_id": resolved_websocket_id,
        "path": websocket.url.path,
    }
    if resolved_project_id:
        context["project_id"] = resolved_project_id
    client_host = websocket.client.host if websocket.client else None
    if client_host:
        context["client"] = client_host
    _merge_extra_values(context, extra_values)
    return context


def ensure_websocket_context(websocket: WebSocket, websocket_id: str | None = None) -> str:
    """Return a websocket id, storing it on the websocket state if needed."""

    stored_id = getattr(websocket.state, _WEBSOCKET_ID_STATE_KEY, None)
    if stored_id:
        return str(stored_id)
    resolved_id = websocket_id or _generate_token("ws")
    setattr(websocket.state, _WEBSOCKET_ID_STATE_KEY, resolved_id)
    return resolved_id


def build_background_task_context(
    *,
    label: str,
    project_id: str | None = None,
    request_id: str | None = None,
    websocket_id: str | None = None,
    extra_values: LoggingContextMapping | None = None,
) -> dict[str, LoggingContextInput]:
    """Return context for background jobs or asyncio tasks."""

    context: dict[str, LoggingContextInput] = {
        "task": label,
    }
    if project_id:
        context["project_id"] = project_id
    if request_id:
        context["request_id"] = request_id
    if websocket_id:
        context["websocket_id"] = websocket_id
    _merge_extra_values(context, extra_values)
    return context


def get_project_id_from_payload(payload: Any) -> str | None:
    """Lookup the project identifier for a validated payload."""

    if not isinstance(payload, ProjectContextModel):
        return None
    return _normalize_value(payload.get_project_config_id_for_context())


def _infer_project_id_from_request(request: Request) -> str | None:
    candidate = _search_mapping(request.path_params, _PROJECT_PARAM_KEYS)
    if candidate:
        return candidate
    candidate = _search_mapping(request.query_params, _PROJECT_PARAM_KEYS)
    if candidate:
        return candidate
    return None


def _infer_project_id_from_websocket(websocket: WebSocket) -> str | None:
    candidate = _search_mapping(websocket.path_params, _PROJECT_PARAM_KEYS)
    if candidate:
        return candidate
    query_params = websocket.query_params
    if query_params:
        candidate = _search_mapping(query_params, _PROJECT_PARAM_KEYS)
        if candidate:
            return candidate
    return None


def _search_mapping(
    mapping: Mapping[str, object], keys: tuple[str, ...]
) -> str | None:
    for key in keys:
        if key not in mapping:
            continue
        value = mapping[key]
        normalized = _normalize_value(value)
        if normalized:
            return normalized
    return None


def _normalize_value(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    if not normalized:
        return None
    return normalized


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
