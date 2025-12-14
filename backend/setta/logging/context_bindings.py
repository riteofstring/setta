"""Helpers for binding logging context to websocket handlers."""

from contextlib import asynccontextmanager

from fastapi import WebSocket

from setta.logging.context import logging_context
from setta.logging.context_sources import (
    LoggingContextMapping,
    build_websocket_context,
)

__all__ = [
    "bind_websocket_logging_context",
]


@asynccontextmanager
async def bind_websocket_logging_context(
    websocket: WebSocket,
    *,
    project_config_id: str | None = None,
    extra_values: LoggingContextMapping | None = None,
):
    """Async context manager that binds websocket metadata to the log context."""

    context_values = build_websocket_context(
        websocket,
        project_config_id=project_config_id,
        extra_values=extra_values,
    )
    with logging_context(values=context_values):
        yield
