from pathlib import Path

import pytest

from setta.types.generated.impl_args_as_typed_dicts import (
    BaseDictSectionImplArgsWithCallable,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl_with_type_guard,
    get_curr_section_variant,
    set_curr_effective_section_impl_value,
)
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.id import ID
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import BaseDictSectionImpl, ConfigLanguage, SectionType
from setta.utils.paths import normalize_workspace_path
from tests.utils.manager_fixture import real_settings_manager


def _install_transport_capture(sender):
    capture = {
        "project_state_broadcast_calls": 0,
        "structural_patch_calls": [],
        "project_config_patch_calls": 0,
        "code_obj_patch_calls": [],
        "section_impl_patch_calls": 0,
        "name_validation_broadcast_calls": 0,
    }
    original_project_state_broadcast = sender.broadcast_project_state
    original_structural_patch_broadcast = (
        sender.broadcast_project_state_structural_patch
    )
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
        capture["structural_patch_calls"].append(
            {
                "projectConfigId": project_config_id_for_patch,
                "previousProjectStateRevision": previous_project_state_revision,
                "projectStateRevision": project_state_revision,
            }
        )
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
                "codeObjVariantIds": list(code_obj_variants_for_patch.keys()),
                "codeObjImplIds": list(code_obj_impls_for_patch.keys()),
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
        capture["section_impl_patch_calls"] += 1
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
    sender.broadcast_project_state_structural_patch = (  # type: ignore[method-assign]
        record_structural_patch
    )
    sender.broadcast_project_state_project_config_patch = (  # type: ignore[method-assign]
        record_project_config_patch
    )
    sender.broadcast_project_state_code_objs_patch = record_code_obj_patch  # type: ignore[method-assign]
    sender.broadcast_project_state_section_impl_patch = record_section_impl_patch  # type: ignore[method-assign]
    sender.broadcast_name_validation_errors = record_name_validation_broadcast  # type: ignore[method-assign]

    def restore() -> None:
        sender.broadcast_project_state = original_project_state_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_structural_patch = (  # type: ignore[method-assign]
            original_structural_patch_broadcast
        )
        sender.broadcast_project_state_project_config_patch = (  # type: ignore[method-assign]
            original_project_config_patch_broadcast
        )
        sender.broadcast_project_state_code_objs_patch = (
            original_code_obj_patch_broadcast  # type: ignore[method-assign]
        )
        sender.broadcast_project_state_section_impl_patch = (
            original_section_impl_patch_broadcast  # type: ignore[method-assign]
        )
        sender.broadcast_name_validation_errors = original_name_validation_broadcast  # type: ignore[method-assign]

    return capture, restore


def _install_immediate_transport_capture(manager):
    capture, restore_transport = _install_transport_capture(
        manager.websocket_msg_handler
    )
    original_schedule_deferred_refresh = manager._schedule_deferred_codegen_refresh

    def _skip_deferred_refresh(_project_config_id: ID) -> None:
        return

    manager._schedule_deferred_codegen_refresh = _skip_deferred_refresh  # type: ignore[method-assign]

    def restore() -> None:
        manager._schedule_deferred_codegen_refresh = original_schedule_deferred_refresh  # type: ignore[method-assign]
        restore_transport()

    return capture, restore


