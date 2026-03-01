import pytest

from setta.project_state.project_manager_types import (
    CreateNewSectionVariantRequest,
    GroupSectionsRequest,
    MoveSectionsRequest,
    SetDefaultSectionVariantRequest,
    SetSectionVariantRequest,
    SetSectionVariantSortOrderRequest,
    UngroupGroupsRequest,
)
from setta.types.id import ID
from setta.types.project_config import Position
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


SECTION_ID = ID("section-1")


def _install_transport_capture(sender):
    capture = {
        "project_state_broadcast_calls": 0,
        "structural_patch_calls": [],
        "project_config_patch_calls": 0,
        "code_obj_patch_calls": 0,
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
                "projectConfigName": project_config_for_patch.name,
                "sectionIds": list(sections_for_patch.keys()),
                "sectionVariantIds": list(section_variants_for_patch.keys()),
                "sectionImplIds": list(section_impls_for_patch.keys()),
                "parentSectionMap": dict(parent_section_map_for_patch),
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
        capture["code_obj_patch_calls"] += 1
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
        sender.broadcast_project_state_code_objs_patch = original_code_obj_patch_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = original_section_impl_patch_broadcast  # type: ignore[method-assign]
        sender.broadcast_name_validation_errors = original_name_validation_broadcast  # type: ignore[method-assign]

    return capture, restore


@pytest.mark.asyncio
async def test_set_section_variant_uses_structural_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        await manager.create_new_section_variant(
            CreateNewSectionVariantRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        section_core = manager.get_single_config_state(project_config_id).sections[
            SECTION_ID
        ]
        active_variant_id = manager.get_single_config_state(
            project_config_id
        ).projectConfig.sectionVariantMap[SECTION_ID]
        target_variant_id = next(
            variant_id
            for variant_id in section_core.variants
            if variant_id != active_variant_id
        )

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            await manager.set_section_variant(
                SetSectionVariantRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    variantId=target_variant_id,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore()

        assert 0 == capture["project_state_broadcast_calls"]
        assert 1 == len(capture["structural_patch_calls"])
        structural_patch = capture["structural_patch_calls"][0]
        assert structural_patch["projectConfigId"] == project_config_id
        assert SECTION_ID in structural_patch["sectionIds"]
        assert (
            structural_patch["previousProjectStateRevision"]
            < structural_patch["projectStateRevision"]
        )
        assert 0 == capture["project_config_patch_calls"]
        assert 0 == capture["code_obj_patch_calls"]
        assert 0 == capture["section_impl_patch_calls"]
        assert 1 == capture["name_validation_broadcast_calls"]

        assert (
            manager.get_single_config_state(project_config_id)
            .projectConfig.sectionVariantMap[SECTION_ID]
            == target_variant_id
        )


@pytest.mark.asyncio
async def test_set_default_section_variant_uses_structural_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        await manager.create_new_section_variant(
            CreateNewSectionVariantRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        section_core_before = manager.get_single_config_state(project_config_id).sections[
            SECTION_ID
        ]
        target_variant_id = next(
            variant_id
            for variant_id in section_core_before.variants
            if variant_id != section_core_before.defaultVariant
        )

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            await manager.set_default_section_variant(
                SetDefaultSectionVariantRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    variantId=target_variant_id,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore()

        assert 0 == capture["project_state_broadcast_calls"]
        assert 1 == len(capture["structural_patch_calls"])
        structural_patch = capture["structural_patch_calls"][0]
        assert structural_patch["projectConfigId"] == project_config_id
        assert SECTION_ID in structural_patch["sectionIds"]
        assert (
            structural_patch["previousProjectStateRevision"]
            < structural_patch["projectStateRevision"]
        )
        assert 0 == capture["project_config_patch_calls"]
        assert 0 == capture["code_obj_patch_calls"]
        assert 0 == capture["section_impl_patch_calls"]
        assert 1 == capture["name_validation_broadcast_calls"]

        assert (
            manager.get_single_config_state(project_config_id).sections[
                SECTION_ID
            ].defaultVariant
            == target_variant_id
        )


@pytest.mark.asyncio
async def test_set_section_variant_sort_order_uses_structural_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        await manager.create_new_section_variant(
            CreateNewSectionVariantRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        section_core = manager.get_single_config_state(project_config_id).sections[
            SECTION_ID
        ]
        reversed_variant_order = list(reversed(section_core.variants))

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            await manager.set_section_variant_sort_order(
                SetSectionVariantSortOrderRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    orderedVariantIds=reversed_variant_order,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore()

        assert 0 == capture["project_state_broadcast_calls"]
        assert 1 == len(capture["structural_patch_calls"])
        structural_patch = capture["structural_patch_calls"][0]
        assert structural_patch["projectConfigId"] == project_config_id
        assert SECTION_ID in structural_patch["sectionIds"]
        assert (
            structural_patch["previousProjectStateRevision"]
            < structural_patch["projectStateRevision"]
        )
        assert 0 == capture["project_config_patch_calls"]
        assert 0 == capture["code_obj_patch_calls"]
        assert 0 == capture["section_impl_patch_calls"]
        assert 1 == capture["name_validation_broadcast_calls"]

        assert (
            manager.get_single_config_state(project_config_id)
            .sections[SECTION_ID]
            .variants
            == reversed_variant_order
        )


@pytest.mark.asyncio
async def test_move_sections_uses_structural_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            await manager.move_sections(
                MoveSectionsRequest(
                    projectConfigId=project_config_id,
                    sectionIds=[SECTION_ID],
                    newParentId=None,
                    newIndex=None,
                    positionsById={
                        SECTION_ID: Position(x=321.0, y=654.0),
                    },
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore()

        assert 0 == capture["project_state_broadcast_calls"]
        assert 1 == len(capture["structural_patch_calls"])
        structural_patch = capture["structural_patch_calls"][0]
        assert structural_patch["projectConfigId"] == project_config_id
        assert SECTION_ID in structural_patch["sectionIds"]
        assert (
            structural_patch["previousProjectStateRevision"]
            < structural_patch["projectStateRevision"]
        )
        assert 0 == capture["project_config_patch_calls"]
        assert 0 == capture["code_obj_patch_calls"]
        assert 0 == capture["section_impl_patch_calls"]
        assert 1 == capture["name_validation_broadcast_calls"]

        updated_layout = manager.get_single_config_state(
            project_config_id
        ).projectConfig.topLevelSections[SECTION_ID]
        assert 321.0 == updated_layout.x
        assert 654.0 == updated_layout.y


@pytest.mark.asyncio
async def test_group_and_ungroup_use_structural_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        sender = manager.websocket_msg_handler
        group_capture, restore_group = _install_transport_capture(sender)
        try:
            await manager.group_sections(
                GroupSectionsRequest(
                    projectConfigId=project_config_id,
                    sectionIds=[SECTION_ID],
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore_group()

        assert 0 == group_capture["project_state_broadcast_calls"]
        assert 1 == len(group_capture["structural_patch_calls"])
        assert 0 == group_capture["project_config_patch_calls"]
        assert 0 == group_capture["code_obj_patch_calls"]
        assert 0 == group_capture["section_impl_patch_calls"]
        assert 1 == group_capture["name_validation_broadcast_calls"]

        grouped_state = manager.get_single_config_state(project_config_id)
        group_id = grouped_state.parentSectionMap[SECTION_ID]
        assert group_id is not None
        assert group_id in grouped_state.sections

        ungroup_capture, restore_ungroup = _install_transport_capture(sender)
        try:
            await manager.ungroup_groups(
                UngroupGroupsRequest(
                    projectConfigId=project_config_id,
                    groupIds=[group_id],
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore_ungroup()

        assert 0 == ungroup_capture["project_state_broadcast_calls"]
        assert 1 == len(ungroup_capture["structural_patch_calls"])
        assert 0 == ungroup_capture["project_config_patch_calls"]
        assert 0 == ungroup_capture["code_obj_patch_calls"]
        assert 0 == ungroup_capture["section_impl_patch_calls"]
        assert 1 == ungroup_capture["name_validation_broadcast_calls"]

        ungrouped_state = manager.get_single_config_state(project_config_id)
        assert ungrouped_state.parentSectionMap[SECTION_ID] is None
        assert group_id not in ungrouped_state.sections
