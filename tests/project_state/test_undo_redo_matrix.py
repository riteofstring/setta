import pytest

from setta.project_state.project_manager_types import (
    AddKwargRequest,
    CreateAgenticEdgeRequest,
    CreateEdgeRequest,
    CreateNewSectionVariantRequest,
    CreateTopLevelSectionRequest,
    CreateViewModeRequest,
    DeleteAgenticEdgesRequest,
    DeleteEdgesRequest,
    DeleteKwargRequest,
    DeleteViewModeRequest,
    MoveSectionsRequest,
    RedoRequest,
    ReconnectEdgeRequest,
    SetAgenticEdgesRequest,
    SetAppDefinitionRequest,
    SetCodeFileBindingRequest,
    SetCodeSectionAttachedTerminalRequest,
    SetCodeSectionDiagnosticCodeSuppressionRequest,
    SetCodeSectionDiagnosticsMuteRequest,
    SetGenCodePrefixRequest,
    SetGenCodeSuffixRequest,
    SetParamEnteredValueRequest,
    SetParamNameAndValueRequest,
    SetSectionColumnWidthRequest,
    SetSectionSizesRequest,
    SetSectionStyleColorRequest,
    SetSectionTagColorRequest,
    SetTypeErrorIgnoreRequest,
    SetViewportRequest,
    UpdateAgenticEdgeRequest,
    UpdateAppDefinitionRequest,
    UpdateEdgeRequest,
    UndoRequest,
)
from setta.types.agentic_edges import AgenticEdgeContextMode, AgenticEdgeKind
from setta.types.edges import EdgePort
from setta.types.helpers_lvl2 import (
    add_kwarg,
    create_top_level_section,
    get_curr_top_level_param_ids,
    set_section_edge_inputs,
    set_section_edge_outputs,
)
from setta.types.project_config import Position, Viewport
from setta.types.section_impls import CodeFileAccessMode, SectionSize, SectionType
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


def _snapshot_backend_state(manager) -> dict:
    return manager.project_state_backend.model_dump(mode="json")


async def _assert_undo_redo_roundtrip(
    *,
    manager,
    project_config_id,
    mutation_name: str,
    mutate,
    require_exact_roundtrip: bool = True,
    require_state_change: bool = True,
) -> None:
    before = _snapshot_backend_state(manager)
    await mutate()
    await manager.finish_pending_operations(timeout=10.0)
    after = _snapshot_backend_state(manager)
    if require_state_change:
        assert after != before, f"{mutation_name} did not mutate backend state."

    await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
    await manager.finish_pending_operations(timeout=10.0)
    undone = _snapshot_backend_state(manager)
    if require_exact_roundtrip:
        assert undone == before, (
            f"{mutation_name} undo did not restore previous state."
        )
    else:
        assert undone != after, (
            f"{mutation_name} undo did not produce a distinct state."
        )

    await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
    await manager.finish_pending_operations(timeout=10.0)
    redone = _snapshot_backend_state(manager)
    if require_exact_roundtrip:
        assert redone == after, (
            f"{mutation_name} redo did not restore mutated state."
        )
    else:
        assert redone != undone, (
            f"{mutation_name} redo did not produce a distinct state."
        )


