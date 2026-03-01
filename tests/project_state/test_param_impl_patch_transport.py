import pytest

from setta.project_state.project_manager_types import (
    ChangeParamImplRequest,
    UpdateParamImplConfigRequest,
)
from setta.types.code_obj_impls import (
    BaseParamCodeObjImpl,
    CodeObjType,
    TextParamCodeObjImpl,
)
from setta.types.helpers_lvl1 import get_curr_effective_code_obj_impl_with_type_guard
from setta.types.id import ID
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


SECTION_ID = ID("section-1")
PARAM_ID = ID("param-0")


@pytest.mark.asyncio
async def test_update_param_impl_config_uses_code_obj_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        sender = manager.websocket_msg_handler
        project_state_broadcast_calls = 0
        code_obj_patch_calls: list[dict[str, int | str | list[str]]] = []
        section_impl_patch_calls = 0
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
            nonlocal section_impl_patch_calls
            section_impl_patch_calls += 1
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
            await manager.update_param_impl_config(
                UpdateParamImplConfigRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    paramInfoId=PARAM_ID,
                    newConfig={"coreNameEditable": False},
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

        assert 0 == project_state_broadcast_calls
        assert 1 == len(code_obj_patch_calls)
        code_obj_patch = code_obj_patch_calls[0]
        assert code_obj_patch["projectConfigId"] == project_config_id
        assert PARAM_ID in code_obj_patch["codeObjIds"]
        assert (
            code_obj_patch["previousProjectStateRevision"]
            < code_obj_patch["projectStateRevision"]
        )
        assert 0 == section_impl_patch_calls
        assert 1 == name_validation_broadcast_calls
        impl = get_curr_effective_code_obj_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            SECTION_ID,
            PARAM_ID,
            BaseParamCodeObjImpl,
        )
        assert impl.coreNameEditable is False


@pytest.mark.asyncio
async def test_change_param_impl_uses_code_obj_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        sender = manager.websocket_msg_handler
        project_state_broadcast_calls = 0
        code_obj_patch_calls: list[dict[str, int | str | list[str]]] = []
        section_impl_patch_calls = 0
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
            nonlocal section_impl_patch_calls
            section_impl_patch_calls += 1
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
            await manager.change_param_impl(
                ChangeParamImplRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    paramInfoId=PARAM_ID,
                    selectedId=ID(CodeObjType.TextParam.value),
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

        assert 0 == project_state_broadcast_calls
        assert 1 == len(code_obj_patch_calls)
        code_obj_patch = code_obj_patch_calls[0]
        assert code_obj_patch["projectConfigId"] == project_config_id
        assert PARAM_ID in code_obj_patch["codeObjIds"]
        assert (
            code_obj_patch["previousProjectStateRevision"]
            < code_obj_patch["projectStateRevision"]
        )
        assert 0 == section_impl_patch_calls
        assert 1 == name_validation_broadcast_calls
        get_curr_effective_code_obj_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            SECTION_ID,
            PARAM_ID,
            TextParamCodeObjImpl,
        )
