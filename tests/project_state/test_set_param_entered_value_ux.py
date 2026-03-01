import asyncio

import pytest

from setta.project_state.project_manager_types import (
    RedoRequest,
    SetParamEnteredValueRequest,
    UndoRequest,
)
from setta.types.code_obj_impls import BaseChildlessCodeObjImpl
from setta.types.helpers_lvl1 import get_curr_effective_code_obj_impl_with_type_guard
from setta.types.id import ID
from setta.types.project_state import ProjectStateSingleConfig
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
async def test_set_param_entered_value_preserves_broadcast_shape_and_value_update() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        sender = manager.websocket_msg_handler
        project_state_broadcast_calls = 0
        code_obj_patch_calls: list[dict[str, int | str | list[str]]] = []
        section_impl_patch_calls: list[dict[str, int | str | list[str]]] = []
        name_validation_broadcast_calls = 0
        original_project_state_broadcast = sender.broadcast_project_state
        original_code_obj_patch_broadcast = (
            sender.broadcast_project_state_code_objs_patch
        )
        original_section_impl_patch_broadcast = (
            sender.broadcast_project_state_section_impl_patch
        )
        original_name_validation_broadcast = sender.broadcast_name_validation_errors

        async def record_project_state_broadcast(
            project_state,
            completed_op_ids,
            pending_op_ids,
            project_state_revision=None,
        ) -> None:
            nonlocal project_state_broadcast_calls
            project_state_broadcast_calls += 1
            await original_project_state_broadcast(
                project_state,
                completed_op_ids,
                pending_op_ids,
                project_state_revision,
            )

        async def record_code_obj_patch(
            project_config_id_for_patch,
            code_objs_for_patch,
            code_obj_variants_for_patch,
            code_obj_impls_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            code_obj_patch_calls.append(
                {
                    "projectConfigId": project_config_id_for_patch,
                    "codeObjIds": list(code_objs_for_patch.keys()),
                    "codeObjVariantIds": list(code_obj_variants_for_patch.keys()),
                    "codeObjImplIds": list(code_obj_impls_for_patch.keys()),
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
                    "completedOpIds": list(completed_op_ids),
                    "pendingOpIds": list(pending_op_ids),
                }
            )
            await original_code_obj_patch_broadcast(
                project_config_id_for_patch,
                code_objs_for_patch,
                code_obj_variants_for_patch,
                code_obj_impls_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        async def record_section_impl_patch(
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
                    "sectionImplId": section_impl_for_patch.id,
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
                    "completedOpIds": list(completed_op_ids),
                    "pendingOpIds": list(pending_op_ids),
                }
            )
            await original_section_impl_patch_broadcast(
                project_config_id_for_patch,
                section_id_for_patch,
                section_impl_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        async def record_name_validation_broadcast(content) -> None:
            nonlocal name_validation_broadcast_calls
            name_validation_broadcast_calls += 1
            await original_name_validation_broadcast(content)

        sender.broadcast_project_state = record_project_state_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_code_objs_patch = record_code_obj_patch  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = record_section_impl_patch  # type: ignore[method-assign]
        sender.broadcast_name_validation_errors = record_name_validation_broadcast  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before_project_state = project_state_broadcast_calls
            before_code_obj_patch_count = len(code_obj_patch_calls)
            before_section_impl_patch_count = len(section_impl_patch_calls)
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
            sender.broadcast_project_state_code_objs_patch = (
                original_code_obj_patch_broadcast  # type: ignore[method-assign]
            )
            sender.broadcast_project_state_section_impl_patch = (
                original_section_impl_patch_broadcast  # type: ignore[method-assign]
            )
            sender.broadcast_name_validation_errors = original_name_validation_broadcast  # type: ignore[method-assign]

        assert project_state_broadcast_calls - before_project_state == 0
        code_obj_patches = code_obj_patch_calls[before_code_obj_patch_count:]
        assert len(code_obj_patches) == 1
        code_obj_patch = code_obj_patches[0]
        assert code_obj_patch["projectConfigId"] == project_config_id
        assert FIRST_PARAM_ID in code_obj_patch["codeObjIds"]
        assert (
            code_obj_patch["previousProjectStateRevision"]
            < code_obj_patch["projectStateRevision"]
        )

        section_impl_patches = section_impl_patch_calls[
            before_section_impl_patch_count:
        ]
        assert len(section_impl_patches) >= 1
        assert any(patch["sectionId"] == SECTION_ID for patch in section_impl_patches)
        for patch in section_impl_patches:
            assert patch["projectConfigId"] == project_config_id
            assert (
                patch["previousProjectStateRevision"]
                == code_obj_patch["projectStateRevision"]
            )
            assert (
                patch["projectStateRevision"] == code_obj_patch["projectStateRevision"]
            )
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

        baseline_first_param = _get_param_value(
            manager, project_config_id, FIRST_PARAM_ID
        )
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
        assert (
            _get_param_value(manager, project_config_id, FIRST_PARAM_ID)
            == "first-change"
        )
        assert (
            _get_param_value(manager, project_config_id, SECOND_PARAM_ID)
            == "second-change"
        )

        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        assert (
            _get_param_value(manager, project_config_id, FIRST_PARAM_ID)
            == "first-change"
        )
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
        assert (
            _get_param_value(manager, project_config_id, FIRST_PARAM_ID)
            == "first-change"
        )

        await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        assert (
            _get_param_value(manager, project_config_id, SECOND_PARAM_ID)
            == "second-change"
        )


@pytest.mark.asyncio
async def test_set_param_entered_value_noop_repeat_does_not_add_history_entry() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        await manager.set_param_entered_value(
            SetParamEnteredValueRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
                paramInfoId=FIRST_PARAM_ID,
                value="same-value",
            )
        )
        await manager.finish_pending_operations(timeout=5.0)
        history_len_after_first_edit = len(manager.history._history)

        await manager.set_param_entered_value(
            SetParamEnteredValueRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
                paramInfoId=FIRST_PARAM_ID,
                value="same-value",
            )
        )
        await manager.finish_pending_operations(timeout=5.0)
        assert len(manager.history._history) == history_len_after_first_edit


