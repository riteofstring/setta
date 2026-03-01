from types import SimpleNamespace

import pytest

from setta.project_state.project_manager_types import (
    AddKwargRequest,
    CreateTopLevelSectionRequest,
    DeleteKwargRequest,
    DeleteSelectedParamsRequest,
    IndentParamsRequest,
    MoveParamGroup,
    MoveParamGroupsRequest,
    MoveParamsRequest,
    RedoRequest,
    SetCallableRequest,
    SetGenCodePrefixRequest,
    UndoRequest,
    UnindentParamsRequest,
)
from setta.types.code_obj_impls import (
    BaseParentCodeObjImpl,
    CodeCallableCodeObjImpl,
    CodeParamCodeObjImpl,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl,
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.helpers_lvl2 import set_section_edge_inputs
from setta.types.id import ID
from setta.types.project_config import Position
from setta.types.section_impls import CallableSectionImpl, SectionType
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


SECTION_ID = ID("section-1")
PARAM_ONE_ID = ID("param-1")
PARAM_TWO_ID = ID("param-2")
PARAM_THREE_ID = ID("param-3")
PARAM_FIVE_ID = ID("param-5")
PARAM_SIX_ID = ID("param-6")


def _install_transport_capture(sender):
    capture = {
        "project_state_broadcast_calls": 0,
        "project_config_patch_calls": [],
        "code_obj_patch_calls": [],
        "section_impl_patch_calls": [],
        "name_validation_broadcast_calls": 0,
    }
    original_project_state_broadcast = sender.broadcast_project_state
    original_project_config_patch_broadcast = (
        sender.broadcast_project_state_project_config_patch
    )
    original_code_obj_patch_broadcast = sender.broadcast_project_state_code_objs_patch
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
        capture["project_state_broadcast_calls"] += 1
        await original_project_state_broadcast(
            project_state,
            completed_op_ids,
            pending_op_ids,
            project_state_revision,
        )

    async def record_project_config_patch(
        project_config_id_for_patch,
        project_config_for_patch,
        previous_project_state_revision,
        project_state_revision,
        completed_op_ids,
        pending_op_ids,
    ) -> None:
        capture["project_config_patch_calls"].append(
            {
                "projectConfigId": project_config_id_for_patch,
                "projectConfigName": project_config_for_patch.name,
                "previousProjectStateRevision": previous_project_state_revision,
                "projectStateRevision": project_state_revision,
            }
        )
        await original_project_config_patch_broadcast(
            project_config_id_for_patch,
            project_config_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
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
        capture["code_obj_patch_calls"].append(
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
        capture["section_impl_patch_calls"].append(
            {
                "projectConfigId": project_config_id_for_patch,
                "sectionId": section_id_for_patch,
                "sectionImplId": section_impl_for_patch.id,
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
        capture["name_validation_broadcast_calls"] += 1
        await original_name_validation_broadcast(content)

    sender.broadcast_project_state = record_project_state_broadcast  # type: ignore[method-assign]
    sender.broadcast_project_state_project_config_patch = (  # type: ignore[method-assign]
        record_project_config_patch
    )
    sender.broadcast_project_state_code_objs_patch = record_code_obj_patch  # type: ignore[method-assign]
    sender.broadcast_project_state_section_impl_patch = (  # type: ignore[method-assign]
        record_section_impl_patch
    )
    sender.broadcast_name_validation_errors = record_name_validation_broadcast  # type: ignore[method-assign]

    def restore() -> None:
        sender.broadcast_project_state = original_project_state_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_project_config_patch = (  # type: ignore[method-assign]
            original_project_config_patch_broadcast
        )
        sender.broadcast_project_state_code_objs_patch = (
            original_code_obj_patch_broadcast  # type: ignore[method-assign]
        )
        sender.broadcast_project_state_section_impl_patch = (  # type: ignore[method-assign]
            original_section_impl_patch_broadcast
        )
        sender.broadcast_name_validation_errors = original_name_validation_broadcast  # type: ignore[method-assign]

    return capture, restore


async def _run_with_transport_capture(
    manager,
    operation,
    *,
    suppress_deferred_codegen_refresh: bool = True,
):
    sender = manager.websocket_msg_handler
    capture, restore = _install_transport_capture(sender)
    original_schedule_deferred_refresh = manager._schedule_deferred_codegen_refresh

    def _skip_deferred_refresh(_project_config_id: ID) -> None:
        return

    if suppress_deferred_codegen_refresh:
        manager._schedule_deferred_codegen_refresh = _skip_deferred_refresh  # type: ignore[method-assign]
    try:
        result = await operation
    finally:
        if suppress_deferred_codegen_refresh:
            manager._schedule_deferred_codegen_refresh = (
                original_schedule_deferred_refresh  # type: ignore[method-assign]
            )
        restore()
    await manager.finish_pending_operations(timeout=5.0)
    return capture, result


def _get_callable_impl(
    manager, project_config_id: ID
) -> tuple[ID, CodeCallableCodeObjImpl]:
    section_impl = get_curr_effective_section_impl_with_type_guard(
        manager.get_single_config_state(project_config_id),
        SECTION_ID,
        CallableSectionImpl,
    )
    if section_impl.callable is None:
        raise KeyError("Callable section missing callable code object id.")
    callable_id = section_impl.callable
    callable_impl = get_curr_effective_code_obj_impl_with_type_guard(
        manager.get_single_config_state(project_config_id),
        SECTION_ID,
        callable_id,
        CodeCallableCodeObjImpl,
    )
    return callable_id, callable_impl


def _set_callable_edge_inputs(manager, project_state, param_ids: list[ID]) -> None:
    set_section_edge_inputs(
        manager.settings_file.settings,
        project_state,
        SECTION_ID,
        list(param_ids),
    )


def _set_callable_param_core_names_editable(project_state, param_count: int) -> None:
    for idx in range(param_count):
        variant_id = ID(f"param-variant-{idx}")
        variant = project_state.codeObjVariants[variant_id]
        impl_id = variant.impl
        impl = project_state.codeObjImpls[impl_id]
        if not isinstance(impl, CodeParamCodeObjImpl):
            raise TypeError(f"Expected CodeParamCodeObjImpl for {impl_id}")
        impl.coreNameEditable = True


@pytest.mark.asyncio
async def test_add_kwarg_uses_code_obj_and_section_impl_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        before_code_obj_ids = set(
            manager.get_single_config_state(project_config_id).codeObjs.keys()
        )
        callable_id, callable_impl_before = _get_callable_impl(
            manager, project_config_id
        )
        before_child_count = len(callable_impl_before.children)

        capture, _ = await _run_with_transport_capture(
            manager,
            manager.add_kwarg(
                AddKwargRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                )
            ),
        )

        assert 0 == capture["project_state_broadcast_calls"]
        assert 0 == len(capture["project_config_patch_calls"])
        assert 1 == len(capture["code_obj_patch_calls"])
        code_obj_patch = capture["code_obj_patch_calls"][0]
        assert code_obj_patch["projectConfigId"] == project_config_id
        assert callable_id in code_obj_patch["codeObjIds"]
        created_param_ids = [
            code_obj_id
            for code_obj_id in code_obj_patch["codeObjIds"]
            if code_obj_id not in before_code_obj_ids
        ]
        assert 1 == len(created_param_ids)
        created_param_id = created_param_ids[0]
        assert (
            code_obj_patch["previousProjectStateRevision"]
            < code_obj_patch["projectStateRevision"]
        )

        assert len(capture["section_impl_patch_calls"]) >= 1
        assert any(
            patch["sectionId"] == SECTION_ID
            for patch in capture["section_impl_patch_calls"]
        )
        for section_patch in capture["section_impl_patch_calls"]:
            assert section_patch["projectConfigId"] == project_config_id
            assert (
                section_patch["previousProjectStateRevision"]
                == code_obj_patch["projectStateRevision"]
            )
            assert (
                section_patch["projectStateRevision"]
                == code_obj_patch["projectStateRevision"]
            )

        assert 1 == capture["name_validation_broadcast_calls"]
        _, callable_impl_after = _get_callable_impl(manager, project_config_id)
        assert len(callable_impl_after.children) == before_child_count + 1
        assert created_param_id in callable_impl_after.children


@pytest.mark.asyncio
async def test_delete_kwarg_uses_code_obj_and_section_patch_transport_when_no_edge_input() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        callable_id, callable_impl_before = _get_callable_impl(
            manager, project_config_id
        )
        removed_param_id = callable_impl_before.children[-1]
        before_child_count = len(callable_impl_before.children)

        capture, _ = await _run_with_transport_capture(
            manager,
            manager.delete_kwarg(
                DeleteKwargRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                )
            ),
        )

        assert 0 == capture["project_state_broadcast_calls"]
        assert 0 == len(capture["project_config_patch_calls"])
        assert 1 == len(capture["code_obj_patch_calls"])
        code_obj_patch = capture["code_obj_patch_calls"][0]
        assert code_obj_patch["projectConfigId"] == project_config_id
        assert callable_id in code_obj_patch["codeObjIds"]
        assert removed_param_id in code_obj_patch["codeObjIds"]
        assert (
            code_obj_patch["previousProjectStateRevision"]
            < code_obj_patch["projectStateRevision"]
        )

        assert len(capture["section_impl_patch_calls"]) >= 1
        assert any(
            patch["sectionId"] == SECTION_ID
            for patch in capture["section_impl_patch_calls"]
        )
        for section_patch in capture["section_impl_patch_calls"]:
            assert section_patch["projectConfigId"] == project_config_id
            assert (
                section_patch["previousProjectStateRevision"]
                == code_obj_patch["projectStateRevision"]
            )
            assert (
                section_patch["projectStateRevision"]
                == code_obj_patch["projectStateRevision"]
            )

        assert 1 == capture["name_validation_broadcast_calls"]
        _, callable_impl_after = _get_callable_impl(manager, project_config_id)
        assert len(callable_impl_after.children) == before_child_count - 1
        assert removed_param_id not in callable_impl_after.children


@pytest.mark.asyncio
async def test_delete_kwarg_includes_project_config_patch_when_deleting_edge_input() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        section_impl_before_update = get_curr_effective_section_impl_with_type_guard(
            project_state,
            SECTION_ID,
            CallableSectionImpl,
        )
        if section_impl_before_update.callable is None:
            raise KeyError("Callable section missing callable code object id.")
        callable_impl_before_update = get_curr_effective_code_obj_impl_with_type_guard(
            project_state,
            SECTION_ID,
            section_impl_before_update.callable,
            CodeCallableCodeObjImpl,
        )
        removed_param_id = callable_impl_before_update.children[-1]
        _set_callable_edge_inputs(manager, project_state, [removed_param_id])
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        callable_id, callable_impl_before = _get_callable_impl(
            manager, project_config_id
        )
        before_child_count = len(callable_impl_before.children)

        capture, _ = await _run_with_transport_capture(
            manager,
            manager.delete_kwarg(
                DeleteKwargRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                )
            ),
        )

        assert 0 == capture["project_state_broadcast_calls"]
        assert 1 == len(capture["project_config_patch_calls"])
        project_config_patch = capture["project_config_patch_calls"][0]
        assert project_config_patch["projectConfigId"] == project_config_id
        assert (
            project_config_patch["previousProjectStateRevision"]
            < project_config_patch["projectStateRevision"]
        )

        assert 1 == len(capture["code_obj_patch_calls"])
        code_obj_patch = capture["code_obj_patch_calls"][0]
        assert code_obj_patch["projectConfigId"] == project_config_id
        assert callable_id in code_obj_patch["codeObjIds"]
        assert removed_param_id in code_obj_patch["codeObjIds"]
        assert (
            code_obj_patch["previousProjectStateRevision"]
            == project_config_patch["projectStateRevision"]
        )
        assert (
            code_obj_patch["projectStateRevision"]
            == project_config_patch["projectStateRevision"]
        )

        assert len(capture["section_impl_patch_calls"]) >= 1
        assert any(
            patch["sectionId"] == SECTION_ID
            for patch in capture["section_impl_patch_calls"]
        )
        for section_patch in capture["section_impl_patch_calls"]:
            assert section_patch["projectConfigId"] == project_config_id
            assert (
                section_patch["previousProjectStateRevision"]
                == code_obj_patch["projectStateRevision"]
            )
            assert (
                section_patch["projectStateRevision"]
                == code_obj_patch["projectStateRevision"]
            )

        assert 1 == capture["name_validation_broadcast_calls"]
        _, callable_impl_after = _get_callable_impl(manager, project_config_id)
        assert len(callable_impl_after.children) == before_child_count - 1
        assert removed_param_id not in callable_impl_after.children


@pytest.mark.asyncio
async def test_delete_selected_params_uses_code_obj_and_section_patch_transport_when_no_edge_input() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        _set_callable_param_core_names_editable(project_state, 4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        callable_id, callable_impl_before = _get_callable_impl(
            manager, project_config_id
        )
        assert PARAM_ONE_ID in callable_impl_before.children
        assert PARAM_TWO_ID in callable_impl_before.children

        capture, _ = await _run_with_transport_capture(
            manager,
            manager.delete_selected_params(
                DeleteSelectedParamsRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    paramInfoIds=[PARAM_ONE_ID, PARAM_TWO_ID],
                )
            ),
        )

        assert 0 == capture["project_state_broadcast_calls"]
        assert 0 == len(capture["project_config_patch_calls"])
        assert 1 == len(capture["code_obj_patch_calls"])
        code_obj_patch = capture["code_obj_patch_calls"][0]
        assert code_obj_patch["projectConfigId"] == project_config_id
        assert callable_id in code_obj_patch["codeObjIds"]
        assert PARAM_ONE_ID in code_obj_patch["codeObjIds"]
        assert PARAM_TWO_ID in code_obj_patch["codeObjIds"]
        assert (
            code_obj_patch["previousProjectStateRevision"]
            < code_obj_patch["projectStateRevision"]
        )

        assert len(capture["section_impl_patch_calls"]) >= 1
        assert any(
            patch["sectionId"] == SECTION_ID
            for patch in capture["section_impl_patch_calls"]
        )
        for section_patch in capture["section_impl_patch_calls"]:
            assert section_patch["projectConfigId"] == project_config_id
            assert (
                section_patch["previousProjectStateRevision"]
                == code_obj_patch["projectStateRevision"]
            )
            assert (
                section_patch["projectStateRevision"]
                == code_obj_patch["projectStateRevision"]
            )

        assert 1 == capture["name_validation_broadcast_calls"]
        _, callable_impl_after = _get_callable_impl(manager, project_config_id)
        assert PARAM_ONE_ID not in callable_impl_after.children
        assert PARAM_TWO_ID not in callable_impl_after.children


@pytest.mark.asyncio
async def test_delete_selected_params_includes_project_config_patch_when_deleting_edge_inputs() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        _set_callable_param_core_names_editable(project_state, 4)
        _set_callable_edge_inputs(manager, project_state, [PARAM_ONE_ID])
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        callable_id, callable_impl_before = _get_callable_impl(
            manager, project_config_id
        )
        assert PARAM_ONE_ID in callable_impl_before.children
        assert PARAM_TWO_ID in callable_impl_before.children

        capture, _ = await _run_with_transport_capture(
            manager,
            manager.delete_selected_params(
                DeleteSelectedParamsRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    paramInfoIds=[PARAM_ONE_ID, PARAM_TWO_ID],
                )
            ),
        )

        assert 0 == capture["project_state_broadcast_calls"]
        assert 1 == len(capture["project_config_patch_calls"])
        project_config_patch = capture["project_config_patch_calls"][0]
        assert project_config_patch["projectConfigId"] == project_config_id
        assert (
            project_config_patch["previousProjectStateRevision"]
            < project_config_patch["projectStateRevision"]
        )

        assert 1 == len(capture["code_obj_patch_calls"])
        code_obj_patch = capture["code_obj_patch_calls"][0]
        assert code_obj_patch["projectConfigId"] == project_config_id
        assert callable_id in code_obj_patch["codeObjIds"]
        assert PARAM_ONE_ID in code_obj_patch["codeObjIds"]
        assert PARAM_TWO_ID in code_obj_patch["codeObjIds"]
        assert (
            code_obj_patch["previousProjectStateRevision"]
            == project_config_patch["projectStateRevision"]
        )
        assert (
            code_obj_patch["projectStateRevision"]
            == project_config_patch["projectStateRevision"]
        )

        assert len(capture["section_impl_patch_calls"]) >= 1
        assert any(
            patch["sectionId"] == SECTION_ID
            for patch in capture["section_impl_patch_calls"]
        )
        for section_patch in capture["section_impl_patch_calls"]:
            assert section_patch["projectConfigId"] == project_config_id
            assert (
                section_patch["previousProjectStateRevision"]
                == code_obj_patch["projectStateRevision"]
            )
            assert (
                section_patch["projectStateRevision"]
                == code_obj_patch["projectStateRevision"]
            )

        assert 1 == capture["name_validation_broadcast_calls"]
        _, callable_impl_after = _get_callable_impl(manager, project_config_id)
        assert PARAM_ONE_ID not in callable_impl_after.children
        assert PARAM_TWO_ID not in callable_impl_after.children


@pytest.mark.asyncio
async def test_move_params_uses_code_obj_and_section_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        callable_id, callable_impl_before = _get_callable_impl(
            manager, project_config_id
        )
        assert PARAM_TWO_ID in callable_impl_before.children

        capture, _ = await _run_with_transport_capture(
            manager,
            manager.move_params(
                MoveParamsRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    paramIds=[PARAM_TWO_ID],
                    newParentId=PARAM_ONE_ID,
                    newIndex=0,
                )
            ),
        )

        assert 0 == capture["project_state_broadcast_calls"]
        assert 0 == len(capture["project_config_patch_calls"])
        assert 1 == len(capture["code_obj_patch_calls"])
        code_obj_patch = capture["code_obj_patch_calls"][0]
        assert callable_id in code_obj_patch["codeObjIds"]
        assert PARAM_ONE_ID in code_obj_patch["codeObjIds"]
        assert len(capture["section_impl_patch_calls"]) >= 1
        assert any(
            patch["sectionId"] == SECTION_ID
            for patch in capture["section_impl_patch_calls"]
        )
        assert 1 == capture["name_validation_broadcast_calls"]

        callable_impl_after = get_curr_effective_code_obj_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            SECTION_ID,
            callable_id,
            CodeCallableCodeObjImpl,
        )
        assert PARAM_TWO_ID not in callable_impl_after.children
        new_parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            SECTION_ID,
            PARAM_ONE_ID,
            BaseParentCodeObjImpl,
        )
        assert PARAM_TWO_ID in new_parent_impl.children


