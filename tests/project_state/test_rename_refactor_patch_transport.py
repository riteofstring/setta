import pytest

from setta.code_gen.dependency_graph import RenameReferenceChangedValue
from setta.project_state.project_manager_types import AcceptRenameRefactorRequest
from setta.types.dependency_key import SectionDependencyKey
from setta.types.helpers_lvl2 import get_curr_section_callable_code_obj
from setta.types.id import ID
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


SECTION_ID = ID("section-1")


def _install_transport_capture(sender):
    capture = {
        "project_state_broadcast_calls": 0,
        "project_config_patch_calls": 0,
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
        capture["project_config_patch_calls"] += 1
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
    sender.broadcast_project_state_project_config_patch = record_project_config_patch  # type: ignore[method-assign]
    sender.broadcast_project_state_code_objs_patch = record_code_obj_patch  # type: ignore[method-assign]
    sender.broadcast_project_state_section_impl_patch = record_section_impl_patch  # type: ignore[method-assign]
    sender.broadcast_name_validation_errors = record_name_validation_broadcast  # type: ignore[method-assign]

    def restore() -> None:
        sender.broadcast_project_state = original_project_state_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_project_config_patch = original_project_config_patch_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_code_objs_patch = original_code_obj_patch_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = original_section_impl_patch_broadcast  # type: ignore[method-assign]
        sender.broadcast_name_validation_errors = original_name_validation_broadcast  # type: ignore[method-assign]

    return capture, restore


@pytest.mark.asyncio
async def test_accept_rename_refactor_uses_code_obj_and_section_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        state_before = manager.get_single_config_state(project_config_id)
        callable_code_obj_before = get_curr_section_callable_code_obj(
            state_before,
            SECTION_ID,
        )
        if callable_code_obj_before is None:
            raise KeyError(f"Expected callable code object for section {SECTION_ID}.")

        frontend_op_id = "rename-patch-transport"
        new_callable_name = f"{callable_code_obj_before.name}_renamed"
        manager.pending_rename_results[frontend_op_id] = (
            project_config_id,
            [
                RenameReferenceChangedValue(
                    depKey=SectionDependencyKey(sectionId=SECTION_ID),
                    newValue=new_callable_name,
                )
            ],
        )

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            await manager.accept_rename_refactor(
                AcceptRenameRefactorRequest(
                    frontendOpId=frontend_op_id,
                    projectConfigId=project_config_id,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore()

        assert 0 == capture["project_state_broadcast_calls"]
        assert 0 == capture["project_config_patch_calls"]
        assert 1 == len(capture["code_obj_patch_calls"])
        code_obj_patch = capture["code_obj_patch_calls"][0]
        assert callable_code_obj_before.id in code_obj_patch["codeObjIds"]
        assert 1 <= len(capture["section_impl_patch_calls"])
        assert any(
            patch["sectionId"] == SECTION_ID for patch in capture["section_impl_patch_calls"]
        )
        assert 1 == capture["name_validation_broadcast_calls"]

        state_after = manager.get_single_config_state(project_config_id)
        callable_code_obj_after = get_curr_section_callable_code_obj(
            state_after,
            SECTION_ID,
        )
        if callable_code_obj_after is None:
            raise KeyError(f"Expected callable code object for section {SECTION_ID}.")
        assert callable_code_obj_after.id == callable_code_obj_before.id
        assert new_callable_name == callable_code_obj_after.name
        assert frontend_op_id not in manager.pending_rename_results
