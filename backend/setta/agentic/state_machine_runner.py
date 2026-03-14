import asyncio
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from setta.agentic.chat_view import get_run_last_updated, is_external_agent_run
from setta.agentic.completion_guard import load_completion_guard_enabled
from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.agentic.external_tool_allowlist import build_external_tool_allowlist
from setta.agentic.managed_chat_dispatch import (
    ManagedChatDispatcher,
    ManagedChatDispatchRequest,
)
from setta.agentic.state_machine_signals import (
    REPORT_STATE_MACHINE_SIGNAL_NAMESPACED_TOOL_NAME,
    REPORT_STATE_MACHINE_SIGNAL_TOOL_NAME,
)
from setta.agentic.store import (
    create_agent_run,
    list_agent_runs_by_metadata,
    load_agent_run,
    load_prompt_template,
    require_agent_profile,
    require_engine_config,
    save_agent_run,
)
from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.llm.agent_runner import AgentRunner
from setta.llm.prompt_renderer import render_prompt
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.project_manager_types import SetChatSectionChatIdRequest
from setta.types.agentic import (
    AgentProfile,
    AgentRun,
    AgentRunStatus,
    EngineType,
    RunEvent,
)
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl,
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.id import ID
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    ChatPermissionMode,
    ChatSectionImpl,
    StateMachineEndSectionImpl,
    StateMachineGateSectionImpl,
    StateMachineGateType,
    StateMachineStartSectionImpl,
)
from setta.types.state_machine_edges import (
    StateMachineEdge,
    StateMachineSourceFilterType,
    StateMachineTargetAction,
    StateMachineTargetActionType,
    StateMachineThreadStrategy,
)
from setta.utils.timestamps import get_now_timestamp

if TYPE_CHECKING:
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

STATE_MACHINE_RUN_TYPE = "state_machine"
INITIAL_STATE_MACHINE_ITERATION = 1

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ResolvedStateMachineGraph:
    project_state: ProjectStateSingleConfig
    machine_group_id: str
    start_section_id: ID
    machine_name: str
    max_iterations: int | None
    start_section_ids: list[ID]
    gate_section_ids: list[ID]
    end_section_ids: list[ID]
    machine_edges: list[StateMachineEdge]
    start_outgoing_edges: list[StateMachineEdge]


@dataclass(slots=True)
class StateMachineProgressState:
    possible_gate_section_ids: set[ID]
    possible_chat_source_section_ids: set[ID]
    blocked_gate_section_ids: set[ID]
    blocked_gate_details_by_section_id: dict[str, dict[str, object]]


@dataclass(slots=True)
class ResolvedStateMachineSignalContext:
    machine_run: AgentRun
    child_run_id: ID | None
    source_section_id: ID
    state_machine_iteration: int


