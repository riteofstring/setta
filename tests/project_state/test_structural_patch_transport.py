import asyncio

import pytest

from setta.database.utils import create_new_id
from setta.project_state.project_manager_types import (
    CreateEdgeRequest,
    CreateChildSectionsRequest,
    CreateChildSectionsViaIncrementerRequest,
    DeleteChildSectionsViaDecrementerRequest,
    DeleteJSONSourceFileAndVariantRequest,
    DeleteSectionsRequest,
    DeleteSectionVariantOrAskRequest,
    CreateTopLevelSectionRequest,
    CreateNewSectionVariantRequest,
    GroupSectionsRequest,
    MoveSectionsRequest,
    PasteSectionsRequest,
    PrepareSectionsForCopyRequest,
    SetCodeSectionAttachedTerminalRequest,
    SetCodeSectionDiagnosticsMuteRequest,
    SetDefaultSectionVariantRequest,
    SetProjectConfigCodegenTargetsRequest,
    SetParamEnteredValueRequest,
    SetSectionNameRequest,
    SetTextBlockHeadingAsSectionNameRequest,
    SetSectionVariantNameRequest,
    SetSectionVariantRequest,
    SetSectionVariantSortOrderRequest,
    SetTypeErrorIgnoreRequest,
    SetViewportRequest,
    RedoRequest,
    UndoRequest,
    SetWatchCodeEnabledRequest,
    SetWatchCodeInputsRequest,
    ToggleVariantFrozenRequest,
    ToggleVariantJSONSourceRequest,
    UngroupGroupsRequest,
)
from setta.types.edges import EdgePort
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl2 import (
    add_kwarg,
    create_top_level_section,
    set_section_edge_inputs,
    set_section_edge_outputs,
)
from setta.types.id import ID
from setta.types.project_config import (
    Position,
    ProjectCodegenPythonTarget,
    Viewport,
    WatchCodeFolder,
)
from setta.types.section_impls import (
    BaseParentSectionImpl,
    SectionType,
    TextBlockSectionImpl,
)
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


SECTION_ID = ID("section-1")


