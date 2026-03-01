import pytest

from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.project_state.project_manager_types import (
    CreateChildSectionsRequest,
    CreateChildSectionsViaIncrementerRequest,
    DeleteChildSectionsViaDecrementerRequest,
    DeleteSectionsRequest,
    DeleteSectionVariantOrAskRequest,
    CreateTopLevelSectionRequest,
    CreateNewSectionVariantRequest,
    GroupSectionsRequest,
    MoveSectionsRequest,
    PasteSectionsRequest,
    PrepareSectionsForCopyRequest,
    SetCodeSectionAttachedTerminalRequest,
    SetDefaultSectionVariantRequest,
    SetProjectConfigCodegenTargetsRequest,
    SetSectionNameRequest,
    SetTextBlockHeadingAsSectionNameRequest,
    SetSectionVariantNameRequest,
    SetSectionVariantRequest,
    SetSectionVariantSortOrderRequest,
    UndoRequest,
    RedoRequest,
    SetWatchCodeEnabledRequest,
    SetWatchCodeInputsRequest,
    ToggleVariantFrozenRequest,
    ToggleVariantJSONSourceRequest,
    UngroupGroupsRequest,
)
from setta.types.id import ID
from setta.types.project_config import Position, ProjectCodegenPythonTarget, WatchCodeFolder
from setta.types.section_impls import (
    BaseParentSectionImpl,
    SectionType,
    TextBlockSectionImpl,
)
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


async def _run_with_transport_capture(manager, operation):
    sender = manager.websocket_msg_handler
    capture, restore = _install_transport_capture(sender)
    try:
        result = await operation
        await manager.finish_pending_operations(timeout=5.0)
    finally:
        restore()
    return capture, result


