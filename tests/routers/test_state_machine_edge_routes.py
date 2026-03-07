from types import SimpleNamespace

import pytest

from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.project_manager_types import (
    CreateStateMachineEdgeRequest,
    CreateTopLevelSectionRequest,
    DeleteStateMachineEdgesRequest,
    SetStateMachineEdgesRequest,
    SetStateMachineSectionSettingsRequest,
    UpdateStateMachineEdgeRequest,
)
from setta.routers.project_manager import (
    route_create_state_machine_edge,
    route_delete_state_machine_edges,
    route_set_state_machine_edges,
    route_set_state_machine_section_settings,
    route_update_state_machine_edge,
)
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.project_config import Position
from setta.types.section_impls import (
    SectionType,
    StateMachineGateSectionImpl,
    StateMachineGateType,
    StateMachineStartSectionImpl,
)
from setta.types.state_machine_edges import StateMachineEdge

from tests.utils.manager_fixture import real_project_manager, real_settings_manager
from tests.utils.runtime_context import runtime_context


@pytest.mark.asyncio
async def test_state_machine_edge_routes_crud() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        state = SimpleNamespace(
            share_mode=False,
            deployment_mode=False,
            wmh_frontend_sender=project_fixture.manager.websocket_msg_handler,
            project_manager_switcher=ProjectManagerSwitcher(
                main_manager=project_fixture.manager,
                settings_manager=settings_fixture.manager,
            ),
        )

        with runtime_context(state) as ctx:
            start_response = await project_fixture.manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.StateMachineStart,
                    position=Position(x=0, y=0),
                ),
            )
            gate_response = await project_fixture.manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.StateMachineGate,
                    position=Position(x=280, y=0),
                ),
            )

            await route_set_state_machine_section_settings(
                SetStateMachineSectionSettingsRequest(
                    projectConfigId=project_config_id,
                    sectionId=start_response.sectionId,
                    machineGroupId="workflow-main",
                    label="Start Main",
                ),
                ctx,
            )
            await route_set_state_machine_section_settings(
                SetStateMachineSectionSettingsRequest(
                    projectConfigId=project_config_id,
                    sectionId=gate_response.sectionId,
                    machineGroupId="workflow-main",
                    label="Join",
                    gateType=StateMachineGateType.OR,
                ),
                ctx,
            )

            await route_create_state_machine_edge(
                CreateStateMachineEdgeRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    sourceSectionId=start_response.sectionId,
                    sourcePortId="start",
                    targetSectionId=gate_response.sectionId,
                    targetPortId="gate_input",
                ),
                ctx,
            )

            project_state = project_fixture.manager.get_single_config_state(
                project_config_id
            )
            start_impl = get_curr_effective_section_impl_with_type_guard(
                project_state,
                start_response.sectionId,
                StateMachineStartSectionImpl,
            )
            gate_impl = get_curr_effective_section_impl_with_type_guard(
                project_state,
                gate_response.sectionId,
                StateMachineGateSectionImpl,
            )
            assert start_impl.machineGroupId == "workflow-main"
            assert start_impl.label == "Start Main"
            assert gate_impl.machineGroupId == "workflow-main"
            assert gate_impl.label == "Join"
            assert gate_impl.gateType == StateMachineGateType.OR
            assert len(project_state.projectConfig.stateMachineEdges) == 1
            edge = project_state.projectConfig.stateMachineEdges[0]

            updated = edge.model_copy(update={"hidden": True, "zIndex": 4})
            await route_update_state_machine_edge(
                UpdateStateMachineEdgeRequest(
                    projectConfigId=project_config_id,
                    edge=updated,
                ),
                ctx,
            )

            project_state = project_fixture.manager.get_single_config_state(
                project_config_id
            )
            stored = project_state.projectConfig.stateMachineEdges[0]
            assert stored.hidden is True
            assert stored.zIndex == 4

            await route_delete_state_machine_edges(
                DeleteStateMachineEdgesRequest(
                    projectConfigId=project_config_id,
                    edgeIds=[edge.id],
                ),
                ctx,
            )

            project_state = project_fixture.manager.get_single_config_state(
                project_config_id
            )
            assert project_state.projectConfig.stateMachineEdges == []

            replacement = StateMachineEdge(
                machineGroupId="workflow-main",
                sourceSectionId=start_response.sectionId,
                sourcePortId="start",
                targetSectionId=gate_response.sectionId,
                targetPortId="gate_input",
            )
            await route_set_state_machine_edges(
                SetStateMachineEdgesRequest(
                    projectConfigId=project_config_id,
                    edges=[replacement],
                ),
                ctx,
            )

            project_state = project_fixture.manager.get_single_config_state(
                project_config_id
            )
            assert project_state.projectConfig.stateMachineEdges == [replacement]
