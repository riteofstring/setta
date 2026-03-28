import asyncio
import time

import pytest

from tests.utils.manager_fixture import real_settings_manager


@pytest.mark.asyncio
async def test_cancelled_enqueue_future_does_not_kill_queue():
    async with real_settings_manager() as fixture:
        manager = fixture.manager

        blocker_started = asyncio.Event()
        blocker_release = asyncio.Event()

        async def blocker():
            blocker_started.set()
            await blocker_release.wait()

        blocker_task = asyncio.create_task(manager._enqueue(blocker()))
        await blocker_started.wait()

        pending_task = asyncio.create_task(manager._enqueue(asyncio.sleep(0)))

        start = time.monotonic()
        while manager.message_queue.qsize() < 1:
            if time.monotonic() - start > 1.0:
                pytest.fail("Expected queued task to be enqueued.")
            await asyncio.sleep(0)

        pending_task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await pending_task

        blocker_release.set()
        await blocker_task
        await asyncio.sleep(0)

        assert not manager.queue_task.done()
        await asyncio.wait_for(manager._enqueue(asyncio.sleep(0)), timeout=1)