@pytest.mark.asyncio
async def test_move_param_groups_uses_code_obj_and_section_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        callable_id, _ = _get_callable_impl(manager, project_config_id)

        capture, _ = await _run_with_transport_capture(
            manager,
            manager.move_param_groups(
                MoveParamGroupsRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    moves=[
                        MoveParamGroup(
                            paramIds=[PARAM_TWO_ID],
                            newParentId=PARAM_ONE_ID,
                            newIndex=0,
                        ),
                        MoveParamGroup(
                            paramIds=[PARAM_THREE_ID],
                            newParentId=PARAM_ONE_ID,
                            newIndex=1,
                        ),
                    ],
                )
            ),
        )

        assert 0 == capture["project_state_broadcast_calls"]
        assert 0 == len(capture["project_config_patch_calls"])
        assert 1 == len(capture["code_obj_patch_calls"])
        code_obj_patch = capture["code_obj_patch_calls"][0]
        assert callable_id in code_obj_patch["codeObjIds"]
        assert PARAM_ONE_ID in code_obj_patch["codeObjIds"]
        assert len(capture["section_impl_patch_calls"]) >= 1
        assert any(
            patch["sectionId"] == SECTION_ID
            for patch in capture["section_impl_patch_calls"]
        )
        assert 1 == capture["name_validation_broadcast_calls"]

        callable_impl_after = get_curr_effective_code_obj_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            SECTION_ID,
            callable_id,
            CodeCallableCodeObjImpl,
        )
        assert PARAM_TWO_ID not in callable_impl_after.children
        assert PARAM_THREE_ID not in callable_impl_after.children
        new_parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            SECTION_ID,
            PARAM_ONE_ID,
            BaseParentCodeObjImpl,
        )
        assert new_parent_impl.children[:2] == [PARAM_TWO_ID, PARAM_THREE_ID]


