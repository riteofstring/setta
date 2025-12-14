"""Structured error logging helpers."""

import asyncio
import inspect
import logging
from collections.abc import Awaitable, Callable, Mapping
from typing import TypeVar

from setta.logging.context import LoggingContextInput, logging_context

T = TypeVar("T")

_LOGGER = logging.getLogger(__name__)

_DEFAULT_FAILURE_MESSAGE = "Unhandled failure in %s"
_HANDLED_FAILURE_MESSAGE = "Handled failure in %s"


def log_failure(
    exc: BaseException,
    label: str,
    logger: logging.Logger | None = None,
    handled: bool = False,
    context: Mapping[str, LoggingContextInput] | None = None,
) -> None:
    """Log a structured failure with context metadata."""

    log = logger or _LOGGER
    context_values: dict[str, LoggingContextInput] = {
        "failure_label": label,
        "failure_handled": handled,
    }

    level = logging.WARNING if handled else logging.ERROR
    message_template = _HANDLED_FAILURE_MESSAGE if handled else _DEFAULT_FAILURE_MESSAGE

    with logging_context(values=context, **context_values):
        log.log(
            level,
            message_template,
            label,
            exc_info=(type(exc), exc, exc.__traceback__),
        )


async def run_safely(
    coroutine_or_factory: Awaitable[T] | Callable[[], Awaitable[T]],
    *,
    label: str,
    logger: logging.Logger | None = None,
    context: Mapping[str, LoggingContextInput] | None = None,
    re_raise: bool = False,
) -> T | None:
    """Execute a coroutine and log failures with consistent metadata."""

    try:
        coroutine = _resolve_coroutine(coroutine_or_factory)
    except TypeError:
        raise
    except Exception as exc:  # noqa: PERF203 - explicit structured logging path
        log_failure(
            exc,
            label=label,
            logger=logger,
            handled=not re_raise,
            context=context,
        )
        if re_raise:
            raise
        return None
    try:
        return await coroutine
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: PERF203 - explicit structured logging path
        log_failure(
            exc,
            label=label,
            logger=logger,
            handled=not re_raise,
            context=context,
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
