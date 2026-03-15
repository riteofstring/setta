import asyncio
from contextlib import asynccontextmanager


class AsyncReadWriteLock:
    """A simple asyncio-compatible reader/writer lock."""

    def __init__(self) -> None:
        self._reader_count = 0
        self._reader_count_lock = asyncio.Lock()
        self._resource_lock = asyncio.Lock()

    async def acquire_read(self) -> None:
        await self._reader_count_lock.acquire()
        try:
            self._reader_count += 1
            if self._reader_count == 1:
                await self._resource_lock.acquire()
        finally:
            self._reader_count_lock.release()

    async def release_read(self) -> None:
        await self._reader_count_lock.acquire()
        try:
            self._reader_count -= 1
            if self._reader_count == 0:
                self._resource_lock.release()
        finally:
            self._reader_count_lock.release()

    async def acquire_write(self) -> None:
        await self._resource_lock.acquire()

    def release_write(self) -> None:
        self._resource_lock.release()

    @asynccontextmanager
    async def read_lock(self):
        await self.acquire_read()
        try:
            yield
        finally:
            await self.release_read()

    @asynccontextmanager
    async def write_lock(self):
        await self.acquire_write()
        try:
            yield
        finally:
            self.release_write()
