import unittest
from contextlib import AsyncExitStack

from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.project_manager_types import (
    ProjectManagerRequestWithFrontendOp,
)

from tests.utils.manager_fixture import real_settings_manager


@BaseProjectManager.enqueue_method
async def _add_two_history_entries(
    self: BaseProjectManager, payload: ProjectManagerRequestWithFrontendOp
) -> None:
    self.add_new_history_entry()
    self.add_new_history_entry()


class HistoryTransactionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._exit_stack = AsyncExitStack()
        fixture = await self._exit_stack.enter_async_context(real_settings_manager())
        self.manager = fixture.manager
        self.project_config_id = (
            self.manager.project_state_backend.defaultProjectConfigId
        )
        await self.manager.load_project_config(self.project_config_id)
        self._autosave_enabled = self.manager.settings_file.settings.backend.autosave
        self.manager.settings_file.settings.backend.autosave = False
        self.manager.add_two_history_entries = _add_two_history_entries.__get__(
            self.manager, type(self.manager)
        )

    async def asyncTearDown(self):
        self.manager.settings_file.settings.backend.autosave = self._autosave_enabled
        await self._exit_stack.aclose()

    async def test_history_transaction_limits_to_single_entry(self):
        start_len = len(self.manager.history._history)
        with self.manager.history_transaction("group-1"):
            self.manager.add_new_history_entry()
            self.manager.add_new_history_entry()
        self.assertEqual(len(self.manager.history._history), start_len + 1)

        self.manager.add_new_history_entry()
        self.assertEqual(len(self.manager.history._history), start_len + 2)

    async def test_history_group_id_wraps_enqueue_methods(self):
        start_len = len(self.manager.history._history)
        payload = ProjectManagerRequestWithFrontendOp(historyGroupId="group-2")
        await self.manager.add_two_history_entries(payload)
        self.assertEqual(len(self.manager.history._history), start_len + 1)

    async def test_history_transaction_allows_nested_same_key(self):
        start_len = len(self.manager.history._history)
        with self.manager.history_transaction("nested"):
            with self.manager.history_transaction("nested"):
                self.manager.add_new_history_entry()
                self.manager.add_new_history_entry()
        self.assertEqual(len(self.manager.history._history), start_len + 1)

    async def test_history_transaction_rejects_mismatched_key(self):
        with self.assertRaises(ValueError):
            with self.manager.history_transaction("outer"):
                with self.manager.history_transaction("inner"):
                    pass

    async def test_manager_add_new_history_entry_coalesces(self):
        start_len = len(self.manager.history._history)
        self.manager.add_new_history_entry(
            coalesce_key="param:alpha",
            coalesce_window_s=1.0,
        )
        self.manager.add_new_history_entry(
            coalesce_key="param:alpha",
            coalesce_window_s=1.0,
        )
        self.assertEqual(len(self.manager.history._history), start_len + 1)

        self.manager.add_new_history_entry(
            coalesce_key="param:beta",
            coalesce_window_s=1.0,
        )
        self.assertEqual(len(self.manager.history._history), start_len + 2)


if __name__ == "__main__":
    unittest.main()
