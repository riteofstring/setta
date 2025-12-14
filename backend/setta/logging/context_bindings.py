"""Helpers for binding logging context to websocket and background tasks."""

from collections.abc import Coroutine
from contextlib import asynccontextmanager
from typing import Any, TypeVar

from fastapi import WebSocket

from setta.logging.context import logging_context
from setta.logging.context_sources import (
    LoggingContextMapping,
    build_background_task_context,
    build_websocket_context,
)

T = TypeVar("T")

__all__ = [
    "bind_websocket_logging_context",
    "wrap_background_coroutine",
]


@asynccontextmanager
async def bind_websocket_logging_context(
    websocket: WebSocket,
    *,
    websocket_id: str | None = None,
    project_id: str | None = None,
    extra_values: LoggingContextMapping | None = None,
):
    """Async context manager that binds websocket metadata to the log context."""

    context_values = build_websocket_context(
        websocket,
        websocket_id=websocket_id,
        project_id=project_id,
        extra_values=extra_values,
    )
    with logging_context(values=context_values):
        yield


def wrap_background_coroutine(
    coro: Coroutine[Any, Any, T],
    *,
    label: str,
    project_id: str | None = None,
    request_id: str | None = None,
    websocket_id: str | None = None,
    extra_values: LoggingContextMapping | None = None,
) -> Coroutine[Any, Any, T]:
    """Attach logging context metadata to a coroutine scheduled in the background."""

    context_values = build_background_task_context(
        label=label,
        project_id=project_id,
        request_id=request_id,
        websocket_id=websocket_id,
        extra_values=extra_values,
    )

    async def _runner() -> T:
        with logging_context(values=context_values):
            return await coro

    return _runner()
