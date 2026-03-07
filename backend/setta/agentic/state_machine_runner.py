import logging
from dataclasses import dataclass

from setta.agentic.chat_view import get_run_last_updated, is_external_agent_run
from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.agentic.managed_chat_dispatch import (
    ManagedChatDispatcher,
    ManagedChatDispatchRequest,
)
from setta.agentic.store import (
    create_agent_run,
    list_agent_runs_by_metadata,
    load_prompt_template,
    save_agent_run,
)
from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.llm.prompt_renderer import render_prompt
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.project_manager_types import SetChatSectionChatIdRequest
from setta.types.agentic import AgentRun, AgentRunStatus, RunEvent
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
    StateMachineStartSectionImpl,
)
from setta.types.state_machine_edges import (
    StateMachineEdge,
    StateMachineTargetAction,
    StateMachineTargetActionType,
    StateMachineThreadStrategy,
)
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
        agent_runner: AgentRunner,
        external_agent_runner: ExternalAgentRunner,
    ) -> None:
        self.dbe = dbe
        self.project_manager_switcher = project_manager_switcher
        self.agent_runner = agent_runner
        self.external_agent_runner = external_agent_runner
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
        try:
            dispatched_actions = await self._activate_start_edges(
                run=run,
                graph=graph,
                project_config_id=project_config_id,
                share_session_id=share_session_id,
            )
        except Exception as exc:
            run.status = AgentRunStatus.failed
            run.finishedAt = get_now_timestamp()
            save_agent_run(self.dbe, run)
            self._record_event(
                run,
                "start_edge_action_failed",
                {
                    "error": str(exc),
                },
            )
            raise
        if run.outputs is None:
            raise KeyError("State machine run outputs were not initialized.")
        run.outputs["dispatchedStartEdgeActions"] = dispatched_actions
        save_agent_run(self.dbe, run)
        if dispatched_actions:
            self._record_event(
                run,
                "start_edge_actions_dispatched",
                {
                    "actions": dispatched_actions,
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

    async def _activate_start_edges(
        self,
        *,
        run: AgentRun,
        graph: ResolvedStateMachineGraph,
        project_config_id: ID,
        share_session_id: str | None,
    ) -> list[dict[str, object]]:
        action_results: list[dict[str, object]] = []
        for edge in graph.start_outgoing_edges:
            action_result = await self._activate_edge_action(
                run=run,
                edge=edge,
                project_config_id=project_config_id,
                share_session_id=share_session_id,
            )
            if action_result is None:
                continue
            action_results.append(action_result)
        return action_results

    async def _activate_edge_action(
        self,
        *,
        run: AgentRun,
        edge: StateMachineEdge,
        project_config_id: ID,
        share_session_id: str | None,
    ) -> dict[str, object] | None:
        project_state = self._get_project_state(
            project_config_id,
            share_session_id=share_session_id,
        )
        target_impl = get_curr_effective_section_impl(
            project_state, edge.targetSectionId
        )
        if not isinstance(target_impl, ChatSectionImpl):
            return None
        target_action = edge.targetAction
        if target_action is None:
            raise ValueError(
                f"State machine edge {edge.id} is missing a Chat target action."
            )
        if target_action.type == StateMachineTargetActionType.reset_thread:
            return await self._reset_thread_action(
                run=run,
                edge=edge,
                target_action=target_action,
                project_config_id=project_config_id,
                share_session_id=share_session_id,
            )
        return await self._send_prompt_action(
            run=run,
            edge=edge,
            target_action=target_action,
            project_config_id=project_config_id,
            share_session_id=share_session_id,
        )

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
            "start_edge_action_reset",
            action_result,
        )
        return action_result

    async def _send_prompt_action(
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
            )
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
        }
        self._record_event(
            run,
            "start_edge_action_dispatched",
            action_result,
        )
        return action_result

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
