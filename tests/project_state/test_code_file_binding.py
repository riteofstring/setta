from __future__ import annotations

import unittest
from contextlib import AsyncExitStack
from unittest.mock import Mock, patch

from setta.project_state.code_file_sync import CodeFileSyncService
from setta.project_state.project_manager_types import (
    CreateTopLevelSectionRequest,
    SetCodeFileBindingRequest,
)
from setta.types.generated.impl_args_as_typed_dicts import CodeSectionImplArgs
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.section_impls import (
    CodeFileAccessMode,
    CodeSectionImpl,
    SectionType,
)
from setta.types.simplified_states import Position
from setta.utils.utils import normalize_path

from tests.utils.manager_fixture import real_settings_manager


class SetCodeFileBindingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._start_patcher = patch(
            "setta.file_watchers.specific_file_watcher.SpecificFileWatcher.start"
        )
        self._start_patcher.start()

        self._exit_stack = AsyncExitStack()
        self.fixture = await self._exit_stack.enter_async_context(
            real_settings_manager()
        )
        self.manager = self.fixture.manager
        default_config_id = self.manager.project_state_backend.defaultProjectConfigId
        if default_config_id is None:
            self.fail("Test fixture expected default project config id")
        self.project_config_id: str = default_config_id
        await self.manager.load_project_config(self.project_config_id)
        self.manager.completed_op_ids_since_last_broadcast.clear()

        self.code_file_sync_mock = Mock(spec=CodeFileSyncService)
        self.manager.code_file_sync = self.code_file_sync_mock

    async def asyncTearDown(self):
        await self._exit_stack.aclose()
        self._start_patcher.stop()

    async def test_updates_binding_and_refreshes_sync(self):
        request = CreateTopLevelSectionRequest(
            projectConfigId=self.project_config_id,
            implType=SectionType.Code,
            implOverrides=CodeSectionImplArgs(type=SectionType.Code),
            position=Position(),
        )
        section_id = await self.manager.create_top_level_section(request)
        self.manager.completed_op_ids_since_last_broadcast.clear()
        self.code_file_sync_mock.reset_mock()

        custom_path = self.fixture.code_folder / "sections" / "custom_binding.py"
        binding_request = SetCodeFileBindingRequest(
            projectConfigId=self.project_config_id,
            sectionId=section_id,
            canonicalPath=custom_path,
            accessMode=CodeFileAccessMode.read_write,
        )
        await self.manager.set_code_file_binding(binding_request)

        project_state = self.manager.get_single_config_state(self.project_config_id)
        section_impl = get_curr_effective_section_impl_with_type_guard(
            project_state, section_id, CodeSectionImpl
        )
        binding = section_impl.codeFileBinding
        if binding is None:
            self.fail("Code file binding should exist after set_code_file_binding")
        self.assertEqual(binding.canonical_path, normalize_path(custom_path))
        self.assertEqual(binding.snapshot_dir, normalize_path(custom_path.parent))
        self.assertEqual(binding.access_mode, CodeFileAccessMode.read_write)

        self.code_file_sync_mock.refresh_binding.assert_called_once()
        refreshed_owner = self.code_file_sync_mock.refresh_binding.call_args[0][0]
        self.assertEqual(
            refreshed_owner.binding.canonical_path, normalize_path(custom_path)
        )
        self.assertEqual(refreshed_owner.section_id, section_id)
