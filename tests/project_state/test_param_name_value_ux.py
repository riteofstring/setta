import pytest

from setta.project_state.project_manager_types import (
    SetCodeObjDisplayNameRequest,
    SetCodeObjNameRequest,
    SetParamNameAndValueRequest,
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


def _get_code_obj_name(manager, project_config_id: ID, code_obj_id: ID) -> str:
    project_state = manager.get_single_config_state(project_config_id)
    return project_state.codeObjs[code_obj_id].name


def _get_code_obj_display_name(manager, project_config_id: ID, code_obj_id: ID) -> str:
    project_state = manager.get_single_config_state(project_config_id)
    return project_state.codeObjs[code_obj_id].displayName


def _snapshot_watcher_paths(manager) -> dict[str, set[str]]:
    snapshots: dict[str, set[str]] = {}
    callbacks = manager.specific_file_watcher.callbacks
    for category, callback_map in callbacks.items():
        snapshots[category] = {str(path) for path in callback_map}
    return snapshots


async def _assert_skips_file_watcher_refresh_calls(
    manager,
    operation_coro,
    *,
    expected_project_config_id: ID,
) -> None:
    json_source_watch_calls = 0
    artifact_watch_calls = 0
    code_watch_calls = 0
    watch_code_sync_calls = 0
    refresh_calls = 0
    scheduled_deferred_refreshes: list[ID] = []

    original_watch_json_source_files = manager.watch_json_source_files
    original_watch_artifact_files = manager.watch_artifact_files
    original_watch_code_files = manager.watch_code_files
    original_watch_code_sync = manager.watch_code_manager.sync_from_backend
    original_refresh = manager._refresh_codegen_state
    original_schedule_deferred_refresh = manager._schedule_deferred_codegen_refresh

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

    def record_schedule_deferred_refresh(project_config_id_for_refresh: ID) -> None:
        scheduled_deferred_refreshes.append(project_config_id_for_refresh)

    manager.watch_json_source_files = record_watch_json_source_files  # type: ignore[method-assign]
    manager.watch_artifact_files = record_watch_artifact_files  # type: ignore[method-assign]
    manager.watch_code_files = record_watch_code_files  # type: ignore[method-assign]
    manager.watch_code_manager.sync_from_backend = record_watch_code_sync  # type: ignore[method-assign]
    manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
    manager._schedule_deferred_codegen_refresh = (  # type: ignore[method-assign]
        record_schedule_deferred_refresh
    )
    try:
        await manager.finish_pending_operations(timeout=5.0)
        before_json = json_source_watch_calls
        before_artifact = artifact_watch_calls
        before_code = code_watch_calls
        before_sync = watch_code_sync_calls
        before_refresh = refresh_calls
        before_scheduled_deferred_refreshes = len(scheduled_deferred_refreshes)
        await operation_coro
        await manager.finish_pending_operations(timeout=5.0)
    finally:
        manager.watch_json_source_files = original_watch_json_source_files  # type: ignore[method-assign]
        manager.watch_artifact_files = original_watch_artifact_files  # type: ignore[method-assign]
        manager.watch_code_files = original_watch_code_files  # type: ignore[method-assign]
        manager.watch_code_manager.sync_from_backend = original_watch_code_sync  # type: ignore[method-assign]
        manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]
        manager._schedule_deferred_codegen_refresh = (  # type: ignore[method-assign]
            original_schedule_deferred_refresh
        )

    assert json_source_watch_calls - before_json == 0
    assert artifact_watch_calls - before_artifact == 0
    assert code_watch_calls - before_code == 0
    assert watch_code_sync_calls - before_sync == 0
    assert refresh_calls - before_refresh == 0
    assert len(scheduled_deferred_refreshes) == before_scheduled_deferred_refreshes + 1
    assert scheduled_deferred_refreshes[-1] == expected_project_config_id