@pytest.mark.asyncio
async def test_set_param_entered_value_adjacent_edits_coalesce_beyond_time_window() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        baseline_value = _get_param_value(manager, project_config_id, FIRST_PARAM_ID)
        history_len_before_edits = len(manager.history._history)

        await manager.set_param_entered_value(
            SetParamEnteredValueRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
                paramInfoId=FIRST_PARAM_ID,
                value="1",
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        # Keep the same field edit adjacent in history, but exceed the old
        # time-based coalesce window to verify adjacent coalescing behavior.
        await asyncio.sleep(0.95)
        await manager.set_param_entered_value(
            SetParamEnteredValueRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
                paramInfoId=FIRST_PARAM_ID,
                value="12",
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        assert len(manager.history._history) == history_len_before_edits + 1
        assert _get_param_value(manager, project_config_id, FIRST_PARAM_ID) == "12"

        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        assert (
            _get_param_value(manager, project_config_id, FIRST_PARAM_ID)
            == baseline_value
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

        def record_watch_code_files(*args, **kwargs) -> None:
            nonlocal code_watch_calls
            code_watch_calls += 1
            original_watch_code_files(*args, **kwargs)

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
        assert refresh_calls - before_refresh == 0


@pytest.mark.asyncio
async def test_set_param_entered_value_incremental_codegen_matches_full_refresh_output() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        # Exercise the route fast path first.
        await manager.set_param_entered_value(
            SetParamEnteredValueRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
                paramInfoId=FIRST_PARAM_ID,
                value="incremental-value",
            )
        )
        await manager.finish_pending_operations(timeout=5.0)
        incremental_codegen = manager.gen_code[project_config_id].code

        # Force a full refresh from the same state and ensure outputs match.
        refreshed_state = manager.get_single_config_state(project_config_id)
        await manager.update(
            refreshed_state,
            updateFileWatcher=False,
            validate_name_rules=False,
        )
        full_refresh_codegen = manager.gen_code[project_config_id].code
        assert incremental_codegen == full_refresh_codegen


@pytest.mark.asyncio
async def test_set_param_entered_value_falls_back_to_full_refresh_without_python_codegen() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id
        await manager.compare_and_set_python_codegen_enabled(project_config_id, False)

        refresh_calls = 0
        original_refresh = manager._refresh_codegen_state

        async def record_refresh(next_state):
            nonlocal refresh_calls
            refresh_calls += 1
            await original_refresh(next_state)

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before_refresh = refresh_calls
            await manager.set_param_entered_value(
                SetParamEnteredValueRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    paramInfoId=FIRST_PARAM_ID,
                    value="fallback-refresh",
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]

        assert refresh_calls - before_refresh > 0
        assert (
            _get_param_value(manager, project_config_id, FIRST_PARAM_ID)
            == "fallback-refresh"
        )


@pytest.mark.asyncio
async def test_set_param_entered_value_skips_full_validate_for_update(
    monkeypatch,
) -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        # Guard the fast path: value edits should avoid full derived-state
        # recomputation via validate_for_update.
        def fail_validate_for_update(
            _self: ProjectStateSingleConfig,
            *,
            _validate_code_file_bindings: bool,
            _allow_reserved_project_name: bool = False,
            _validate_name_rules: bool = True,
        ) -> ProjectStateSingleConfig:
            raise AssertionError(
                "set_param_entered_value should not call validate_for_update"
            )

        monkeypatch.setattr(
            ProjectStateSingleConfig,
            "validate_for_update",
            fail_validate_for_update,
        )
        await manager.set_param_entered_value(
            SetParamEnteredValueRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
                paramInfoId=FIRST_PARAM_ID,
                value="fast-validate-path",
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        assert (
            _get_param_value(manager, project_config_id, FIRST_PARAM_ID)
            == "fast-validate-path"
        )


@pytest.mark.asyncio
async def test_set_param_entered_value_fast_validation_matches_full_validation() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        await manager.set_param_entered_value(
            SetParamEnteredValueRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
                paramInfoId=FIRST_PARAM_ID,
                value="derived-parity",
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        # Re-run full validation on a deep copy and verify the fast path already
        # left all derived state in the same final shape.
        fast_state = manager.get_single_config_state(project_config_id)
        fully_validated_state = fast_state.model_copy(deep=True)
        fully_validated_state.validate_for_update(
            validate_code_file_bindings=True,
            validate_name_rules=False,
        )

        assert fast_state.singletonSections == fully_validated_state.singletonSections
        assert fast_state.parentSectionMap == fully_validated_state.parentSectionMap
        assert fast_state.shownParamIds == fully_validated_state.shownParamIds
        assert set(fast_state.requiredDecodedImages) == set(
            fully_validated_state.requiredDecodedImages
        )
        assert fast_state.genCodeBinding == fully_validated_state.genCodeBinding
        assert fast_state.projectConfig == fully_validated_state.projectConfig
