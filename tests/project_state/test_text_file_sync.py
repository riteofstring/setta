from contextlib import AsyncExitStack
from pathlib import Path
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from setta.project_state.project_manager_types import (
    CreateTopLevelSectionRequest,
    SetCodeRequest,
)
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.section_impls import CodeSyncMode, SectionType
from setta.types.simplified_states import Position
from setta.types.specific_file_watcher import FileEventType, FileWatcherCoreUpdate
from setta.utils.utils import normalize_path

from tests.utils.manager_fixture import real_settings_manager


class TextFileSyncIntegrationTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.exit_stack = AsyncExitStack()
        self.fixture = await self.exit_stack.enter_async_context(real_settings_manager())
        self.manager = self.fixture.manager
        self.project_config_id = (
            self.manager.project_state_backend.defaultProjectConfigId
        )
        await self.manager.load_project_config(self.project_config_id)

    async def asyncTearDown(self) -> None:
        await self.exit_stack.aclose()

    async def _create_two_way_code_section(
        self,
        *,
        file_path: Path,
        initial_code: str = "print('initial')",
    ) -> str:
        request = CreateTopLevelSectionRequest(
            projectConfigId=self.project_config_id,
            implType=SectionType.Code,
            implOverrides={"type": SectionType.Code},
            position=Position(),
        )
        section_id = await self.manager.create_top_level_section(request)

        set_code_request = SetCodeRequest(
            projectConfigId=self.project_config_id,
            sectionId=section_id,
            code=initial_code,
            filePath=str(file_path),
            syncMode=CodeSyncMode.twoWay,
            fileMissing=False,
        )
        await self.manager.set_code(set_code_request)
        return section_id

    def _get_text_file_callback(self, path: Path):
        callback_category = f"{self.manager.__class__.__name__}_TextFiles"
        normalized = normalize_path(path)
        callbacks = self.manager.specific_file_watcher.callbacks[callback_category]
        return callbacks[normalized], normalized

    async def test_initial_two_way_binding_loads_existing_file(self):
        target_path = self.fixture.code_folder / "existing.py"
        disk_content = "print('from disk')\n"
        self.fixture.dbe.write(target_path, disk_content)

        request = CreateTopLevelSectionRequest(
            projectConfigId=self.project_config_id,
            implType=SectionType.Code,
            implOverrides={"type": SectionType.Code},
            position=Position(),
        )
        section_id = await self.manager.create_top_level_section(request)

        set_code_request = SetCodeRequest(
            projectConfigId=self.project_config_id,
            sectionId=section_id,
            code="",
            filePath=str(target_path),
            syncMode=CodeSyncMode.twoWay,
            fileMissing=False,
        )
        await self.manager.set_code(set_code_request)

        file_after = self.fixture.dbe.read(target_path)
        self.assertEqual(file_after, disk_content)

        project_state = self.manager.get_single_config_state(self.project_config_id)
        impl = get_curr_effective_section_impl(project_state, section_id)
        self.assertEqual(impl.code, disk_content)
        self.assertFalse(impl.fileMissing)

    async def test_external_change_updates_project_state(self):
        target_path = self.fixture.code_folder / "synced.py"
        section_id = await self._create_two_way_code_section(
            file_path=target_path, initial_code="print('initial')"
        )

        external_content = "print('updated')"
        self.fixture.dbe.write(target_path, external_content)

        callback, normalized_path = self._get_text_file_callback(target_path)
        notification_spy = AsyncMock()
        self.manager.websocket_msg_handler.broadcast_notification = notification_spy

        update = FileWatcherCoreUpdate(
            absPath=target_path.resolve(),
            relPath=normalized_path,
            eventType=FileEventType.modified,
            matchingGlobPatterns=[],
            fileToRead=normalized_path,
        )
        await callback(update)

        project_state = self.manager.get_single_config_state(self.project_config_id)
        impl = get_curr_effective_section_impl(project_state, section_id)
        self.assertEqual(impl.code, external_content)
        self.assertFalse(impl.fileMissing)

        self.assertGreaterEqual(notification_spy.await_count, 1)
        last_call = notification_spy.await_args_list[-1]
        notification = last_call.args[0]
        self.assertIn("modified", notification.message)
        self.assertEqual(notification.projectConfigId, self.project_config_id)

    async def test_deleted_file_sets_missing_flag(self):
        target_path = self.fixture.code_folder / "synced_missing.py"
        section_id = await self._create_two_way_code_section(
            file_path=target_path, initial_code="print('initial')"
        )

        if target_path.exists():
            target_path.unlink()

        callback, normalized_path = self._get_text_file_callback(target_path)
        notification_spy = AsyncMock()
        self.manager.websocket_msg_handler.broadcast_notification = notification_spy

        update = FileWatcherCoreUpdate(
            absPath=target_path.resolve(),
            relPath=normalized_path,
            eventType=FileEventType.deleted,
            matchingGlobPatterns=[],
            fileToRead=normalized_path,
        )
        await callback(update)

        project_state = self.manager.get_single_config_state(self.project_config_id)
        impl = get_curr_effective_section_impl(project_state, section_id)
        self.assertTrue(impl.fileMissing)
        self.assertEqual(impl.code, "print('initial')")

        self.assertGreaterEqual(notification_spy.await_count, 1)
        notification = notification_spy.await_args_list[-1].args[0]
        self.assertIn("deleted", notification.message)

    async def test_skips_when_hash_matches_last_write(self):
        target_path = self.fixture.code_folder / "synced_skip.py"
        await self._create_two_way_code_section(
            file_path=target_path, initial_code="print('initial')"
        )

        callback, normalized_path = self._get_text_file_callback(target_path)
        handler_mock = AsyncMock()
        with patch.object(
            self.manager,
            "handle_external_text_file_change",
            handler_mock,
        ):
            update = FileWatcherCoreUpdate(
                absPath=target_path.resolve(),
                relPath=normalized_path,
                eventType=FileEventType.modified,
                matchingGlobPatterns=[],
                fileToRead=normalized_path,
            )
            await callback(update)

        handler_mock.assert_not_awaited()
