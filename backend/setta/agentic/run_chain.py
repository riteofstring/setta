import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any

from setta.agentic.engine_resolver import resolve_engine_config
from setta.agentic.external_agent_preflight import build_external_agent_preflight_status
from setta.agentic.external_tool_allowlist import build_external_tool_allowlist
from setta.agentic.store import (
    create_agent_run,
    load_agent_run,
    require_agent_profile,
    save_agent_run,
)
from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.logging.tasks import spawn_background_task
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.types.agentic import (
    AgentProfile,
    AgentRun,
    AgentRunStatus,
    EngineType,
    RunChainSpec,
    RunChainStep,
    RunEvent,
)
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.id import ID
from setta.utils.timestamps import get_now_timestamp
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

from .external_agent_runner import ExternalAgentRunner

logger = logging.getLogger(__name__)

_CHAIN_RUN_TYPE = "run_chain"
_CHAIN_STEP_RUN_TYPE = "run_chain_step"
_CHAIN_INPUT_KEYS = ("projectConfigId", "chatId", "sectionId", "thinking")


@dataclass(frozen=True)
class _ActiveStepState:
    run_id: ID
    engine_type: EngineType


class RunChainRunner:
    def __init__(
        self,
        dbe: DBE,
        agent_runner: AgentRunner,
        external_agent_runner: ExternalAgentRunner,
        frontend_sender: WMHFrontendSender,
    ) -> None:
        self.dbe = dbe
        self.agent_runner = agent_runner
        self.external_agent_runner = external_agent_runner
        self.frontend_sender = frontend_sender
        self._tasks: dict[ID, asyncio.Task[Any]] = {}
        self._runs: dict[ID, AgentRun] = {}
        self._active_steps: dict[ID, _ActiveStepState] = {}

    @property
    def disabled(self) -> bool:
        return False

    def start_run(
        self,
        spec: RunChainSpec,
        inputs: dict[str, Any] | None,
    ) -> AgentRun:
        payload_inputs = dict(inputs or {})
        payload_inputs["runType"] = _CHAIN_RUN_TYPE
        payload_inputs["chainId"] = str(spec.id)
        payload_inputs["chainName"] = spec.name
        payload_inputs["chainSpec"] = spec.model_dump(mode="json")
        run = create_agent_run(profile_id=None, inputs=payload_inputs)
        self._runs[run.id] = run
        save_agent_run(self.dbe, run)
        self._record_event(
            run,
            "chain_started",
            {
                "chainId": str(spec.id),
                "chainRunId": str(run.id),
                "stepCount": len(spec.steps),
            },
        )
        self._record_snapshot(run)
        task = spawn_background_task(
            lambda: self._run_chain(run, spec, payload_inputs),
            label="run-chain",
            extra_values={"run_id": str(run.id)},
        )

        def _cleanup(_task: asyncio.Task[Any], run_id: ID) -> None:
            self._tasks.pop(run_id, None)
            self._runs.pop(run_id, None)
            self._active_steps.pop(run_id, None)

        task.add_done_callback(lambda t, run_id=run.id: _cleanup(t, run_id))
        self._tasks[run.id] = task
        return run

    async def stop_run(self, run_id: ID) -> AgentRun:
        task = self._tasks.get(run_id)
        if task and not task.done():
            task.cancel()
        active = self._active_steps.get(run_id)
        if active is not None:
            if active.engine_type == EngineType.setta_llm:
                await self.agent_runner.stop_run(active.run_id)
            else:
                await self.external_agent_runner.stop_run(active.run_id)
            self._active_steps.pop(run_id, None)
        run = self._runs.get(run_id) or load_agent_run(self.dbe, run_id)
        if run is None:
            raise KeyError(f"Run chain {run_id} not found")
        run.status = AgentRunStatus.cancelled
        run.finishedAt = get_now_timestamp()
        save_agent_run(self.dbe, run)
        self._record_event(run, "chain_cancelled", {})
        return run

    async def wait_for_run(self, run_id: ID, timeout: float | None = None) -> AgentRun:
        task = self._tasks.get(run_id)
        if task is not None:
            if timeout is None:
                await task
            else:
                await asyncio.wait_for(task, timeout=timeout)
        run = self._runs.get(run_id) or load_agent_run(self.dbe, run_id)
        if run is None:
            raise KeyError(f"Run chain {run_id} not found")
        return run

    async def _run_chain(
        self,
        run: AgentRun,
        spec: RunChainSpec,
        chain_inputs: dict[str, Any],
    ) -> None:
        step_summaries: list[dict[str, Any]] = []
        try:
            for idx, step in enumerate(spec.steps):
                self._record_event(
                    run,
                    "step_started",
                    {
                        "stepIndex": idx,
                        "stepId": str(step.id),
                        "engineConfigId": str(step.engineConfigId),
                        "agentProfileId": str(step.agentProfileId)
                        if step.agentProfileId
                        else None,
                    },
                )
                child_run = await self._run_step(
                    step=step,
                    step_index=idx,
                    chain_run_id=run.id,
                    chain_inputs=chain_inputs,
                    previous_outputs=list(step_summaries),
                )
                active = self._active_steps.get(run.id)
                if active is not None and active.run_id == child_run.id:
                    self._active_steps.pop(run.id, None)
                summary = self._build_step_summary(step, child_run)
                step_summaries.append(summary)
                self._update_chain_outputs(run, spec, step_summaries)
                if child_run.status == AgentRunStatus.completed:
                    self._record_event(
                        run,
                        "step_completed",
                        {
                            "stepIndex": idx,
                            "stepId": str(step.id),
                            "runId": str(child_run.id),
                            "status": child_run.status.value,
                        },
                    )
                    continue
                self._record_event(
                    run,
                    "step_failed",
                    {
                        "stepIndex": idx,
                        "stepId": str(step.id),
                        "runId": str(child_run.id),
                        "status": child_run.status.value,
                    },
                )
                if spec.stopOnFailure:
                    run.status = (
                        AgentRunStatus.cancelled
                        if child_run.status == AgentRunStatus.cancelled
                        else AgentRunStatus.failed
                    )
                    run.finishedAt = get_now_timestamp()
                    save_agent_run(self.dbe, run)
                    self._record_event(run, "chain_failed", {})
                    return
            self._update_chain_outputs(run, spec, step_summaries)
            run.status = AgentRunStatus.completed
            run.finishedAt = get_now_timestamp()
            save_agent_run(self.dbe, run)
            self._record_event(run, "chain_completed", {})
        except asyncio.CancelledError:
            run.status = AgentRunStatus.cancelled
            run.finishedAt = get_now_timestamp()
            save_agent_run(self.dbe, run)
            self._record_event(run, "chain_cancelled", {})
            raise
        except Exception as exc:
            logger.exception("Run chain failed", exc_info=exc)
            run.status = AgentRunStatus.failed
            run.finishedAt = get_now_timestamp()
            save_agent_run(self.dbe, run)
            self._record_event(run, "chain_failed", {"error": str(exc)})

    async def _run_step(
        self,
        *,
        step: RunChainStep,
        step_index: int,
        chain_run_id: ID,
        chain_inputs: dict[str, Any],
        previous_outputs: list[dict[str, Any]],
    ) -> AgentRun:
        resolved = resolve_engine_config(
            self.dbe, self.agent_runner.config, step.engineConfigId
        )
        payload_inputs = self._build_step_inputs(
            step=step,
            step_index=step_index,
            chain_run_id=chain_run_id,
            chain_inputs=chain_inputs,
            previous_outputs=previous_outputs,
        )
        profile = self._resolve_step_profile(step)
        profile = profile.model_copy(update={"engineConfigId": step.engineConfigId})
        if resolved.engine_config.engineType == EngineType.setta_llm:
            if self.agent_runner.disabled:
                raise RuntimeError("Agent runner is not available")
            run = self.agent_runner.start_run(
                profile,
                payload_inputs,
                emit_stream=False,
                emit_ai_follow=False,
            )
            self._active_steps[chain_run_id] = _ActiveStepState(
                run_id=run.id,
                engine_type=EngineType.setta_llm,
            )
            return await self.agent_runner.wait_for_run(run.id)
        if resolved.engine_config.engineType == EngineType.external_agent:
            if self.external_agent_runner.disabled:
                raise RuntimeError("External agent runner is not available")
            external_config = resolved.external_agent_config
            if external_config is None:
                raise KeyError("External agent config not found")
            status = build_external_agent_preflight_status(self.dbe, external_config)
            if not status.available:
                issues = (
                    "; ".join(status.issues) if status.issues else "preflight failed"
                )
                raise RuntimeError(f"External agent config is not available: {issues}")
            if profile.toolAllowlist:
                _, error = build_external_tool_allowlist(
                    profile.toolAllowlist,
                    server_id=SETTA_MCP_SERVER_ID,
                )
                if error:
                    raise ValueError(error)
            run = self.external_agent_runner.start_run(
                resolved.engine_config.id,
                external_config,
                profile,
                payload_inputs,
            )
            self._active_steps[chain_run_id] = _ActiveStepState(
                run_id=run.id,
                engine_type=EngineType.external_agent,
            )
            return await self.external_agent_runner.wait_for_run(run.id)
        raise ValueError("Unsupported engine config")

    def _resolve_step_profile(self, step: RunChainStep) -> AgentProfile:
        if step.agentProfileId is not None:
            profile = require_agent_profile(self.dbe, step.agentProfileId)
            return profile
        return AgentProfile(
            name=step.name or "Orchestrated step",
            description="",
            systemPrompt="",
            engineConfigId=step.engineConfigId,
        )

    def _build_step_inputs(
        self,
        *,
        step: RunChainStep,
        step_index: int,
        chain_run_id: ID,
        chain_inputs: dict[str, Any],
        previous_outputs: list[dict[str, Any]],
    ) -> dict[str, Any]:
        payload_inputs: dict[str, Any] = {}
        for key in _CHAIN_INPUT_KEYS:
            if key in chain_inputs and key not in payload_inputs:
                payload_inputs[key] = chain_inputs[key]
        if "chainId" in chain_inputs:
            payload_inputs["chainId"] = chain_inputs["chainId"]
        if "chainName" in chain_inputs:
            payload_inputs["chainName"] = chain_inputs["chainName"]
        if step.inputs:
            payload_inputs.update(step.inputs)
        if "engineConfigId" in payload_inputs:
            raw_engine_config_id = payload_inputs["engineConfigId"]
            if not isinstance(raw_engine_config_id, str):
                raise TypeError("engineConfigId must be a string")
            if raw_engine_config_id != str(step.engineConfigId):
                raise KeyError(
                    "engineConfigId does not match run chain step engine config"
                )
        payload_inputs["engineConfigId"] = str(step.engineConfigId)
        payload_inputs["runType"] = _CHAIN_STEP_RUN_TYPE
        payload_inputs["chainRunId"] = str(chain_run_id)
        payload_inputs["parentRunId"] = str(chain_run_id)
        payload_inputs["stepId"] = str(step.id)
        payload_inputs["stepIndex"] = step_index
        if step.agentProfileId is not None:
            payload_inputs["agentProfileId"] = str(step.agentProfileId)
        if previous_outputs:
            payload_inputs["previousOutputs"] = previous_outputs
        if step.prompt and "prompt" not in payload_inputs:
            payload_inputs["prompt"] = step.prompt
        if step.messages and "messages" not in payload_inputs:
            payload_inputs["messages"] = list(step.messages)
        if step.includePreviousOutputs and previous_outputs:
            context_message = self._build_previous_outputs_message(previous_outputs)
            messages = []
            if "messages" in payload_inputs:
                raw_messages = payload_inputs["messages"]
                if isinstance(raw_messages, list):
                    messages = list(raw_messages)
            messages.insert(0, context_message)
            payload_inputs["messages"] = messages
        return payload_inputs

    def _build_previous_outputs_message(
        self, previous_outputs: list[dict[str, Any]]
    ) -> dict[str, Any]:
        payload = json.dumps(previous_outputs, indent=2, default=str)
        text = f"Previous step outputs:\n{payload}"
        message = UserChatMessage(content=[MessageTextContent(text=text)])
        return message.model_dump(mode="json")

    def _build_step_summary(
        self,
        step: RunChainStep,
        child_run: AgentRun,
    ) -> dict[str, Any]:
        return {
            "stepId": str(step.id),
            "name": step.name,
            "engineConfigId": str(step.engineConfigId),
            "agentProfileId": str(step.agentProfileId) if step.agentProfileId else None,
            "runId": str(child_run.id),
            "status": child_run.status.value,
            "outputs": child_run.outputs,
        }

    def _update_chain_outputs(
        self,
        run: AgentRun,
        spec: RunChainSpec,
        step_summaries: list[dict[str, Any]],
    ) -> None:
        outputs = run.outputs or {}
        outputs["chainId"] = str(spec.id)
        outputs["chainName"] = spec.name
        outputs["steps"] = step_summaries
        run.outputs = outputs
        save_agent_run(self.dbe, run)

    def _record_snapshot(self, run: AgentRun) -> None:
        project_state = self.dbe.read_project_required()
        _, canonical_to_temporary = self.dbe.read_temporary_id_map()
        self._record_event(
            run,
            "snapshot",
            {
                "projectState": project_state.model_dump(mode="json"),
                "temporaryIdMap": {
                    str(k): str(v) for k, v in canonical_to_temporary.items()
                },
            },
        )

    def _record_event(self, run: AgentRun, event_type: str, payload: dict[str, Any]):
        run.events.append(RunEvent(type=event_type, payload=payload))
        save_agent_run(self.dbe, run)
