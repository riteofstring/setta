import asyncio
import unittest
from types import MethodType

from setta.project_state.settings_project_manager import SettingsProjectManager
from setta.utils.async_debouncer import AsyncDebouncer


class ManualSaveDebounceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.manager = object.__new__(SettingsProjectManager)
        self.save_calls: list[str] = []
        self.autosave_calls: list[str] = []

        def fake_save(_self):
            self.save_calls.append("manual")

        async def fake_autosave():
            self.autosave_calls.append("autosave")

        self.manager.save = MethodType(fake_save, self.manager)
        self.manager.autosave_debouncer = AsyncDebouncer(fake_autosave, wait=0.05)

    async def test_manual_save_cancels_pending_autosave(self):
        self.manager.autosave_debouncer.trigger()
        await asyncio.sleep(0)

        self.manager.perform_manual_save()
        await asyncio.sleep(0.1)

        self.assertFalse(self.manager.autosave_debouncer.is_pending)
        self.assertEqual(["manual"], self.save_calls)
        self.assertEqual([], self.autosave_calls)


if __name__ == "__main__":
    unittest.main()