@pytest.mark.asyncio
async def test_indent_params_uses_code_obj_and_section_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        callable_id, callable_impl_before = _get_callable_impl(
            manager, project_config_id
        )
        assert PARAM_TWO_ID in callable_impl_before.children

        capture, _ = await _run_with_transport_capture(
            manager,
            manager.indent_params(
                IndentParamsRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    paramIds=[PARAM_TWO_ID],
                )
            ),
        )

        assert 0 == capture["project_state_broadcast_calls"]
        assert 0 == len(capture["project_config_patch_calls"])
        assert 1 == len(capture["code_obj_patch_calls"])
        code_obj_patch = capture["code_obj_patch_calls"][0]
        assert callable_id in code_obj_patch["codeObjIds"]
        assert PARAM_ONE_ID in code_obj_patch["codeObjIds"]
        assert len(capture["section_impl_patch_calls"]) >= 1
        assert any(
            patch["sectionId"] == SECTION_ID
            for patch in capture["section_impl_patch_calls"]
        )
        assert 1 == capture["name_validation_broadcast_calls"]

        callable_impl_after = get_curr_effective_code_obj_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            SECTION_ID,
            callable_id,
            CodeCallableCodeObjImpl,
        )
        assert PARAM_TWO_ID not in callable_impl_after.children
        new_parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            SECTION_ID,
            PARAM_ONE_ID,
            BaseParentCodeObjImpl,
        )
        assert PARAM_TWO_ID in new_parent_impl.children


