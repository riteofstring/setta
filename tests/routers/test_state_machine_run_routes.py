from types import SimpleNamespace

from fastapi import HTTPException
import pytest

from setta.agentic.state_machine_runner import STATE_MACHINE_RUN_TYPE, StateMachineRunner
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.project_manager_types import (
    CreateStateMachineEdgeRequest,
    CreateTopLevelSectionRequest,
    SetStateMachineSectionSettingsRequest,
)
from setta.types.agentic import AgentRunStatus
from setta.types.project_config import Position
from setta.types.section_impls import SectionType, StateMachineGateType
from setta.types.state_machine_edges import (
    STATE_MACHINE_EDGE_SOURCE_PORT_ID,
    STATE_MACHINE_EDGE_TARGET_PORT_ID,
)
from setta.routers.agentic import (
    GetStateMachineRunRequest,
    ResetStateMachineRequest,
    StartStateMachineRunRequest,
    StopStateMachineRunRequest,
    route_get_state_machine_run,
    route_reset_state_machine,
    route_start_state_machine_run,
    route_stop_state_machine_run,
)

from tests.utils.manager_fixture import real_project_manager, real_settings_manager
from tests.utils.runtime_context import runtime_context


async def _seed_state_machine_graph(
    *,
    project_fixture,
    project_config_id,
) -> tuple[str, str, str]:
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
    end_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineEnd,
            position=Position(x=560, y=0),
        ),
    )

    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=start_response.sectionId,
            machineGroupId="workflow-main",
            label="Review Flow",
        )
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=gate_response.sectionId,
            machineGroupId="workflow-main",
            label="Join",
            gateType=StateMachineGateType.AND,
        )
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=end_response.sectionId,
            machineGroupId="workflow-main",
            label="Done",
        )
    )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=start_response.sectionId,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=gate_response.sectionId,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
        )
    )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=gate_response.sectionId,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=end_response.sectionId,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
        )
    )
    return (
        start_response.sectionId,
        gate_response.sectionId,
        end_response.sectionId,
    )


@pytest.mark.asyncio
async def test_state_machine_run_routes_start_stop_reset_cycle() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        start_section_id, gate_section_id, _ = await _seed_state_machine_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
        )

        project_manager_switcher = ProjectManagerSwitcher(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
        )
        state_machine_runner = StateMachineRunner(
            project_fixture.dbe,
            project_manager_switcher,
        )
        state = SimpleNamespace(
            share_mode=False,
            deployment_mode=False,
            launcher_mode=False,
            wmh_frontend_sender=project_fixture.manager.websocket_msg_handler,
            project_manager_switcher=project_manager_switcher,
            state_machine_runner=state_machine_runner,
        )

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )

            assert started.status == AgentRunStatus.running
            assert started.inputs is not None
            assert started.inputs["runType"] == STATE_MACHINE_RUN_TYPE
            assert started.inputs["projectConfigId"] == str(project_config_id)
            assert started.inputs["machineGroupId"] == "workflow-main"
            assert started.inputs["startSectionId"] == str(start_section_id)
            assert started.inputs["machineName"] == "Review Flow"
            assert started.outputs is not None
            assert started.outputs["startOutgoingTargetSectionIds"] == [
                str(gate_section_id)
            ]
            assert [event.type for event in started.events] == [
                "run_started",
                "graph_resolved",
                "start_edges_activated",
            ]

            # Starting the same machine while it is already running must reuse
            # the active parent run instead of creating a duplicate.
            restarted_while_running = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert restarted_while_running.id == started.id

            latest_running = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert latest_running.id == started.id
            assert latest_running.status == AgentRunStatus.running

            stopped = await route_stop_state_machine_run(
                StopStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert stopped.alreadyStopped is False
            assert stopped.stoppedRunId == started.id

            latest_stopped = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert latest_stopped.id == started.id
            assert latest_stopped.status == AgentRunStatus.cancelled
            assert latest_stopped.finishedAt is not None
            assert latest_stopped.events[-1].type == "run_cancelled"

            already_stopped = await route_stop_state_machine_run(
                StopStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert already_stopped.alreadyStopped is True
            assert already_stopped.stoppedRunId is None

            restarted = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert restarted.id != started.id
            assert restarted.status == AgentRunStatus.running

            reset = await route_reset_state_machine(
                ResetStateMachineRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert reset.alreadyStopped is False
            assert reset.stoppedRunId == restarted.id

            latest_reset = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert latest_reset.id == restarted.id
            assert latest_reset.status == AgentRunStatus.cancelled


@pytest.mark.asyncio
async def test_state_machine_run_routes_reject_missing_machine_group() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        project_manager_switcher = ProjectManagerSwitcher(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
        )
        state = SimpleNamespace(
            share_mode=False,
            deployment_mode=False,
            launcher_mode=False,
            wmh_frontend_sender=project_fixture.manager.websocket_msg_handler,
            project_manager_switcher=project_manager_switcher,
            state_machine_runner=StateMachineRunner(
                project_fixture.dbe,
                project_manager_switcher,
            ),
        )

        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc_info:
                await route_start_state_machine_run(
                    StartStateMachineRunRequest(
                        projectConfigId=project_config_id,
                        machineGroupId="missing-machine",
                    ),
                    ctx,
                )

        assert exc_info.value.status_code == 404
        assert "missing-machine" in str(exc_info.value.detail)
