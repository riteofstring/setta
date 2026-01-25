import pytest

from setta.database.utils import create_new_id
from setta.project_state.project_manager_types import (
    CreateEdgeRequest,
    SetSectionEdgeOutputsRequest,
)
from setta.types.code_obj_impls import CodeParamCodeObjImpl
from setta.types.edges import EdgePort
from setta.types.helpers_lvl1 import get_curr_effective_code_obj_impl_with_type_guard
from setta.types.helpers_lvl2 import (
    add_kwarg,
    create_top_level_section,
    set_section_edge_inputs,
    set_section_edge_outputs,
)
from setta.types.id import ID
from setta.types.project_config import Position
from setta.types.section_impls import SectionType

from tests.utils.manager_fixture import real_project_manager


@pytest.mark.asyncio
class TestEdgeOutputReapply:
    async def test_set_section_edge_outputs_reapplies_edge_values(self) -> None:
        async with real_project_manager() as fixture:
            manager = fixture.manager
            project_config_id = manager.project_state_backend.defaultProjectConfigId
            assert project_config_id is not None
            project_config_id = ID(project_config_id)

            project_state = manager.get_single_config_state(project_config_id)
            settings = fixture.settings_file.settings

            source_section_id = create_top_level_section(
                settings,
                project_state,
                SectionType.Dict,
                Position(),
            )
            target_section_id = create_top_level_section(
                settings,
                project_state,
                SectionType.Dict,
                Position(),
            )
            target_param_id = add_kwarg(settings, project_state, target_section_id)
            set_section_edge_inputs(
                settings, project_state, target_section_id, [target_param_id]
            )
            port_id = create_new_id()
            set_section_edge_outputs(
                project_state,
                source_section_id,
                [EdgePort(id=port_id, accessor=".foo")],
            )

            await manager.update_and_broadcast_project_state(project_state)

            project_state = manager.get_single_config_state(project_config_id)
            source_variant_id = project_state.projectConfig.sectionVariantMap[
                source_section_id
            ]
            target_variant_id = project_state.projectConfig.sectionVariantMap[
                target_section_id
            ]

            await manager.create_edge(
                CreateEdgeRequest(
                    projectConfigId=project_config_id,
                    sourceSectionId=source_section_id,
                    sourceVariantId=source_variant_id,
                    sourcePortId=port_id,
                    targetSectionId=target_section_id,
                    targetVariantId=target_variant_id,
                    targetPortId=target_param_id,
                )
            )

            project_state = manager.get_single_config_state(project_config_id)
            edge = next(
                edge
                for edge in project_state.projectConfig.edges
                if edge.sourceSectionId == source_section_id
                and edge.sourcePortId == port_id
                and edge.targetSectionId == target_section_id
                and edge.targetPortId == target_param_id
            )
            target_impl = get_curr_effective_code_obj_impl_with_type_guard(
                project_state,
                target_section_id,
                target_param_id,
                CodeParamCodeObjImpl,
            )
            expected_initial = manager.gen_code[project_config_id].build_edge_expression(
                project_state, edge
            )
            assert target_impl.value == expected_initial

            await manager.set_section_edge_outputs(
                SetSectionEdgeOutputsRequest(
                    projectConfigId=project_config_id,
                    sectionId=source_section_id,
                    edgeOutputPorts=[EdgePort(id=port_id, accessor=".bar")],
                )
            )

            project_state = manager.get_single_config_state(project_config_id)
            edge = next(
                edge
                for edge in project_state.projectConfig.edges
                if edge.sourceSectionId == source_section_id
                and edge.sourcePortId == port_id
                and edge.targetSectionId == target_section_id
                and edge.targetPortId == target_param_id
            )
            target_impl = get_curr_effective_code_obj_impl_with_type_guard(
                project_state,
                target_section_id,
                target_param_id,
                CodeParamCodeObjImpl,
            )
            expected_updated = manager.gen_code[project_config_id].build_edge_expression(
                project_state, edge
            )
            assert expected_initial != expected_updated
            assert target_impl.value == expected_updated