@pytest.mark.asyncio
async def test_unindent_params_uses_code_obj_and_section_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        callable_id, _ = _get_callable_impl(manager, project_config_id)

        await manager.indent_params(
            IndentParamsRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
                paramIds=[PARAM_TWO_ID],
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        capture, _ = await _run_with_transport_capture(
            manager,
            manager.unindent_params(
                UnindentParamsRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    paramIds=[PARAM_TWO_ID],
                )
            ),
        )

        assert 0 == capture["project_state_broadcast_calls"]
        assert 0 == len(capture["project_config_patch_calls"])
        assert 1 == len(capture["code_obj_patch_calls"])
        code_obj_patch = capture["code_obj_patch_calls"][0]
        assert callable_id in code_obj_patch["codeObjIds"]
        assert PARAM_ONE_ID in code_obj_patch["codeObjIds"]
        assert len(capture["section_impl_patch_calls"]) >= 1
        assert any(
            patch["sectionId"] == SECTION_ID
            for patch in capture["section_impl_patch_calls"]
        )
        assert 0 == capture["name_validation_broadcast_calls"]

        callable_impl_after = get_curr_effective_code_obj_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            SECTION_ID,
            callable_id,
            CodeCallableCodeObjImpl,
        )
        assert PARAM_TWO_ID in callable_impl_after.children
        parent_impl_after = get_curr_effective_code_obj_impl(
            manager.get_single_config_state(project_config_id),
            SECTION_ID,
            PARAM_ONE_ID,
        )
        if isinstance(parent_impl_after, BaseParentCodeObjImpl):
            assert PARAM_TWO_ID not in parent_impl_after.children


