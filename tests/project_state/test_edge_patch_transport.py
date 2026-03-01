import pytest

from setta.database.utils import create_new_id
from setta.project_state.project_manager_types import (
    CreateAgenticEdgeRequest,
    CreateEdgeRequest,
    DeleteAgenticEdgesRequest,
    DeleteEdgesRequest,
    ReconnectEdgeRequest,
    SetAgenticEdgesRequest,
    SetEdgesRequest,
    SetSectionEdgeInputsRequest,
    SetSectionEdgeOutputsRequest,
    UpdateAgenticEdgeRequest,
    UpdateEdgeRequest,
)
from setta.types.agentic_edges import AgenticEdgeContextMode, AgenticEdgeKind
from setta.types.edges import EdgePort
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl2 import (
    add_kwarg,
    create_top_level_section,
    set_section_edge_inputs,
    set_section_edge_outputs,
)
from setta.types.id import ID
from setta.types.project_config import Position
from setta.types.section_impls import BaseSectionWithParamsImpl, SectionType
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


def _install_transport_capture(sender):
    capture = {
        "project_state_broadcast_calls": 0,
        "structural_patch_calls": 0,
        "project_config_patch_calls": [],
        "code_obj_patch_calls": [],
        "section_impl_patch_calls": [],
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
    sender.broadcast_project_state_structural_patch = (  # type: ignore[method-assign]
        record_structural_patch
    )
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
        sender.broadcast_project_state_structural_patch = (  # type: ignore[method-assign]
            original_structural_patch_broadcast
        )
        sender.broadcast_project_state_project_config_patch = (  # type: ignore[method-assign]
            original_project_config_patch_broadcast
        )
        sender.broadcast_project_state_code_objs_patch = original_code_obj_patch_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = (  # type: ignore[method-assign]
            original_section_impl_patch_broadcast
        )
        sender.broadcast_name_validation_errors = original_name_validation_broadcast  # type: ignore[method-assign]

    return capture, restore


def _capture_counts(capture: dict) -> dict[str, int]:
    return {
        "project_state_broadcast_calls": capture["project_state_broadcast_calls"],
        "structural_patch_calls": capture["structural_patch_calls"],
        "project_config_patch_calls": len(capture["project_config_patch_calls"]),
        "code_obj_patch_calls": len(capture["code_obj_patch_calls"]),
        "section_impl_patch_calls": len(capture["section_impl_patch_calls"]),
        "name_validation_broadcast_calls": capture["name_validation_broadcast_calls"],
    }


def _assert_patch_delta(
    capture: dict,
    before: dict[str, int],
    *,
    expected_project_config_patch_calls: int,
    expected_code_obj_ids: set[ID] | None = None,
    expected_section_ids: set[ID] | None = None,
) -> None:
    assert (
        capture["project_state_broadcast_calls"]
        == before["project_state_broadcast_calls"]
    )
    assert capture["structural_patch_calls"] == before["structural_patch_calls"]
    assert (
        capture["name_validation_broadcast_calls"]
        == before["name_validation_broadcast_calls"]
    )

    project_config_patches = capture["project_config_patch_calls"][
        before["project_config_patch_calls"] :
    ]
    assert len(project_config_patches) == expected_project_config_patch_calls
    for project_config_patch in project_config_patches:
        assert (
            project_config_patch["previousProjectStateRevision"]
            < project_config_patch["projectStateRevision"]
        )

    code_obj_patches = capture["code_obj_patch_calls"][before["code_obj_patch_calls"] :]
    if expected_code_obj_ids is None:
        assert [] == code_obj_patches
    else:
        assert code_obj_patches
        patched_code_obj_ids: set[ID] = set()
        for code_obj_patch in code_obj_patches:
            assert (
                code_obj_patch["previousProjectStateRevision"]
                <= code_obj_patch["projectStateRevision"]
            )
            patched_code_obj_ids.update(code_obj_patch["codeObjIds"])
        assert expected_code_obj_ids.issubset(patched_code_obj_ids)

    if expected_section_ids is not None:
        section_patches = capture["section_impl_patch_calls"][
            before["section_impl_patch_calls"] :
        ]
        patched_section_ids = {patch["sectionId"] for patch in section_patches}
        assert expected_section_ids.issubset(patched_section_ids)


def _build_edge_test_state(settings):
    project_state = build_callable_project_state(20)
    source_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Dict,
        Position(x=900, y=0),
        core_overrides={"name": "edge_source"},
    )
    target_one_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Dict,
        Position(x=980, y=120),
        core_overrides={"name": "edge_target_one"},
    )
    target_two_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Dict,
        Position(x=1060, y=240),
        core_overrides={"name": "edge_target_two"},
    )
    source_port_id = create_new_id()
    target_one_param_id = add_kwarg(settings, project_state, target_one_section_id)
    target_two_param_id = add_kwarg(settings, project_state, target_two_section_id)
    set_section_edge_outputs(
        project_state,
        source_section_id,
        [EdgePort(id=source_port_id, accessor=".foo")],
    )
    set_section_edge_inputs(
        settings,
        project_state,
        target_one_section_id,
        [target_one_param_id],
    )
    set_section_edge_inputs(
        settings,
        project_state,
        target_two_section_id,
        [target_two_param_id],
    )
    return (
        project_state,
        source_section_id,
        source_port_id,
        target_one_section_id,
        target_one_param_id,
        target_two_section_id,
        target_two_param_id,
    )


