"""Structured error logging helpers."""

import asyncio
import inspect
import logging
from collections.abc import Awaitable, Callable, Mapping
from typing import TYPE_CHECKING, TypeVar

from setta.logging.context import LoggingContextInput, logging_context
from setta.logging.context_sources import build_request_context, build_websocket_context

if TYPE_CHECKING:
    from fastapi import Request, WebSocket

T = TypeVar("T")

_LOGGER = logging.getLogger(__name__)

_DEFAULT_FAILURE_MESSAGE = "Unhandled failure in %s"
_HANDLED_FAILURE_MESSAGE = "Handled failure in %s"


def log_route_failure(
    exc: BaseException,
    *,
    label: str,
    logger: logging.Logger | None = None,
    handled: bool = False,
    notify_frontend: bool = False,
    context: Mapping[str, LoggingContextInput] | None = None,
    request: "Request" | None = None,
    websocket: "WebSocket" | None = None,
) -> None:
    """Log a structured failure with context metadata."""

    log = logger or _LOGGER
    context_values: dict[str, LoggingContextInput] = {
        "failure_label": label,
        "failure_handled": handled,
    }
    if notify_frontend:
        context_values["failure_notify_frontend"] = True

    level = logging.WARNING if handled else logging.ERROR
    message_template = _HANDLED_FAILURE_MESSAGE if handled else _DEFAULT_FAILURE_MESSAGE

    merged_context = _merged_failure_context(
        request=request,
        websocket=websocket,
        context=context,
    )

    with logging_context(values=merged_context, **context_values):
        log.log(level, message_template, label, exc_info=exc)


async def run_safely(
    coroutine_or_factory: Awaitable[T] | Callable[[], Awaitable[T]],
    *,
    label: str,
    logger: logging.Logger | None = None,
    context: Mapping[str, LoggingContextInput] | None = None,
    notify_frontend: bool = False,
    re_raise: bool = False,
    request: "Request" | None = None,
    websocket: "WebSocket" | None = None,
) -> T | None:
    """Execute a coroutine and log failures with consistent metadata."""

    coroutine = _resolve_coroutine(coroutine_or_factory)
    try:
        return await coroutine
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: PERF203 - explicit structured logging path
        log_route_failure(
            exc,
            label=label,
            logger=logger,
            handled=not re_raise,
            notify_frontend=notify_frontend,
            context=context,
            request=request,
            websocket=websocket,
        )
        if re_raise:
            raise
        return None


def _resolve_coroutine(
    coroutine_or_factory: Awaitable[T] | Callable[[], Awaitable[T]],
) -> Awaitable[T]:
    if inspect.isawaitable(coroutine_or_factory):
        return coroutine_or_factory
    if callable(coroutine_or_factory):
        result = coroutine_or_factory()
        if inspect.isawaitable(result):
            return result
        message = "run_safely callable must return an awaitable"
        raise TypeError(message)
    message = "run_safely requires an awaitable or zero-arg callable"
    raise TypeError(message)


def _merged_failure_context(
    *,
    request: "Request" | None,
    websocket: "WebSocket" | None,
    context: Mapping[str, LoggingContextInput] | None,
) -> Mapping[str, LoggingContextInput] | None:
    merged: dict[str, LoggingContextInput] = {}
    if request is not None:
        merged.update(build_request_context(request))
    if websocket is not None:
        merged.update(build_websocket_context(websocket))
    if context:
        merged.update(context)
    return merged or None