@pytest.mark.asyncio
async def test_undo_redo_roundtrips_across_mutation_families() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False

        project_state = build_callable_project_state(8)
        callable_section_id = next(iter(project_state.sections.keys()))
        project_config_id = project_state.projectConfig.id

        code_section_id = create_top_level_section(
            manager.settings_file.settings,
            project_state,
            SectionType.Code,
            Position(x=400, y=80),
            core_overrides={"name": "undo_matrix_code"},
        )
        terminal_section_id = create_top_level_section(
            manager.settings_file.settings,
            project_state,
            SectionType.Terminal,
            Position(x=640, y=80),
            core_overrides={"name": "undo_matrix_terminal"},
        )
        chat_section_id = create_top_level_section(
            manager.settings_file.settings,
            project_state,
            SectionType.Chat,
            Position(x=760, y=80),
            core_overrides={"name": "undo_matrix_chat"},
        )
        source_section_id = create_top_level_section(
            manager.settings_file.settings,
            project_state,
            SectionType.Dict,
            Position(x=880, y=80),
            core_overrides={"name": "undo_matrix_edge_source"},
        )
        target_section_id = create_top_level_section(
            manager.settings_file.settings,
            project_state,
            SectionType.Dict,
            Position(x=1120, y=80),
            core_overrides={"name": "undo_matrix_edge_target_a"},
        )
        target_two_section_id = create_top_level_section(
            manager.settings_file.settings,
            project_state,
            SectionType.Dict,
            Position(x=1360, y=80),
            core_overrides={"name": "undo_matrix_edge_target_b"},
        )

        source_port_id = add_kwarg(
            manager.settings_file.settings,
            project_state,
            source_section_id,
        )
        target_param_id = add_kwarg(
            manager.settings_file.settings,
            project_state,
            target_section_id,
        )
        target_two_param_id = add_kwarg(
            manager.settings_file.settings,
            project_state,
            target_two_section_id,
        )
        set_section_edge_outputs(
            project_state,
            source_section_id,
            [EdgePort(id=source_port_id, accessor=".value")],
        )
        set_section_edge_inputs(
            manager.settings_file.settings,
            project_state,
            target_section_id,
            [target_param_id],
        )
        set_section_edge_inputs(
            manager.settings_file.settings,
            project_state,
            target_two_section_id,
            [target_two_param_id],
        )

        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=10.0)

        state = manager.get_single_config_state(project_config_id)
        callable_param_ids = get_curr_top_level_param_ids(
            state,
            callable_section_id,
        )
        if not callable_param_ids:
            raise KeyError("Callable section is missing top-level params for undo matrix.")
        callable_param_id = callable_param_ids[0]

        edge_id: str | None = None
        agentic_edge_id: str | None = None
        created_view_mode_id: str | None = None
        code_binding_path = fixture.code_folder / "undo_matrix_binding.py"
        code_binding_path.write_text("print('undo matrix')\n")

        async def create_view_mode_mutation() -> None:
            nonlocal created_view_mode_id
            created_view_mode_id = await manager.create_view_mode(
                CreateViewModeRequest(projectConfigId=project_config_id)
            )

        async def set_viewport_mutation() -> None:
            await manager.set_viewport(
                SetViewportRequest(
                    projectConfigId=project_config_id,
                    viewport=Viewport(x=33.0, y=-12.5, zoom=1.35),
                )
            )

        async def set_section_tag_color_mutation() -> None:
            await manager.set_section_tag_color(
                SetSectionTagColorRequest(
                    projectConfigId=project_config_id,
                    sectionId=callable_section_id,
                    tagColor="#22c55e",
                )
            )

        async def set_section_style_color_mutation() -> None:
            await manager.set_section_style_color(
                SetSectionStyleColorRequest(
                    projectConfigId=project_config_id,
                    sectionId=callable_section_id,
                    styleColor="#2563eb",
                )
            )

        async def set_section_column_width_mutation() -> None:
            await manager.set_section_column_width(
                SetSectionColumnWidthRequest(
                    projectConfigId=project_config_id,
                    sectionId=callable_section_id,
                    columnWidth=320.0,
                )
            )

        async def set_section_sizes_mutation() -> None:
            await manager.set_section_sizes(
                SetSectionSizesRequest(
                    projectConfigId=project_config_id,
                    sectionSizes={
                        callable_section_id: SectionSize(width=540.0, height=410.0)
                    },
                )
            )

        async def move_sections_mutation() -> None:
            await manager.move_sections(
                MoveSectionsRequest(
                    projectConfigId=project_config_id,
                    sectionIds=[callable_section_id],
                    newParentId=None,
                    newIndex=None,
                    positionsById={
                        callable_section_id: Position(x=95.0, y=205.0),
                    },
                )
            )

        async def create_edge_mutation() -> None:
            nonlocal edge_id
            state = manager.get_single_config_state(project_config_id)
            await manager.create_edge(
                CreateEdgeRequest(
                    projectConfigId=project_config_id,
                    sourceSectionId=source_section_id,
                    sourceVariantId=state.projectConfig.sectionVariantMap[source_section_id],
                    sourcePortId=source_port_id,
                    targetSectionId=target_section_id,
                    targetVariantId=state.projectConfig.sectionVariantMap[target_section_id],
                    targetPortId=target_param_id,
                )
            )
            updated_state = manager.get_single_config_state(project_config_id)
            edge_id = updated_state.projectConfig.edges[-1].id

        async def update_edge_mutation() -> None:
            if edge_id is None:
                raise KeyError("Missing edge id for update mutation.")
            state = manager.get_single_config_state(project_config_id)
            edge = next(edge for edge in state.projectConfig.edges if edge.id == edge_id)
            await manager.update_edge(
                UpdateEdgeRequest(
                    projectConfigId=project_config_id,
                    edge=edge.model_copy(update={"label": "undo-matrix-edge"}),
                )
            )

        async def reconnect_edge_mutation() -> None:
            if edge_id is None:
                raise KeyError("Missing edge id for reconnect mutation.")
            state = manager.get_single_config_state(project_config_id)
            await manager.reconnect_edge(
                ReconnectEdgeRequest(
                    projectConfigId=project_config_id,
                    edgeId=edge_id,
                    sourceSectionId=source_section_id,
                    sourceVariantId=state.projectConfig.sectionVariantMap[source_section_id],
                    sourcePortId=source_port_id,
                    targetSectionId=target_two_section_id,
                    targetVariantId=state.projectConfig.sectionVariantMap[target_two_section_id],
                    targetPortId=target_two_param_id,
                )
            )

        async def delete_edge_mutation() -> None:
            if edge_id is None:
                raise KeyError("Missing edge id for delete mutation.")
            await manager.delete_edges(
                DeleteEdgesRequest(
                    projectConfigId=project_config_id,
                    edgeIds=[edge_id],
                )
            )

        async def create_agentic_edge_mutation() -> None:
            nonlocal agentic_edge_id
            await manager.create_agentic_edge(
                CreateAgenticEdgeRequest(
                    projectConfigId=project_config_id,
                    sourceSectionId=source_section_id,
                    targetSectionId=chat_section_id,
                    kind=AgenticEdgeKind.section_chat,
                    contextMode=AgenticEdgeContextMode.reference_only,
                )
            )
            state = manager.get_single_config_state(project_config_id)
            agentic_edge_id = state.projectConfig.agenticEdges[-1].id

        async def update_agentic_edge_mutation() -> None:
            if agentic_edge_id is None:
                raise KeyError("Missing agentic edge id for update mutation.")
            state = manager.get_single_config_state(project_config_id)
            edge = next(
                edge for edge in state.projectConfig.agenticEdges if edge.id == agentic_edge_id
            )
            await manager.update_agentic_edge(
                UpdateAgenticEdgeRequest(
                    projectConfigId=project_config_id,
                    edge=edge.model_copy(update={"hidden": True}),
                )
            )

        async def set_agentic_edges_mutation() -> None:
            await manager.set_agentic_edges(
                SetAgenticEdgesRequest(
                    projectConfigId=project_config_id,
                    edges=[],
                )
            )

        async def delete_agentic_edges_mutation() -> None:
            if agentic_edge_id is None:
                raise KeyError("Missing agentic edge id for delete mutation.")
            await manager.delete_agentic_edges(
                DeleteAgenticEdgesRequest(
                    projectConfigId=project_config_id,
                    edgeIds=[agentic_edge_id],
                )
            )

        async def set_code_section_diagnostics_mute_mutation() -> None:
            await manager.set_code_section_diagnostics_mute(
                SetCodeSectionDiagnosticsMuteRequest(
                    projectConfigId=project_config_id,
                    sectionId=code_section_id,
                    mute=True,
                )
            )

        async def set_code_section_diagnostic_code_suppression_mutation() -> None:
            await manager.set_code_section_diagnostic_code_suppression(
                SetCodeSectionDiagnosticCodeSuppressionRequest(
                    projectConfigId=project_config_id,
                    sectionId=code_section_id,
                    code="E9999",
                    suppress=True,
                )
            )

        async def set_code_section_attached_terminal_mutation() -> None:
            await manager.set_code_section_attached_terminal(
                SetCodeSectionAttachedTerminalRequest(
                    projectConfigId=project_config_id,
                    sectionId=code_section_id,
                    terminalSectionId=terminal_section_id,
                )
            )

        async def set_code_file_binding_mutation() -> None:
            await manager.set_code_file_binding(
                SetCodeFileBindingRequest(
                    projectConfigId=project_config_id,
                    sectionId=code_section_id,
                    binding={
                        "canonical_path": str(code_binding_path),
                        "access_mode": CodeFileAccessMode.read_only,
                    },
                )
            )

        async def set_param_entered_value_mutation() -> None:
            await manager.set_param_entered_value(
                SetParamEnteredValueRequest(
                    projectConfigId=project_config_id,
                    sectionId=callable_section_id,
                    paramInfoId=callable_param_id,
                    value="[1, 2, 3]",
                )
            )

        async def set_param_name_and_value_mutation() -> None:
            await manager.set_param_name_and_value(
                SetParamNameAndValueRequest(
                    projectConfigId=project_config_id,
                    sectionId=callable_section_id,
                    codeObjId=callable_param_id,
                    name="iterable",
                    value="[9, 8, 7]",
                )
            )

        async def add_kwarg_mutation() -> None:
            await manager.add_kwarg(
                AddKwargRequest(
                    projectConfigId=project_config_id,
                    sectionId=callable_section_id,
                )
            )

        async def delete_kwarg_mutation() -> None:
            await manager.delete_kwarg(
                DeleteKwargRequest(
                    projectConfigId=project_config_id,
                    sectionId=callable_section_id,
                )
            )

        async def create_new_section_variant_mutation() -> None:
            await manager.create_new_section_variant(
                CreateNewSectionVariantRequest(
                    projectConfigId=project_config_id,
                    sectionId=callable_section_id,
                )
            )

        async def set_type_error_ignore_mutation() -> None:
            await manager.set_type_error_ignore(
                SetTypeErrorIgnoreRequest(
                    projectConfigId=project_config_id,
                    sectionId=callable_section_id,
                    paramInfoId=callable_param_id,
                    ignoreTypeErrors=True,
                )
            )

        async def set_gen_code_prefix_mutation() -> None:
            await manager.set_gen_code_prefix(
                SetGenCodePrefixRequest(
                    projectConfigId=project_config_id,
                    genCodePrefix="# undo-matrix-prefix\n",
                )
            )

        async def set_gen_code_suffix_mutation() -> None:
            await manager.set_gen_code_suffix(
                SetGenCodeSuffixRequest(
                    projectConfigId=project_config_id,
                    genCodeSuffix="\n# undo-matrix-suffix",
                )
            )

        async def set_app_definition_mutation() -> None:
            await manager.set_app_definition(
                SetAppDefinitionRequest(
                    appSpec={
                        "root": {"key": "root", "type": "Stack"},
                        "elements": {},
                    },
                    appSpecPath="app_specs/undo-matrix-v1.json",
                    appSpecVersion="v1",
                    catalogId="setta.app.default",
                )
            )

        async def update_app_definition_mutation() -> None:
            await manager.update_app_definition(
                UpdateAppDefinitionRequest(
                    patch={
                        "root": {
                            "props": {
                                "gap": 8,
                            }
                        }
                    }
                )
            )

        async def compare_and_set_app_definition_spec_path_mutation() -> None:
            await manager.compare_and_set_app_definition_spec_path(
                app_spec_path="app_specs/undo-matrix-v2.json"
            )

        async def compare_and_set_app_definition_spec_version_mutation() -> None:
            await manager.compare_and_set_app_definition_spec_version(
                app_spec_version="v2"
            )

        async def compare_and_set_app_definition_theme_mode_mutation() -> None:
            await manager.compare_and_set_app_definition_theme_mode(theme_mode="dark")

        async def delete_view_mode_mutation() -> None:
            if created_view_mode_id is None:
                raise KeyError("Missing view mode id for delete mutation.")
            await manager.delete_view_mode(
                DeleteViewModeRequest(
                    projectConfigId=project_config_id,
                    viewModeId=created_view_mode_id,
                )
            )

        async def create_top_level_section_mutation() -> None:
            await manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.TextBlock,
                    position=Position(x=1600, y=120),
                )
            )

        operations = [
            ("create_view_mode", create_view_mode_mutation, True, True),
            ("set_viewport", set_viewport_mutation, True, True),
            ("set_section_tag_color", set_section_tag_color_mutation, True, True),
            ("set_section_style_color", set_section_style_color_mutation, True, True),
            (
                "set_section_column_width",
                set_section_column_width_mutation,
                True,
                True,
            ),
            ("set_section_sizes", set_section_sizes_mutation, True, True),
            ("move_sections", move_sections_mutation, True, True),
            ("create_edge", create_edge_mutation, True, True),
            ("update_edge", update_edge_mutation, True, True),
            ("reconnect_edge", reconnect_edge_mutation, True, True),
            ("delete_edge", delete_edge_mutation, True, True),
            ("create_agentic_edge", create_agentic_edge_mutation, True, True),
            ("update_agentic_edge", update_agentic_edge_mutation, True, True),
            ("set_agentic_edges", set_agentic_edges_mutation, True, True),
            ("create_agentic_edge_again", create_agentic_edge_mutation, True, True),
            ("delete_agentic_edges", delete_agentic_edges_mutation, True, True),
            (
                "set_code_section_diagnostics_mute",
                set_code_section_diagnostics_mute_mutation,
                True,
                True,
            ),
            (
                "set_code_section_diagnostic_code_suppression",
                set_code_section_diagnostic_code_suppression_mutation,
                True,
                True,
            ),
            (
                "set_code_section_attached_terminal",
                set_code_section_attached_terminal_mutation,
                True,
                True,
            ),
            ("set_code_file_binding", set_code_file_binding_mutation, True, True),
            ("set_param_entered_value", set_param_entered_value_mutation, True, True),
            ("set_param_name_and_value", set_param_name_and_value_mutation, True, True),
            ("add_kwarg", add_kwarg_mutation, True, True),
            ("delete_kwarg", delete_kwarg_mutation, True, True),
            ("create_new_section_variant", create_new_section_variant_mutation, True, True),
            ("set_type_error_ignore", set_type_error_ignore_mutation, True, True),
            ("set_gen_code_prefix", set_gen_code_prefix_mutation, True, True),
            ("set_gen_code_suffix", set_gen_code_suffix_mutation, True, True),
            ("set_app_definition", set_app_definition_mutation, True, True),
            ("update_app_definition", update_app_definition_mutation, True, False),
            (
                "compare_and_set_app_definition_spec_path",
                compare_and_set_app_definition_spec_path_mutation,
                True,
                True,
            ),
            (
                "compare_and_set_app_definition_spec_version",
                compare_and_set_app_definition_spec_version_mutation,
                True,
                True,
            ),
            (
                "compare_and_set_app_definition_theme_mode",
                compare_and_set_app_definition_theme_mode_mutation,
                True,
                True,
            ),
            ("delete_view_mode", delete_view_mode_mutation, True, True),
            ("create_top_level_section", create_top_level_section_mutation, True, True),
        ]

        # Run one-step apply->undo->redo roundtrips for each mutation family.
        for (
            mutation_name,
            mutation_fn,
            require_exact_roundtrip,
            require_state_change,
        ) in operations:
            await _assert_undo_redo_roundtrip(
                manager=manager,
                project_config_id=project_config_id,
                mutation_name=mutation_name,
                mutate=mutation_fn,
                require_exact_roundtrip=require_exact_roundtrip,
                require_state_change=require_state_change,
            )