@pytest.mark.asyncio
async def test_set_callable_uses_code_obj_and_section_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        current_callable_id, _ = _get_callable_impl(manager, project_config_id)

        capture, response = await _run_with_transport_capture(
            manager,
            manager.set_callable(
                SetCallableRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    callableName="patch_transport_new_callable",
                    refetchParams=True,
                )
            ),
        )

        assert response.callableId is not None
        assert response.callableId != current_callable_id
        assert 0 == capture["project_state_broadcast_calls"]
        assert 0 == len(capture["project_config_patch_calls"])
        assert 1 == len(capture["code_obj_patch_calls"])
        code_obj_patch = capture["code_obj_patch_calls"][0]
        assert code_obj_patch["projectConfigId"] == project_config_id
        assert response.callableId in code_obj_patch["codeObjIds"]
        assert (
            code_obj_patch["previousProjectStateRevision"]
            < code_obj_patch["projectStateRevision"]
        )
        assert len(capture["section_impl_patch_calls"]) >= 1
        assert any(
            patch["sectionId"] == SECTION_ID
            for patch in capture["section_impl_patch_calls"]
        )
        assert 1 == capture["name_validation_broadcast_calls"]
        section_impl = get_curr_effective_section_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            SECTION_ID,
            CallableSectionImpl,
        )
        assert section_impl.callable == response.callableId


