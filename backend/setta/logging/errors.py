"""Structured error logging helpers."""

import asyncio
import inspect
import logging
from collections.abc import Awaitable, Callable, Mapping
from typing import TypeVar

from pydantic import BaseModel

from setta.logging.context import LoggingContextInput, logging_context
from setta.logging.context_models import serialize_logging_models

T = TypeVar("T")

_LOGGER = logging.getLogger(__name__)

_DEFAULT_FAILURE_MESSAGE = "Unhandled failure in %s"
_HANDLED_FAILURE_MESSAGE = "Handled failure in %s"


def log_route_failure(
    exc: BaseException,
    *context_objects: BaseModel,
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

    merged_context = _merge_contexts(
        context,
        serialize_logging_models(*context_objects),
    )

    level = logging.WARNING if handled else logging.ERROR
    message_template = _HANDLED_FAILURE_MESSAGE if handled else _DEFAULT_FAILURE_MESSAGE

    with logging_context(values=merged_context, **context_values):
        log.log(level, message_template, label, exc_info=exc)


async def run_safely(
    coroutine_or_factory: Awaitable[T] | Callable[[], Awaitable[T]],
    *,
    label: str,
    logger: logging.Logger | None = None,
    context: Mapping[str, LoggingContextInput] | None = None,
    re_raise: bool = False,
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


def _merge_contexts(
    explicit: Mapping[str, LoggingContextInput] | None,
    model_context: Mapping[str, LoggingContextInput] | None,
) -> Mapping[str, LoggingContextInput] | None:
    if explicit and model_context:
        merged = dict(explicit)
        merged.update(model_context)
        return merged
    return explicit or (model_context if model_context else None)