@pytest.mark.asyncio
async def test_load_json_sources_uses_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="json-source-patch-transport")
        )
        section_id = create_top_level_section(
            manager.settings_file.settings,
            project_state,
            SectionType.Dict,
            Position(),
        )
        set_curr_effective_section_impl_value(
            project_state,
            section_id,
            BaseDictSectionImplArgsWithCallable(
                isJsonSource=True,
                jsonSourceKeys=[],
                configLanguage=ConfigLanguage.json,
            ),
        )
        variant = get_curr_section_variant(project_state, section_id)
        json_source_path = normalize_workspace_path(Path("json-source-patch.json"))
        variant.name = str(json_source_path)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        capture, restore = _install_immediate_transport_capture(manager)
        try:
            processed = manager.json_source.process_json_object({"alpha": {"value": 1}})
            await manager.load_json_sources(
                {json_source_path: processed},
                [(section_id, variant.id)],
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore()

        assert 0 == capture["project_state_broadcast_calls"]
        assert 1 == len(capture["structural_patch_calls"])
        structural_patch = capture["structural_patch_calls"][0]
        assert structural_patch["projectConfigId"] == project_config_id
        assert (
            structural_patch["previousProjectStateRevision"]
            <= structural_patch["projectStateRevision"]
        )
        assert 0 == capture["project_config_patch_calls"]
        assert 1 == len(capture["code_obj_patch_calls"])
        code_obj_patch = capture["code_obj_patch_calls"][0]
        assert code_obj_patch["projectConfigId"] == project_config_id
        assert code_obj_patch["codeObjIds"]
        assert code_obj_patch["codeObjVariantIds"]
        assert code_obj_patch["codeObjImplIds"]
        assert (
            code_obj_patch["previousProjectStateRevision"]
            < code_obj_patch["projectStateRevision"]
        )
        assert 0 == capture["section_impl_patch_calls"]
        assert 1 == capture["name_validation_broadcast_calls"]

        updated_state = manager.get_single_config_state(project_config_id)
        updated_impl = get_curr_effective_section_impl_with_type_guard(
            updated_state,
            section_id,
            BaseDictSectionImpl,
        )
        assert not updated_impl.jsonSourceMissing
        assert updated_impl.topLevelParamId is not None


@pytest.mark.asyncio
async def test_load_json_sources_defers_codegen_refresh() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="json-source-deferred-refresh")
        )
        section_id = create_top_level_section(
            manager.settings_file.settings,
            project_state,
            SectionType.Dict,
            Position(),
        )
        set_curr_effective_section_impl_value(
            project_state,
            section_id,
            BaseDictSectionImplArgsWithCallable(
                isJsonSource=True,
                jsonSourceKeys=[],
                configLanguage=ConfigLanguage.json,
            ),
        )
        variant = get_curr_section_variant(project_state, section_id)
        json_source_path = normalize_workspace_path(Path("json-source-deferred.json"))
        variant.name = str(json_source_path)
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

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        manager._schedule_deferred_codegen_refresh = (  # type: ignore[method-assign]
            record_schedule_deferred_refresh
        )
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before_refresh_calls = refresh_calls
            before_scheduled_count = len(scheduled_deferred_refreshes)
            processed = manager.json_source.process_json_object({"alpha": {"value": 1}})
            await manager.load_json_sources(
                {json_source_path: processed},
                [(section_id, variant.id)],
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]
            manager._schedule_deferred_codegen_refresh = (
                original_schedule_deferred_refresh  # type: ignore[method-assign]
            )

        # JSON-source mutation ACK should avoid synchronous refresh and schedule
        # stage-B codegen work on the owning project config.
        assert refresh_calls == before_refresh_calls
        assert len(scheduled_deferred_refreshes) == before_scheduled_count + 1
        assert scheduled_deferred_refreshes[-1] == project_config_id


@pytest.mark.asyncio
async def test_load_json_sources_skips_name_validation_for_reserved_settings_name() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="settings")
        )
        section_id = create_top_level_section(
            manager.settings_file.settings,
            project_state,
            SectionType.Dict,
            Position(),
        )
        set_curr_effective_section_impl_value(
            project_state,
            section_id,
            BaseDictSectionImplArgsWithCallable(
                isJsonSource=True,
                jsonSourceKeys=[],
                configLanguage=ConfigLanguage.json,
            ),
        )
        variant = get_curr_section_variant(project_state, section_id)
        json_source_path = normalize_workspace_path(Path("json-source-settings.json"))
        variant.name = str(json_source_path)
        await manager.update(
            project_state,
            updateFileWatcher=True,
        )
        await manager.finish_pending_operations(timeout=5.0)

        capture, restore = _install_immediate_transport_capture(manager)
        try:
            processed = manager.json_source.process_json_object({"alpha": {"value": 1}})
            await manager.load_json_sources(
                {json_source_path: processed},
                [(section_id, variant.id)],
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore()

        assert 0 == capture["project_state_broadcast_calls"]
        assert 1 == len(capture["structural_patch_calls"])
        assert 1 == len(capture["code_obj_patch_calls"])