@pytest.mark.asyncio
async def test_set_callable_clear_uses_section_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        capture, response = await _run_with_transport_capture(
            manager,
            manager.set_callable(
                SetCallableRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    callableName="",
                    refetchParams=False,
                )
            ),
        )

        assert response.callableId is None
        assert 0 == capture["project_state_broadcast_calls"]
        assert 0 == len(capture["project_config_patch_calls"])
        assert 0 == len(capture["code_obj_patch_calls"])
        assert len(capture["section_impl_patch_calls"]) >= 1
        assert any(
            patch["sectionId"] == SECTION_ID
            for patch in capture["section_impl_patch_calls"]
        )
        assert 1 == capture["name_validation_broadcast_calls"]
        section_impl = get_curr_effective_section_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            SECTION_ID,
            CallableSectionImpl,
        )
        assert section_impl.callable is None


@pytest.mark.asyncio
async def test_first_set_callable_redo_includes_code_obj_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        create_response = await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Callable,
                position=Position(x=640, y=320),
            )
        )
        section_id = create_response.sectionId
        set_response = await manager.set_callable(
            SetCallableRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                callableName="math.sqrt",
                refetchParams=False,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)
        callable_id = set_response.callableId
        if callable_id is None:
            raise KeyError("Expected callable id after set_callable.")

        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        undo_state = manager.get_single_config_state(project_config_id)
        section_impl_after_undo = get_curr_effective_section_impl_with_type_guard(
            undo_state,
            section_id,
            CallableSectionImpl,
        )
        assert section_impl_after_undo.callable is None

        redo_capture, _ = await _run_with_transport_capture(
            manager,
            manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1)),
        )

        assert 0 == redo_capture["project_state_broadcast_calls"]
        assert 0 == len(redo_capture["project_config_patch_calls"])
        assert 1 <= len(redo_capture["code_obj_patch_calls"])
        assert any(
            patch["sectionId"] == section_id
            for patch in redo_capture["section_impl_patch_calls"]
        )
        patched_code_obj_ids: set[ID] = set()
        for patch in redo_capture["code_obj_patch_calls"]:
            patched_code_obj_ids.update(patch["codeObjIds"])
        assert callable_id in patched_code_obj_ids

        redo_state = manager.get_single_config_state(project_config_id)
        section_impl_after_redo = get_curr_effective_section_impl_with_type_guard(
            redo_state,
            section_id,
            CallableSectionImpl,
        )
        callable_after_redo = section_impl_after_redo.callable
        if callable_after_redo is None:
            raise KeyError("Expected callable id after redo.")
        assert "math.sqrt" == redo_state.codeObjs[callable_after_redo].name


