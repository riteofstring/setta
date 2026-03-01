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

        async def record_refresh(next_state):
            nonlocal refresh_calls
            refresh_calls += 1
            await original_refresh(next_state)

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
            sender.broadcast_project_state = original_snapshot  # type: ignore[method-assign]
            sender.broadcast_project_state_section_impl_patch = original_section_patch  # type: ignore[method-assign]

        assert 0 == refresh_calls
        assert [project_config_id] == scheduled_refreshes
        assert 0 == snapshot_calls
        assert 1 == len(section_impl_patch_calls)
        patch = section_impl_patch_calls[0]
        assert patch["projectConfigId"] == project_config_id
        assert patch["sectionId"] == task_board_section_id
        assert patch["sectionImplType"] == SectionType.TaskBoard
        assert patch["previousProjectStateRevision"] < patch["projectStateRevision"]


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
            manager._pending_deferred_codegen_refresh_revision_by_project_config[  # type: ignore[attr-defined]
                project_config_id_for_refresh
            ] = manager.history.revision

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
            not in manager._pending_deferred_codegen_refresh_revision_by_project_config  # type: ignore[attr-defined]
        )
