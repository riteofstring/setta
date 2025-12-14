"""Structured error logging helpers."""

import asyncio
import inspect
import logging
import os
from collections.abc import Awaitable, Callable, Mapping
from typing import TypeVar

from setta.logging.context import LoggingContextInput, logging_context

T = TypeVar("T")

_LOGGER = logging.getLogger(__name__)

_DEFAULT_FAILURE_MESSAGE = "Unhandled failure in %s"
_HANDLED_FAILURE_MESSAGE = "Handled failure in %s"
_HANDLED_TRACEBACK_ENV = "SETTA_HANDLED_TRACEBACKS"


def log_failure(
    exc: BaseException,
    label: str,
    logger: logging.Logger | None = None,
    handled: bool = False,
    context: Mapping[str, LoggingContextInput] | None = None,
    include_traceback: bool | None = None,
) -> None:
    """Log a structured failure with context metadata."""

    log = logger or _LOGGER
    context_values: dict[str, LoggingContextInput] = {
        "failure_label": label,
        "failure_handled": handled,
    }

    level = logging.WARNING if handled else logging.ERROR
    message_template = _HANDLED_FAILURE_MESSAGE if handled else _DEFAULT_FAILURE_MESSAGE
    if include_traceback is None:
        include_traceback = (not handled) or _include_handled_traceback(log)

    message = message_template % label

    with logging_context(values=context, **context_values):
        if include_traceback:
            log.log(
                level,
                message,
                exc_info=(type(exc), exc, exc.__traceback__),
            )
            return
        summary = type(exc).__name__
        exc_message = str(exc).replace("\n", " ").strip()
        if exc_message:
            summary = f"{summary}: {exc_message}"
        log.log(level, "%s: %s", message, summary)


def _include_handled_traceback(logger: logging.Logger) -> bool:
    env_value = os.environ.get(_HANDLED_TRACEBACK_ENV)
    if env_value is not None:
        normalized = env_value.strip().lower()
        return normalized in {"1", "true", "yes", "y", "on"}
    return logger.isEnabledFor(logging.DEBUG)


async def run_safely(
    coroutine_or_factory: Awaitable[T] | Callable[[], Awaitable[T]],
    *,
    label: str,
    logger: logging.Logger | None = None,
    context: Mapping[str, LoggingContextInput] | None = None,
    re_raise: bool = False,
    handled: bool = False,
) -> T | None:
    """Execute a coroutine and log failures with consistent metadata.

    `re_raise` controls propagation (whether exceptions are re-raised).
    `handled` controls semantics/severity (expected/acceptable vs unhandled failure).
    """

    try:
        coroutine = _resolve_coroutine(coroutine_or_factory)
    except TypeError:
        raise
    except Exception as exc:  # noqa: PERF203 - explicit structured logging path
        log_failure(
            exc,
            label=label,
            logger=logger,
            handled=handled,
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
            handled=handled,
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