@pytest.mark.asyncio
async def test_set_callable_redo_after_gen_prefix_history_keeps_callable_patch_transport() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        create_response = await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Callable,
                position=Position(x=640, y=320),
            )
        )
        section_id = create_response.sectionId

        await manager.set_gen_code_prefix(
            SetGenCodePrefixRequest(
                projectConfigId=project_config_id,
                genCodePrefix="import math",
            )
        )
        set_response = await manager.set_callable(
            SetCallableRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                callableName="math.sqrt",
                refetchParams=False,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)
        callable_id = set_response.callableId
        if callable_id is None:
            raise KeyError("Expected callable id after set_callable.")
        if not manager.history.can_undo(3):
            raise RuntimeError("Expected at least three undo steps for test setup.")

        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=3))
        await manager.finish_pending_operations(timeout=5.0)
        if not manager.history.can_redo(3):
            raise RuntimeError("Expected at least three redo steps after undo.")

        redo_capture, _ = await _run_with_transport_capture(
            manager,
            manager.redo(RedoRequest(projectConfigId=project_config_id, steps=3)),
        )

        assert 0 == redo_capture["project_state_broadcast_calls"]
        assert 1 <= len(redo_capture["project_config_patch_calls"])
        assert 1 <= len(redo_capture["code_obj_patch_calls"])
        assert any(
            patch["sectionId"] == section_id
            for patch in redo_capture["section_impl_patch_calls"]
        )
        patched_code_obj_ids: set[ID] = set()
        for patch in redo_capture["code_obj_patch_calls"]:
            patched_code_obj_ids.update(patch["codeObjIds"])
        assert callable_id in patched_code_obj_ids

        redo_state = manager.get_single_config_state(project_config_id)
        section_impl_after_redo = get_curr_effective_section_impl_with_type_guard(
            redo_state,
            section_id,
            CallableSectionImpl,
        )
        callable_after_redo = section_impl_after_redo.callable
        if callable_after_redo is None:
            raise KeyError("Expected callable id after redo.")
        assert "math.sqrt" == redo_state.codeObjs[callable_after_redo].name


@pytest.mark.asyncio
async def test_set_callable_flushes_pending_deferred_refresh() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        refresh_calls = 0
        original_refresh = manager._refresh_codegen_state
        original_schedule_deferred_refresh = manager._schedule_deferred_codegen_refresh

        async def record_refresh(next_state) -> None:
            nonlocal refresh_calls
            refresh_calls += 1
            await original_refresh(next_state)

        def mark_pending_refresh_only(project_config_id_for_refresh: ID) -> None:
            manager._pending_deferred_codegen_refresh_by_project_config[  # type: ignore[attr-defined]
                project_config_id_for_refresh
            ] = SimpleNamespace(
                history_revision=manager.history.revision,
                history_entry_token=manager.history.get_current_entry_token(),
            )

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        manager._schedule_deferred_codegen_refresh = mark_pending_refresh_only  # type: ignore[method-assign]
        try:
            create_response = await manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.Callable,
                    position=Position(x=640, y=320),
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            assert 0 == refresh_calls

            response = await manager.set_callable(
                SetCallableRequest(
                    projectConfigId=project_config_id,
                    sectionId=create_response.sectionId,
                    callableName="deferred_refresh_before_set_callable",
                    refetchParams=False,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]
            manager._schedule_deferred_codegen_refresh = (
                original_schedule_deferred_refresh  # type: ignore[method-assign]
            )

        assert response.callableId is not None
        assert refresh_calls == 1
        section_impl = get_curr_effective_section_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            create_response.sectionId,
            CallableSectionImpl,
        )
        assert section_impl.callable == response.callableId


