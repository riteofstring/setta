import asyncio
from typing import Callable, Optional


class AsyncDebouncer:
    """Debounces an async function - delays execution until the function
    hasn't been called for `wait` seconds."""

    def __init__(self, func: Callable, wait: float = 2.0):
        self.func = func
        self.wait = wait
        self._task: Optional[asyncio.Task] = None

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
        try:
            await asyncio.sleep(self.wait)
            return await self.func(*args, **kwargs)
        except asyncio.CancelledError:
            pass

    def cancel(self):
        """Cancel any pending execution."""
        if self._task and not self._task.done():
            self._task.cancel()

    async def flush(self, *args, **kwargs):
        """Execute immediately, cancelling any pending execution."""
        self.cancel()
        return await self.func(*args, **kwargs)

    @property
    def is_pending(self) -> bool:
        """Check if there's a pending execution."""
        return self._task is not None and not self._task.done()
