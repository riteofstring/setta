from fastapi import HTTPException
from pydantic import BaseModel, Field

from setta.agentic.chat_view import (
    LLM_CHAT_RUN_TYPE,
    build_chat_state_from_run,
    get_run_chat_id,
    get_run_llm_config_id,
    get_run_project_config_id,
    get_run_sort_key,
    is_external_agent_run,
    is_llm_chat_run,
)
from setta.agentic.store import list_agent_runs, require_agent_profile
from setta.database.utils import create_new_id
from setta.logging.project_id_route import require_project_context
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
from setta.types.agentic import AgentProfile, AgentRun, AgentRunStatus
from setta.types.generated.chat_messages import (
    BaseChatMessageUnion,
    BaseChatMessageUnionWithDiscriminator,
)
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.types.routes import Route
from setta.types.websocket import AIFollowToolArgumentsUpdateContent

router = SettaProjectContextAPIRouter()


def _get_llm_chat_runs(
    *,
    dbe,
    chat_id: ID | None = None,
    project_config_id: ID | None = None,
) -> list[AgentRun]:
    runs = [run for run in list_agent_runs(dbe) if is_llm_chat_run(run)]
    if chat_id is not None:
        runs = [run for run in runs if get_run_chat_id(run) == chat_id]
    if project_config_id is not None:
        runs = [
            run for run in runs if get_run_project_config_id(run) == project_config_id
        ]
    return runs


def _get_external_agent_chat_runs(
    *,
    dbe,
    chat_id: ID | None = None,
    project_config_id: ID | None = None,
) -> list[AgentRun]:
    runs = [run for run in list_agent_runs(dbe) if is_external_agent_run(run)]
    if chat_id is not None:
        runs = [run for run in runs if get_run_chat_id(run) == chat_id]
    if project_config_id is not None:
        runs = [
            run for run in runs if get_run_project_config_id(run) == project_config_id
        ]
    return runs


def _select_latest_run(runs: list[AgentRun]) -> AgentRun | None:
    if not runs:
        return None
    return max(runs, key=get_run_sort_key)


def _build_inputs_messages(
    *,
    prior_messages: list[BaseChatMessageUnion],
    message: BaseChatMessageUnionWithDiscriminator,
) -> list[BaseChatMessageUnion]:
    existing_ids = {entry.id for entry in prior_messages}
    if message.id in existing_ids:
        return list(prior_messages)
    return list(prior_messages) + [message]


class GetLLMResponseRequest(BaseModel):
    chatId: ID | None
    message: BaseChatMessageUnionWithDiscriminator
    llmConfigId: str | None
    agentProfileId: ID | None = None
    deepThink: bool
    projectConfigId: ID


class GetLLMChatRequest(BaseModel):
    chatId: ID
    projectConfigId: ID | None


class GetLLMChatRequestResponse(BaseModel):
    messages: list[BaseChatMessageUnionWithDiscriminator]
    waitingForResponse: bool
    llmConfig: LLMConfig


class GetExternalAgentChatRequest(BaseModel):
    chatId: ID
    projectConfigId: ID | None


class GetExternalAgentChatResponse(BaseModel):
    messages: list[BaseChatMessageUnionWithDiscriminator]
    waitingForResponse: bool
    toolCallArguments: dict[str, str] = Field(default_factory=dict)


class StopLLMChatRequest(BaseModel):
    chatId: ID


class GetAIFollowSnapshotRequest(BaseModel):
    projectConfigId: ID