@pytest.mark.asyncio
async def test_param_structure_routes_defer_codegen_refresh() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(8)
        _set_callable_param_core_names_editable(project_state, 8)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        refresh_calls = 0
        scheduled_deferred_refreshes: list[ID] = []
        original_refresh = manager._refresh_codegen_state
        original_schedule_deferred_refresh = manager._schedule_deferred_codegen_refresh

        async def record_refresh(next_state) -> None:
            nonlocal refresh_calls
            refresh_calls += 1
            await original_refresh(next_state)

        def record_schedule_deferred_refresh(project_config_id_for_refresh: ID) -> None:
            scheduled_deferred_refreshes.append(project_config_id_for_refresh)

        async def assert_deferred_refresh(operation_coro) -> None:
            await manager.finish_pending_operations(timeout=5.0)
            before_refresh_calls = refresh_calls
            before_scheduled_count = len(scheduled_deferred_refreshes)
            await operation_coro
            await manager.finish_pending_operations(timeout=5.0)
            assert refresh_calls == before_refresh_calls
            assert len(scheduled_deferred_refreshes) == before_scheduled_count + 1
            assert scheduled_deferred_refreshes[-1] == project_config_id

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        manager._schedule_deferred_codegen_refresh = record_schedule_deferred_refresh  # type: ignore[method-assign]
        try:
            await assert_deferred_refresh(
                manager.add_kwarg(
                    AddKwargRequest(
                        projectConfigId=project_config_id,
                        sectionId=SECTION_ID,
                    )
                )
            )
            await assert_deferred_refresh(
                manager.delete_kwarg(
                    DeleteKwargRequest(
                        projectConfigId=project_config_id,
                        sectionId=SECTION_ID,
                    )
                )
            )
            await assert_deferred_refresh(
                manager.move_params(
                    MoveParamsRequest(
                        projectConfigId=project_config_id,
                        sectionId=SECTION_ID,
                        paramIds=[PARAM_TWO_ID],
                        newParentId=PARAM_ONE_ID,
                        newIndex=0,
                    )
                )
            )
            await assert_deferred_refresh(
                manager.move_param_groups(
                    MoveParamGroupsRequest(
                        projectConfigId=project_config_id,
                        sectionId=SECTION_ID,
                        moves=[
                            MoveParamGroup(
                                paramIds=[PARAM_THREE_ID],
                                newParentId=PARAM_ONE_ID,
                                newIndex=1,
                            )
                        ],
                    )
                )
            )
            await assert_deferred_refresh(
                manager.indent_params(
                    IndentParamsRequest(
                        projectConfigId=project_config_id,
                        sectionId=SECTION_ID,
                        paramIds=[PARAM_FIVE_ID],
                    )
                )
            )
            await assert_deferred_refresh(
                manager.unindent_params(
                    UnindentParamsRequest(
                        projectConfigId=project_config_id,
                        sectionId=SECTION_ID,
                        paramIds=[PARAM_FIVE_ID],
                    )
                )
            )
            await assert_deferred_refresh(
                manager.delete_selected_params(
                    DeleteSelectedParamsRequest(
                        projectConfigId=project_config_id,
                        sectionId=SECTION_ID,
                        paramInfoIds=[PARAM_SIX_ID],
                    )
                )
            )
            await assert_deferred_refresh(
                manager.set_callable(
                    SetCallableRequest(
                        projectConfigId=project_config_id,
                        sectionId=SECTION_ID,
                        callableName="deferred_refresh_callable",
                        refetchParams=True,
                    )
                )
            )
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]
            manager._schedule_deferred_codegen_refresh = (
                original_schedule_deferred_refresh  # type: ignore[method-assign]
            )

        section_impl = get_curr_effective_section_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            SECTION_ID,
            CallableSectionImpl,
        )
        assert section_impl.callable is not None
