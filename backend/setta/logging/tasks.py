"""Helpers for safely spawning background asyncio tasks with logging context."""

import asyncio
import logging
from collections.abc import Coroutine
from typing import Any, TypeVar

from pydantic import BaseModel

from setta.logging.context import LoggingContextInput
from setta.logging.context_bindings import wrap_background_coroutine
from setta.logging.errors import run_safely

T = TypeVar("T")


def spawn_background_task(
    coro: Coroutine[Any, Any, T],
    *,
    label: str,
    logger: logging.Logger | None = None,
    context: dict[str, LoggingContextInput] | None = None,
    re_raise: bool = False,
    loop: asyncio.AbstractEventLoop | None = None,
    name: str | None = None,
    project_id: str | None = None,
    request_id: str | None = None,
    websocket_id: str | None = None,
    extra_values: dict[str, LoggingContextInput] | None = None,
    context_models: tuple[BaseModel, ...] | None = None,
) -> asyncio.Task[T | None]:
    """Spawn a background task that logs structured failures with context metadata.

    The failure handler runs *inside* the bound context, so contextvars metadata is
    preserved even when exceptions are swallowed.
    """

    wrapped = wrap_background_coroutine(
        run_safely(
            coro,
            label=label,
            logger=logger,
            context=context,
            re_raise=re_raise,
        ),
        label=label,
        project_id=project_id,
        request_id=request_id,
        websocket_id=websocket_id,
        extra_values=extra_values,
        context_models=context_models,
    )

    task_name = name or label
    if loop is not None:
        return loop.create_task(wrapped, name=task_name)
    return asyncio.create_task(wrapped, name=task_name)