@router.post(Route.GET_LLM_RESPONSE)
@require_project_context()
async def route_get_llm_response(
    x: GetLLMResponseRequest,
    ctx: RuntimeContextFromRequest,
) -> str | None:
    await ctx.enforce_llm_allowed()
    if ctx.state.agent_runner.disabled:
        raise HTTPException(status_code=503, detail="Agent runner is not available")

    chat_id = x.chatId or create_new_id()
    prior_messages: list[BaseChatMessageUnion] = []
    if x.chatId is not None:
        runs = _get_llm_chat_runs(
            dbe=ctx.state.dbe,
            chat_id=chat_id,
            project_config_id=x.projectConfigId,
        )
        latest_run = _select_latest_run(runs)
        if latest_run is not None:
            prior_messages = build_chat_state_from_run(latest_run).messages
    combined_messages = _build_inputs_messages(
        prior_messages=prior_messages,
        message=x.message,
    )
    if x.agentProfileId is not None:
        try:
            profile = require_agent_profile(ctx.state.dbe, x.agentProfileId)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        if x.llmConfigId is not None:
            profile = profile.model_copy(update={"llmConfigId": x.llmConfigId})
    else:
        profile = AgentProfile(
            name="Managed chat",
            description="",
            systemPrompt="",
            llmConfigId=x.llmConfigId,
        )

    inputs = {
        "chatId": str(chat_id),
        "projectConfigId": str(x.projectConfigId),
        "deepThink": x.deepThink,
        "llmConfigId": x.llmConfigId,
        "runType": LLM_CHAT_RUN_TYPE,
        "messages": [message.model_dump(mode="json") for message in combined_messages],
    }
    ctx.state.agent_runner.start_run(profile, inputs)
    return chat_id


@router.post(Route.STOP_LLM_CHAT)
async def route_stop_llm_chat(
    x: StopLLMChatRequest,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    runs = _get_llm_chat_runs(dbe=ctx.state.dbe, chat_id=x.chatId)
    running_runs = [run for run in runs if run.status == AgentRunStatus.running]
    latest_run = _select_latest_run(running_runs)
    if latest_run is None:
        return None
    await ctx.state.agent_runner.stop_run(latest_run.id)
    return None


@router.post(Route.GET_LLM_CHAT)
async def route_get_llm_chat(
    x: GetLLMChatRequest,
    ctx: RuntimeContextFromRequest,
) -> GetLLMChatRequestResponse:
    await ctx.enforce_llm_allowed()
    runs = _get_llm_chat_runs(
        dbe=ctx.state.dbe,
        chat_id=x.chatId,
        project_config_id=x.projectConfigId,
    )
    latest_run = _select_latest_run(runs)
    if latest_run is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    state = build_chat_state_from_run(latest_run)
    llm_config_id = get_run_llm_config_id(latest_run)
    if not llm_config_id:
        raise HTTPException(status_code=500, detail="Chat LLM config not found")
    llm_config = ctx.state.agent_runner.config.resolve_config(llm_config_id)
    return GetLLMChatRequestResponse(
        messages=state.messages,
        waitingForResponse=state.waitingForResponse,
        llmConfig=llm_config,
    )


@router.post(Route.GET_EXTERNAL_AGENT_CHAT)
async def route_get_external_agent_chat(
    x: GetExternalAgentChatRequest,
    ctx: RuntimeContextFromRequest,
) -> GetExternalAgentChatResponse:
    await ctx.enforce_llm_allowed()
    runs = _get_external_agent_chat_runs(
        dbe=ctx.state.dbe,
        chat_id=x.chatId,
        project_config_id=x.projectConfigId,
    )
    latest_run = _select_latest_run(runs)
    if latest_run is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    state = build_chat_state_from_run(latest_run)
    return GetExternalAgentChatResponse(
        messages=state.messages,
        waitingForResponse=state.waitingForResponse,
        toolCallArguments=state.toolCallArguments,
    )


@router.post(Route.GET_AI_FOLLOW_SNAPSHOT)
@require_project_context()
async def route_get_ai_follow_snapshot(
    x: GetAIFollowSnapshotRequest,
    ctx: RuntimeContextFromRequest,
) -> list[AIFollowToolArgumentsUpdateContent]:
    await ctx.enforce_llm_allowed()
    snapshot = ctx.state.agent_runner.get_ai_follow_snapshot(x.projectConfigId)
    external_runner = ctx.state.external_agent_runner
    if external_runner and not external_runner.disabled:
        snapshot.extend(external_runner.get_ai_follow_snapshot(x.projectConfigId))
    return snapshot