def _build_edge_test_state_for_undo_redo(settings):
    project_state = build_callable_project_state(20)
    source_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Dict,
        Position(x=900, y=0),
        core_overrides={"name": "edge_source"},
    )
    target_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Dict,
        Position(x=980, y=120),
        core_overrides={"name": "edge_target"},
    )
    source_port_id = create_new_id()
    target_param_id = add_kwarg(settings, project_state, target_section_id)
    set_section_edge_outputs(
        project_state,
        source_section_id,
        [EdgePort(id=source_port_id, accessor=".foo")],
    )
    set_section_edge_inputs(
        settings,
        project_state,
        target_section_id,
        [target_param_id],
    )
    return (
        project_state,
        source_section_id,
        source_port_id,
        target_section_id,
        target_param_id,
    )


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
        sender.broadcast_project_state_code_objs_patch = (
            original_code_obj_patch_broadcast  # type: ignore[method-assign]
        )
        sender.broadcast_project_state_section_impl_patch = (
            original_section_impl_patch_broadcast  # type: ignore[method-assign]
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
    # Drain deferred refresh work outside the capture window so assertions stay
    # scoped to the immediate transport payload of the route under test.
    await manager.finish_pending_operations(timeout=5.0)
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

        capture, _ = await _run_with_transport_capture(
            manager,
            manager.set_section_variant(
                SetSectionVariantRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    variantId=target_variant_id,
                )
            ),
        )

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
            manager.get_single_config_state(
                project_config_id
            ).projectConfig.sectionVariantMap[SECTION_ID]
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

        section_core_before = manager.get_single_config_state(
            project_config_id
        ).sections[SECTION_ID]
        target_variant_id = next(
            variant_id
            for variant_id in section_core_before.variants
            if variant_id != section_core_before.defaultVariant
        )

        capture, _ = await _run_with_transport_capture(
            manager,
            manager.set_default_section_variant(
                SetDefaultSectionVariantRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    variantId=target_variant_id,
                )
            ),
        )

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
            .sections[SECTION_ID]
            .defaultVariant
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

        capture, _ = await _run_with_transport_capture(
            manager,
            manager.set_section_variant_sort_order(
                SetSectionVariantSortOrderRequest(
                    projectConfigId=project_config_id,
                    sectionId=SECTION_ID,
                    orderedVariantIds=reversed_variant_order,
                )
            ),
        )

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

        capture_toggle_json, _ = await _run_with_transport_capture(
            manager,
            manager.toggle_variant_json_source(
                ToggleVariantJSONSourceRequest(
                    projectConfigId=project_config_id,
                    sectionId=dict_section_id,
                    variantId=variant_id,
                )
            ),
        )

        assert 0 == capture_toggle_json["project_state_broadcast_calls"]
        assert 1 == len(capture_toggle_json["structural_patch_calls"])
        assert 0 == capture_toggle_json["project_config_patch_calls"]
        assert 0 == capture_toggle_json["code_obj_patch_calls"]
        assert 0 == capture_toggle_json["section_impl_patch_calls"]
        assert 0 == capture_toggle_json["name_validation_broadcast_calls"]

        before_is_frozen = (
            manager.get_single_config_state(project_config_id)
            .sectionVariants[variant_id]
            .isFrozen
        )
        capture_toggle_frozen, _ = await _run_with_transport_capture(
            manager,
            manager.toggle_variant_frozen(
                ToggleVariantFrozenRequest(
                    projectConfigId=project_config_id,
                    variantId=variant_id,
                )
            ),
        )

        assert 0 == capture_toggle_frozen["project_state_broadcast_calls"]
        assert 1 == len(capture_toggle_frozen["structural_patch_calls"])
        assert 0 == capture_toggle_frozen["project_config_patch_calls"]
        assert 0 == capture_toggle_frozen["code_obj_patch_calls"]
        assert 0 == capture_toggle_frozen["section_impl_patch_calls"]
        assert 0 == capture_toggle_frozen["name_validation_broadcast_calls"]
        assert (
            manager.get_single_config_state(project_config_id)
            .sectionVariants[variant_id]
            .isFrozen
            != before_is_frozen
        )

        capture_set_name, _ = await _run_with_transport_capture(
            manager,
            manager.set_section_variant_name(
                SetSectionVariantNameRequest(
                    projectConfigId=project_config_id,
                    variantId=variant_id,
                    name="Updated Variant Name",
                )
            ),
        )

        assert 0 == capture_set_name["project_state_broadcast_calls"]
        assert 1 == len(capture_set_name["structural_patch_calls"])
        assert 0 == capture_set_name["project_config_patch_calls"]
        assert 0 == capture_set_name["code_obj_patch_calls"]
        assert 0 == capture_set_name["section_impl_patch_calls"]
        assert 0 == capture_set_name["name_validation_broadcast_calls"]
        assert (
            manager.get_single_config_state(project_config_id)
            .sectionVariants[variant_id]
            .name
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

        capture_attach, _ = await _run_with_transport_capture(
            manager,
            manager.set_code_section_attached_terminal(
                SetCodeSectionAttachedTerminalRequest(
                    projectConfigId=project_config_id,
                    sectionId=code_section_id,
                    terminalSectionId=terminal_section_id,
                )
            ),
        )

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

        capture_ensure, terminal_id = await _run_with_transport_capture(
            manager,
            manager.ensure_code_section_attached_terminal_for_run(
                project_config_id,
                code_section_id,
            ),
        )

        assert terminal_id is not None
        assert 0 == capture_ensure["project_state_broadcast_calls"]
        assert 1 == len(capture_ensure["structural_patch_calls"])
        assert 0 == capture_ensure["project_config_patch_calls"]
        assert 0 == capture_ensure["code_obj_patch_calls"]
        assert 0 == capture_ensure["section_impl_patch_calls"]
        assert 0 == capture_ensure["name_validation_broadcast_calls"]


@pytest.mark.asyncio
async def test_code_section_terminal_routes_defer_codegen_refresh() -> None:
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

        refresh_calls = 0
        scheduled_deferred_refreshes: list[ID] = []
        original_refresh = manager._refresh_codegen_state
        original_schedule_deferred_refresh = manager._schedule_deferred_codegen_refresh

        async def record_refresh(next_state) -> None:
            nonlocal refresh_calls
            if next_state.projectConfig.id != project_config_id:
                await original_refresh(next_state)
                return
            refresh_calls += 1
            await original_refresh(next_state)

        def record_schedule_deferred_refresh(project_config_id_for_refresh: ID) -> None:
            if project_config_id_for_refresh != project_config_id:
                return
            scheduled_deferred_refreshes.append(project_config_id_for_refresh)

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        manager._schedule_deferred_codegen_refresh = record_schedule_deferred_refresh  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)

            before_attach_refresh_calls = refresh_calls
            before_attach_scheduled_count = len(scheduled_deferred_refreshes)
            await manager.set_code_section_attached_terminal(
                SetCodeSectionAttachedTerminalRequest(
                    projectConfigId=project_config_id,
                    sectionId=code_section_id,
                    terminalSectionId=terminal_section_id,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            assert refresh_calls == before_attach_refresh_calls
            assert (
                len(scheduled_deferred_refreshes) == before_attach_scheduled_count + 1
            )
            assert scheduled_deferred_refreshes[-1] == project_config_id

            before_detach_refresh_calls = refresh_calls
            before_detach_scheduled_count = len(scheduled_deferred_refreshes)
            await manager.set_code_section_attached_terminal(
                SetCodeSectionAttachedTerminalRequest(
                    projectConfigId=project_config_id,
                    sectionId=code_section_id,
                    terminalSectionId=None,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            assert refresh_calls == before_detach_refresh_calls
            assert (
                len(scheduled_deferred_refreshes) == before_detach_scheduled_count + 1
            )
            assert scheduled_deferred_refreshes[-1] == project_config_id

            before_ensure_refresh_calls = refresh_calls
            before_ensure_scheduled_count = len(scheduled_deferred_refreshes)
            terminal_id = await manager.ensure_code_section_attached_terminal_for_run(
                project_config_id,
                code_section_id,
            )
            await manager.finish_pending_operations(timeout=5.0)
            assert terminal_id is not None
            assert refresh_calls == before_ensure_refresh_calls
            assert (
                len(scheduled_deferred_refreshes) == before_ensure_scheduled_count + 1
            )
            assert scheduled_deferred_refreshes[-1] == project_config_id
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]
            manager._schedule_deferred_codegen_refresh = (
                original_schedule_deferred_refresh  # type: ignore[method-assign]
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

        capture, _ = await _run_with_transport_capture(
            manager,
            manager.move_sections(
                MoveSectionsRequest(
                    projectConfigId=project_config_id,
                    sectionIds=[SECTION_ID],
                    newParentId=None,
                    newIndex=None,
                    positionsById={
                        SECTION_ID: Position(x=321.0, y=654.0),
                    },
                )
            ),
        )

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
async def test_move_sections_defers_codegen_refresh() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(8)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        refresh_calls = 0
        scheduled_deferred_refreshes: list[ID] = []
        original_refresh = manager._refresh_codegen_state
        original_schedule_deferred_refresh = manager._schedule_deferred_codegen_refresh

        async def record_refresh(next_state) -> None:
            nonlocal refresh_calls
            if next_state.projectConfig.id != project_config_id:
                await original_refresh(next_state)
                return
            refresh_calls += 1
            await original_refresh(next_state)

        def record_schedule_deferred_refresh(project_config_id_for_refresh: ID) -> None:
            if project_config_id_for_refresh != project_config_id:
                return
            scheduled_deferred_refreshes.append(project_config_id_for_refresh)

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        manager._schedule_deferred_codegen_refresh = record_schedule_deferred_refresh  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before_refresh_calls = refresh_calls
            before_scheduled_count = len(scheduled_deferred_refreshes)
            await manager.move_sections(
                MoveSectionsRequest(
                    projectConfigId=project_config_id,
                    sectionIds=[SECTION_ID],
                    newParentId=None,
                    newIndex=None,
                    positionsById={
                        SECTION_ID: Position(x=515.0, y=712.0),
                    },
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            assert refresh_calls == before_refresh_calls
            assert len(scheduled_deferred_refreshes) == before_scheduled_count + 1
            assert scheduled_deferred_refreshes[-1] == project_config_id
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]
            manager._schedule_deferred_codegen_refresh = (
                original_schedule_deferred_refresh  # type: ignore[method-assign]
            )


@pytest.mark.asyncio
async def test_group_and_ungroup_use_structural_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        group_capture, _ = await _run_with_transport_capture(
            manager,
            manager.group_sections(
                GroupSectionsRequest(
                    projectConfigId=project_config_id,
                    sectionIds=[SECTION_ID],
                )
            ),
        )

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

        ungroup_capture, _ = await _run_with_transport_capture(
            manager,
            manager.ungroup_groups(
                UngroupGroupsRequest(
                    projectConfigId=project_config_id,
                    groupIds=[group_id],
                )
            ),
        )

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
async def test_group_and_ungroup_defer_codegen_refresh() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(8)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        refresh_calls = 0
        scheduled_deferred_refreshes: list[ID] = []
        original_refresh = manager._refresh_codegen_state
        original_schedule_deferred_refresh = manager._schedule_deferred_codegen_refresh

        async def record_refresh(next_state) -> None:
            nonlocal refresh_calls
            if next_state.projectConfig.id != project_config_id:
                await original_refresh(next_state)
                return
            refresh_calls += 1
            await original_refresh(next_state)

        def record_schedule_deferred_refresh(project_config_id_for_refresh: ID) -> None:
            if project_config_id_for_refresh != project_config_id:
                return
            scheduled_deferred_refreshes.append(project_config_id_for_refresh)

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        manager._schedule_deferred_codegen_refresh = record_schedule_deferred_refresh  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before_group_refresh_calls = refresh_calls
            before_group_scheduled_count = len(scheduled_deferred_refreshes)
            await manager.group_sections(
                GroupSectionsRequest(
                    projectConfigId=project_config_id,
                    sectionIds=[SECTION_ID],
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            assert refresh_calls == before_group_refresh_calls
            assert len(scheduled_deferred_refreshes) == before_group_scheduled_count + 1
            assert scheduled_deferred_refreshes[-1] == project_config_id

            grouped_state = manager.get_single_config_state(project_config_id)
            group_id = grouped_state.parentSectionMap[SECTION_ID]
            assert group_id is not None

            before_ungroup_refresh_calls = refresh_calls
            before_ungroup_scheduled_count = len(scheduled_deferred_refreshes)
            await manager.ungroup_groups(
                UngroupGroupsRequest(
                    projectConfigId=project_config_id,
                    groupIds=[group_id],
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            assert refresh_calls == before_ungroup_refresh_calls
            assert (
                len(scheduled_deferred_refreshes) == before_ungroup_scheduled_count + 1
            )
            assert scheduled_deferred_refreshes[-1] == project_config_id
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]
            manager._schedule_deferred_codegen_refresh = (
                original_schedule_deferred_refresh  # type: ignore[method-assign]
            )


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
async def test_remaining_section_lifecycle_routes_defer_codegen_refresh() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(8)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        refresh_calls = 0
        scheduled_deferred_refreshes: list[ID] = []
        original_refresh = manager._refresh_codegen_state
        original_schedule_deferred_refresh = manager._schedule_deferred_codegen_refresh

        async def record_refresh(next_state) -> None:
            nonlocal refresh_calls
            if next_state.projectConfig.id != project_config_id:
                await original_refresh(next_state)
                return
            refresh_calls += 1
            await original_refresh(next_state)

        def record_schedule_deferred_refresh(project_config_id_for_refresh: ID) -> None:
            if project_config_id_for_refresh != project_config_id:
                return
            scheduled_deferred_refreshes.append(project_config_id_for_refresh)

        async def assert_deferred_refresh(operation_coro):
            await manager._flush_pending_gen_code_prefix_suffix_refresh(
                project_config_id
            )
            await manager._flush_pending_deferred_codegen_refresh(project_config_id)
            await manager.finish_pending_operations(timeout=5.0)
            before_refresh_calls = refresh_calls
            before_scheduled_count = len(scheduled_deferred_refreshes)
            result = await operation_coro
            await manager.finish_pending_operations(timeout=5.0)
            assert refresh_calls == before_refresh_calls
            assert len(scheduled_deferred_refreshes) == before_scheduled_count + 1
            assert scheduled_deferred_refreshes[-1] == project_config_id
            return result

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        manager._schedule_deferred_codegen_refresh = record_schedule_deferred_refresh  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)

            create_group_result = await assert_deferred_refresh(
                manager.create_top_level_section(
                    CreateTopLevelSectionRequest(
                        projectConfigId=project_config_id,
                        implType=SectionType.Group,
                        controlCodeObjType=None,
                        implOverrides=None,
                        position=Position(x=701.0, y=121.0),
                        topLevelSections=None,
                        viewportBounds=None,
                    )
                )
            )
            group_id = create_group_result.sectionId

            await assert_deferred_refresh(
                manager.create_child_sections(
                    CreateChildSectionsRequest(
                        projectConfigId=project_config_id,
                        parentId=group_id,
                        implType=SectionType.TextBlock,
                        numChildren=1,
                        startIdx=0,
                    )
                )
            )

            await assert_deferred_refresh(
                manager.create_child_sections_via_incrementer(
                    CreateChildSectionsViaIncrementerRequest(
                        projectConfigId=project_config_id,
                        calledBy=group_id,
                        numChildren=1,
                        implType=SectionType.TextBlock,
                    )
                )
            )

            temp_terminal_id = ID("deferred-refresh-temp-terminal")
            await assert_deferred_refresh(
                manager.create_temporary_terminal(project_config_id, temp_terminal_id)
            )

            await assert_deferred_refresh(
                manager.delete_child_sections_via_decrementer(
                    DeleteChildSectionsViaDecrementerRequest(
                        projectConfigId=project_config_id,
                        calledBy=group_id,
                        numChildren=1,
                    )
                )
            )

            group_impl_after_delete_child = (
                get_curr_effective_section_impl_with_type_guard(
                    manager.get_single_config_state(project_config_id),
                    group_id,
                    BaseParentSectionImpl,
                )
            )
            assert 1 == len(group_impl_after_delete_child.children)
            remaining_child_id = group_impl_after_delete_child.children[0]

            await assert_deferred_refresh(
                manager.delete_sections(
                    DeleteSectionsRequest(
                        projectConfigId=project_config_id,
                        sectionIds=[remaining_child_id],
                    )
                )
            )

            await assert_deferred_refresh(
                manager.create_new_section_variant(
                    CreateNewSectionVariantRequest(
                        projectConfigId=project_config_id,
                        sectionId=SECTION_ID,
                    )
                )
            )

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
            await assert_deferred_refresh(
                manager.paste_sections(
                    PasteSectionsRequest(
                        projectConfigId=project_config_id,
                        data=copy_payload.data,
                        position=Position(x=1410.0, y=520.0),
                        asRef=False,
                    )
                )
            )
            section_count_after_paste = len(
                manager.get_single_config_state(project_config_id).sections
            )
            assert section_count_after_paste > section_count_before_paste
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]
            manager._schedule_deferred_codegen_refresh = (
                original_schedule_deferred_refresh  # type: ignore[method-assign]
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

        (
            delete_variant_capture,
            delete_variant_result,
        ) = await _run_with_transport_capture(
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
async def test_variant_and_name_routes_defer_codegen_refresh() -> None:
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
        create_dict_response = await manager.create_top_level_section(
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
        create_text_response = await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.TextBlock,
                controlCodeObjType=None,
                implOverrides=None,
                position=Position(x=930.0, y=230.0),
                topLevelSections=None,
                viewportBounds=None,
            )
        )
        await manager.create_new_section_variant(
            CreateNewSectionVariantRequest(
                projectConfigId=project_config_id,
                sectionId=create_dict_response.sectionId,
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
        reversed_variant_order = list(reversed(section_core.variants))
        variant_to_delete = next(
            variant_id
            for variant_id in section_core.variants
            if variant_id != section_core.defaultVariant
        )

        dict_section_id = create_dict_response.sectionId
        dict_section_core = manager.get_single_config_state(project_config_id).sections[
            dict_section_id
        ]
        dict_active_variant_id = manager.get_single_config_state(
            project_config_id
        ).projectConfig.sectionVariantMap[dict_section_id]
        dict_variant_to_delete = next(
            variant_id
            for variant_id in dict_section_core.variants
            if variant_id != dict_section_core.defaultVariant
        )
        text_section_id = create_text_response.sectionId

        refresh_calls = 0
        scheduled_deferred_refreshes: list[ID] = []
        original_refresh = manager._refresh_codegen_state
        original_schedule_deferred_refresh = manager._schedule_deferred_codegen_refresh

        async def record_refresh(next_state) -> None:
            nonlocal refresh_calls
            if next_state.projectConfig.id != project_config_id:
                await original_refresh(next_state)
                return
            refresh_calls += 1
            await original_refresh(next_state)

        def record_schedule_deferred_refresh(project_config_id_for_refresh: ID) -> None:
            if project_config_id_for_refresh != project_config_id:
                return
            scheduled_deferred_refreshes.append(project_config_id_for_refresh)

        async def assert_deferred_refresh(operation_coro):
            await manager._flush_pending_gen_code_prefix_suffix_refresh(
                project_config_id
            )
            await manager._flush_pending_deferred_codegen_refresh(project_config_id)
            await manager.finish_pending_operations(timeout=5.0)
            before_refresh_calls = refresh_calls
            before_scheduled_count = len(scheduled_deferred_refreshes)
            result = await operation_coro
            assert refresh_calls == before_refresh_calls
            assert len(scheduled_deferred_refreshes) == before_scheduled_count + 1
            assert scheduled_deferred_refreshes[-1] == project_config_id
            return result

        temp_json_source_file = (
            fixture.setta_root.parent
            / "tmp-structural-transport-delete-json-source-file.tmp"
        )

        # Setup routes above can queue deferred refresh work; flush it before
        # installing counters so this test only measures the target operations.
        await manager._flush_pending_gen_code_prefix_suffix_refresh(project_config_id)
        await manager._flush_pending_deferred_codegen_refresh(project_config_id)
        await manager.finish_pending_operations(timeout=5.0)

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        manager._schedule_deferred_codegen_refresh = record_schedule_deferred_refresh  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)

            await assert_deferred_refresh(
                manager.set_section_variant(
                    SetSectionVariantRequest(
                        projectConfigId=project_config_id,
                        sectionId=SECTION_ID,
                        variantId=target_variant_id,
                    )
                )
            )
            await assert_deferred_refresh(
                manager.set_default_section_variant(
                    SetDefaultSectionVariantRequest(
                        projectConfigId=project_config_id,
                        sectionId=SECTION_ID,
                        variantId=target_variant_id,
                    )
                )
            )
            await assert_deferred_refresh(
                manager.set_section_variant_sort_order(
                    SetSectionVariantSortOrderRequest(
                        projectConfigId=project_config_id,
                        sectionId=SECTION_ID,
                        orderedVariantIds=reversed_variant_order,
                    )
                )
            )
            await assert_deferred_refresh(
                manager.toggle_variant_json_source(
                    ToggleVariantJSONSourceRequest(
                        projectConfigId=project_config_id,
                        sectionId=dict_section_id,
                        variantId=dict_active_variant_id,
                    )
                )
            )
            await assert_deferred_refresh(
                manager.toggle_variant_frozen(
                    ToggleVariantFrozenRequest(
                        projectConfigId=project_config_id,
                        variantId=dict_active_variant_id,
                    )
                )
            )
            await assert_deferred_refresh(
                manager.set_section_variant_name(
                    SetSectionVariantNameRequest(
                        projectConfigId=project_config_id,
                        variantId=dict_active_variant_id,
                        name="deferred-variant-name",
                    )
                )
            )
            await assert_deferred_refresh(
                manager.set_section_name(
                    SetSectionNameRequest(
                        projectConfigId=project_config_id,
                        sectionId=SECTION_ID,
                        name="deferred-section-name",
                    )
                )
            )
            await assert_deferred_refresh(
                manager.set_text_block_heading_as_section_name(
                    SetTextBlockHeadingAsSectionNameRequest(
                        projectConfigId=project_config_id,
                        sectionId=text_section_id,
                        headingAsSectionName=True,
                    )
                )
            )
            delete_variant_result = await assert_deferred_refresh(
                manager.delete_section_variant_or_ask(
                    DeleteSectionVariantOrAskRequest(
                        projectConfigId=project_config_id,
                        sectionId=SECTION_ID,
                        variantId=variant_to_delete,
                    )
                )
            )
            assert delete_variant_result is None

            temp_json_source_file.write_text("{}", encoding="utf-8")
            before_scheduled_count = len(scheduled_deferred_refreshes)
            delete_json_result = await manager.delete_json_source_file_and_variant(
                DeleteJSONSourceFileAndVariantRequest(
                    projectConfigId=project_config_id,
                    sectionId=dict_section_id,
                    variantId=dict_variant_to_delete,
                    filepath=str(temp_json_source_file),
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            assert delete_json_result is None
            assert len(scheduled_deferred_refreshes) == before_scheduled_count + 1
            assert scheduled_deferred_refreshes[-1] == project_config_id
            assert not temp_json_source_file.exists()
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]
            manager._schedule_deferred_codegen_refresh = (
                original_schedule_deferred_refresh  # type: ignore[method-assign]
            )
            if temp_json_source_file.exists():
                temp_json_source_file.unlink()


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
            expected_name_validation_calls=0,
        )
        assert (
            manager.get_single_config_state(
                project_config_id
            ).projectConfig.watchCodeEnabled
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
            expected_name_validation_calls=0,
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
            expected_name_validation_calls=0,
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
            expected_name_validation_calls=0,
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
                    watchCodeFiles=[
                        "backend/setta/project_state/base_project_manager.py"
                    ],
                )
            ),
        )
        _assert_single_structural_patch(
            cas_files_capture,
            project_config_id,
            expected_name_validation_calls=0,
        )
        files_old, files_new = cas_files_result
        assert ["backend/setta/project_state/watch_code.py"] == files_old
        assert ["backend/setta/project_state/base_project_manager.py"] == files_new


@pytest.mark.asyncio
async def test_watch_code_routes_defer_codegen_refresh() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        refresh_calls = 0
        scheduled_deferred_refreshes: list[ID] = []
        original_refresh = manager._refresh_codegen_state
        original_schedule_deferred_refresh = manager._schedule_deferred_codegen_refresh

        async def record_refresh(next_state) -> None:
            nonlocal refresh_calls
            if next_state.projectConfig.id != project_config_id:
                await original_refresh(next_state)
                return
            refresh_calls += 1
            await original_refresh(next_state)

        def record_schedule_deferred_refresh(project_config_id_for_refresh: ID) -> None:
            if project_config_id_for_refresh != project_config_id:
                return
            scheduled_deferred_refreshes.append(project_config_id_for_refresh)

        async def assert_deferred_refresh(operation_coro):
            before_refresh_calls = refresh_calls
            before_scheduled_count = len(scheduled_deferred_refreshes)
            result = await operation_coro
            await manager.finish_pending_operations(timeout=5.0)
            assert refresh_calls == before_refresh_calls
            assert len(scheduled_deferred_refreshes) == before_scheduled_count + 1
            assert scheduled_deferred_refreshes[-1] == project_config_id
            return result

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        manager._schedule_deferred_codegen_refresh = record_schedule_deferred_refresh  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)

            await assert_deferred_refresh(
                manager.set_watch_code_enabled(
                    SetWatchCodeEnabledRequest(
                        projectConfigId=project_config_id,
                        enabled=True,
                    )
                )
            )

            enabled_old, enabled_new = await assert_deferred_refresh(
                manager.compare_and_set_watch_code_enabled(
                    SetWatchCodeEnabledRequest(
                        projectConfigId=project_config_id,
                        enabled=False,
                    )
                )
            )
            assert enabled_old is True
            assert enabled_new is False

            await assert_deferred_refresh(
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
                )
            )

            folders_old, folders_new = await assert_deferred_refresh(
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
                )
            )
            assert 1 == len(folders_old)
            assert 1 == len(folders_new)
            assert folders_old[0]["recursive"] is False
            assert folders_new[0]["recursive"] is True

            files_old, files_new = await assert_deferred_refresh(
                manager.compare_and_set_watch_code_files(
                    SetWatchCodeInputsRequest(
                        projectConfigId=project_config_id,
                        watchCodeFolders=[
                            WatchCodeFolder(
                                path="backend/setta/project_state",
                                recursive=True,
                            )
                        ],
                        watchCodeFiles=[
                            "backend/setta/project_state/base_project_manager.py"
                        ],
                    )
                )
            )
            assert ["backend/setta/project_state/watch_code.py"] == files_old
            assert ["backend/setta/project_state/base_project_manager.py"] == files_new
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]
            manager._schedule_deferred_codegen_refresh = (
                original_schedule_deferred_refresh  # type: ignore[method-assign]
            )


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
            expected_name_validation_calls=0,
        )
        assert (
            []
            == manager.get_single_config_state(
                project_config_id
            ).projectConfig.codegenTargets
        )
        assert (
            manager.get_single_config_state(
                project_config_id
            ).singletonSections.GenPythonCode
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
            expected_name_validation_calls=0,
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
            manager.get_single_config_state(
                project_config_id
            ).singletonSections.GenPythonCode
            is not None
        )


@pytest.mark.asyncio
async def test_codegen_target_routes_defer_codegen_refresh() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        refresh_calls = 0
        scheduled_deferred_refreshes: list[ID] = []
        original_refresh = manager._refresh_codegen_state
        original_schedule_deferred_refresh = manager._schedule_deferred_codegen_refresh

        async def record_refresh(next_state) -> None:
            nonlocal refresh_calls
            if next_state.projectConfig.id != project_config_id:
                await original_refresh(next_state)
                return
            refresh_calls += 1
            await original_refresh(next_state)

        def record_schedule_deferred_refresh(project_config_id_for_refresh: ID) -> None:
            if project_config_id_for_refresh != project_config_id:
                return
            scheduled_deferred_refreshes.append(project_config_id_for_refresh)

        async def assert_deferred_refresh(operation_coro):
            before_refresh_calls = refresh_calls
            before_scheduled_count = len(scheduled_deferred_refreshes)
            result = await operation_coro
            await manager.finish_pending_operations(timeout=5.0)
            assert refresh_calls == before_refresh_calls
            assert len(scheduled_deferred_refreshes) == before_scheduled_count + 1
            assert scheduled_deferred_refreshes[-1] == project_config_id
            return result

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        manager._schedule_deferred_codegen_refresh = record_schedule_deferred_refresh  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)

            await assert_deferred_refresh(
                manager.set_project_config_codegen_targets(
                    SetProjectConfigCodegenTargetsRequest(
                        projectConfigId=project_config_id,
                        codegenTargets=[],
                    )
                )
            )
            assert (
                []
                == manager.get_single_config_state(
                    project_config_id
                ).projectConfig.codegenTargets
            )
            assert (
                manager.get_single_config_state(
                    project_config_id
                ).singletonSections.GenPythonCode
                is None
            )

            enabled_old, enabled_new = await assert_deferred_refresh(
                manager.compare_and_set_python_codegen_enabled(
                    project_config_id,
                    True,
                )
            )
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
                manager.get_single_config_state(
                    project_config_id
                ).singletonSections.GenPythonCode
                is not None
            )
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]
            manager._schedule_deferred_codegen_refresh = (
                original_schedule_deferred_refresh  # type: ignore[method-assign]
            )


