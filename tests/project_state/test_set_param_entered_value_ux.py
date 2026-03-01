import pytest

from setta.project_state.project_manager_types import (
    RedoRequest,
    SetParamEnteredValueRequest,
    UndoRequest,
)
from setta.types.code_obj_impls import BaseChildlessCodeObjImpl
from setta.types.helpers_lvl1 import get_curr_effective_code_obj_impl_with_type_guard
from setta.types.id import ID
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


SECTION_ID = ID("section-1")
FIRST_PARAM_ID = ID("param-0")
SECOND_PARAM_ID = ID("param-1")


def _get_param_value(manager, project_config_id: ID, param_id: ID) -> str:
    project_state = manager.get_single_config_state(project_config_id)
    impl = get_curr_effective_code_obj_impl_with_type_guard(
        project_state,
        SECTION_ID,
        param_id,
        BaseChildlessCodeObjImpl,
    )
    return impl.value


def _snapshot_watcher_paths(manager) -> dict[str, set[str]]:
    snapshots: dict[str, set[str]] = {}
    callbacks = manager.specific_file_watcher.callbacks
    for category, callback_map in callbacks.items():
        snapshots[category] = {str(path) for path in callback_map}
    return snapshots


@pytest.mark.asyncio
async def test_set_param_entered_value_preserves_broadcast_shape_and_value_update() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        sender = manager.websocket_msg_handler
        project_state_broadcast_calls = 0
        name_validation_broadcast_calls = 0
        original_project_state_broadcast = sender.broadcast_project_state
        original_name_validation_broadcast = sender.broadcast_name_validation_errors

        async def record_project_state_broadcast(
            project_state,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            nonlocal project_state_broadcast_calls
            project_state_broadcast_calls += 1
            await original_project_state_broadcast(
                project_state, completed_op_ids, pending_op_ids
            )

        async def record_name_validation_broadcast(content) -> None:
            nonlocal name_validation_broadcast_calls
            name_validation_broadcast_calls += 1
            await original_name_validation_broadcast(content)

        sender.broadcast_project_state = record_project_state_broadcast  # type: ignore[method-assign]
        sender.broadcast_name_validation_errors = record_name_validation_broadcast  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before_project_state = project_state_broadcast_calls
            before_name_validation = name_validation_broadcast_calls
            await manager.set_param_entered_value(
                SetParamEnteredValueRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    paramInfoId=FIRST_PARAM_ID,
                    value="1234",
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_project_state = original_project_state_broadcast  # type: ignore[method-assign]
            sender.broadcast_name_validation_errors = original_name_validation_broadcast  # type: ignore[method-assign]

        assert project_state_broadcast_calls - before_project_state == 1
        assert name_validation_broadcast_calls - before_name_validation == 0
        assert _get_param_value(manager, project_config_id, FIRST_PARAM_ID) == "1234"


@pytest.mark.asyncio
async def test_set_param_entered_value_preserves_undo_redo_behavior() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        baseline_first_param = _get_param_value(manager, project_config_id, FIRST_PARAM_ID)
        baseline_second_param = _get_param_value(
            manager, project_config_id, SECOND_PARAM_ID
        )

        await manager.set_param_entered_value(
            SetParamEnteredValueRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
                paramInfoId=FIRST_PARAM_ID,
                value="first-change",
            )
        )
        await manager.set_param_entered_value(
            SetParamEnteredValueRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
                paramInfoId=SECOND_PARAM_ID,
                value="second-change",
            )
        )
        await manager.finish_pending_operations(timeout=5.0)
        assert _get_param_value(manager, project_config_id, FIRST_PARAM_ID) == "first-change"
        assert (
            _get_param_value(manager, project_config_id, SECOND_PARAM_ID)
            == "second-change"
        )

        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        assert _get_param_value(manager, project_config_id, FIRST_PARAM_ID) == "first-change"
        assert (
            _get_param_value(manager, project_config_id, SECOND_PARAM_ID)
            == baseline_second_param
        )

        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        assert (
            _get_param_value(manager, project_config_id, FIRST_PARAM_ID)
            == baseline_first_param
        )

        await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        assert _get_param_value(manager, project_config_id, FIRST_PARAM_ID) == "first-change"

        await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        assert (
            _get_param_value(manager, project_config_id, SECOND_PARAM_ID)
            == "second-change"
        )


@pytest.mark.asyncio
async def test_set_param_entered_value_preserves_watcher_path_registration() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        await manager.finish_pending_operations(timeout=5.0)
        before_paths = _snapshot_watcher_paths(manager)

        await manager.set_param_entered_value(
            SetParamEnteredValueRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
                paramInfoId=FIRST_PARAM_ID,
                value="watcher-stability",
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        after_paths = _snapshot_watcher_paths(manager)
        assert after_paths == before_paths


@pytest.mark.asyncio
async def test_set_param_entered_value_skips_file_watcher_refresh_calls() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        json_source_watch_calls = 0
        artifact_watch_calls = 0
        code_watch_calls = 0
        watch_code_sync_calls = 0
        refresh_calls = 0

        original_watch_json_source_files = manager.watch_json_source_files
        original_watch_artifact_files = manager.watch_artifact_files
        original_watch_code_files = manager.watch_code_files
        original_watch_code_sync = manager.watch_code_manager.sync_from_backend
        original_refresh = manager._refresh_codegen_state

        def record_watch_json_source_files() -> None:
            nonlocal json_source_watch_calls
            json_source_watch_calls += 1
            original_watch_json_source_files()

        def record_watch_artifact_files() -> None:
            nonlocal artifact_watch_calls
            artifact_watch_calls += 1
            original_watch_artifact_files()

        def record_watch_code_files() -> None:
            nonlocal code_watch_calls
            code_watch_calls += 1
            original_watch_code_files()

        def record_watch_code_sync(backend) -> None:
            nonlocal watch_code_sync_calls
            watch_code_sync_calls += 1
            original_watch_code_sync(backend)

        async def record_refresh(next_state):
            nonlocal refresh_calls
            refresh_calls += 1
            await original_refresh(next_state)

        manager.watch_json_source_files = record_watch_json_source_files  # type: ignore[method-assign]
        manager.watch_artifact_files = record_watch_artifact_files  # type: ignore[method-assign]
        manager.watch_code_files = record_watch_code_files  # type: ignore[method-assign]
        manager.watch_code_manager.sync_from_backend = record_watch_code_sync  # type: ignore[method-assign]
        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before_json = json_source_watch_calls
            before_artifact = artifact_watch_calls
            before_code = code_watch_calls
            before_sync = watch_code_sync_calls
            before_refresh = refresh_calls
            await manager.set_param_entered_value(
                SetParamEnteredValueRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    paramInfoId=FIRST_PARAM_ID,
                    value="no-watcher-refresh",
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            manager.watch_json_source_files = original_watch_json_source_files  # type: ignore[method-assign]
            manager.watch_artifact_files = original_watch_artifact_files  # type: ignore[method-assign]
            manager.watch_code_files = original_watch_code_files  # type: ignore[method-assign]
            manager.watch_code_manager.sync_from_backend = original_watch_code_sync  # type: ignore[method-assign]
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]

        assert json_source_watch_calls - before_json == 0
        assert artifact_watch_calls - before_artifact == 0
        assert code_watch_calls - before_code == 0
        assert watch_code_sync_calls - before_sync == 0
        assert refresh_calls - before_refresh > 0
