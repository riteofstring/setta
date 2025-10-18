import asyncio
from typing import Callable, Optional


class AsyncDebouncer:
    """Debounces an async function - delays execution until the function
    hasn't been called for `wait` seconds."""

    def __init__(self, func: Callable, wait: float = 2.0):
        self.func = func
        self.wait = wait
        self._task: Optional[asyncio.Task] = None
        self._is_executing: bool = False

    def trigger(self, *args, **kwargs):
        """Trigger the debounced function. Cancels any pending execution."""
        asyncio.create_task(self._schedule(*args, **kwargs))

    async def _schedule(self, *args, **kwargs):
        # Cancel existing task if pending
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        # Schedule new execution
        self._task = asyncio.create_task(self._execute_after_delay(*args, **kwargs))

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
        if self._task and not self._task.done():
            self._task.cancel()

    def cancel_pending(self) -> bool:
        """Cancel only if execution has not started yet."""
        if self._task and not self._task.done():
            if self._is_executing:
                return False
            self._task.cancel()
            return True
        return False

    async def flush(self, *args, **kwargs):
        """Execute immediately, cancelling any pending execution."""
        self.cancel()
        return await self.func(*args, **kwargs)

    @property
    def is_pending(self) -> bool:
        """Check if there's a pending execution."""
        return self._task is not None and not self._task.done()