@pytest.mark.asyncio
async def test_undo_redo_project_config_only_history_uses_project_config_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        await manager.set_viewport(
            SetViewportRequest(
                projectConfigId=project_config_id,
                viewport=Viewport(x=14.0, y=-8.0, zoom=1.2),
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
        assert 0 == len(undo_capture["structural_patch_calls"])
        assert 1 == undo_capture["project_config_patch_calls"]
        assert 0 == undo_capture["code_obj_patch_calls"]
        assert 0 == undo_capture["section_impl_patch_calls"]
        assert 1 == undo_capture["name_validation_broadcast_calls"]

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
        assert 0 == len(redo_capture["structural_patch_calls"])
        assert 1 == redo_capture["project_config_patch_calls"]
        assert 0 == redo_capture["code_obj_patch_calls"]
        assert 0 == redo_capture["section_impl_patch_calls"]
        assert 1 == redo_capture["name_validation_broadcast_calls"]


@pytest.mark.asyncio
async def test_undo_redo_code_obj_scoped_history_uses_targeted_patch_transport() -> None:
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
                paramInfoId=ID("param-0"),
                value="undo-redo-targeted-patch",
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
        assert 0 == len(undo_capture["structural_patch_calls"])
        assert 0 == undo_capture["project_config_patch_calls"]
        assert 1 <= undo_capture["code_obj_patch_calls"]
        assert 1 <= (
            undo_capture["code_obj_patch_calls"]
            + undo_capture["section_impl_patch_calls"]
        )
        assert 1 == undo_capture["name_validation_broadcast_calls"]

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
        assert 0 == len(redo_capture["structural_patch_calls"])
        assert 0 == redo_capture["project_config_patch_calls"]
        assert 1 <= redo_capture["code_obj_patch_calls"]
        assert 1 <= (
            redo_capture["code_obj_patch_calls"]
            + redo_capture["section_impl_patch_calls"]
        )
        assert 1 == redo_capture["name_validation_broadcast_calls"]


@pytest.mark.asyncio
async def test_undo_redo_include_project_config_history_uses_targeted_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        await manager.set_type_error_ignore(
            SetTypeErrorIgnoreRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
                paramInfoId=ID("param-0"),
                ignoreTypeErrors=True,
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
        assert 0 == len(undo_capture["structural_patch_calls"])
        assert 1 == undo_capture["project_config_patch_calls"]
        assert 0 == undo_capture["code_obj_patch_calls"]
        assert 1 == undo_capture["section_impl_patch_calls"]
        assert 1 == undo_capture["name_validation_broadcast_calls"]

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
        assert 0 == len(redo_capture["structural_patch_calls"])
        assert 1 == redo_capture["project_config_patch_calls"]
        assert 0 == redo_capture["code_obj_patch_calls"]
        assert 1 == redo_capture["section_impl_patch_calls"]
        assert 1 == redo_capture["name_validation_broadcast_calls"]


@pytest.mark.asyncio
async def test_undo_redo_code_section_diagnostics_mute_include_project_config_uses_targeted_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        code_section_response = await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Code,
                controlCodeObjType=None,
                implOverrides=None,
                position=Position(x=1360.0, y=700.0),
                topLevelSections=None,
                viewportBounds=None,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        await manager.set_code_section_diagnostics_mute(
            SetCodeSectionDiagnosticsMuteRequest(
                projectConfigId=project_config_id,
                sectionId=code_section_response.sectionId,
                mute=True,
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
        assert 0 == len(undo_capture["structural_patch_calls"])
        assert 1 == undo_capture["project_config_patch_calls"]
        assert 0 == undo_capture["code_obj_patch_calls"]
        assert 1 <= undo_capture["section_impl_patch_calls"]
        assert 1 == undo_capture["name_validation_broadcast_calls"]

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
        assert 0 == len(redo_capture["structural_patch_calls"])
        assert 1 == redo_capture["project_config_patch_calls"]
        assert 0 == redo_capture["code_obj_patch_calls"]
        assert 1 <= redo_capture["section_impl_patch_calls"]
        assert 1 == redo_capture["name_validation_broadcast_calls"]


@pytest.mark.asyncio
async def test_undo_redo_create_edge_include_project_config_uses_targeted_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        (
            project_state,
            source_section_id,
            source_port_id,
            target_section_id,
            target_param_id,
        ) = _build_edge_test_state_for_undo_redo(manager.settings_file.settings)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        state_before_edge = manager.get_single_config_state(project_config_id)
        source_variant_id = state_before_edge.projectConfig.sectionVariantMap[
            source_section_id
        ]
        target_variant_id = state_before_edge.projectConfig.sectionVariantMap[
            target_section_id
        ]

        await manager.create_edge(
            CreateEdgeRequest(
                projectConfigId=project_config_id,
                sourceSectionId=source_section_id,
                sourceVariantId=source_variant_id,
                sourcePortId=source_port_id,
                targetSectionId=target_section_id,
                targetVariantId=target_variant_id,
                targetPortId=target_param_id,
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
        assert 0 == len(undo_capture["structural_patch_calls"])
        assert 1 == undo_capture["project_config_patch_calls"]
        assert 1 <= undo_capture["code_obj_patch_calls"]
        assert 1 <= (
            undo_capture["code_obj_patch_calls"]
            + undo_capture["section_impl_patch_calls"]
        )
        assert 1 == undo_capture["name_validation_broadcast_calls"]

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
        assert 0 == len(redo_capture["structural_patch_calls"])
        assert 1 == redo_capture["project_config_patch_calls"]
        assert 1 <= redo_capture["code_obj_patch_calls"]
        assert 1 <= (
            redo_capture["code_obj_patch_calls"]
            + redo_capture["section_impl_patch_calls"]
        )
        assert 1 == redo_capture["name_validation_broadcast_calls"]


@pytest.mark.asyncio
async def test_undo_redo_unknown_scope_uses_diff_aware_fallback_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        manager.add_new_history_entry(
            trigger_autosave=False,
            project_config_id=project_config_id,
            undo_redo_full_patch_fallback=True,
        )
        manager.project_state_backend.sections[SECTION_ID].name = "undo-redo-full-fallback"

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
        assert 0 == undo_capture["code_obj_patch_calls"]
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
        assert 0 == redo_capture["code_obj_patch_calls"]
        assert 0 == redo_capture["project_config_patch_calls"]
        assert 0 == redo_capture["section_impl_patch_calls"]
        assert (
            len(redo_capture["structural_patch_calls"])
            == redo_capture["name_validation_broadcast_calls"]
        )


@pytest.mark.asyncio
async def test_undo_redo_unknown_scope_code_obj_changes_still_broadcast_code_obj_patch() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        manager.add_new_history_entry(
            trigger_autosave=False,
            project_config_id=project_config_id,
            undo_redo_full_patch_fallback=True,
        )
        section_variant_id = manager.project_state_backend.projectConfigs[
            project_config_id
        ].sectionVariantMap[SECTION_ID]
        section_impl_id = manager.project_state_backend.sectionVariants[
            section_variant_id
        ].impl
        section_impl = manager.project_state_backend.sectionImpls[section_impl_id]
        assert hasattr(section_impl, "codeObjVariantMap")
        target_code_obj_id = next(iter(section_impl.codeObjVariantMap.keys()))
        target_code_obj = manager.project_state_backend.codeObjs[target_code_obj_id]
        manager.project_state_backend.codeObjs[target_code_obj_id] = (
            target_code_obj.model_copy(
                update={"name": f"{target_code_obj.name}-undo-redo-unknown-scope"}
            )
        )

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
        assert 0 == len(undo_capture["structural_patch_calls"])
        assert 1 <= undo_capture["code_obj_patch_calls"]
        assert 0 == undo_capture["project_config_patch_calls"]
        assert 0 == undo_capture["section_impl_patch_calls"]
        assert 1 == undo_capture["name_validation_broadcast_calls"]

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
        assert 0 == len(redo_capture["structural_patch_calls"])
        assert 1 <= redo_capture["code_obj_patch_calls"]
        assert 0 == redo_capture["project_config_patch_calls"]
        assert 0 == redo_capture["section_impl_patch_calls"]
        assert 1 == redo_capture["name_validation_broadcast_calls"]


@pytest.mark.asyncio
async def test_undo_redo_structural_include_project_config_history_uses_structural_fallback_transport() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        create_group_response = await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Group,
                controlCodeObjType=None,
                implOverrides=None,
                position=Position(x=1230.0, y=640.0),
                topLevelSections=None,
                viewportBounds=None,
            )
        )
        group_id = create_group_response.sectionId
        await manager.create_child_sections(
            CreateChildSectionsRequest(
                projectConfigId=project_config_id,
                parentId=group_id,
                implType=SectionType.TextBlock,
                numChildren=1,
                startIdx=0,
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
        assert 0 == undo_capture["code_obj_patch_calls"]
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
        assert 0 == redo_capture["code_obj_patch_calls"]
        assert 0 == redo_capture["project_config_patch_calls"]
        assert 0 == redo_capture["section_impl_patch_calls"]
        assert (
            len(redo_capture["structural_patch_calls"])
            == redo_capture["name_validation_broadcast_calls"]
        )


@pytest.mark.asyncio
async def test_undo_redo_boundary_noops_skip_transport_broadcasts() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        # Create an extra history entry so we can navigate to both boundaries.
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

        await manager.undo(
            UndoRequest(
                projectConfigId=project_config_id,
                steps=1,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)
        assert not manager.history.can_undo(1)

        undo_boundary_revision_before = manager.history.revision
        undo_boundary_capture, _ = await _run_with_transport_capture(
            manager,
            asyncio.gather(
                *[
                    manager.undo(
                        UndoRequest(
                            projectConfigId=project_config_id,
                            steps=1,
                        )
                    )
                    for _ in range(20)
                ]
            ),
        )
        assert manager.history.revision == undo_boundary_revision_before
        assert 0 == undo_boundary_capture["project_state_broadcast_calls"]
        assert 0 == len(undo_boundary_capture["structural_patch_calls"])
        assert 0 == undo_boundary_capture["project_config_patch_calls"]
        assert 0 == undo_boundary_capture["code_obj_patch_calls"]
        assert 0 == undo_boundary_capture["section_impl_patch_calls"]
        assert 0 == undo_boundary_capture["name_validation_broadcast_calls"]

        await manager.redo(
            RedoRequest(
                projectConfigId=project_config_id,
                steps=1,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)
        assert not manager.history.can_redo(1)

        redo_boundary_revision_before = manager.history.revision
        redo_boundary_capture, _ = await _run_with_transport_capture(
            manager,
            asyncio.gather(
                *[
                    manager.redo(
                        RedoRequest(
                            projectConfigId=project_config_id,
                            steps=1,
                        )
                    )
                    for _ in range(20)
                ]
            ),
        )
        assert manager.history.revision == redo_boundary_revision_before
        assert 0 == redo_boundary_capture["project_state_broadcast_calls"]
        assert 0 == len(redo_boundary_capture["structural_patch_calls"])
        assert 0 == redo_boundary_capture["project_config_patch_calls"]
        assert 0 == redo_boundary_capture["code_obj_patch_calls"]
        assert 0 == redo_boundary_capture["section_impl_patch_calls"]
        assert 0 == redo_boundary_capture["name_validation_broadcast_calls"]
