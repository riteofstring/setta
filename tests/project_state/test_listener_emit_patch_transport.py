import pytest

from setta.types.dependency_key import SectionDependencyKey, SectionParamDependencyKey
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_top_level_section, get_curr_top_level_param_ids
from setta.types.id import ID
from setta.types.listener import ListenerFrontendEmitKeyAndValue
from setta.types.project_config import Position
from setta.types.section_impls import SectionType
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


SECTION_ID = ID("section-1")


def _install_transport_capture(sender):
    capture = {
        "project_state_broadcast_calls": 0,
        "project_config_patch_calls": 0,
        "code_obj_patch_calls": [],
        "section_impl_patch_calls": [],
        "structural_patch_calls": 0,
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
    original_structural_patch_broadcast = (
        sender.broadcast_project_state_structural_patch
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

    async def record_structural_patch(
        project_config_id_for_patch,
        project_config_for_patch,
        sections_for_patch,
        section_variants_for_patch,
        section_impls_for_patch,
        parent_section_map_for_patch,
        previous_project_state_revision,
        project_state_revision,
        completed_op_ids,
        pending_op_ids,
    ) -> None:
        capture["structural_patch_calls"] += 1
        await original_structural_patch_broadcast(
            project_config_id_for_patch,
            project_config_for_patch,
            sections_for_patch,
            section_variants_for_patch,
            section_impls_for_patch,
            parent_section_map_for_patch,
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
    sender.broadcast_project_state_section_impl_patch = record_section_impl_patch  # type: ignore[method-assign]
    sender.broadcast_project_state_structural_patch = record_structural_patch  # type: ignore[method-assign]
    sender.broadcast_name_validation_errors = record_name_validation_broadcast  # type: ignore[method-assign]

    def restore() -> None:
        sender.broadcast_project_state = original_project_state_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_project_config_patch = (  # type: ignore[method-assign]
            original_project_config_patch_broadcast
        )
        sender.broadcast_project_state_code_objs_patch = original_code_obj_patch_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = original_section_impl_patch_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_structural_patch = original_structural_patch_broadcast  # type: ignore[method-assign]
        sender.broadcast_name_validation_errors = original_name_validation_broadcast  # type: ignore[method-assign]

    return capture, restore


@pytest.mark.asyncio
async def test_listener_emit_section_dependency_uses_section_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(20)
        settings = SettingsState()
        text_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.TextBlock,
            Position(x=1200, y=220),
            core_overrides={"name": "listener_emit_patch_text"},
        )
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            await manager.apply_listener_emit_updates(
                projectConfigId=project_config_id,
                dependency_updates=[
                    ListenerFrontendEmitKeyAndValue(
                        dependencyKey=SectionDependencyKey(sectionId=text_section_id),
                        value=LiteralDependencyValue("listener emit text update"),
                    )
                ],
                artifact_updates=[],
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore()

        patched_section_ids = [
            section_patch_call["sectionId"]
            for section_patch_call in capture["section_impl_patch_calls"]
        ]
        assert 0 == capture["project_state_broadcast_calls"]
        assert 0 == capture["project_config_patch_calls"]
        assert [] == capture["code_obj_patch_calls"]
        assert text_section_id in patched_section_ids
        assert 0 == capture["structural_patch_calls"]
        assert 0 == capture["name_validation_broadcast_calls"]


@pytest.mark.asyncio
async def test_listener_emit_param_dependency_uses_code_obj_and_section_patches() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(20)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        top_level_param_ids = get_curr_top_level_param_ids(
            manager.get_single_config_state(project_config_id),
            SECTION_ID,
        )
        assert top_level_param_ids
        target_param_id = top_level_param_ids[0]

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            await manager.apply_listener_emit_updates(
                projectConfigId=project_config_id,
                dependency_updates=[
                    ListenerFrontendEmitKeyAndValue(
                        dependencyKey=SectionParamDependencyKey(
                            sectionId=SECTION_ID,
                            codeObjId=target_param_id,
                        ),
                        value=LiteralDependencyValue("listener emit param update"),
                    )
                ],
                artifact_updates=[],
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore()

        patched_section_ids = {
            section_patch_call["sectionId"]
            for section_patch_call in capture["section_impl_patch_calls"]
        }
        patched_code_obj_ids = {
            code_obj_id
            for code_obj_patch_call in capture["code_obj_patch_calls"]
            for code_obj_id in code_obj_patch_call["codeObjIds"]
        }
        assert 0 == capture["project_state_broadcast_calls"]
        assert 0 == capture["project_config_patch_calls"]
        assert target_param_id in patched_code_obj_ids
        assert SECTION_ID in patched_section_ids
        assert 0 == capture["structural_patch_calls"]
        assert 0 == capture["name_validation_broadcast_calls"]


@pytest.mark.asyncio
async def test_listener_emit_dependency_updates_defer_codegen_refresh() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(20)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        top_level_param_ids = get_curr_top_level_param_ids(
            manager.get_single_config_state(project_config_id),
            SECTION_ID,
        )
        assert top_level_param_ids
        target_param_id = top_level_param_ids[0]

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

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        manager._schedule_deferred_codegen_refresh = (
            record_schedule_deferred_refresh  # type: ignore[method-assign]
        )
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before_refresh_calls = refresh_calls
            before_scheduled_count = len(scheduled_deferred_refreshes)
            await manager.apply_listener_emit_updates(
                projectConfigId=project_config_id,
                dependency_updates=[
                    ListenerFrontendEmitKeyAndValue(
                        dependencyKey=SectionParamDependencyKey(
                            sectionId=SECTION_ID,
                            codeObjId=target_param_id,
                        ),
                        value=LiteralDependencyValue("listener emit deferred refresh"),
                    )
                ],
                artifact_updates=[],
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]
            manager._schedule_deferred_codegen_refresh = (
                original_schedule_deferred_refresh  # type: ignore[method-assign]
            )

        assert refresh_calls == before_refresh_calls
        assert len(scheduled_deferred_refreshes) == before_scheduled_count + 1
        assert scheduled_deferred_refreshes[-1] == project_config_id
