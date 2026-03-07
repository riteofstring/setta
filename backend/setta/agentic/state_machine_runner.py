import logging
from dataclasses import dataclass

from setta.agentic.chat_view import get_run_last_updated
from setta.agentic.store import (
    create_agent_run,
    list_agent_runs_by_metadata,
    save_agent_run,
)
from setta.database.db_objs import DBE
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.types.agentic import AgentRun, AgentRunStatus, RunEvent
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl,
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.id import ID
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    StateMachineEndSectionImpl,
    StateMachineGateSectionImpl,
    StateMachineStartSectionImpl,
)
from setta.types.state_machine_edges import StateMachineEdge
from setta.utils.timestamps import get_now_timestamp

STATE_MACHINE_RUN_TYPE = "state_machine"

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ResolvedStateMachineGraph:
    project_state: ProjectStateSingleConfig
    machine_group_id: str
    start_section_id: ID
    machine_name: str
    start_section_ids: list[ID]
    gate_section_ids: list[ID]
    end_section_ids: list[ID]
    machine_edges: list[StateMachineEdge]
    start_outgoing_edges: list[StateMachineEdge]


class StateMachineRunner:
    def __init__(
        self,
        dbe: DBE,
        project_manager_switcher: ProjectManagerSwitcher,
    ) -> None:
        self.dbe = dbe
        self.project_manager_switcher = project_manager_switcher

    def start_run(
        self,
        *,
        project_config_id: ID,
        machine_group_id: str,
        start_section_id: ID | None = None,
        share_session_id: str | None = None,
    ) -> AgentRun:
        existing_run = self.get_latest_run(
            project_config_id=project_config_id,
            machine_group_id=machine_group_id,
        )
        if existing_run is not None and existing_run.status == AgentRunStatus.running:
            return existing_run

        graph = self._resolve_graph(
            project_config_id=project_config_id,
            machine_group_id=machine_group_id,
            start_section_id=start_section_id,
            share_session_id=share_session_id,
        )

        run = create_agent_run(
            profile_id=None,
            inputs={
                "runType": STATE_MACHINE_RUN_TYPE,
                "projectConfigId": str(project_config_id),
                "machineGroupId": graph.machine_group_id,
                "startSectionId": str(graph.start_section_id),
                "machineName": graph.machine_name,
            },
        )
        run.outputs = {
            "machineGroupId": graph.machine_group_id,
            "machineName": graph.machine_name,
            "startSectionId": str(graph.start_section_id),
            "startSectionIds": [
                str(section_id) for section_id in graph.start_section_ids
            ],
            "gateSectionIds": [
                str(section_id) for section_id in graph.gate_section_ids
            ],
            "endSectionIds": [str(section_id) for section_id in graph.end_section_ids],
            "machineEdgeIds": [str(edge.id) for edge in graph.machine_edges],
            "startOutgoingEdgeIds": [
                str(edge.id) for edge in graph.start_outgoing_edges
            ],
            "startOutgoingTargetSectionIds": [
                str(edge.targetSectionId) for edge in graph.start_outgoing_edges
            ],
        }
        save_agent_run(self.dbe, run)
        self._record_event(
            run,
            "run_started",
            {
                "projectConfigId": str(project_config_id),
                "machineGroupId": graph.machine_group_id,
                "startSectionId": str(graph.start_section_id),
                "machineName": graph.machine_name,
            },
        )
        self._record_event(
            run,
            "graph_resolved",
            {
                "startSectionIds": [
                    str(section_id) for section_id in graph.start_section_ids
                ],
                "gateSectionIds": [
                    str(section_id) for section_id in graph.gate_section_ids
                ],
                "endSectionIds": [
                    str(section_id) for section_id in graph.end_section_ids
                ],
                "machineEdgeIds": [str(edge.id) for edge in graph.machine_edges],
            },
        )
        self._record_event(
            run,
            "start_edges_activated",
            {
                "edgeIds": [str(edge.id) for edge in graph.start_outgoing_edges],
                "targetSectionIds": [
                    str(edge.targetSectionId) for edge in graph.start_outgoing_edges
                ],
            },
        )
        return run

    async def stop_run(
        self,
        *,
        project_config_id: ID,
        machine_group_id: str,
    ) -> AgentRun | None:
        run = self.get_latest_run(
            project_config_id=project_config_id,
            machine_group_id=machine_group_id,
        )
        if run is None:
            return None
        if run.status != AgentRunStatus.running:
            return None
        run.status = AgentRunStatus.cancelled
        run.finishedAt = get_now_timestamp()
        save_agent_run(self.dbe, run)
        self._record_event(
            run,
            "run_cancelled",
            {},
        )
        return run

    async def reset_machine(
        self,
        *,
        project_config_id: ID,
        machine_group_id: str,
    ) -> AgentRun | None:
        return await self.stop_run(
            project_config_id=project_config_id,
            machine_group_id=machine_group_id,
        )

    def get_latest_run(
        self,
        *,
        project_config_id: ID,
        machine_group_id: str,
    ) -> AgentRun | None:
        runs = list_agent_runs_by_metadata(
            self.dbe,
            run_type=STATE_MACHINE_RUN_TYPE,
            project_config_id=project_config_id,
        )
        matching_runs: list[AgentRun] = []
        for run in runs:
            inputs = run.inputs
            if not isinstance(inputs, dict):
                continue
            raw_machine_group_id = inputs.get("machineGroupId")
            if raw_machine_group_id != machine_group_id:
                continue
            matching_runs.append(run)
        if not matching_runs:
            return None
        matching_runs.sort(key=get_run_last_updated, reverse=True)
        return matching_runs[0]

    def _resolve_graph(
        self,
        *,
        project_config_id: ID,
        machine_group_id: str,
        start_section_id: ID | None,
        share_session_id: str | None,
    ) -> ResolvedStateMachineGraph:
        project_state = self._get_project_state(
            project_config_id,
            share_session_id=share_session_id,
        )
        start_section_ids: list[ID] = []
        gate_section_ids: list[ID] = []
        end_section_ids: list[ID] = []
        for section_id in project_state.sections:
            if section_id not in project_state.projectConfig.sectionVariantMap:
                raise KeyError(
                    f"Section {section_id} missing active variant while resolving state machine."
                )
            section_impl = get_curr_effective_section_impl(project_state, section_id)
            if not isinstance(
                section_impl,
                (
                    StateMachineStartSectionImpl,
                    StateMachineGateSectionImpl,
                    StateMachineEndSectionImpl,
                ),
            ):
                continue
            if section_impl.machineGroupId != machine_group_id:
                continue
            if isinstance(section_impl, StateMachineStartSectionImpl):
                start_section_ids.append(section_id)
            elif isinstance(section_impl, StateMachineGateSectionImpl):
                gate_section_ids.append(section_id)
            elif isinstance(section_impl, StateMachineEndSectionImpl):
                end_section_ids.append(section_id)

        if start_section_id is None:
            if not start_section_ids:
                raise KeyError(
                    f"State machine group {machine_group_id} does not have a Start section."
                )
            if len(start_section_ids) != 1:
                raise ValueError(
                    f"State machine group {machine_group_id} must resolve to exactly one Start section."
                )
            resolved_start_section_id = start_section_ids[0]
        else:
            if start_section_id not in start_section_ids:
                raise KeyError(
                    f"State machine start {start_section_id} not found in group {machine_group_id}."
                )
            resolved_start_section_id = start_section_id

        start_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            resolved_start_section_id,
            StateMachineStartSectionImpl,
        )
        machine_edges = [
            edge
            for edge in project_state.projectConfig.stateMachineEdges
            if edge.machineGroupId == machine_group_id
        ]
        start_outgoing_edges = [
            edge
            for edge in machine_edges
            if edge.sourceSectionId == resolved_start_section_id
        ]
        machine_name = start_impl.label.strip() or machine_group_id
        return ResolvedStateMachineGraph(
            project_state=project_state,
            machine_group_id=machine_group_id,
            start_section_id=resolved_start_section_id,
            machine_name=machine_name,
            start_section_ids=start_section_ids,
            gate_section_ids=gate_section_ids,
            end_section_ids=end_section_ids,
            machine_edges=machine_edges,
            start_outgoing_edges=start_outgoing_edges,
        )

    def _get_project_state(
        self,
        project_config_id: ID,
        *,
        share_session_id: str | None = None,
    ) -> ProjectStateSingleConfig:
        manager = self.project_manager_switcher.get(
            project_config_id,
            share_session_id=share_session_id,
        )
        return convert_backend_to_single_config(
            manager.project_state_backend,
            project_config_id,
        )

    def _record_event(
        self, run: AgentRun, event_type: str, payload: dict[str, object]
    ) -> None:
        run.events.append(
            RunEvent(
                type=event_type,
                payload=payload,
            )
        )
        save_agent_run(self.dbe, run)
