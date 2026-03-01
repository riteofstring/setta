from types import SimpleNamespace

import pytest

from setta.project_state.project_manager_types import (
    RunCodeRequest,
    SetTaskBoardSectionStateRequest,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.id import ID
from setta.types.project_config import Position
from setta.types.section_impls import (
    SectionType,
    TaskBoardColumn,
    TaskBoardTask,
    TaskBoardViewMode,
)
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


def build_task_board_state_request(
    *,
    project_config_id: ID,
    section_id: ID,
    iteration: int,
) -> SetTaskBoardSectionStateRequest:
    column_id = ID("task-board-column-1")
    return SetTaskBoardSectionStateRequest(
        projectConfigId=project_config_id,
        sectionId=section_id,
        viewMode=TaskBoardViewMode.task_list,
        columns=[
            TaskBoardColumn(
                id=column_id,
                name="Todo",
                sortIndex=0,
            )
        ],
        tasks=[
            TaskBoardTask(
                id=ID("task-board-task-1"),
                title=f"Task {iteration}",
                columnId=column_id,
                sortIndex=0,
            )
        ],
    )


@pytest.mark.asyncio
async def test_set_task_board_section_state_acks_via_patch_then_defers_refresh() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(40)
        task_board_section_id = create_top_level_section(
            SettingsState(),
            project_state,
            SectionType.TaskBoard,
            Position(x=900, y=120),
            core_overrides={"name": "deferred_refresh_task_board"},
        )
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        scheduled_refreshes: list[ID] = []

        def record_schedule(project_config_id_for_refresh: ID) -> None:
            scheduled_refreshes.append(project_config_id_for_refresh)

        manager._schedule_deferred_codegen_refresh = record_schedule  # type: ignore[method-assign]

        refresh_calls = 0
        original_refresh = manager._refresh_codegen_state
        watcher_refresh_calls = 0
        original_watch_json_source_files = manager.watch_json_source_files
        original_watch_artifact_files = manager.watch_artifact_files
        original_watch_code_files = manager.watch_code_files
        original_watch_code_sync_from_backend = (
            manager.watch_code_manager.sync_from_backend
        )

        async def record_refresh(next_state):
            nonlocal refresh_calls
            refresh_calls += 1
            await original_refresh(next_state)

        def record_watch_json_source_files() -> None:
            nonlocal watcher_refresh_calls
            watcher_refresh_calls += 1
            original_watch_json_source_files()

        def record_watch_artifact_files() -> None:
            nonlocal watcher_refresh_calls
            watcher_refresh_calls += 1
            original_watch_artifact_files()

        def record_watch_code_files(project_state_for_watch) -> None:
            nonlocal watcher_refresh_calls
            watcher_refresh_calls += 1
            original_watch_code_files(project_state_for_watch)

        def record_watch_code_sync_from_backend(
            project_state_backend_for_watch,
        ) -> None:
            nonlocal watcher_refresh_calls
            watcher_refresh_calls += 1
            original_watch_code_sync_from_backend(project_state_backend_for_watch)

        sender = manager.websocket_msg_handler
        snapshot_calls = 0
        section_impl_patch_calls: list[dict[str, int | str | list[str]]] = []
        original_snapshot = sender.broadcast_project_state
        original_section_patch = sender.broadcast_project_state_section_impl_patch

        async def record_snapshot(
            project_state,
            completed_op_ids,
            pending_op_ids,
            project_state_revision=None,
        ) -> None:
            nonlocal snapshot_calls
            snapshot_calls += 1
            await original_snapshot(
                project_state,
                completed_op_ids,
                pending_op_ids,
                project_state_revision,
            )

        async def record_section_patch(
            project_config_id_for_patch,
            section_id_for_patch,
            section_impl_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            section_impl_patch_calls.append(
                {
                    "projectConfigId": project_config_id_for_patch,
                    "sectionId": section_id_for_patch,
                    "sectionImplType": section_impl_for_patch.type,
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
                    "completedOpIds": list(completed_op_ids),
                    "pendingOpIds": list(pending_op_ids),
                }
            )
            await original_section_patch(
                project_config_id_for_patch,
                section_id_for_patch,
                section_impl_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        manager.watch_json_source_files = record_watch_json_source_files  # type: ignore[method-assign]
        manager.watch_artifact_files = record_watch_artifact_files  # type: ignore[method-assign]
        manager.watch_code_files = record_watch_code_files  # type: ignore[method-assign]
        manager.watch_code_manager.sync_from_backend = (
            record_watch_code_sync_from_backend  # type: ignore[method-assign]
        )
        sender.broadcast_project_state = record_snapshot  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = record_section_patch  # type: ignore[method-assign]
        try:
            await manager.set_task_board_section_state(
                build_task_board_state_request(
                    project_config_id=project_config_id,
                    section_id=task_board_section_id,
                    iteration=1,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]
            manager.watch_json_source_files = original_watch_json_source_files  # type: ignore[method-assign]
            manager.watch_artifact_files = original_watch_artifact_files  # type: ignore[method-assign]
            manager.watch_code_files = original_watch_code_files  # type: ignore[method-assign]
            manager.watch_code_manager.sync_from_backend = (
                original_watch_code_sync_from_backend  # type: ignore[method-assign]
            )
            sender.broadcast_project_state = original_snapshot  # type: ignore[method-assign]
            sender.broadcast_project_state_section_impl_patch = original_section_patch  # type: ignore[method-assign]

        assert 0 == refresh_calls
        assert 0 == watcher_refresh_calls
        assert [project_config_id] == scheduled_refreshes
        assert 0 == snapshot_calls
        assert 1 == len(section_impl_patch_calls)
        patch = section_impl_patch_calls[0]
        assert patch["projectConfigId"] == project_config_id
        assert patch["sectionId"] == task_board_section_id
        assert patch["sectionImplType"] == SectionType.TaskBoard
        assert patch["previousProjectStateRevision"] < patch["projectStateRevision"]


@pytest.mark.asyncio
async def test_finish_pending_operations_waits_for_task_board_deferred_refresh() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(40)
        task_board_section_id = create_top_level_section(
            SettingsState(),
            project_state,
            SectionType.TaskBoard,
            Position(x=900, y=120),
            core_overrides={"name": "finish_pending_waits_for_task_board_refresh"},
        )
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        refresh_calls = 0
        original_refresh = manager._refresh_codegen_state

        async def record_refresh(next_state):
            nonlocal refresh_calls
            refresh_calls += 1
            await original_refresh(next_state)

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        try:
            await manager.set_task_board_section_state(
                build_task_board_state_request(
                    project_config_id=project_config_id,
                    section_id=task_board_section_id,
                    iteration=2,
                )
            )
            # The task board route schedules deferred refresh after patch transport.
            assert (
                project_config_id
                in manager._pending_deferred_codegen_refresh_by_project_config
            )
            refresh_calls_before_wait = refresh_calls
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]

        assert refresh_calls == refresh_calls_before_wait + 1
        assert (
            project_config_id
            not in manager._pending_deferred_codegen_refresh_by_project_config
        )


@pytest.mark.asyncio
async def test_create_run_command_flushes_pending_task_board_deferred_refresh() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(40)
        task_board_section_id = create_top_level_section(
            SettingsState(),
            project_state,
            SectionType.TaskBoard,
            Position(x=900, y=120),
            core_overrides={"name": "flush_pending_deferred_refresh_task_board"},
        )
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        refresh_calls = 0
        original_refresh = manager._refresh_codegen_state

        async def record_refresh(next_state):
            nonlocal refresh_calls
            refresh_calls += 1
            await original_refresh(next_state)

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]

        def mark_pending_refresh_only(project_config_id_for_refresh: ID) -> None:
            manager._pending_deferred_codegen_refresh_by_project_config[  # type: ignore[attr-defined]
                project_config_id_for_refresh
            ] = SimpleNamespace(
                history_revision=manager.history.revision,
                history_entry_token=manager.history.get_current_entry_token(),
            )

        manager._schedule_deferred_codegen_refresh = mark_pending_refresh_only  # type: ignore[method-assign]
        try:
            await manager.set_task_board_section_state(
                build_task_board_state_request(
                    project_config_id=project_config_id,
                    section_id=task_board_section_id,
                    iteration=2,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            assert 0 == refresh_calls

            await manager.create_run_command(
                RunCodeRequest(
                    projectConfigId=project_config_id,
                    sectionId=None,
                    terminalSectionId=None,
                    cliId=None,
                    runSnapshotMode=None,
                    drawSnapshotsBySectionId=None,
                    sectionVariantOverrides=None,
                    paramOverrides=None,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]

        assert 1 == refresh_calls
        assert (
            project_config_id
            not in manager._pending_deferred_codegen_refresh_by_project_config  # type: ignore[attr-defined]
        )


@pytest.mark.asyncio
async def test_flush_pending_task_board_deferred_refresh_uses_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(40)
        task_board_section_id = create_top_level_section(
            SettingsState(),
            project_state,
            SectionType.TaskBoard,
            Position(x=900, y=120),
            core_overrides={"name": "flush_patch_transport_task_board"},
        )
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        def mark_pending_refresh_only(project_config_id_for_refresh: ID) -> None:
            manager._pending_deferred_codegen_refresh_by_project_config[  # type: ignore[attr-defined]
                project_config_id_for_refresh
            ] = SimpleNamespace(
                history_revision=manager.history.revision,
                history_entry_token=manager.history.get_current_entry_token(),
            )

        manager._schedule_deferred_codegen_refresh = mark_pending_refresh_only  # type: ignore[method-assign]

        sender = manager.websocket_msg_handler
        snapshot_calls = 0
        section_impl_patch_calls = 0
        project_config_patch_calls = 0
        op_status_patch_calls = 0
        original_snapshot = sender.broadcast_project_state
        original_section_patch = sender.broadcast_project_state_section_impl_patch
        original_project_config_patch = (
            sender.broadcast_project_state_project_config_patch
        )
        original_op_status_patch = sender.broadcast_project_state_op_status_patch

        async def record_snapshot(
            project_state,
            completed_op_ids,
            pending_op_ids,
            project_state_revision=None,
        ) -> None:
            nonlocal snapshot_calls
            snapshot_calls += 1
            await original_snapshot(
                project_state,
                completed_op_ids,
                pending_op_ids,
                project_state_revision,
            )

        async def record_section_patch(
            project_config_id_for_patch,
            section_id_for_patch,
            section_impl_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            nonlocal section_impl_patch_calls
            section_impl_patch_calls += 1
            await original_section_patch(
                project_config_id_for_patch,
                section_id_for_patch,
                section_impl_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        async def record_project_config_patch(
            project_config_id_for_patch,
            project_config_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            nonlocal project_config_patch_calls
            project_config_patch_calls += 1
            await original_project_config_patch(
                project_config_id_for_patch,
                project_config_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        async def record_op_status_patch(
            project_config_id_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            nonlocal op_status_patch_calls
            op_status_patch_calls += 1
            await original_op_status_patch(
                project_config_id_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        sender.broadcast_project_state = record_snapshot  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = record_section_patch  # type: ignore[method-assign]
        sender.broadcast_project_state_project_config_patch = (
            record_project_config_patch  # type: ignore[method-assign]
        )
        sender.broadcast_project_state_op_status_patch = record_op_status_patch  # type: ignore[method-assign]
        try:
            await manager.set_task_board_section_state(
                build_task_board_state_request(
                    project_config_id=project_config_id,
                    section_id=task_board_section_id,
                    iteration=3,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)

            snapshot_calls = 0
            section_impl_patch_calls = 0
            project_config_patch_calls = 0
            op_status_patch_calls = 0

            await manager._flush_pending_deferred_codegen_refresh(project_config_id)
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_project_state = original_snapshot  # type: ignore[method-assign]
            sender.broadcast_project_state_section_impl_patch = original_section_patch  # type: ignore[method-assign]
            sender.broadcast_project_state_project_config_patch = (
                original_project_config_patch  # type: ignore[method-assign]
            )
            sender.broadcast_project_state_op_status_patch = original_op_status_patch  # type: ignore[method-assign]

        assert 0 == snapshot_calls
        assert (
            section_impl_patch_calls
            + project_config_patch_calls
            + op_status_patch_calls
            >= 1
        )
