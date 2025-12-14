"""Helpers for binding logging context to websocket and background tasks."""

import inspect
from collections.abc import Awaitable, Callable, Coroutine
from contextlib import asynccontextmanager, contextmanager
from typing import Any, ParamSpec, TypeVar

from fastapi import WebSocket
from pydantic import BaseModel

from setta.logging.context import logging_context
from setta.logging.context_sources import (
    LoggingContextMapping,
    build_background_task_context,
    build_websocket_context,
)

P = ParamSpec("P")
T = TypeVar("T")

__all__ = [
    "bind_background_task_logging_context",
    "bind_websocket_logging_context",
    "wrap_background_callable",
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


@contextmanager
def bind_background_task_logging_context(
    *,
    label: str,
    project_id: str | None = None,
    request_id: str | None = None,
    websocket_id: str | None = None,
    extra_values: LoggingContextMapping | None = None,
    context_models: tuple[BaseModel, ...] | None = None,
):
    """Context manager that attaches metadata for background task execution."""

    context_values = build_background_task_context(
        label=label,
        project_id=project_id,
        request_id=request_id,
        websocket_id=websocket_id,
        extra_values=extra_values,
        context_models=context_models,
    )
    with logging_context(values=context_values):
        yield


def wrap_background_callable(
    func: Callable[P, T | Awaitable[T]],
    *,
    label: str,
    project_id: str | None = None,
    request_id: str | None = None,
    websocket_id: str | None = None,
    extra_values: LoggingContextMapping | None = None,
    context_models: tuple[BaseModel, ...] | None = None,
) -> Callable[P, Awaitable[T]]:
    """Wrap a callable so it runs with the provided background logging context."""

    context_values = build_background_task_context(
        label=label,
        project_id=project_id,
        request_id=request_id,
        websocket_id=websocket_id,
        extra_values=extra_values,
        context_models=context_models,
    )

    async def _async_wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
        with logging_context(values=context_values):
            result = func(*args, **kwargs)
            if inspect.isawaitable(result):
                return await result
            return result

    return _async_wrapper


def wrap_background_coroutine(
    coro: Coroutine[Any, Any, T],
    *,
    label: str,
    project_id: str | None = None,
    request_id: str | None = None,
    websocket_id: str | None = None,
    extra_values: LoggingContextMapping | None = None,
    context_models: tuple[BaseModel, ...] | None = None,
) -> Coroutine[Any, Any, T]:
    """Attach logging context metadata to a coroutine scheduled in the background."""

    context_values = build_background_task_context(
        label=label,
        project_id=project_id,
        request_id=request_id,
        websocket_id=websocket_id,
        extra_values=extra_values,
        context_models=context_models,
    )

    async def _runner() -> T:
        with logging_context(values=context_values):
            return await coro

    return _runner()