@pytest.mark.asyncio
async def test_set_param_name_and_value_preserves_broadcast_shape_and_mutation() -> (
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
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
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
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
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
        sender.broadcast_project_state_code_objs_patch = (
            record_code_obj_patch  # type: ignore[method-assign]
        )
        sender.broadcast_project_state_section_impl_patch = (
            record_section_impl_patch  # type: ignore[method-assign]
        )
        sender.broadcast_name_validation_errors = record_name_validation_broadcast  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before_project_state = project_state_broadcast_calls
            before_code_obj_patch_count = len(code_obj_patch_calls)
            before_section_impl_patch_count = len(section_impl_patch_calls)
            before_name_validation = name_validation_broadcast_calls
            await manager.set_param_name_and_value(
                SetParamNameAndValueRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    codeObjId=FIRST_PARAM_ID,
                    name="renamed_param",
                    value="12345",
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
        section_impl_patches = section_impl_patch_calls[before_section_impl_patch_count:]
        assert len(section_impl_patches) >= 1
        assert any(patch["sectionId"] == SECTION_ID for patch in section_impl_patches)
        for patch in section_impl_patches:
            assert patch["projectConfigId"] == project_config_id
            assert (
                patch["previousProjectStateRevision"]
                == code_obj_patch["projectStateRevision"]
            )
            assert patch["projectStateRevision"] == code_obj_patch["projectStateRevision"]
        assert name_validation_broadcast_calls - before_name_validation == 1
        assert (
            _get_code_obj_name(manager, project_config_id, FIRST_PARAM_ID)
            == "renamed_param"
        )
        assert _get_param_value(manager, project_config_id, FIRST_PARAM_ID) == "12345"


@pytest.mark.asyncio
async def test_set_code_obj_name_preserves_broadcast_shape_and_mutation() -> None:
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
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
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
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
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
        sender.broadcast_project_state_code_objs_patch = (
            record_code_obj_patch  # type: ignore[method-assign]
        )
        sender.broadcast_project_state_section_impl_patch = (
            record_section_impl_patch  # type: ignore[method-assign]
        )
        sender.broadcast_name_validation_errors = record_name_validation_broadcast  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before_project_state = project_state_broadcast_calls
            before_code_obj_patch_count = len(code_obj_patch_calls)
            before_section_impl_patch_count = len(section_impl_patch_calls)
            before_name_validation = name_validation_broadcast_calls
            await manager.set_code_obj_name(
                SetCodeObjNameRequest(
                    projectConfigId=project_config_id,
                    codeObjId=SECOND_PARAM_ID,
                    name="renamed_second_param",
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
        assert SECOND_PARAM_ID in code_obj_patch["codeObjIds"]
        assert (
            code_obj_patch["previousProjectStateRevision"]
            < code_obj_patch["projectStateRevision"]
        )
        section_impl_patches = section_impl_patch_calls[before_section_impl_patch_count:]
        assert len(section_impl_patches) >= 1
        assert any(patch["sectionId"] == SECTION_ID for patch in section_impl_patches)
        for patch in section_impl_patches:
            assert patch["projectConfigId"] == project_config_id
            assert (
                patch["previousProjectStateRevision"]
                == code_obj_patch["projectStateRevision"]
            )
            assert patch["projectStateRevision"] == code_obj_patch["projectStateRevision"]
        assert name_validation_broadcast_calls - before_name_validation == 1
        assert (
            _get_code_obj_name(manager, project_config_id, SECOND_PARAM_ID)
            == "renamed_second_param"
        )


@pytest.mark.asyncio
async def test_set_code_obj_display_name_uses_code_obj_patch_transport() -> None:
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
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
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
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
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
        sender.broadcast_project_state_code_objs_patch = (
            record_code_obj_patch  # type: ignore[method-assign]
        )
        sender.broadcast_project_state_section_impl_patch = (
            record_section_impl_patch  # type: ignore[method-assign]
        )
        sender.broadcast_name_validation_errors = record_name_validation_broadcast  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before_project_state = project_state_broadcast_calls
            before_code_obj_patch_count = len(code_obj_patch_calls)
            before_section_impl_patch_count = len(section_impl_patch_calls)
            before_name_validation = name_validation_broadcast_calls
            await manager.set_code_obj_display_name(
                SetCodeObjDisplayNameRequest(
                    projectConfigId=project_config_id,
                    codeObjId=SECOND_PARAM_ID,
                    displayName="Second Param Display Name",
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
        assert SECOND_PARAM_ID in code_obj_patch["codeObjIds"]
        assert (
            code_obj_patch["previousProjectStateRevision"]
            < code_obj_patch["projectStateRevision"]
        )
        section_impl_patches = section_impl_patch_calls[before_section_impl_patch_count:]
        assert len(section_impl_patches) == 0
        assert name_validation_broadcast_calls - before_name_validation == 0
        assert (
            _get_code_obj_display_name(manager, project_config_id, SECOND_PARAM_ID)
            == "Second Param Display Name"
        )


@pytest.mark.asyncio
async def test_set_param_name_and_value_preserves_watcher_path_registration() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        await manager.finish_pending_operations(timeout=5.0)
        before_paths = _snapshot_watcher_paths(manager)
        await manager.set_param_name_and_value(
            SetParamNameAndValueRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
                codeObjId=FIRST_PARAM_ID,
                name="path_stability_param",
                value="777",
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        after_paths = _snapshot_watcher_paths(manager)
        assert after_paths == before_paths


@pytest.mark.asyncio
async def test_set_code_obj_name_preserves_watcher_path_registration() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        await manager.finish_pending_operations(timeout=5.0)
        before_paths = _snapshot_watcher_paths(manager)
        await manager.set_code_obj_name(
            SetCodeObjNameRequest(
                projectConfigId=project_config_id,
                codeObjId=SECOND_PARAM_ID,
                name="path_stability_second_param",
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        after_paths = _snapshot_watcher_paths(manager)
        assert after_paths == before_paths


@pytest.mark.asyncio
async def test_set_param_name_and_value_skips_file_watcher_refresh_calls() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        await _assert_skips_file_watcher_refresh_calls(
            manager,
            manager.set_param_name_and_value(
                SetParamNameAndValueRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    codeObjId=FIRST_PARAM_ID,
                    name="skip_refresh_param",
                    value="888",
                )
            ),
            expected_project_config_id=project_config_id,
        )


@pytest.mark.asyncio
async def test_set_code_obj_name_skips_file_watcher_refresh_calls() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        await _assert_skips_file_watcher_refresh_calls(
            manager,
            manager.set_code_obj_name(
                SetCodeObjNameRequest(
                    projectConfigId=project_config_id,
                    codeObjId=SECOND_PARAM_ID,
                    name="skip_refresh_second_param",
                )
            ),
            expected_project_config_id=project_config_id,
        )