@pytest.mark.asyncio
async def test_set_section_edge_input_and_output_routes_use_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        (
            project_state,
            source_section_id,
            source_port_id,
            target_section_id,
            target_param_id,
            _,
            _,
        ) = _build_edge_test_state(manager.settings_file.settings)
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

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            before = _capture_counts(capture)
            await manager.set_section_edge_outputs(
                SetSectionEdgeOutputsRequest(
                    projectConfigId=project_config_id,
                    sectionId=source_section_id,
                    edgeOutputPorts=[EdgePort(id=source_port_id, accessor=".bar")],
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            _assert_patch_delta(
                capture,
                before,
                expected_project_config_patch_calls=1,
                expected_code_obj_ids={target_param_id},
                expected_section_ids={source_section_id},
            )

            source_impl = get_curr_effective_section_impl_with_type_guard(
                manager.get_single_config_state(project_config_id),
                source_section_id,
                BaseSectionWithParamsImpl,
            )
            assert source_impl.edgeOutputPorts[0].accessor == ".bar"

            before = _capture_counts(capture)
            await manager.set_section_edge_inputs(
                SetSectionEdgeInputsRequest(
                    projectConfigId=project_config_id,
                    sectionId=target_section_id,
                    edgeInputParams=[],
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            _assert_patch_delta(
                capture,
                before,
                expected_project_config_patch_calls=1,
                expected_code_obj_ids={target_param_id},
                expected_section_ids={target_section_id},
            )
        finally:
            restore()

        target_impl = get_curr_effective_section_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            target_section_id,
            BaseSectionWithParamsImpl,
        )
        assert target_impl.edgeInputParams == []
        assert [] == manager.get_single_config_state(project_config_id).projectConfig.edges


@pytest.mark.asyncio
async def test_edge_routes_use_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        (
            project_state,
            source_section_id,
            source_port_id,
            target_one_section_id,
            target_one_param_id,
            target_two_section_id,
            target_two_param_id,
        ) = _build_edge_test_state(manager.settings_file.settings)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        state_before_edge = manager.get_single_config_state(project_config_id)
        source_variant_id = state_before_edge.projectConfig.sectionVariantMap[
            source_section_id
        ]
        target_one_variant_id = state_before_edge.projectConfig.sectionVariantMap[
            target_one_section_id
        ]
        target_two_variant_id = state_before_edge.projectConfig.sectionVariantMap[
            target_two_section_id
        ]

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            before = _capture_counts(capture)
            await manager.create_edge(
                CreateEdgeRequest(
                    projectConfigId=project_config_id,
                    sourceSectionId=source_section_id,
                    sourceVariantId=source_variant_id,
                    sourcePortId=source_port_id,
                    targetSectionId=target_one_section_id,
                    targetVariantId=target_one_variant_id,
                    targetPortId=target_one_param_id,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            _assert_patch_delta(
                capture,
                before,
                expected_project_config_patch_calls=1,
                expected_code_obj_ids={target_one_param_id},
            )

            created_edge = manager.get_single_config_state(project_config_id).projectConfig.edges[
                0
            ]
            before = _capture_counts(capture)
            await manager.update_edge(
                UpdateEdgeRequest(
                    projectConfigId=project_config_id,
                    edge=created_edge.model_copy(update={"label": "patched-edge"}),
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            _assert_patch_delta(
                capture,
                before,
                expected_project_config_patch_calls=1,
                expected_code_obj_ids=None,
            )

            before = _capture_counts(capture)
            await manager.reconnect_edge(
                ReconnectEdgeRequest(
                    projectConfigId=project_config_id,
                    edgeId=created_edge.id,
                    sourceSectionId=source_section_id,
                    sourceVariantId=source_variant_id,
                    sourcePortId=source_port_id,
                    targetSectionId=target_two_section_id,
                    targetVariantId=target_two_variant_id,
                    targetPortId=target_two_param_id,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            _assert_patch_delta(
                capture,
                before,
                expected_project_config_patch_calls=1,
                expected_code_obj_ids={target_two_param_id},
            )

            before = _capture_counts(capture)
            await manager.set_edges(
                SetEdgesRequest(projectConfigId=project_config_id, edges=[])
            )
            await manager.finish_pending_operations(timeout=5.0)
            _assert_patch_delta(
                capture,
                before,
                expected_project_config_patch_calls=1,
                expected_code_obj_ids={target_two_param_id},
            )
            assert [] == manager.get_single_config_state(project_config_id).projectConfig.edges

            before = _capture_counts(capture)
            await manager.create_edge(
                CreateEdgeRequest(
                    projectConfigId=project_config_id,
                    sourceSectionId=source_section_id,
                    sourceVariantId=source_variant_id,
                    sourcePortId=source_port_id,
                    targetSectionId=target_one_section_id,
                    targetVariantId=target_one_variant_id,
                    targetPortId=target_one_param_id,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            _assert_patch_delta(
                capture,
                before,
                expected_project_config_patch_calls=1,
                expected_code_obj_ids={target_one_param_id},
            )

            edge_for_delete = manager.get_single_config_state(
                project_config_id
            ).projectConfig.edges[0]
            before = _capture_counts(capture)
            await manager.delete_edges(
                DeleteEdgesRequest(
                    projectConfigId=project_config_id,
                    edgeIds=[edge_for_delete.id],
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            _assert_patch_delta(
                capture,
                before,
                expected_project_config_patch_calls=1,
                expected_code_obj_ids={target_one_param_id},
            )
        finally:
            restore()

        assert [] == manager.get_single_config_state(project_config_id).projectConfig.edges


@pytest.mark.asyncio
async def test_agentic_edge_routes_use_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(20)
        source_section_id = create_top_level_section(
            manager.settings_file.settings,
            project_state,
            SectionType.Chat,
            Position(x=900, y=0),
            core_overrides={"name": "agentic_source"},
        )
        target_section_id = create_top_level_section(
            manager.settings_file.settings,
            project_state,
            SectionType.Dict,
            Position(x=980, y=120),
            core_overrides={"name": "agentic_target"},
        )
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        agentic_edge_id = ID(create_new_id())

        sender = manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            before = _capture_counts(capture)
            await manager.create_agentic_edge(
                CreateAgenticEdgeRequest(
                    projectConfigId=project_config_id,
                    id=agentic_edge_id,
                    sourceSectionId=source_section_id,
                    targetSectionId=target_section_id,
                    kind=AgenticEdgeKind.chat_section,
                    contextMode=AgenticEdgeContextMode.reference_only,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            _assert_patch_delta(
                capture,
                before,
                expected_project_config_patch_calls=1,
                expected_code_obj_ids=None,
            )

            created_agentic_edge = next(
                edge
                for edge in manager.get_single_config_state(
                    project_config_id
                ).projectConfig.agenticEdges
                if edge.id == agentic_edge_id
            )
            before = _capture_counts(capture)
            await manager.update_agentic_edge(
                UpdateAgenticEdgeRequest(
                    projectConfigId=project_config_id,
                    edge=created_agentic_edge.model_copy(
                        update={"contextMode": AgenticEdgeContextMode.summary}
                    ),
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            _assert_patch_delta(
                capture,
                before,
                expected_project_config_patch_calls=1,
                expected_code_obj_ids=None,
            )

            updated_agentic_edge = next(
                edge
                for edge in manager.get_single_config_state(
                    project_config_id
                ).projectConfig.agenticEdges
                if edge.id == agentic_edge_id
            )
            before = _capture_counts(capture)
            await manager.set_agentic_edges(
                SetAgenticEdgesRequest(
                    projectConfigId=project_config_id,
                    edges=[updated_agentic_edge.model_copy(update={"selected": True})],
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            _assert_patch_delta(
                capture,
                before,
                expected_project_config_patch_calls=1,
                expected_code_obj_ids=None,
            )

            before = _capture_counts(capture)
            await manager.delete_agentic_edges(
                DeleteAgenticEdgesRequest(
                    projectConfigId=project_config_id,
                    edgeIds=[agentic_edge_id],
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            _assert_patch_delta(
                capture,
                before,
                expected_project_config_patch_calls=1,
                expected_code_obj_ids=None,
            )
        finally:
            restore()

        assert (
            []
            == manager.get_single_config_state(project_config_id).projectConfig.agenticEdges
        )


@pytest.mark.asyncio
async def test_edge_and_agentic_edge_routes_defer_codegen_refresh() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        (
            project_state,
            source_section_id,
            source_port_id,
            target_one_section_id,
            target_one_param_id,
            _,
            _,
        ) = _build_edge_test_state(manager.settings_file.settings)
        agentic_source_section_id = create_top_level_section(
            manager.settings_file.settings,
            project_state,
            SectionType.Chat,
            Position(x=1140, y=360),
            core_overrides={"name": "agentic_deferred_source"},
        )
        agentic_target_section_id = create_top_level_section(
            manager.settings_file.settings,
            project_state,
            SectionType.Dict,
            Position(x=1220, y=420),
            core_overrides={"name": "agentic_deferred_target"},
        )
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        state_before_edge = manager.get_single_config_state(project_config_id)
        source_variant_id = state_before_edge.projectConfig.sectionVariantMap[
            source_section_id
        ]
        target_one_variant_id = state_before_edge.projectConfig.sectionVariantMap[
            target_one_section_id
        ]

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
        manager._schedule_deferred_codegen_refresh = (
            record_schedule_deferred_refresh  # type: ignore[method-assign]
        )
        try:
            await assert_deferred_refresh(
                manager.create_edge(
                    CreateEdgeRequest(
                        projectConfigId=project_config_id,
                        sourceSectionId=source_section_id,
                        sourceVariantId=source_variant_id,
                        sourcePortId=source_port_id,
                        targetSectionId=target_one_section_id,
                        targetVariantId=target_one_variant_id,
                        targetPortId=target_one_param_id,
                    )
                )
            )
            await assert_deferred_refresh(
                manager.set_section_edge_outputs(
                    SetSectionEdgeOutputsRequest(
                        projectConfigId=project_config_id,
                        sectionId=source_section_id,
                        edgeOutputPorts=[EdgePort(id=source_port_id, accessor=".deferred")],
                    )
                )
            )
            await assert_deferred_refresh(
                manager.create_agentic_edge(
                    CreateAgenticEdgeRequest(
                        projectConfigId=project_config_id,
                        id=ID(create_new_id()),
                        sourceSectionId=agentic_source_section_id,
                        targetSectionId=agentic_target_section_id,
                        kind=AgenticEdgeKind.chat_section,
                        contextMode=AgenticEdgeContextMode.reference_only,
                    )
                )
            )
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]
            manager._schedule_deferred_codegen_refresh = (
                original_schedule_deferred_refresh  # type: ignore[method-assign]
            )
