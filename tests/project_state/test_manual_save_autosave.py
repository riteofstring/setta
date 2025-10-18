import asyncio
import unittest

from setta.utils.async_debouncer import AsyncDebouncer

from tests.utils.manager_fixture import real_settings_manager


class ManualSaveDebounceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._manager_cm = real_settings_manager()
        self.fixture = await self._manager_cm.__aenter__()
        self.manager = self.fixture.manager

        # Use a shorter debounce delay so the test stays fast.
        self.manager.autosave_debouncer.cancel()
        self.manager.autosave_debouncer.cancel_pending()
        self.manager.autosave_debouncer = AsyncDebouncer(
            self.manager.autosave, wait=0.05
        )

    async def asyncTearDown(self):
        await self._manager_cm.__aexit__(None, None, None)

    async def test_manual_save_cancels_pending_autosave(self):
        settings_project_path = self.fixture.dbe.settings_project
        before_mtime_ns = settings_project_path.stat().st_mtime_ns

        self.manager.autosave_debouncer.trigger()
        await asyncio.sleep(0)

        self.assertTrue(self.manager.autosave_debouncer.is_pending)

        self.manager.perform_manual_save()
        await asyncio.sleep(0.1)

        self.assertFalse(self.manager.autosave_debouncer.is_pending)
        after_mtime_ns = settings_project_path.stat().st_mtime_ns
        self.assertGreater(after_mtime_ns, before_mtime_ns)


if __name__ == "__main__":
    unittest.main()
