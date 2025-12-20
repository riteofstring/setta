import asyncio
from typing import Any, Callable

from setta.logging.context import get_logging_context
from setta.logging.tasks import spawn_background_task


class AsyncDebouncer:
    """Debounces an async function - delays execution until the function
    hasn't been called for `wait` seconds."""

    def __init__(self, func: Callable, wait: float = 2.0, *, label: str):
        self.func = func
        self.wait = wait
        self.label = label
        self._schedule_task: asyncio.Task | None = None
        self._task: asyncio.Task | None = None
        self._is_executing: bool = False

    def trigger(self, *args, **kwargs):
        """Trigger the debounced function. Cancels any pending execution."""
        if self._schedule_task and not self._schedule_task.done():
            self._schedule_task.cancel()
        self._schedule_task = spawn_background_task(
            lambda: self._schedule(*args, **kwargs),
            label=f"{self.label}-schedule",
            **self._resolve_context_kwargs(),
        )

    async def _schedule(self, *args, **kwargs):
        # Cancel existing task if pending
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        # Schedule new execution
        self._task = spawn_background_task(
            lambda: self._execute_after_delay(*args, **kwargs),
            label=self.label,
            **self._resolve_context_kwargs(),
        )

    async def _execute_after_delay(self, *args, **kwargs):
        current_task = asyncio.current_task()
        try:
            await asyncio.sleep(self.wait)
            self._is_executing = True
            return await self.func(*args, **kwargs)
        except asyncio.CancelledError:
            pass
        finally:
            self._is_executing = False
            if current_task and self._task is current_task:
                self._task = None

    def cancel(self):
        """Cancel any pending execution."""
        if self._schedule_task and not self._schedule_task.done():
            self._schedule_task.cancel()
        self._schedule_task = None
        if self._task and not self._task.done():
            self._task.cancel()
        self._task = None

    def cancel_pending(self) -> bool:
        """Cancel only if execution has not started yet."""
        if self._schedule_task and not self._schedule_task.done():
            self._schedule_task.cancel()
            self._schedule_task = None
            return True
        if self._task and not self._task.done():
            if self._is_executing:
                return False
            self._task.cancel()
            self._task = None
            return True
        return False

    async def flush(self, *args, **kwargs):
        """Execute immediately, cancelling any pending execution."""
        self.cancel()
        return await self.func(*args, **kwargs)

    @property
    def is_pending(self) -> bool:
        """Check if there's a pending execution."""
        if self._schedule_task and not self._schedule_task.done():
            return True
        return self._task is not None and not self._task.done()

    def _resolve_context_kwargs(self) -> dict[str, Any]:
        context = get_logging_context()
        keys = ("project_config_id", "request_id", "websocket_id")
        resolved: dict[str, Any] = {}
        for key in keys:
            value = context.get(key)
            if value:
                resolved[key] = value
        return resolved
