import asyncio

import pytest
import pytest_asyncio

from setta.utils.async_debouncer import AsyncDebouncer

from tests.utils.manager_fixture import real_settings_manager

@pytest.mark.asyncio
class TestManualSaveDebounce:
    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self):
        self._manager_cm = real_settings_manager()
        self.fixture = await self._manager_cm.__aenter__()
        self.manager = self.fixture.manager

        # Use a shorter debounce delay so the test stays fast.
        self.manager.autosave_debouncer.cancel()
        self.manager.autosave_debouncer.cancel_pending()
        self.manager.autosave_debouncer = AsyncDebouncer(
            self.manager.autosave,
            wait=0.05,
            label="test-autosave",
        )

        yield

        await self._manager_cm.__aexit__(None, None, None)

    async def test_manual_save_cancels_pending_autosave(self):
        settings_project_path = self.fixture.dbe.settings_project
        before_mtime_ns = settings_project_path.stat().st_mtime_ns

        self.manager.autosave_debouncer.trigger()
        await asyncio.sleep(0)

        assert self.manager.autosave_debouncer.is_pending

        self.manager.perform_manual_save()
        await asyncio.sleep(0.1)

        assert not self.manager.autosave_debouncer.is_pending
        after_mtime_ns = settings_project_path.stat().st_mtime_ns
        assert after_mtime_ns > before_mtime_ns

    async def test_add_new_history_entry_skips_autosave_when_disabled(self):
        # Confirm autosave enqueues normally while enabled.
        self.manager.settings_file.settings.backend.autosave = True
        self.manager.autosave_debouncer.cancel_pending()
        self.manager.add_new_history_entry()
        await asyncio.sleep(0)
        assert self.manager.autosave_debouncer.is_pending

        # Disable autosave and ensure new history entries do not enqueue saves.
        self.manager.autosave_debouncer.cancel_pending()
        self.manager.settings_file.settings.backend.autosave = False
        self.manager.add_new_history_entry()
        await asyncio.sleep(0)
        assert not self.manager.autosave_debouncer.is_pending

        # Restore default behaviour for other tests.
        self.manager.settings_file.settings.backend.autosave = True
