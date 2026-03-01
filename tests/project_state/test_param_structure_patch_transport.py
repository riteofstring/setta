import pytest

from setta.project_state.project_manager_types import (
    AddKwargRequest,
    DeleteKwargRequest,
    DeleteSelectedParamsRequest,
    IndentParamsRequest,
    MoveParamGroup,
    MoveParamGroupsRequest,
    MoveParamsRequest,
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
from setta.types.id import ID
from setta.types.section_impls import CallableSectionImpl
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


SECTION_ID = ID("section-1")
PARAM_ONE_ID = ID("param-1")
PARAM_TWO_ID = ID("param-2")
PARAM_THREE_ID = ID("param-3")


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
        sender.broadcast_project_state_code_objs_patch = original_code_obj_patch_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = (  # type: ignore[method-assign]
            original_section_impl_patch_broadcast
        )
        sender.broadcast_name_validation_errors = original_name_validation_broadcast  # type: ignore[method-assign]

    return capture, restore


def _get_callable_impl(manager, project_config_id: ID) -> tuple[ID, CodeCallableCodeObjImpl]:
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
        callable_id, callable_impl_before = _get_callable_impl(manager, project_config_id)
        before_child_count = len(callable_impl_before.children)

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            await manager.add_kwarg(
                AddKwargRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore()

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
async def test_delete_kwarg_uses_project_config_code_obj_and_section_patch_transport() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        callable_id, callable_impl_before = _get_callable_impl(manager, project_config_id)
        removed_param_id = callable_impl_before.children[-1]
        before_child_count = len(callable_impl_before.children)

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            await manager.delete_kwarg(
                DeleteKwargRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore()

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
async def test_delete_selected_params_uses_project_config_code_obj_and_section_patch_transport() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        for idx in range(4):
            variant_id = ID(f"param-variant-{idx}")
            variant = project_state.codeObjVariants[variant_id]
            impl_id = variant.impl
            impl = project_state.codeObjImpls[impl_id]
            if not isinstance(impl, CodeParamCodeObjImpl):
                raise TypeError(f"Expected CodeParamCodeObjImpl for {impl_id}")
            impl.coreNameEditable = True
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        callable_id, callable_impl_before = _get_callable_impl(manager, project_config_id)
        assert PARAM_ONE_ID in callable_impl_before.children
        assert PARAM_TWO_ID in callable_impl_before.children

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            await manager.delete_selected_params(
                DeleteSelectedParamsRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    paramInfoIds=[PARAM_ONE_ID, PARAM_TWO_ID],
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore()

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
        callable_id, callable_impl_before = _get_callable_impl(manager, project_config_id)
        assert PARAM_TWO_ID in callable_impl_before.children

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            await manager.move_params(
                MoveParamsRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    paramIds=[PARAM_TWO_ID],
                    newParentId=PARAM_ONE_ID,
                    newIndex=0,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore()

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

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            await manager.move_param_groups(
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
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore()

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
        callable_id, callable_impl_before = _get_callable_impl(manager, project_config_id)
        assert PARAM_TWO_ID in callable_impl_before.children

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            await manager.indent_params(
                IndentParamsRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    paramIds=[PARAM_TWO_ID],
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore()

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

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            await manager.unindent_params(
                UnindentParamsRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    paramIds=[PARAM_TWO_ID],
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore()

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
        assert PARAM_TWO_ID in callable_impl_after.children
        parent_impl_after = get_curr_effective_code_obj_impl(
            manager.get_single_config_state(project_config_id),
            SECTION_ID,
            PARAM_ONE_ID,
        )
        if isinstance(parent_impl_after, BaseParentCodeObjImpl):
            assert PARAM_TWO_ID not in parent_impl_after.children