def _assert_single_structural_patch(
    capture,
    project_config_id: ID,
    *,
    expected_name_validation_calls: int,
) -> dict[str, object]:
    assert 0 == capture["project_state_broadcast_calls"]
    assert 1 == len(capture["structural_patch_calls"])
    structural_patch = capture["structural_patch_calls"][0]
    assert structural_patch["projectConfigId"] == project_config_id
    assert (
        structural_patch["previousProjectStateRevision"]
        < structural_patch["projectStateRevision"]
    )
    assert 0 == capture["project_config_patch_calls"]
    assert 0 == capture["code_obj_patch_calls"]
    assert 0 == capture["section_impl_patch_calls"]
    assert expected_name_validation_calls == capture["name_validation_broadcast_calls"]
    return structural_patch


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
        assert 0 == capture["name_validation_broadcast_calls"]

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
        assert 0 == capture["name_validation_broadcast_calls"]

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
async def test_variant_metadata_routes_use_structural_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        create_response = await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Dict,
                controlCodeObjType=None,
                implOverrides=None,
                position=None,
                topLevelSections=None,
                viewportBounds=None,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        dict_section_id = create_response.sectionId
        variant_id = manager.get_single_config_state(
            project_config_id
        ).projectConfig.sectionVariantMap[dict_section_id]

        sender = manager.websocket_msg_handler
        capture_toggle_json, restore_toggle_json = _install_transport_capture(sender)
        try:
            await manager.toggle_variant_json_source(
                ToggleVariantJSONSourceRequest(
                    projectConfigId=project_config_id,
                    sectionId=dict_section_id,
                    variantId=variant_id,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore_toggle_json()

        assert 0 == capture_toggle_json["project_state_broadcast_calls"]
        assert 1 == len(capture_toggle_json["structural_patch_calls"])
        assert 0 == capture_toggle_json["project_config_patch_calls"]
        assert 0 == capture_toggle_json["code_obj_patch_calls"]
        assert 0 == capture_toggle_json["section_impl_patch_calls"]
        assert 0 == capture_toggle_json["name_validation_broadcast_calls"]

        before_is_frozen = manager.get_single_config_state(project_config_id).sectionVariants[
            variant_id
        ].isFrozen
        capture_toggle_frozen, restore_toggle_frozen = _install_transport_capture(sender)
        try:
            await manager.toggle_variant_frozen(
                ToggleVariantFrozenRequest(
                    projectConfigId=project_config_id,
                    variantId=variant_id,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore_toggle_frozen()

        assert 0 == capture_toggle_frozen["project_state_broadcast_calls"]
        assert 1 == len(capture_toggle_frozen["structural_patch_calls"])
        assert 0 == capture_toggle_frozen["project_config_patch_calls"]
        assert 0 == capture_toggle_frozen["code_obj_patch_calls"]
        assert 0 == capture_toggle_frozen["section_impl_patch_calls"]
        assert 0 == capture_toggle_frozen["name_validation_broadcast_calls"]
        assert (
            manager.get_single_config_state(project_config_id).sectionVariants[
                variant_id
            ].isFrozen
            != before_is_frozen
        )

        capture_set_name, restore_set_name = _install_transport_capture(sender)
        try:
            await manager.set_section_variant_name(
                SetSectionVariantNameRequest(
                    projectConfigId=project_config_id,
                    variantId=variant_id,
                    name="Updated Variant Name",
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore_set_name()

        assert 0 == capture_set_name["project_state_broadcast_calls"]
        assert 1 == len(capture_set_name["structural_patch_calls"])
        assert 0 == capture_set_name["project_config_patch_calls"]
        assert 0 == capture_set_name["code_obj_patch_calls"]
        assert 0 == capture_set_name["section_impl_patch_calls"]
        assert 0 == capture_set_name["name_validation_broadcast_calls"]
        assert (
            manager.get_single_config_state(project_config_id).sectionVariants[
                variant_id
            ].name
            == "Updated Variant Name"
        )


@pytest.mark.asyncio
async def test_code_section_terminal_routes_use_structural_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        create_code_response = await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Code,
                controlCodeObjType=None,
                implOverrides=None,
                position=None,
                topLevelSections=None,
                viewportBounds=None,
            )
        )
        create_terminal_response = await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Terminal,
                controlCodeObjType=None,
                implOverrides=None,
                position=None,
                topLevelSections=None,
                viewportBounds=None,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        code_section_id = create_code_response.sectionId
        terminal_section_id = create_terminal_response.sectionId

        sender = manager.websocket_msg_handler
        capture_attach, restore_attach = _install_transport_capture(sender)
        try:
            await manager.set_code_section_attached_terminal(
                SetCodeSectionAttachedTerminalRequest(
                    projectConfigId=project_config_id,
                    sectionId=code_section_id,
                    terminalSectionId=terminal_section_id,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore_attach()

        assert 0 == capture_attach["project_state_broadcast_calls"]
        assert 1 == len(capture_attach["structural_patch_calls"])
        assert 0 == capture_attach["project_config_patch_calls"]
        assert 0 == capture_attach["code_obj_patch_calls"]
        assert 0 == capture_attach["section_impl_patch_calls"]
        assert 0 == capture_attach["name_validation_broadcast_calls"]

        await manager.set_code_section_attached_terminal(
            SetCodeSectionAttachedTerminalRequest(
                projectConfigId=project_config_id,
                sectionId=code_section_id,
                terminalSectionId=None,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        capture_ensure, restore_ensure = _install_transport_capture(sender)
        try:
            terminal_id = await manager.ensure_code_section_attached_terminal_for_run(
                project_config_id,
                code_section_id,
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            restore_ensure()

        assert terminal_id is not None
        assert 0 == capture_ensure["project_state_broadcast_calls"]
        assert 1 == len(capture_ensure["structural_patch_calls"])
        assert 0 == capture_ensure["project_config_patch_calls"]
        assert 0 == capture_ensure["code_obj_patch_calls"]
        assert 0 == capture_ensure["section_impl_patch_calls"]
        assert 0 == capture_ensure["name_validation_broadcast_calls"]


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
        assert 0 == capture["name_validation_broadcast_calls"]

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


@pytest.mark.asyncio
async def test_remaining_section_routes_use_structural_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        create_group_capture, create_group_result = await _run_with_transport_capture(
            manager,
            manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.Group,
                    controlCodeObjType=None,
                    implOverrides=None,
                    position=Position(x=777.0, y=111.0),
                    topLevelSections=None,
                    viewportBounds=None,
                )
            ),
        )
        _assert_single_structural_patch(
            create_group_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        group_id = create_group_result.sectionId
        assert group_id in manager.get_single_config_state(project_config_id).sections

        create_child_capture, _ = await _run_with_transport_capture(
            manager,
            manager.create_child_sections(
                CreateChildSectionsRequest(
                    projectConfigId=project_config_id,
                    parentId=group_id,
                    implType=SectionType.TextBlock,
                    numChildren=1,
                    startIdx=0,
                )
            ),
        )
        _assert_single_structural_patch(
            create_child_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        group_impl_after_create = get_curr_effective_section_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            group_id,
            BaseParentSectionImpl,
        )
        assert 1 == len(group_impl_after_create.children)

        via_incrementer_capture, _ = await _run_with_transport_capture(
            manager,
            manager.create_child_sections_via_incrementer(
                CreateChildSectionsViaIncrementerRequest(
                    projectConfigId=project_config_id,
                    calledBy=group_id,
                    numChildren=1,
                    implType=SectionType.TextBlock,
                )
            ),
        )
        _assert_single_structural_patch(
            via_incrementer_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        group_impl_after_incrementer = get_curr_effective_section_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            group_id,
            BaseParentSectionImpl,
        )
        assert 2 == len(group_impl_after_incrementer.children)

        temp_terminal_id = ID("structural-patch-temp-terminal")
        create_temp_terminal_capture, _ = await _run_with_transport_capture(
            manager,
            manager.create_temporary_terminal(project_config_id, temp_terminal_id),
        )
        _assert_single_structural_patch(
            create_temp_terminal_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        assert (
            temp_terminal_id
            in manager.get_single_config_state(project_config_id).sections
        )

        delete_child_capture, _ = await _run_with_transport_capture(
            manager,
            manager.delete_child_sections_via_decrementer(
                DeleteChildSectionsViaDecrementerRequest(
                    projectConfigId=project_config_id,
                    calledBy=group_id,
                    numChildren=1,
                )
            ),
        )
        _assert_single_structural_patch(
            delete_child_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        group_impl_after_delete_child = get_curr_effective_section_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            group_id,
            BaseParentSectionImpl,
        )
        assert 1 == len(group_impl_after_delete_child.children)
        remaining_child_id = group_impl_after_delete_child.children[0]

        delete_section_capture, _ = await _run_with_transport_capture(
            manager,
            manager.delete_sections(
                DeleteSectionsRequest(
                    projectConfigId=project_config_id,
                    sectionIds=[remaining_child_id],
                )
            ),
        )
        _assert_single_structural_patch(
            delete_section_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        assert (
            remaining_child_id
            not in manager.get_single_config_state(project_config_id).sections
        )


@pytest.mark.asyncio
async def test_variant_name_and_paste_routes_use_structural_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        create_text_capture, create_text_result = await _run_with_transport_capture(
            manager,
            manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.TextBlock,
                    controlCodeObjType=None,
                    implOverrides=None,
                    position=Position(x=910.0, y=210.0),
                    topLevelSections=None,
                    viewportBounds=None,
                )
            ),
        )
        _assert_single_structural_patch(
            create_text_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        text_section_id = create_text_result.sectionId

        rename_capture, _ = await _run_with_transport_capture(
            manager,
            manager.set_section_name(
                SetSectionNameRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    name="structural-patch-renamed",
                )
            ),
        )
        _assert_single_structural_patch(
            rename_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        assert (
            "structural-patch-renamed"
            == manager.get_single_config_state(project_config_id)
            .sections[SECTION_ID]
            .name
        )

        heading_toggle_capture, _ = await _run_with_transport_capture(
            manager,
            manager.set_text_block_heading_as_section_name(
                SetTextBlockHeadingAsSectionNameRequest(
                    projectConfigId=project_config_id,
                    sectionId=text_section_id,
                    headingAsSectionName=True,
                )
            ),
        )
        _assert_single_structural_patch(
            heading_toggle_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        text_impl_after_toggle = get_curr_effective_section_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            text_section_id,
            TextBlockSectionImpl,
        )
        assert text_impl_after_toggle.headingAsSectionName is True

        create_variant_capture, _ = await _run_with_transport_capture(
            manager,
            manager.create_new_section_variant(
                CreateNewSectionVariantRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                )
            ),
        )
        _assert_single_structural_patch(
            create_variant_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        section_core_after_variant_create = manager.get_single_config_state(
            project_config_id
        ).sections[SECTION_ID]
        assert 2 == len(section_core_after_variant_create.variants)
        variant_to_delete = next(
            variant_id
            for variant_id in section_core_after_variant_create.variants
            if variant_id != section_core_after_variant_create.defaultVariant
        )

        delete_variant_capture, delete_variant_result = await _run_with_transport_capture(
            manager,
            manager.delete_section_variant_or_ask(
                DeleteSectionVariantOrAskRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    variantId=variant_to_delete,
                )
            ),
        )
        _assert_single_structural_patch(
            delete_variant_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        assert delete_variant_result is None
        section_core_after_variant_delete = manager.get_single_config_state(
            project_config_id
        ).sections[SECTION_ID]
        assert 1 == len(section_core_after_variant_delete.variants)
        assert variant_to_delete not in section_core_after_variant_delete.variants

        copy_payload = await manager.prepare_sections_for_copy(
            PrepareSectionsForCopyRequest(
                projectConfigId=project_config_id,
                sectionIds=[SECTION_ID],
            )
        )
        await manager.finish_pending_operations(timeout=5.0)
        section_count_before_paste = len(
            manager.get_single_config_state(project_config_id).sections
        )
        paste_capture, _ = await _run_with_transport_capture(
            manager,
            manager.paste_sections(
                PasteSectionsRequest(
                    projectConfigId=project_config_id,
                    data=copy_payload.data,
                    position=Position(x=1440.0, y=550.0),
                    asRef=False,
                )
            ),
        )
        _assert_single_structural_patch(
            paste_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        section_count_after_paste = len(
            manager.get_single_config_state(project_config_id).sections
        )
        assert section_count_after_paste > section_count_before_paste


@pytest.mark.asyncio
async def test_watch_code_routes_use_structural_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        set_enabled_capture, _ = await _run_with_transport_capture(
            manager,
            manager.set_watch_code_enabled(
                SetWatchCodeEnabledRequest(
                    projectConfigId=project_config_id,
                    enabled=True,
                )
            ),
        )
        _assert_single_structural_patch(
            set_enabled_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        assert (
            manager.get_single_config_state(project_config_id)
            .projectConfig.watchCodeEnabled
            is True
        )

        cas_enabled_capture, cas_enabled_result = await _run_with_transport_capture(
            manager,
            manager.compare_and_set_watch_code_enabled(
                SetWatchCodeEnabledRequest(
                    projectConfigId=project_config_id,
                    enabled=False,
                )
            ),
        )
        _assert_single_structural_patch(
            cas_enabled_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        enabled_old, enabled_new = cas_enabled_result
        assert enabled_old is True
        assert enabled_new is False

        set_inputs_capture, _ = await _run_with_transport_capture(
            manager,
            manager.set_watch_code_inputs(
                SetWatchCodeInputsRequest(
                    projectConfigId=project_config_id,
                    watchCodeFolders=[
                        WatchCodeFolder(
                            path="backend/setta/project_state",
                            recursive=False,
                        )
                    ],
                    watchCodeFiles=["backend/setta/project_state/watch_code.py"],
                )
            ),
        )
        _assert_single_structural_patch(
            set_inputs_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )

        cas_folders_capture, cas_folders_result = await _run_with_transport_capture(
            manager,
            manager.compare_and_set_watch_code_folders(
                SetWatchCodeInputsRequest(
                    projectConfigId=project_config_id,
                    watchCodeFolders=[
                        WatchCodeFolder(
                            path="backend/setta/project_state",
                            recursive=True,
                        )
                    ],
                    watchCodeFiles=["backend/setta/project_state/watch_code.py"],
                )
            ),
        )
        _assert_single_structural_patch(
            cas_folders_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        folders_old, folders_new = cas_folders_result
        assert 1 == len(folders_old)
        assert 1 == len(folders_new)
        assert "backend/setta/project_state" == folders_old[0]["path"]
        assert "backend/setta/project_state" == folders_new[0]["path"]
        assert folders_old[0]["recursive"] is False
        assert folders_new[0]["recursive"] is True

        cas_files_capture, cas_files_result = await _run_with_transport_capture(
            manager,
            manager.compare_and_set_watch_code_files(
                SetWatchCodeInputsRequest(
                    projectConfigId=project_config_id,
                    watchCodeFolders=[
                        WatchCodeFolder(
                            path="backend/setta/project_state",
                            recursive=True,
                        )
                    ],
                    watchCodeFiles=["backend/setta/project_state/base_project_manager.py"],
                )
            ),
        )
        _assert_single_structural_patch(
            cas_files_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        files_old, files_new = cas_files_result
        assert ["backend/setta/project_state/watch_code.py"] == files_old
        assert ["backend/setta/project_state/base_project_manager.py"] == files_new


@pytest.mark.asyncio
async def test_codegen_target_routes_use_structural_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        disable_capture, _ = await _run_with_transport_capture(
            manager,
            manager.set_project_config_codegen_targets(
                SetProjectConfigCodegenTargetsRequest(
                    projectConfigId=project_config_id,
                    codegenTargets=[],
                )
            ),
        )
        _assert_single_structural_patch(
            disable_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        assert (
            []
            == manager.get_single_config_state(project_config_id)
            .projectConfig.codegenTargets
        )
        assert (
            manager.get_single_config_state(project_config_id)
            .singletonSections.GenPythonCode
            is None
        )

        enable_capture, enable_result = await _run_with_transport_capture(
            manager,
            manager.compare_and_set_python_codegen_enabled(
                project_config_id,
                True,
            ),
        )
        _assert_single_structural_patch(
            enable_capture,
            project_config_id,
            expected_name_validation_calls=1,
        )
        enabled_old, enabled_new = enable_result
        assert enabled_old is False
        assert enabled_new is True
        targets_after_enable = manager.get_single_config_state(
            project_config_id
        ).projectConfig.codegenTargets
        assert any(
            isinstance(target, ProjectCodegenPythonTarget)
            for target in targets_after_enable
        )
        assert (
            manager.get_single_config_state(project_config_id)
            .singletonSections.GenPythonCode
            is not None
        )


@pytest.mark.asyncio
async def test_undo_redo_use_full_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.TextBlock,
                controlCodeObjType=None,
                implOverrides=None,
                position=Position(x=1120.0, y=540.0),
                topLevelSections=None,
                viewportBounds=None,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        undo_capture, _ = await _run_with_transport_capture(
            manager,
            manager.undo(
                UndoRequest(
                    projectConfigId=project_config_id,
                    steps=1,
                )
            ),
        )
        assert 0 == undo_capture["project_state_broadcast_calls"]
        assert undo_capture["structural_patch_calls"]
        assert 1 <= undo_capture["code_obj_patch_calls"]
        assert (
            undo_capture["code_obj_patch_calls"]
            <= len(undo_capture["structural_patch_calls"])
        )
        assert 0 == undo_capture["project_config_patch_calls"]
        assert 0 == undo_capture["section_impl_patch_calls"]
        assert (
            len(undo_capture["structural_patch_calls"])
            == undo_capture["name_validation_broadcast_calls"]
        )

        redo_capture, _ = await _run_with_transport_capture(
            manager,
            manager.redo(
                RedoRequest(
                    projectConfigId=project_config_id,
                    steps=1,
                )
            ),
        )
        assert 0 == redo_capture["project_state_broadcast_calls"]
        assert redo_capture["structural_patch_calls"]
        assert 1 <= redo_capture["code_obj_patch_calls"]
        assert (
            redo_capture["code_obj_patch_calls"]
            <= len(redo_capture["structural_patch_calls"])
        )
        assert 0 == redo_capture["project_config_patch_calls"]
        assert 0 == redo_capture["section_impl_patch_calls"]
        assert (
            len(redo_capture["structural_patch_calls"])
            == redo_capture["name_validation_broadcast_calls"]
        )