class StateMachineRunner:
    def __init__(
        self,
        dbe: DBE,
        project_manager_switcher: ProjectManagerSwitcher,
        agent_runner: AgentRunner,
        external_agent_runner: ExternalAgentRunner,
        frontend_sender: "WMHFrontendSender",
    ) -> None:
        self.dbe = dbe
        self.project_manager_switcher = project_manager_switcher
        self.agent_runner = agent_runner
        self.external_agent_runner = external_agent_runner
        self.frontend_sender = frontend_sender
        self.chat_dispatcher = ManagedChatDispatcher(
            dbe=dbe,
            agent_runner=agent_runner,
            external_agent_runner=external_agent_runner,
        )

    async def start_run(
        self,
        *,
        project_config_id: ID,
        machine_group_id: str,
        start_section_id: ID | None = None,
        share_session_id: str | None = None,
    ) -> AgentRun:
        existing_run = await self.get_latest_run(
            project_config_id=project_config_id,
            machine_group_id=machine_group_id,
            share_session_id=share_session_id,
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
                "shareSessionId": share_session_id,
            },
        )
        self._ensure_run_outputs_initialized(run, graph)
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
        try:
            dispatched_actions = await self._activate_start_edges(
                run=run,
                graph=graph,
                project_config_id=project_config_id,
                share_session_id=share_session_id,
            )
        except Exception as exc:
            self._record_event(
                run,
                "start_edge_action_failed",
                {
                    "error": str(exc),
                },
            )
            self._fail_run(
                run=run,
                reason="start_edge_action_failed",
                message=f"Workflow failed while dispatching the first action: {exc}",
                extra_details={
                    "error": str(exc),
                },
            )
            raise
        if run.outputs is None:
            raise KeyError("State machine run outputs were not initialized.")
        run.outputs["dispatchedStartEdgeActions"] = dispatched_actions
        self._append_child_run_ids(run, dispatched_actions)
        self._refresh_live_outputs(
            run=run,
            graph=graph,
            project_config_id=project_config_id,
        )
        save_agent_run(self.dbe, run)
        if dispatched_actions:
            self._record_event(
                run,
                "start_edge_actions_dispatched",
                {
                    "actions": dispatched_actions,
                },
            )
        await self._broadcast_run_update(run, share_session_id=share_session_id)
        return run

    async def stop_run(
        self,
        *,
        project_config_id: ID,
        machine_group_id: str,
        share_session_id: str | None = None,
    ) -> AgentRun | None:
        run = await self.get_latest_run(
            project_config_id=project_config_id,
            machine_group_id=machine_group_id,
            share_session_id=share_session_id,
        )
        if run is None:
            return None
        if run.status != AgentRunStatus.running:
            return None
        stopped_child_run_ids = await self._stop_running_child_runs(
            run=run,
            project_config_id=project_config_id,
        )
        if stopped_child_run_ids:
            self._record_event(
                run,
                "child_runs_cancelled",
                {
                    "childRunIds": stopped_child_run_ids,
                },
            )
        run.status = AgentRunStatus.cancelled
        run.finishedAt = get_now_timestamp()
        save_agent_run(self.dbe, run)
        self._record_event(
            run,
            "run_cancelled",
            {},
        )
        await self._broadcast_run_update(run, share_session_id=share_session_id)
        return run

    async def reset_machine(
        self,
        *,
        project_config_id: ID,
        machine_group_id: str,
    ) -> AgentRun | None:
        run = self._load_latest_run(
            project_config_id=project_config_id,
            machine_group_id=machine_group_id,
        )
        if run is None:
            return None
        if self._is_machine_run_cleared(run):
            return None
        if run.status == AgentRunStatus.running:
            stopped_child_run_ids = await self._stop_running_child_runs(
                run=run,
                project_config_id=project_config_id,
            )
            if stopped_child_run_ids:
                self._record_event(
                    run,
                    "child_runs_cancelled",
                    {
                        "childRunIds": stopped_child_run_ids,
                    },
                )
            run.status = AgentRunStatus.cancelled
            run.finishedAt = get_now_timestamp()
            save_agent_run(self.dbe, run)
            self._record_event(
                run,
                "run_cancelled",
                {},
            )
        self._clear_machine_run_state(run)
        self._record_event(run, "run_reset", {})
        await self._broadcast_run_update(run, share_session_id=None)
        return run

    async def get_latest_run(
        self,
        *,
        project_config_id: ID,
        machine_group_id: str,
        share_session_id: str | None = None,
    ) -> AgentRun | None:
        run = self._load_latest_run(
            project_config_id=project_config_id,
            machine_group_id=machine_group_id,
        )
        if run is None:
            return None
        if self._is_machine_run_cleared(run):
            return None
        if run.status != AgentRunStatus.running:
            return run
        refreshed_run = await self._refresh_run(
            run=run,
            project_config_id=project_config_id,
            machine_group_id=machine_group_id,
            share_session_id=share_session_id,
        )
        if self._is_machine_run_cleared(refreshed_run):
            return None
        return refreshed_run

    async def _broadcast_run_update(
        self,
        run: AgentRun,
        *,
        share_session_id: str | None,
    ) -> None:
        await self.frontend_sender.broadcast_agent_run_update(
            run,
            share_session_id=share_session_id,
        )

    async def report_signal(
        self,
        *,
        project_config_id: ID,
        child_run_id: ID | None,
        machine_run_id: ID | None,
        section_id: ID | None,
        signal_name: str,
        payload: dict[str, object],
        share_session_id: str | None = None,
    ) -> dict[str, object]:
        signal_context = self._resolve_signal_report_context(
            project_config_id=project_config_id,
            child_run_id=child_run_id,
            machine_run_id=machine_run_id,
            section_id=section_id,
        )
        run = signal_context.machine_run
        if run.status != AgentRunStatus.running:
            raise ValueError(
                f"State machine run {run.id} is not running and cannot accept signals."
            )
        graph = self._resolve_graph(
            project_config_id=project_config_id,
            machine_group_id=self._get_machine_group_id(run),
            start_section_id=None,
            share_session_id=share_session_id,
        )
        self._ensure_run_outputs_initialized(run, graph)
        signal_event = {
            "signalEventId": str(create_new_id()),
            "signalName": signal_name,
            "payload": dict(payload),
            "machineRunId": str(run.id),
            "childRunId": str(signal_context.child_run_id)
            if signal_context.child_run_id is not None
            else None,
            "sourceSectionId": str(signal_context.source_section_id),
            "stateMachineIteration": signal_context.state_machine_iteration,
            "reportedAt": int(get_now_timestamp().timestamp() * 1000),
        }
        signal_events = self._get_output_list_of_dicts(run, "signalEvents")
        signal_events.append(signal_event)
        self._record_event(
            run,
            "signal_reported",
            {
                "signalEventId": signal_event["signalEventId"],
                "signalName": signal_name,
                "machineRunId": str(run.id),
                "childRunId": signal_event["childRunId"],
                "sourceSectionId": str(signal_context.source_section_id),
                "stateMachineIteration": signal_context.state_machine_iteration,
            },
        )
        refreshed_run = await self._refresh_run(
            run=run,
            project_config_id=project_config_id,
            machine_group_id=self._get_machine_group_id(run),
            share_session_id=share_session_id,
        )
        save_agent_run(self.dbe, refreshed_run)
        await self._broadcast_run_update(
            refreshed_run,
            share_session_id=share_session_id,
        )
        return {
            "status": "ok",
            "signalEventId": signal_event["signalEventId"],
            "machineRunId": str(refreshed_run.id),
            "childRunId": signal_event["childRunId"],
            "sourceSectionId": str(signal_context.source_section_id),
            "signalName": signal_name,
            "stateMachineIteration": signal_context.state_machine_iteration,
        }

    async def handle_terminal_child_run_update(
        self,
        child_run: AgentRun,
        *,
        share_session_id: str | None = None,
    ) -> None:
        if child_run.status not in {
            AgentRunStatus.completed,
            AgentRunStatus.failed,
            AgentRunStatus.cancelled,
        }:
            return
        if not isinstance(child_run.inputs, dict):
            return
        if child_run.inputs.get("stateMachineParentRunType") != STATE_MACHINE_RUN_TYPE:
            return
        parent_run_id = self._get_child_parent_run_id(child_run)
        parent_run = load_agent_run(self.dbe, parent_run_id)
        if parent_run is None:
            raise KeyError(f"State machine run {parent_run_id} not found.")
        if not isinstance(parent_run.inputs, dict):
            raise KeyError(f"State machine run {parent_run.id} inputs are missing.")
        if parent_run.inputs.get("runType") != STATE_MACHINE_RUN_TYPE:
            raise ValueError(f"Run {parent_run.id} is not a state machine run.")
        resolved_share_session_id = (
            share_session_id
            if share_session_id is not None
            else self._get_run_share_session_id(parent_run)
        )
        refreshed_run = parent_run
        if parent_run.status == AgentRunStatus.running:
            refreshed_run = await self._refresh_run(
                run=parent_run,
                project_config_id=self._get_run_project_config_id(parent_run),
                machine_group_id=self._get_machine_group_id(parent_run),
                share_session_id=resolved_share_session_id,
            )
            save_agent_run(self.dbe, refreshed_run)
        await self._broadcast_run_update(
            refreshed_run,
            share_session_id=resolved_share_session_id,
        )

    def _load_latest_run(
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

    def _resolve_signal_report_context(
        self,
        *,
        project_config_id: ID,
        child_run_id: ID | None,
        machine_run_id: ID | None,
        section_id: ID | None,
    ) -> ResolvedStateMachineSignalContext:
        child_run: AgentRun | None = None
        if child_run_id is not None:
            child_run = load_agent_run(self.dbe, child_run_id)
            if child_run is None:
                raise KeyError(f"Child run {child_run_id} not found.")

        resolved_machine_run_id = machine_run_id
        if child_run is not None:
            parent_run_id = self._get_child_parent_run_id(child_run)
            if (
                resolved_machine_run_id is not None
                and resolved_machine_run_id != parent_run_id
            ):
                raise ValueError(
                    f"machineRunId {resolved_machine_run_id} does not match child run {child_run.id} parent {parent_run_id}."
                )
            resolved_machine_run_id = parent_run_id
        if resolved_machine_run_id is None:
            raise ValueError(
                "report_state_machine_signal requires an active child run or machineRunId."
            )
        machine_run = load_agent_run(self.dbe, resolved_machine_run_id)
        if machine_run is None:
            raise KeyError(f"State machine run {resolved_machine_run_id} not found.")
        if not isinstance(machine_run.inputs, dict):
            raise KeyError(f"State machine run {machine_run.id} inputs are missing.")
        if machine_run.inputs.get("runType") != STATE_MACHINE_RUN_TYPE:
            raise ValueError(f"Run {machine_run.id} is not a state machine run.")
        raw_project_config_id = machine_run.inputs.get("projectConfigId")
        if raw_project_config_id != str(project_config_id):
            raise ValueError(
                f"State machine run {machine_run.id} does not belong to project config {project_config_id}."
            )

        resolved_section_id = section_id
        if child_run is not None:
            child_section_id = self._get_child_target_section_id(child_run)
            if (
                resolved_section_id is not None
                and resolved_section_id != child_section_id
            ):
                raise ValueError(
                    f"sectionId {resolved_section_id} does not match child run {child_run.id} section {child_section_id}."
                )
            resolved_section_id = child_section_id
        if resolved_section_id is None:
            raise ValueError(
                "report_state_machine_signal requires sectionId when no active chat section is available."
            )

        resolved_iteration = self._get_state_machine_iteration(machine_run)
        if child_run is not None:
            child_iteration = self._get_child_run_iteration(child_run)
            if child_iteration > resolved_iteration:
                resolved_iteration = child_iteration

        return ResolvedStateMachineSignalContext(
            machine_run=machine_run,
            child_run_id=child_run.id if child_run is not None else None,
            source_section_id=resolved_section_id,
            state_machine_iteration=resolved_iteration,
        )

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

        if not start_section_ids:
            raise KeyError(
                f"State machine group {machine_group_id} does not have a Start section."
            )
        if len(start_section_ids) != 1:
            raise ValueError(
                f"State machine group {machine_group_id} must resolve to exactly one Start section."
            )
        if not end_section_ids:
            raise ValueError(
                f"State machine group {machine_group_id} must resolve to at least one End section."
            )

        resolved_start_section_id = start_section_ids[0]
        if (
            start_section_id is not None
            and start_section_id != resolved_start_section_id
        ):
            raise KeyError(
                f"State machine start {start_section_id} not found in group {machine_group_id}."
            )

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
            max_iterations=start_impl.maxIterations,
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

    def _ensure_run_outputs_initialized(
        self,
        run: AgentRun,
        graph: ResolvedStateMachineGraph,
    ) -> None:
        if run.outputs is None:
            run.outputs = {}
        defaults: dict[str, object] = {
            "machineGroupId": graph.machine_group_id,
            "machineName": graph.machine_name,
            "maxIterations": graph.max_iterations,
            "stateMachineIteration": INITIAL_STATE_MACHINE_ITERATION,
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
            "childRunIds": [],
            "activatedEdgeIds": [],
            "processedChildTerminalRunIds": [],
            "signalEvents": [],
            "processedSignalEventIds": [],
            "dispatchedEdgeActions": [],
            "gateInputEdgeIdsBySectionId": {},
            "gateStatusBySectionId": {},
            "firedGateSectionIds": [],
            "blockedGateSectionIds": [],
            "blockedGateDetailsBySectionId": {},
            "reachedEndSectionIds": [],
            "activeChildRunIds": [],
            "failureSummary": None,
            "machineStateCleared": False,
            "machineStateClearedAt": None,
        }
        for key, value in defaults.items():
            if key not in run.outputs:
                run.outputs[key] = value

    def _clear_machine_run_state(self, run: AgentRun) -> None:
        if run.outputs is None:
            run.outputs = {}
        run.outputs["stateMachineIteration"] = INITIAL_STATE_MACHINE_ITERATION
        run.outputs["childRunIds"] = []
        run.outputs["activatedEdgeIds"] = []
        run.outputs["processedChildTerminalRunIds"] = []
        run.outputs["signalEvents"] = []
        run.outputs["processedSignalEventIds"] = []
        run.outputs["dispatchedStartEdgeActions"] = []
        run.outputs["dispatchedEdgeActions"] = []
        run.outputs["gateInputEdgeIdsBySectionId"] = {}
        run.outputs["gateStatusBySectionId"] = {}
        run.outputs["firedGateSectionIds"] = []
        run.outputs["blockedGateSectionIds"] = []
        run.outputs["blockedGateDetailsBySectionId"] = {}
        run.outputs["reachedEndSectionIds"] = []
        run.outputs["activeChildRunIds"] = []
        run.outputs["failureSummary"] = None
        run.outputs["machineStateCleared"] = True
        run.outputs["machineStateClearedAt"] = get_now_timestamp().isoformat()
        save_agent_run(self.dbe, run)

    def _append_child_run_ids(
        self,
        run: AgentRun,
        action_results: list[dict[str, object]],
    ) -> None:
        child_run_ids = self._get_output_str_list(run, "childRunIds")
        for action in action_results:
            raw_run_id = action.get("runId")
            if not isinstance(raw_run_id, str):
                continue
            if raw_run_id in child_run_ids:
                continue
            child_run_ids.append(raw_run_id)

    def _refresh_live_outputs(
        self,
        *,
        run: AgentRun,
        graph: ResolvedStateMachineGraph,
        project_config_id: ID,
    ) -> StateMachineProgressState:
        active_child_run_ids = [
            str(child_run.id)
            for child_run in self._list_child_runs(
                run=run,
                project_config_id=project_config_id,
            )
            if child_run.status == AgentRunStatus.running
            and self._get_child_run_iteration(child_run)
            == self._get_state_machine_iteration(run)
        ]
        run.outputs["activeChildRunIds"] = active_child_run_ids
        progress_state = self._compute_progress_state(
            run=run,
            graph=graph,
            project_config_id=project_config_id,
        )
        gate_status_by_section_id = self._get_output_dict(run, "gateStatusBySectionId")
        fired_gate_section_ids = set(
            self._get_output_str_list(run, "firedGateSectionIds")
        )
        for gate_section_id in graph.gate_section_ids:
            gate_section_key = str(gate_section_id)
            if gate_section_key in fired_gate_section_ids:
                gate_status_by_section_id[gate_section_key] = "satisfied"
                continue
            if gate_section_id in progress_state.blocked_gate_section_ids:
                gate_status_by_section_id[gate_section_key] = "blocked"
                continue
            gate_status_by_section_id[gate_section_key] = "waiting"
        run.outputs["blockedGateSectionIds"] = [
            str(section_id)
            for section_id in graph.gate_section_ids
            if section_id in progress_state.blocked_gate_section_ids
        ]
        run.outputs["blockedGateDetailsBySectionId"] = (
            progress_state.blocked_gate_details_by_section_id
        )
        return progress_state

    async def _refresh_run(
        self,
        *,
        run: AgentRun,
        project_config_id: ID,
        machine_group_id: str,
        share_session_id: str | None,
    ) -> AgentRun:
        graph = self._resolve_graph(
            project_config_id=project_config_id,
            machine_group_id=machine_group_id,
            start_section_id=None,
            share_session_id=share_session_id,
        )
        self._ensure_run_outputs_initialized(run, graph)
        progress = False
        while run.status == AgentRunStatus.running:
            signal_events = self._get_unprocessed_signal_events(run=run)
            if not signal_events:
                break
            signal_event = signal_events[0]
            dispatched_actions = await self._activate_signal_event(
                run=run,
                graph=graph,
                signal_event=signal_event,
                project_config_id=project_config_id,
                share_session_id=share_session_id,
            )
            self._mark_signal_event_processed(run, signal_event)
            if dispatched_actions:
                self._append_child_run_ids(run, dispatched_actions)
                self._append_dispatched_edge_actions(run, dispatched_actions)
            progress = True
        while run.status == AgentRunStatus.running:
            child_runs = self._get_unprocessed_terminal_child_runs(
                run=run,
                project_config_id=project_config_id,
            )
            if not child_runs:
                break
            child_run = child_runs[0]
            if run.status != AgentRunStatus.running:
                break
            self._record_child_terminal_event(run, child_run)
            dispatched_actions = await self._activate_child_run_edges(
                run=run,
                graph=graph,
                child_run=child_run,
                project_config_id=project_config_id,
                share_session_id=share_session_id,
            )
            self._mark_child_run_processed(run, child_run.id)
            if dispatched_actions:
                self._append_child_run_ids(run, dispatched_actions)
                self._append_dispatched_edge_actions(run, dispatched_actions)
            progress = True
        progress_state = self._refresh_live_outputs(
            run=run,
            graph=graph,
            project_config_id=project_config_id,
        )
        if (
            run.status == AgentRunStatus.running
            and progress_state.blocked_gate_section_ids
        ):
            await self._block_run(
                run=run,
                graph=graph,
                progress_state=progress_state,
                project_config_id=project_config_id,
            )
            self._refresh_live_outputs(
                run=run,
                graph=graph,
                project_config_id=project_config_id,
            )
            progress = True
        if progress:
            save_agent_run(self.dbe, run)
        return run

    async def _activate_start_edges(
        self,
        *,
        run: AgentRun,
        graph: ResolvedStateMachineGraph,
        project_config_id: ID,
        share_session_id: str | None,
    ) -> list[dict[str, object]]:
        return await self._activate_ready_edges(
            run=run,
            graph=graph,
            edges=graph.start_outgoing_edges,
            project_config_id=project_config_id,
            share_session_id=share_session_id,
        )

    async def _activate_ready_edges(
        self,
        *,
        run: AgentRun,
        graph: ResolvedStateMachineGraph,
        edges: list[StateMachineEdge],
        project_config_id: ID,
        share_session_id: str | None,
    ) -> list[dict[str, object]]:
        if self._should_advance_iteration(
            run=run,
            graph=graph,
            edges=edges,
            project_config_id=project_config_id,
        ):
            if not self._begin_next_iteration(run=run, graph=graph, edges=edges):
                return []
        edge_groups = self._group_edges_by_target_section(edges)
        if not edge_groups:
            return []
        grouped_results = await asyncio.gather(
            *[
                self._activate_edge_group(
                    run=run,
                    graph=graph,
                    edges=edge_group,
                    project_config_id=project_config_id,
                    share_session_id=share_session_id,
                )
                for edge_group in edge_groups
            ]
        )
        action_results: list[dict[str, object]] = []
        for group_results in grouped_results:
            action_results.extend(group_results)
        return action_results

    async def _activate_edge_group(
        self,
        *,
        run: AgentRun,
        graph: ResolvedStateMachineGraph,
        edges: list[StateMachineEdge],
        project_config_id: ID,
        share_session_id: str | None,
    ) -> list[dict[str, object]]:
        action_results: list[dict[str, object]] = []
        for edge in edges:
            edge_results = await self._activate_edge(
                run=run,
                graph=graph,
                edge=edge,
                project_config_id=project_config_id,
                share_session_id=share_session_id,
            )
            action_results.extend(edge_results)
        return action_results

    def _group_edges_by_target_section(
        self, edges: list[StateMachineEdge]
    ) -> list[list[StateMachineEdge]]:
        ordered_target_section_ids: list[ID] = []
        edges_by_target_section_id: dict[ID, list[StateMachineEdge]] = {}
        for edge in edges:
            if edge.targetSectionId not in edges_by_target_section_id:
                ordered_target_section_ids.append(edge.targetSectionId)
                edges_by_target_section_id[edge.targetSectionId] = []
            edges_by_target_section_id[edge.targetSectionId].append(edge)
        return [
            edges_by_target_section_id[target_section_id]
            for target_section_id in ordered_target_section_ids
        ]

    def _should_advance_iteration(
        self,
        *,
        run: AgentRun,
        graph: ResolvedStateMachineGraph,
        edges: list[StateMachineEdge],
        project_config_id: ID,
    ) -> bool:
        current_iteration = self._get_state_machine_iteration(run)
        targeted_section_ids_in_iteration = {
            self._get_child_target_section_id(child_run)
            for child_run in self._list_child_runs(
                run=run,
                project_config_id=project_config_id,
            )
            if self._get_child_run_iteration(child_run) == current_iteration
        }
        for edge in edges:
            target_impl = get_curr_effective_section_impl(
                graph.project_state,
                edge.targetSectionId,
            )
            if not isinstance(target_impl, ChatSectionImpl):
                continue
            if edge.targetSectionId in targeted_section_ids_in_iteration:
                return True
        return False

    def _begin_next_iteration(
        self,
        *,
        run: AgentRun,
        graph: ResolvedStateMachineGraph,
        edges: list[StateMachineEdge],
    ) -> bool:
        previous_iteration = self._get_state_machine_iteration(run)
        next_iteration = previous_iteration + 1
        max_iterations = graph.max_iterations
        if max_iterations is not None and next_iteration > max_iterations:
            target_section_ids = [str(edge.targetSectionId) for edge in edges]
            edge_ids = [str(edge.id) for edge in edges]
            self._record_event(
                run,
                "iteration_limit_reached",
                {
                    "previousIteration": previous_iteration,
                    "attemptedIteration": next_iteration,
                    "maxIterations": max_iterations,
                    "targetSectionIds": target_section_ids,
                    "edgeIds": edge_ids,
                },
            )
            self._fail_run(
                run=run,
                reason="max_iterations_reached",
                message=(
                    f"Workflow reached the max iteration limit ({max_iterations}) before dispatching iteration {next_iteration}."
                ),
                extra_details={
                    "previousIteration": previous_iteration,
                    "attemptedIteration": next_iteration,
                    "maxIterations": max_iterations,
                    "targetSectionIds": target_section_ids,
                    "edgeIds": edge_ids,
                },
            )
            return False
        run.outputs["stateMachineIteration"] = next_iteration
        run.outputs["activatedEdgeIds"] = []
        run.outputs["processedChildTerminalRunIds"] = []
        run.outputs["processedSignalEventIds"] = []
        run.outputs["gateInputEdgeIdsBySectionId"] = {}
        run.outputs["gateStatusBySectionId"] = {}
        run.outputs["firedGateSectionIds"] = []
        run.outputs["blockedGateSectionIds"] = []
        run.outputs["blockedGateDetailsBySectionId"] = {}
        run.outputs["reachedEndSectionIds"] = []
        run.outputs["activeChildRunIds"] = []
        self._record_event(
            run,
            "iteration_advanced",
            {
                "previousIteration": previous_iteration,
                "stateMachineIteration": next_iteration,
                "targetSectionIds": [str(edge.targetSectionId) for edge in edges],
                "edgeIds": [str(edge.id) for edge in edges],
            },
        )
        return True

    async def _activate_edge(
        self,
        *,
        run: AgentRun,
        graph: ResolvedStateMachineGraph,
        edge: StateMachineEdge,
        project_config_id: ID,
        share_session_id: str | None,
    ) -> list[dict[str, object]]:
        target_impl = get_curr_effective_section_impl(
            graph.project_state, edge.targetSectionId
        )
        if isinstance(target_impl, StateMachineGateSectionImpl):
            return await self._activate_gate_input(
                run=run,
                graph=graph,
                edge=edge,
                gate_section_id=edge.targetSectionId,
                gate_impl=target_impl,
                project_config_id=project_config_id,
                share_session_id=share_session_id,
            )
        if isinstance(target_impl, StateMachineEndSectionImpl):
            self._reach_end(run=run, edge=edge)
            self._mark_edge_activated(run, edge.id)
            return []
        if not isinstance(target_impl, ChatSectionImpl):
            return []
        target_action = edge.targetAction
        if target_action is None:
            raise ValueError(
                f"State machine edge {edge.id} is missing a Chat target action."
            )
        if target_action.type == StateMachineTargetActionType.reset_thread:
            action_result = await self._reset_thread_action(
                run=run,
                edge=edge,
                target_action=target_action,
                project_config_id=project_config_id,
                share_session_id=share_session_id,
            )
            self._mark_edge_activated(run, edge.id)
            return [action_result]
        action_result = await self._send_prompt_action(
            run=run,
            graph=graph,
            edge=edge,
            target_action=target_action,
            project_config_id=project_config_id,
            share_session_id=share_session_id,
        )
        self._mark_edge_activated(run, edge.id)
        return [action_result]

    async def _activate_gate_input(
        self,
        *,
        run: AgentRun,
        graph: ResolvedStateMachineGraph,
        edge: StateMachineEdge,
        gate_section_id: ID,
        gate_impl: StateMachineGateSectionImpl,
        project_config_id: ID,
        share_session_id: str | None,
    ) -> list[dict[str, object]]:
        gate_input_edge_ids_by_section_id = self._get_output_dict(
            run,
            "gateInputEdgeIdsBySectionId",
        )
        gate_section_key = str(gate_section_id)
        raw_gate_inputs = gate_input_edge_ids_by_section_id.get(gate_section_key)
        if raw_gate_inputs is None:
            raw_gate_inputs = []
            gate_input_edge_ids_by_section_id[gate_section_key] = raw_gate_inputs
        if not isinstance(raw_gate_inputs, list):
            raise TypeError(
                f"State machine gate inputs for section {edge.targetSectionId} must be a list."
            )
        raw_edge_id = str(edge.id)
        if raw_edge_id not in raw_gate_inputs:
            raw_gate_inputs.append(raw_edge_id)
            self._mark_edge_activated(run, edge.id)
            self._record_event(
                run,
                "gate_input_activated",
                {
                    "edgeId": raw_edge_id,
                    "gateSectionId": gate_section_key,
                    "gateType": gate_impl.gateType.value,
                },
            )
        gate_actions = await self._evaluate_gate(
            run=run,
            graph=graph,
            gate_section_id=gate_section_id,
            gate_impl=gate_impl,
            project_config_id=project_config_id,
            share_session_id=share_session_id,
        )
        return gate_actions

    async def _evaluate_gate(
        self,
        *,
        run: AgentRun,
        graph: ResolvedStateMachineGraph,
        gate_section_id: ID,
        gate_impl: StateMachineGateSectionImpl,
        project_config_id: ID,
        share_session_id: str | None,
    ) -> list[dict[str, object]]:
        gate_section_key = str(gate_section_id)
        gate_input_edge_ids_by_section_id = self._get_output_dict(
            run,
            "gateInputEdgeIdsBySectionId",
        )
        raw_activated_edge_ids = gate_input_edge_ids_by_section_id.get(gate_section_key)
        if raw_activated_edge_ids is None:
            activated_edge_ids: list[str] = []
        elif isinstance(raw_activated_edge_ids, list):
            activated_edge_ids = [
                raw_edge_id
                for raw_edge_id in raw_activated_edge_ids
                if isinstance(raw_edge_id, str)
            ]
        else:
            raise TypeError(
                f"State machine gate inputs for section {gate_section_id} must be a list."
            )
        incoming_edges = [
            edge
            for edge in graph.machine_edges
            if edge.targetSectionId == gate_section_id
        ]
        activated_edge_id_set = set(activated_edge_ids)
        fired_gate_section_ids = self._get_output_str_list(run, "firedGateSectionIds")
        gate_status_by_section_id = self._get_output_dict(run, "gateStatusBySectionId")
        if gate_section_key in fired_gate_section_ids:
            gate_status_by_section_id[gate_section_key] = "satisfied"
            return []
        is_satisfied = False
        if gate_impl.gateType == StateMachineGateType.AND:
            is_satisfied = all(
                str(edge.id) in activated_edge_id_set for edge in incoming_edges
            )
        elif gate_impl.gateType == StateMachineGateType.OR:
            is_satisfied = any(
                str(edge.id) in activated_edge_id_set for edge in incoming_edges
            )
        elif gate_impl.gateType == StateMachineGateType.XOR:
            is_satisfied = len(activated_edge_id_set) == 1
        if not is_satisfied:
            gate_status_by_section_id[gate_section_key] = "waiting"
            return []
        fired_gate_section_ids.append(gate_section_key)
        gate_status_by_section_id[gate_section_key] = "satisfied"
        self._record_event(
            run,
            "gate_satisfied",
            {
                "gateSectionId": gate_section_key,
                "gateType": gate_impl.gateType.value,
                "activatedEdgeIds": activated_edge_ids,
            },
        )
        outgoing_edges = [
            edge
            for edge in graph.machine_edges
            if edge.sourceSectionId == gate_section_id
        ]
        if not outgoing_edges:
            return []
        return await self._activate_ready_edges(
            run=run,
            graph=graph,
            edges=outgoing_edges,
            project_config_id=project_config_id,
            share_session_id=share_session_id,
        )

    def _reach_end(
        self,
        *,
        run: AgentRun,
        edge: StateMachineEdge,
    ) -> None:
        reached_end_section_ids = self._get_output_str_list(run, "reachedEndSectionIds")
        target_section_key = str(edge.targetSectionId)
        if target_section_key not in reached_end_section_ids:
            reached_end_section_ids.append(target_section_key)
            self._record_event(
                run,
                "end_reached",
                {
                    "edgeId": str(edge.id),
                    "endSectionId": target_section_key,
                },
            )
        if run.status != AgentRunStatus.running:
            return
        run.status = AgentRunStatus.completed
        run.finishedAt = get_now_timestamp()
        save_agent_run(self.dbe, run)
        self._record_event(run, "run_completed", {})

    async def _reset_thread_action(
        self,
        *,
        run: AgentRun,
        edge: StateMachineEdge,
        target_action: StateMachineTargetAction,
        project_config_id: ID,
        share_session_id: str | None,
    ) -> dict[str, object]:
        target_impl = self._get_chat_section_impl(
            project_config_id,
            edge.targetSectionId,
            share_session_id=share_session_id,
        )
        current_chat_id = target_impl.chatId
        stopped_run_id: str | None = None
        if current_chat_id is not None and target_action.stopIfRunning:
            stopped_run = await self._stop_chat_if_running(
                chat_id=current_chat_id,
                project_config_id=project_config_id,
            )
            if stopped_run is not None:
                stopped_run_id = str(stopped_run.id)
        if current_chat_id is not None:
            await self._set_chat_section_chat_id(
                project_config_id=project_config_id,
                section_id=edge.targetSectionId,
                chat_id=None,
                share_session_id=share_session_id,
            )
        action_result = {
            "edgeId": str(edge.id),
            "actionType": target_action.type.value,
            "targetSectionId": str(edge.targetSectionId),
            "clearedChatId": str(current_chat_id)
            if current_chat_id is not None
            else None,
            "stoppedRunId": stopped_run_id,
        }
        self._record_event(
            run,
            self._get_edge_action_event_type(
                project_config_id=project_config_id,
                edge=edge,
                target_action=target_action,
                share_session_id=share_session_id,
            ),
            action_result,
        )
        return action_result

    async def _send_prompt_action(
        self,
        *,
        run: AgentRun,
        graph: ResolvedStateMachineGraph,
        edge: StateMachineEdge,
        target_action: StateMachineTargetAction,
        project_config_id: ID,
        share_session_id: str | None,
    ) -> dict[str, object]:
        target_impl = self._get_chat_section_impl(
            project_config_id,
            edge.targetSectionId,
            share_session_id=share_session_id,
        )
        self._ensure_signal_tool_available_for_chat_dispatch(
            graph=graph,
            edge=edge,
            target_impl=target_impl,
            target_action=target_action,
        )
        prompt_text = self._resolve_prompt_text(edge.id, target_action)
        chat_id = target_impl.chatId
        if (
            target_action.threadStrategy
            == StateMachineThreadStrategy.new_thread_before_send
        ):
            if chat_id is not None:
                await self._set_chat_section_chat_id(
                    project_config_id=project_config_id,
                    section_id=edge.targetSectionId,
                    chat_id=None,
                    share_session_id=share_session_id,
                )
            chat_id = None
        # Managed child runs resolve scope from the project-state backend.
        # Flush queued section updates before dispatch so newly configured chats
        # are visible to AgentRunner.
        await self.project_manager_switcher.get(
            project_config_id,
            share_session_id=share_session_id,
        ).finish_pending_operations()
        dispatch_project_state = self._get_project_state(
            project_config_id,
            share_session_id=share_session_id,
        )
        dispatch_response = self.chat_dispatcher.dispatch(
            ManagedChatDispatchRequest(
                chatId=chat_id,
                message=UserChatMessage(
                    content=[MessageTextContent(text=prompt_text)],
                ),
                engineConfigId=self._resolve_engine_config_id(
                    edge.id,
                    target_impl,
                    target_action,
                ),
                agentProfileId=(
                    target_action.agentProfileId
                    if target_action.agentProfileId is not None
                    else target_impl.agentProfileId
                ),
                thinking=target_impl.thinking,
                projectConfigId=project_config_id,
                sectionId=edge.targetSectionId,
                allowUnscoped=False,
                permissionMode=self._resolve_permission_mode(
                    target_impl,
                    target_action,
                ),
                searchEnabled=(
                    target_action.searchEnabled
                    if target_action.searchEnabled is not None
                    else target_impl.searchEnabled
                ),
                extraRunInputs=self._build_child_run_inputs(run, edge),
            ),
            project_state=dispatch_project_state,
        )
        if chat_id != dispatch_response.chatId:
            await self._set_chat_section_chat_id(
                project_config_id=project_config_id,
                section_id=edge.targetSectionId,
                chat_id=dispatch_response.chatId,
                share_session_id=share_session_id,
            )
        action_result = {
            "edgeId": str(edge.id),
            "actionType": target_action.type.value,
            "targetSectionId": str(edge.targetSectionId),
            "chatId": str(dispatch_response.chatId),
            "runId": str(dispatch_response.runId),
            "threadStrategy": target_action.threadStrategy.value,
            "engineType": dispatch_response.engineType.value,
            "stateMachineIteration": self._get_state_machine_iteration(run),
        }
        self._record_event(
            run,
            self._get_edge_action_event_type(
                project_config_id=project_config_id,
                edge=edge,
                target_action=target_action,
                share_session_id=share_session_id,
            ),
            action_result,
        )
        return action_result

    def _build_child_run_inputs(
        self,
        run: AgentRun,
        edge: StateMachineEdge,
    ) -> dict[str, object]:
        return {
            "stateMachineRunId": str(run.id),
            "machineGroupId": self._get_machine_group_id(run),
            "stateMachineSourceEdgeId": str(edge.id),
            "stateMachineTargetSectionId": str(edge.targetSectionId),
            "stateMachineIteration": self._get_state_machine_iteration(run),
            "stateMachineParentRunType": STATE_MACHINE_RUN_TYPE,
        }

    def _ensure_signal_tool_available_for_chat_dispatch(
        self,
        *,
        graph: ResolvedStateMachineGraph,
        edge: StateMachineEdge,
        target_impl: ChatSectionImpl,
        target_action: StateMachineTargetAction,
    ) -> None:
        if not self._chat_section_has_signal_outputs(
            graph=graph,
            section_id=edge.targetSectionId,
        ):
            return
        agent_profile = self._resolve_signal_dispatch_agent_profile(
            target_impl=target_impl,
            target_action=target_action,
        )
        if agent_profile is None or not agent_profile.toolAllowlist:
            return
        engine_config = require_engine_config(
            self.dbe,
            self._resolve_engine_config_id(edge.id, target_impl, target_action),
        )
        completion_guard_enabled = load_completion_guard_enabled(self.dbe)
        if engine_config.engineType == EngineType.setta_llm:
            allowlist = self.agent_runner._normalize_tool_allowlist(
                agent_profile,
                completion_guard_enabled=completion_guard_enabled,
            )
            if allowlist is None:
                return
            if self.agent_runner._is_tool_allowed(
                REPORT_STATE_MACHINE_SIGNAL_NAMESPACED_TOOL_NAME,
                allowlist,
                completion_guard_enabled=completion_guard_enabled,
            ):
                return
            raise ValueError(
                f"Chat section {edge.targetSectionId} has signal-filtered outgoing state-machine edges, but agent profile {agent_profile.id} does not allow {REPORT_STATE_MACHINE_SIGNAL_NAMESPACED_TOOL_NAME}."
            )
        if engine_config.engineType != EngineType.external_agent:
            return
        allowlist, error = build_external_tool_allowlist(
            agent_profile.toolAllowlist,
            server_id=SETTA_MCP_SERVER_ID,
            completion_guard_enabled=completion_guard_enabled,
        )
        if error is not None:
            raise ValueError(error)
        if allowlist is None or allowlist.allow_all:
            return
        if REPORT_STATE_MACHINE_SIGNAL_TOOL_NAME in allowlist.tool_names:
            return
        raise ValueError(
            f"Chat section {edge.targetSectionId} has signal-filtered outgoing state-machine edges, but agent profile {agent_profile.id} does not allow {REPORT_STATE_MACHINE_SIGNAL_NAMESPACED_TOOL_NAME}."
        )

    def _chat_section_has_signal_outputs(
        self,
        *,
        graph: ResolvedStateMachineGraph,
        section_id: ID,
    ) -> bool:
        for edge in graph.machine_edges:
            if edge.sourceSectionId != section_id:
                continue
            source_filter = edge.sourceFilter
            if source_filter is None:
                continue
            if source_filter.type == StateMachineSourceFilterType.signal:
                return True
        return False

    def _resolve_signal_dispatch_agent_profile(
        self,
        *,
        target_impl: ChatSectionImpl,
        target_action: StateMachineTargetAction,
    ) -> AgentProfile | None:
        agent_profile_id = (
            target_action.agentProfileId
            if target_action.agentProfileId is not None
            else target_impl.agentProfileId
        )
        if agent_profile_id is None:
            return None
        return require_agent_profile(self.dbe, agent_profile_id)

    def _get_machine_group_id(self, run: AgentRun) -> str:
        if not isinstance(run.inputs, dict):
            raise KeyError("State machine run inputs are missing.")
        raw_machine_group_id = run.inputs.get("machineGroupId")
        if not isinstance(raw_machine_group_id, str) or raw_machine_group_id == "":
            raise KeyError("State machine run machineGroupId is missing.")
        return raw_machine_group_id

    def _get_run_project_config_id(self, run: AgentRun) -> ID:
        if not isinstance(run.inputs, dict):
            raise KeyError("Run inputs are missing.")
        raw_project_config_id = run.inputs.get("projectConfigId")
        if not isinstance(raw_project_config_id, str) or raw_project_config_id == "":
            raise KeyError("Run projectConfigId is missing.")
        return ID(raw_project_config_id)

    def _get_run_share_session_id(self, run: AgentRun) -> str | None:
        if not isinstance(run.inputs, dict):
            raise KeyError("Run inputs are missing.")
        raw_share_session_id = run.inputs.get("shareSessionId")
        if raw_share_session_id is None:
            return None
        if not isinstance(raw_share_session_id, str) or raw_share_session_id == "":
            raise KeyError("Run shareSessionId is invalid.")
        return raw_share_session_id

    def _is_machine_run_cleared(self, run: AgentRun) -> bool:
        if not isinstance(run.outputs, dict):
            return False
        return run.outputs.get("machineStateCleared") is True

    def _get_section_display_label(
        self,
        project_state: ProjectStateSingleConfig,
        section_id: ID,
    ) -> str:
        section_impl = get_curr_effective_section_impl(project_state, section_id)
        if isinstance(section_impl, StateMachineGateSectionImpl):
            if section_impl.label.strip() != "":
                return section_impl.label
            return f"{section_impl.gateType.value} Gate"
        if (
            isinstance(
                section_impl,
                (StateMachineStartSectionImpl, StateMachineEndSectionImpl),
            )
            and section_impl.label.strip() != ""
        ):
            return section_impl.label
        return str(section_id)

    def _get_state_machine_iteration(self, run: AgentRun) -> int:
        if not isinstance(run.outputs, dict):
            raise KeyError("State machine run outputs are missing.")
        raw_iteration = run.outputs.get("stateMachineIteration")
        if not isinstance(raw_iteration, int):
            raise KeyError("State machine run iteration is missing.")
        return raw_iteration

    def _set_failure_summary(
        self,
        *,
        run: AgentRun,
        reason: str,
        message: str,
        extra_details: dict[str, object] | None = None,
    ) -> None:
        if run.outputs is None:
            run.outputs = {}
        run.outputs["failureSummary"] = {
            "reason": reason,
            "message": message,
            "details": {} if extra_details is None else extra_details,
        }

    def _fail_run(
        self,
        *,
        run: AgentRun,
        reason: str,
        message: str,
        extra_details: dict[str, object] | None = None,
    ) -> None:
        self._set_failure_summary(
            run=run,
            reason=reason,
            message=message,
            extra_details=extra_details,
        )
        run.status = AgentRunStatus.failed
        run.finishedAt = get_now_timestamp()
        save_agent_run(self.dbe, run)
        failure_event_payload: dict[str, object] = {
            "reason": reason,
            "message": message,
        }
        if extra_details is not None:
            failure_event_payload["details"] = extra_details
        self._record_event(run, "run_failed", failure_event_payload)

    def _get_edge_action_event_type(
        self,
        *,
        project_config_id: ID,
        edge: StateMachineEdge,
        target_action: StateMachineTargetAction,
        share_session_id: str | None,
    ) -> str:
        project_state = self._get_project_state(
            project_config_id,
            share_session_id=share_session_id,
        )
        source_impl = get_curr_effective_section_impl(
            project_state, edge.sourceSectionId
        )
        if target_action.type == StateMachineTargetActionType.reset_thread:
            if isinstance(source_impl, StateMachineStartSectionImpl):
                return "start_edge_action_reset"
            return "edge_action_reset"
        if isinstance(source_impl, StateMachineStartSectionImpl):
            return "start_edge_action_dispatched"
        return "edge_action_dispatched"

    def _mark_edge_activated(self, run: AgentRun, edge_id: ID) -> None:
        activated_edge_ids = self._get_output_str_list(run, "activatedEdgeIds")
        raw_edge_id = str(edge_id)
        if raw_edge_id in activated_edge_ids:
            return
        activated_edge_ids.append(raw_edge_id)

    async def _block_run(
        self,
        *,
        run: AgentRun,
        graph: ResolvedStateMachineGraph,
        progress_state: StateMachineProgressState,
        project_config_id: ID,
    ) -> None:
        blocked_gate_section_ids = [
            gate_section_id
            for gate_section_id in graph.gate_section_ids
            if gate_section_id in progress_state.blocked_gate_section_ids
        ]
        for gate_section_id in blocked_gate_section_ids:
            gate_detail = progress_state.blocked_gate_details_by_section_id[
                str(gate_section_id)
            ]
            self._record_event(run, "gate_blocked", gate_detail)
        stopped_child_run_ids = await self._stop_running_child_runs(
            run=run,
            project_config_id=project_config_id,
        )
        if stopped_child_run_ids:
            self._record_event(
                run,
                "child_runs_cancelled",
                {
                    "childRunIds": stopped_child_run_ids,
                },
            )
        gate_section_ids = [
            str(gate_section_id) for gate_section_id in blocked_gate_section_ids
        ]
        gate_details_by_section_id = progress_state.blocked_gate_details_by_section_id
        blocked_gate_labels = [
            self._get_section_display_label(graph.project_state, gate_section_id)
            for gate_section_id in blocked_gate_section_ids
        ]
        if len(blocked_gate_labels) == 1:
            failure_message = f"Workflow blocked at gate {blocked_gate_labels[0]}."
        else:
            failure_message = f"Workflow blocked at {len(blocked_gate_labels)} gates: {', '.join(blocked_gate_labels)}."
        self._record_event(
            run,
            "run_blocked",
            {
                "gateSectionIds": gate_section_ids,
                "gateDetailsBySectionId": gate_details_by_section_id,
            },
        )
        self._fail_run(
            run=run,
            reason="run_blocked",
            message=failure_message,
            extra_details={
                "gateSectionIds": gate_section_ids,
                "gateDetailsBySectionId": gate_details_by_section_id,
            },
        )

    def _compute_progress_state(
        self,
        *,
        run: AgentRun,
        graph: ResolvedStateMachineGraph,
        project_config_id: ID,
    ) -> StateMachineProgressState:
        activated_edge_id_set = self._get_activated_edge_id_set(run)
        fired_gate_section_ids = {
            ID(raw_gate_section_id)
            for raw_gate_section_id in self._get_output_str_list(
                run,
                "firedGateSectionIds",
            )
        }
        active_chat_source_section_ids = {
            self._get_child_target_section_id(child_run)
            for child_run in self._list_child_runs(
                run=run,
                project_config_id=project_config_id,
            )
            if child_run.status == AgentRunStatus.running
            and self._get_child_run_iteration(child_run)
            == self._get_state_machine_iteration(run)
        }
        possible_gate_section_ids: set[ID] = set()
        possible_chat_source_section_ids = set(active_chat_source_section_ids)
        while True:
            next_possible_gate_section_ids: set[ID] = set()
            for gate_section_id in graph.gate_section_ids:
                if gate_section_id in fired_gate_section_ids:
                    continue
                if self._gate_can_satisfy_later(
                    gate_section_id=gate_section_id,
                    graph=graph,
                    activated_edge_id_set=activated_edge_id_set,
                    possible_gate_section_ids=possible_gate_section_ids,
                    possible_chat_source_section_ids=possible_chat_source_section_ids,
                ):
                    next_possible_gate_section_ids.add(gate_section_id)
            next_possible_chat_source_section_ids = set(active_chat_source_section_ids)
            for edge in graph.machine_edges:
                if str(edge.id) in activated_edge_id_set:
                    continue
                if edge.targetAction is None:
                    continue
                target_impl = get_curr_effective_section_impl(
                    graph.project_state,
                    edge.targetSectionId,
                )
                if not isinstance(target_impl, ChatSectionImpl):
                    continue
                if self._edge_source_can_activate_later(
                    edge=edge,
                    graph=graph,
                    possible_gate_section_ids=next_possible_gate_section_ids,
                    possible_chat_source_section_ids=possible_chat_source_section_ids,
                ):
                    next_possible_chat_source_section_ids.add(edge.targetSectionId)
            if (
                next_possible_gate_section_ids == possible_gate_section_ids
                and next_possible_chat_source_section_ids
                == possible_chat_source_section_ids
            ):
                break
            possible_gate_section_ids = next_possible_gate_section_ids
            possible_chat_source_section_ids = next_possible_chat_source_section_ids
        blocked_gate_section_ids = {
            gate_section_id
            for gate_section_id in graph.gate_section_ids
            if gate_section_id not in fired_gate_section_ids
            and gate_section_id not in possible_gate_section_ids
        }
        blocked_gate_details_by_section_id = {
            str(gate_section_id): self._build_blocked_gate_detail(
                gate_section_id=gate_section_id,
                graph=graph,
                activated_edge_id_set=activated_edge_id_set,
                possible_gate_section_ids=possible_gate_section_ids,
                possible_chat_source_section_ids=possible_chat_source_section_ids,
            )
            for gate_section_id in graph.gate_section_ids
            if gate_section_id in blocked_gate_section_ids
        }
        return StateMachineProgressState(
            possible_gate_section_ids=possible_gate_section_ids,
            possible_chat_source_section_ids=possible_chat_source_section_ids,
            blocked_gate_section_ids=blocked_gate_section_ids,
            blocked_gate_details_by_section_id=blocked_gate_details_by_section_id,
        )

    def _build_blocked_gate_detail(
        self,
        *,
        gate_section_id: ID,
        graph: ResolvedStateMachineGraph,
        activated_edge_id_set: set[str],
        possible_gate_section_ids: set[ID],
        possible_chat_source_section_ids: set[ID],
    ) -> dict[str, object]:
        gate_impl = get_curr_effective_section_impl_with_type_guard(
            graph.project_state,
            gate_section_id,
            StateMachineGateSectionImpl,
        )
        incoming_edges = [
            edge
            for edge in graph.machine_edges
            if edge.targetSectionId == gate_section_id
        ]
        activated_edge_ids = [
            str(edge.id)
            for edge in incoming_edges
            if str(edge.id) in activated_edge_id_set
        ]
        required_edge_ids = [
            str(edge.id)
            for edge in incoming_edges
            if str(edge.id) not in activated_edge_id_set
        ]
        impossible_edge_ids = [
            str(edge.id)
            for edge in incoming_edges
            if str(edge.id) not in activated_edge_id_set
            and not self._edge_source_can_activate_later(
                edge=edge,
                graph=graph,
                possible_gate_section_ids=possible_gate_section_ids,
                possible_chat_source_section_ids=possible_chat_source_section_ids,
            )
        ]
        return {
            "gateSectionId": str(gate_section_id),
            "gateType": gate_impl.gateType.value,
            "activatedEdgeIds": activated_edge_ids,
            "requiredEdgeIds": required_edge_ids,
            "impossibleEdgeIds": impossible_edge_ids,
        }

    def _gate_can_satisfy_later(
        self,
        *,
        gate_section_id: ID,
        graph: ResolvedStateMachineGraph,
        activated_edge_id_set: set[str],
        possible_gate_section_ids: set[ID],
        possible_chat_source_section_ids: set[ID],
    ) -> bool:
        gate_impl = get_curr_effective_section_impl_with_type_guard(
            graph.project_state,
            gate_section_id,
            StateMachineGateSectionImpl,
        )
        incoming_edges = [
            edge
            for edge in graph.machine_edges
            if edge.targetSectionId == gate_section_id
        ]
        possible_edge_count = 0
        for edge in incoming_edges:
            if str(edge.id) in activated_edge_id_set:
                continue
            if self._edge_source_can_activate_later(
                edge=edge,
                graph=graph,
                possible_gate_section_ids=possible_gate_section_ids,
                possible_chat_source_section_ids=possible_chat_source_section_ids,
            ):
                possible_edge_count += 1
                continue
            if gate_impl.gateType == StateMachineGateType.AND:
                return False
        if gate_impl.gateType == StateMachineGateType.AND:
            return possible_edge_count > 0
        return possible_edge_count > 0

    def _edge_source_can_activate_later(
        self,
        *,
        edge: StateMachineEdge,
        graph: ResolvedStateMachineGraph,
        possible_gate_section_ids: set[ID],
        possible_chat_source_section_ids: set[ID],
    ) -> bool:
        source_impl = get_curr_effective_section_impl(
            graph.project_state,
            edge.sourceSectionId,
        )
        if isinstance(source_impl, StateMachineStartSectionImpl):
            return False
        if isinstance(source_impl, StateMachineGateSectionImpl):
            return edge.sourceSectionId in possible_gate_section_ids
        if not isinstance(source_impl, ChatSectionImpl):
            return False
        source_filter = edge.sourceFilter
        if (
            source_filter is not None
            and source_filter.type == StateMachineSourceFilterType.signal
        ):
            return False
        return edge.sourceSectionId in possible_chat_source_section_ids

    def _get_activated_edge_id_set(self, run: AgentRun) -> set[str]:
        return set(self._get_output_str_list(run, "activatedEdgeIds"))

    def _append_dispatched_edge_actions(
        self,
        run: AgentRun,
        dispatched_actions: list[dict[str, object]],
    ) -> None:
        all_dispatched_actions = self._get_output_list_of_dicts(
            run,
            "dispatchedEdgeActions",
        )
        all_dispatched_actions.extend(dispatched_actions)

    def _mark_signal_event_processed(
        self,
        run: AgentRun,
        signal_event: dict[str, object],
    ) -> None:
        processed_signal_event_ids = self._get_output_str_list(
            run,
            "processedSignalEventIds",
        )
        signal_event_id = self._get_signal_event_id(signal_event)
        if signal_event_id in processed_signal_event_ids:
            return
        processed_signal_event_ids.append(signal_event_id)

    def _get_unprocessed_signal_events(
        self,
        *,
        run: AgentRun,
    ) -> list[dict[str, object]]:
        processed_signal_event_ids = set(
            self._get_output_str_list(run, "processedSignalEventIds")
        )
        current_iteration = self._get_state_machine_iteration(run)
        signal_events = self._get_output_list_of_dicts(run, "signalEvents")
        unprocessed_signal_events: list[dict[str, object]] = []
        for signal_event in signal_events:
            if self._get_signal_event_iteration(signal_event) != current_iteration:
                continue
            signal_event_id = self._get_signal_event_id(signal_event)
            if signal_event_id in processed_signal_event_ids:
                continue
            unprocessed_signal_events.append(signal_event)
        return unprocessed_signal_events

    def _mark_child_run_processed(self, run: AgentRun, child_run_id: ID) -> None:
        processed_child_terminal_run_ids = self._get_output_str_list(
            run,
            "processedChildTerminalRunIds",
        )
        raw_child_run_id = str(child_run_id)
        if raw_child_run_id in processed_child_terminal_run_ids:
            return
        processed_child_terminal_run_ids.append(raw_child_run_id)

    def _get_unprocessed_terminal_child_runs(
        self,
        *,
        run: AgentRun,
        project_config_id: ID,
    ) -> list[AgentRun]:
        processed_child_terminal_run_ids = set(
            self._get_output_str_list(run, "processedChildTerminalRunIds")
        )
        current_iteration = self._get_state_machine_iteration(run)
        terminal_runs: list[AgentRun] = []
        for child_run in self._list_child_runs(
            run=run,
            project_config_id=project_config_id,
        ):
            if child_run.status not in {
                AgentRunStatus.completed,
                AgentRunStatus.failed,
            }:
                continue
            if self._get_child_run_iteration(child_run) != current_iteration:
                continue
            if str(child_run.id) in processed_child_terminal_run_ids:
                continue
            terminal_runs.append(child_run)
        terminal_runs.sort(key=get_run_last_updated)
        return terminal_runs

    def _record_child_terminal_event(self, run: AgentRun, child_run: AgentRun) -> None:
        child_section_id = self._get_child_target_section_id(child_run)
        self._record_event(
            run,
            f"child_run_{child_run.status.value}",
            {
                "childRunId": str(child_run.id),
                "sourceSectionId": str(child_section_id),
                "stateMachineIteration": self._get_child_run_iteration(child_run),
            },
        )

    async def _activate_signal_event(
        self,
        *,
        run: AgentRun,
        graph: ResolvedStateMachineGraph,
        signal_event: dict[str, object],
        project_config_id: ID,
        share_session_id: str | None,
    ) -> list[dict[str, object]]:
        source_section_id = self._get_signal_event_source_section_id(signal_event)
        matching_edges = [
            edge
            for edge in graph.machine_edges
            if edge.sourceSectionId == source_section_id
            and self._edge_matches_signal_event(edge, signal_event)
        ]
        if not matching_edges:
            return []
        self._record_event(
            run,
            "signal_edges_activated",
            {
                "signalEventId": self._get_signal_event_id(signal_event),
                "signalName": self._get_signal_event_name(signal_event),
                "edgeIds": [str(edge.id) for edge in matching_edges],
                "sourceSectionId": str(source_section_id),
            },
        )
        return await self._activate_ready_edges(
            run=run,
            graph=graph,
            edges=matching_edges,
            project_config_id=project_config_id,
            share_session_id=share_session_id,
        )

    async def _activate_child_run_edges(
        self,
        *,
        run: AgentRun,
        graph: ResolvedStateMachineGraph,
        child_run: AgentRun,
        project_config_id: ID,
        share_session_id: str | None,
    ) -> list[dict[str, object]]:
        source_section_id = self._get_child_target_section_id(child_run)
        matching_edges = [
            edge
            for edge in graph.machine_edges
            if edge.sourceSectionId == source_section_id
            and self._edge_matches_child_terminal_run(edge, child_run)
        ]
        if not matching_edges:
            return []
        self._record_event(
            run,
            "child_run_edges_activated",
            {
                "childRunId": str(child_run.id),
                "edgeIds": [str(edge.id) for edge in matching_edges],
                "sourceSectionId": str(source_section_id),
            },
        )
        return await self._activate_ready_edges(
            run=run,
            graph=graph,
            edges=matching_edges,
            project_config_id=project_config_id,
            share_session_id=share_session_id,
        )

    def _edge_matches_child_terminal_run(
        self,
        edge: StateMachineEdge,
        child_run: AgentRun,
    ) -> bool:
        source_filter = edge.sourceFilter
        if source_filter is None:
            return child_run.status == AgentRunStatus.completed
        if source_filter.type == StateMachineSourceFilterType.run_completed:
            return child_run.status == AgentRunStatus.completed
        if source_filter.type == StateMachineSourceFilterType.run_failed:
            return child_run.status == AgentRunStatus.failed
        return False

    def _edge_matches_signal_event(
        self,
        edge: StateMachineEdge,
        signal_event: dict[str, object],
    ) -> bool:
        source_filter = edge.sourceFilter
        if source_filter is None:
            return False
        if source_filter.type != StateMachineSourceFilterType.signal:
            return False
        if source_filter.signalName != self._get_signal_event_name(signal_event):
            return False
        if source_filter.payloadField is None:
            return True
        payload = self._get_signal_event_payload(signal_event)
        raw_value = payload.get(source_filter.payloadField)
        if not isinstance(raw_value, str):
            return False
        return raw_value == source_filter.equals

    def _get_signal_event_id(self, signal_event: dict[str, object]) -> str:
        raw_signal_event_id = signal_event.get("signalEventId")
        if not isinstance(raw_signal_event_id, str) or raw_signal_event_id == "":
            raise KeyError("State machine signal event is missing signalEventId.")
        return raw_signal_event_id

    def _get_signal_event_name(self, signal_event: dict[str, object]) -> str:
        raw_signal_name = signal_event.get("signalName")
        if not isinstance(raw_signal_name, str) or raw_signal_name == "":
            raise KeyError("State machine signal event is missing signalName.")
        return raw_signal_name

    def _get_signal_event_payload(
        self,
        signal_event: dict[str, object],
    ) -> dict[str, object]:
        raw_payload = signal_event.get("payload")
        if not isinstance(raw_payload, dict):
            raise TypeError("State machine signal event payload must be an object.")
        return raw_payload

    def _get_signal_event_source_section_id(
        self,
        signal_event: dict[str, object],
    ) -> ID:
        raw_source_section_id = signal_event.get("sourceSectionId")
        if not isinstance(raw_source_section_id, str) or raw_source_section_id == "":
            raise KeyError("State machine signal event is missing sourceSectionId.")
        return ID(raw_source_section_id)

    def _get_signal_event_iteration(self, signal_event: dict[str, object]) -> int:
        raw_iteration = signal_event.get("stateMachineIteration")
        if not isinstance(raw_iteration, int):
            raise KeyError(
                "State machine signal event is missing stateMachineIteration."
            )
        return raw_iteration

    def _get_child_parent_run_id(self, child_run: AgentRun) -> ID:
        if not isinstance(child_run.inputs, dict):
            raise KeyError(f"Child run {child_run.id} inputs are missing.")
        raw_parent_run_id = child_run.inputs.get("stateMachineRunId")
        if not isinstance(raw_parent_run_id, str) or raw_parent_run_id == "":
            raise KeyError(f"Child run {child_run.id} is missing stateMachineRunId.")
        return ID(raw_parent_run_id)

    def _get_child_target_section_id(self, child_run: AgentRun) -> ID:
        if not isinstance(child_run.inputs, dict):
            raise KeyError(f"Child run {child_run.id} inputs are missing.")
        raw_section_id = child_run.inputs.get("stateMachineTargetSectionId")
        if not isinstance(raw_section_id, str) or raw_section_id == "":
            raise KeyError(
                f"Child run {child_run.id} is missing stateMachineTargetSectionId."
            )
        return ID(raw_section_id)

    def _get_child_run_iteration(self, child_run: AgentRun) -> int:
        if not isinstance(child_run.inputs, dict):
            raise KeyError(f"Child run {child_run.id} inputs are missing.")
        raw_iteration = child_run.inputs.get("stateMachineIteration")
        if not isinstance(raw_iteration, int):
            raise KeyError(
                f"Child run {child_run.id} is missing stateMachineIteration."
            )
        return raw_iteration

    def _resolve_prompt_text(
        self,
        edge_id: ID,
        target_action: StateMachineTargetAction,
    ) -> str:
        inline_prompt = target_action.inlinePrompt
        if inline_prompt is not None and inline_prompt.strip() != "":
            return inline_prompt
        if target_action.promptTemplateId is None:
            raise ValueError(
                f"State machine edge {edge_id} send_prompt action is missing prompt content."
            )
        prompt_template = load_prompt_template(self.dbe, target_action.promptTemplateId)
        if prompt_template is None:
            raise KeyError(
                f"Prompt template {target_action.promptTemplateId} not found for state machine edge {edge_id}."
            )
        render_result = render_prompt(prompt_template.template, {})
        if render_result.render_error is not None:
            raise ValueError(
                f"State machine edge {edge_id} prompt template {prompt_template.id} failed to render: {render_result.render_error}"
            )
        if render_result.rendered_text.strip() == "":
            raise ValueError(
                f"State machine edge {edge_id} prompt template {prompt_template.id} rendered an empty prompt."
            )
        return render_result.rendered_text

    def _resolve_engine_config_id(
        self,
        edge_id: ID,
        target_impl: ChatSectionImpl,
        target_action: StateMachineTargetAction,
    ) -> ID:
        if target_action.engineConfigId is not None:
            return target_action.engineConfigId
        if target_impl.engineConfigId is not None:
            return target_impl.engineConfigId
        raise KeyError(
            f"Chat section {target_impl.id} is missing engineConfigId for state machine edge {edge_id}."
        )

    def _resolve_permission_mode(
        self,
        target_impl: ChatSectionImpl,
        target_action: StateMachineTargetAction,
    ) -> ChatPermissionMode:
        if target_action.permissionMode is None:
            return target_impl.permissionMode
        return ChatPermissionMode(target_action.permissionMode)

    def _get_chat_section_impl(
        self,
        project_config_id: ID,
        section_id: ID,
        *,
        share_session_id: str | None,
    ) -> ChatSectionImpl:
        project_state = self._get_project_state(
            project_config_id,
            share_session_id=share_session_id,
        )
        return get_curr_effective_section_impl_with_type_guard(
            project_state,
            section_id,
            ChatSectionImpl,
        )

    async def _set_chat_section_chat_id(
        self,
        *,
        project_config_id: ID,
        section_id: ID,
        chat_id: ID | None,
        share_session_id: str | None,
    ) -> None:
        manager = self.project_manager_switcher.get(
            project_config_id,
            share_session_id=share_session_id,
        )
        await manager.set_chat_section_chat_id(
            SetChatSectionChatIdRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                chatId=chat_id,
            )
        )

    async def _stop_chat_if_running(
        self,
        *,
        chat_id: ID,
        project_config_id: ID,
    ) -> AgentRun | None:
        runs = list_agent_runs_by_metadata(
            self.dbe,
            chat_id=chat_id,
            project_config_id=project_config_id,
        )
        running_runs = [run for run in runs if run.status == AgentRunStatus.running]
        if not running_runs:
            return None
        running_runs.sort(key=get_run_last_updated, reverse=True)
        latest_run = running_runs[0]
        if is_external_agent_run(latest_run):
            return await self.external_agent_runner.stop_run(latest_run.id)
        return await self.agent_runner.stop_run(latest_run.id)

    def _list_child_runs(
        self,
        *,
        run: AgentRun,
        project_config_id: ID,
    ) -> list[AgentRun]:
        runs = list_agent_runs_by_metadata(
            self.dbe,
            project_config_id=project_config_id,
        )
        child_runs: list[AgentRun] = []
        for child_run in runs:
            if child_run.id == run.id:
                continue
            if not isinstance(child_run.inputs, dict):
                continue
            raw_parent_run_id = child_run.inputs.get("stateMachineRunId")
            if raw_parent_run_id != str(run.id):
                continue
            raw_parent_run_type = child_run.inputs.get("stateMachineParentRunType")
            if raw_parent_run_type != STATE_MACHINE_RUN_TYPE:
                continue
            child_runs.append(child_run)
        child_runs.sort(key=get_run_last_updated, reverse=True)
        return child_runs

    async def _stop_running_child_runs(
        self,
        *,
        run: AgentRun,
        project_config_id: ID,
    ) -> list[str]:
        stopped_child_run_ids: list[str] = []
        for child_run in self._list_child_runs(
            run=run,
            project_config_id=project_config_id,
        ):
            if child_run.status != AgentRunStatus.running:
                continue
            if is_external_agent_run(child_run):
                stopped_run = await self.external_agent_runner.stop_run(child_run.id)
            else:
                stopped_run = await self.agent_runner.stop_run(child_run.id)
            stopped_child_run_ids.append(str(stopped_run.id))
        return stopped_child_run_ids

    def _get_output_str_list(self, run: AgentRun, key: str) -> list[str]:
        raw_value = self._get_output_value(run, key)
        if not isinstance(raw_value, list):
            raise TypeError(f"State machine run output {key} must be a list.")
        for entry in raw_value:
            if not isinstance(entry, str):
                raise TypeError(
                    f"State machine run output {key} entries must all be strings."
                )
        return raw_value

    def _get_output_dict(self, run: AgentRun, key: str) -> dict[str, object]:
        raw_value = self._get_output_value(run, key)
        if not isinstance(raw_value, dict):
            raise TypeError(f"State machine run output {key} must be an object.")
        return raw_value

    def _get_output_list_of_dicts(
        self,
        run: AgentRun,
        key: str,
    ) -> list[dict[str, object]]:
        raw_value = self._get_output_value(run, key)
        if not isinstance(raw_value, list):
            raise TypeError(f"State machine run output {key} must be a list.")
        for entry in raw_value:
            if not isinstance(entry, dict):
                raise TypeError(
                    f"State machine run output {key} entries must all be objects."
                )
        return raw_value

    def _get_output_value(self, run: AgentRun, key: str) -> object:
        if not isinstance(run.outputs, dict):
            raise KeyError("State machine run outputs are missing.")
        if key not in run.outputs:
            raise KeyError(f"State machine run output {key} is missing.")
        return run.outputs[key]
