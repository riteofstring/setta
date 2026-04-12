"""Helpers for safely spawning background asyncio tasks with logging context."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import TypeVar

from setta.logging.context import LoggingContextInput, logging_context
from setta.logging.context_sources import build_background_task_context
from setta.logging.errors import run_safely

T = TypeVar("T")


def spawn_background_task(
    coroutine_or_factory: Awaitable[T] | Callable[[], Awaitable[T]],
    *,
    label: str,
    logger: logging.Logger | None = None,
    context: dict[str, LoggingContextInput] | None = None,
    re_raise: bool = False,
    handled: bool = False,
    loop: asyncio.AbstractEventLoop | None = None,
    name: str | None = None,
    project_config_id: str | None = None,
    request_id: str | None = None,
    websocket_id: str | None = None,
    extra_values: dict[str, LoggingContextInput] | None = None,
) -> asyncio.Task[T | None]:
    """Spawn a background task that logs structured failures with context metadata.

    The failure handler runs *inside* the bound context, so contextvars metadata is
    preserved even when exceptions are swallowed.

    `re_raise` controls propagation. `handled` controls whether a failure is
    semantically expected/acceptable (WARNING) vs unhandled (ERROR).
    """

    context_values = build_background_task_context(
        label=label,
        project_config_id=project_config_id,
        request_id=request_id,
        websocket_id=websocket_id,
        extra_values=extra_values,
    )

    async def _runner() -> T | None:
        with logging_context(values=context_values):
            return await run_safely(
                coroutine_or_factory,
                label=label,
                logger=logger,
                context=context,
                re_raise=re_raise,
                handled=handled,
            )

    task_name = name or label
    # Avoid "coroutine was never awaited" warnings when task creation fails (for
    # example, if the loop is closing during teardown).
    to_close = None
    if not callable(coroutine_or_factory) and asyncio.iscoroutine(coroutine_or_factory):
        to_close = coroutine_or_factory
    runner = _runner()
    try:
        if loop is not None:
            return loop.create_task(runner, name=task_name)
        return asyncio.create_task(runner, name=task_name)
    except Exception:
        runner.close()
        if to_close is not None:
            to_close.close()
        raise
