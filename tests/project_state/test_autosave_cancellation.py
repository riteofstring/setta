import asyncio
import pytest

from tests.utils.manager_fixture import real_settings_manager


@pytest.mark.asyncio
async def test_autosave_cancellation_does_not_kill_queue():
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = True
        manager.autosave_debouncer.wait = 0

        blocker_started = asyncio.Event()
        blocker_release = asyncio.Event()

        async def blocker():
            blocker_started.set()
            await blocker_release.wait()

        blocker_task = asyncio.create_task(manager._enqueue(blocker()))
        await blocker_started.wait()

        manager.autosave_debouncer.trigger()
        await asyncio.sleep(0)
        assert manager.autosave_debouncer.is_pending

        # Re-trigger while the previous autosave is pending to exercise cancellation.
        manager.autosave_debouncer.trigger()
        await asyncio.sleep(0)
        assert manager.autosave_debouncer.is_pending

        blocker_release.set()
        await blocker_task
        await asyncio.sleep(0)

        assert not manager.queue_task.done()
        await asyncio.wait_for(manager._enqueue(asyncio.sleep(0)), timeout=1)
