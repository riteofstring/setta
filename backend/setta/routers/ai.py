from fastapi import HTTPException
from pydantic import BaseModel

from setta.agentic.chat_view import (
    LLM_CHAT_RUN_TYPE,
    build_chat_state_from_run,
    derive_chat_name,
    get_run_chat_id,
    get_run_last_updated,
    get_run_llm_config_id,
    get_run_project_config_id,
    get_run_sort_key,
    is_llm_chat_run,
)
from setta.agentic.store import list_agent_runs, require_agent_profile
from setta.database.utils import create_new_id
from setta.logging.project_id_route import require_project_context
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
from setta.types.agentic import AgentProfile, AgentRun, AgentRunStatus
from setta.types.chat import ChatMetadata
from setta.types.generated.chat_messages import (
    BaseChatMessageUnion,
    BaseChatMessageUnionWithDiscriminator,
)
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.types.routes import Route
from setta.types.websocket import AIFollowToolArgumentsUpdateContent

router = SettaProjectContextAPIRouter()


def _chat_manager_kwargs(ctx: RuntimeContextFromRequest) -> dict[str, str]:
    if ctx.share_mode:
        return {"share_session_id": ctx.share_session_id}
    return {}


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


class DeleteLLMChatRequest(BaseModel):
    chatId: ID


class GetLLMChatRequest(BaseModel):
    chatId: ID
    projectConfigId: ID | None


class GetLLMChatRequestResponse(BaseModel):
    messages: list[BaseChatMessageUnionWithDiscriminator]
    waitingForResponse: bool
    llmConfig: LLMConfig


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
    if ctx.share_mode:
        if x.llmConfigId is None:
            raise HTTPException(status_code=400, detail="LLM config is required")
        chat_manager_kwargs = _chat_manager_kwargs(ctx)
        try:
            chat = ctx.state.chat_manager.get_or_create_chat(
                x.chatId,
                x.message,
                x.llmConfigId,
                **chat_manager_kwargs,
            )
        except Exception as exc:
            raise HTTPException(
                status_code=500, detail="Failed to enqueue LLM request"
            ) from exc

        if chat:
            ctx.state.chat_manager.start_processing_query(
                chat,
                x.deepThink,
                x.projectConfigId,
                **chat_manager_kwargs,
            )
            return chat.id
        return None

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


@router.post(Route.GET_ALL_LLM_CHAT_METADATA)
async def route_get_all_llm_chat_metadata(
    ctx: RuntimeContextFromRequest,
) -> list[ChatMetadata]:
    await ctx.enforce_llm_allowed()
    if ctx.share_mode:
        return ctx.state.chat_manager.get_all_chat_metadata(**_chat_manager_kwargs(ctx))

    runs = _get_llm_chat_runs(dbe=ctx.state.dbe)
    latest_by_chat: dict[ID, AgentRun] = {}
    for run in runs:
        chat_id = get_run_chat_id(run)
        if chat_id is None:
            continue
        existing = latest_by_chat.get(chat_id)
        if existing is None or get_run_sort_key(run) > get_run_sort_key(existing):
            latest_by_chat[chat_id] = run

    metadata: list[ChatMetadata] = []
    for chat_id, run in latest_by_chat.items():
        llm_config_id = get_run_llm_config_id(run)
        if not llm_config_id:
            continue
        llm_config = ctx.state.agent_runner.config.resolve_config(llm_config_id)
        state = build_chat_state_from_run(run)
        metadata.append(
            ChatMetadata(
                id=chat_id,
                name=derive_chat_name(state.messages),
                lastUpdated=get_run_last_updated(run),
                llmConfig=llm_config,
                projectConfigId=get_run_project_config_id(run),
            )
        )
    return metadata


@router.post(Route.DELETE_LLM_CHAT)
async def route_delete_llm_chat(
    x: DeleteLLMChatRequest,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    if ctx.share_mode:
        return ctx.state.chat_manager.delete_chat(
            x.chatId,
            **_chat_manager_kwargs(ctx),
        )

    runs = _get_llm_chat_runs(dbe=ctx.state.dbe, chat_id=x.chatId)
    for run in runs:
        if run.status == AgentRunStatus.running:
            await ctx.state.agent_runner.stop_run(run.id)
        ctx.state.dbe.delete_agent_run_file(run.id)
    return None


@router.post(Route.STOP_LLM_CHAT)
async def route_stop_llm_chat(
    x: StopLLMChatRequest,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    if ctx.share_mode:
        await ctx.state.chat_manager.request_stop_streaming(
            x.chatId,
            **_chat_manager_kwargs(ctx),
        )
        return None

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
    if ctx.share_mode:
        chat = ctx.state.chat_manager.get_chat(
            x.chatId,
            **_chat_manager_kwargs(ctx),
        )
        if not chat:
            raise HTTPException(status_code=404, detail="Chat not found")

        waiting_for_response = ctx.state.chat_manager.is_waiting_for_response(
            x.chatId,
            **_chat_manager_kwargs(ctx),
        )
        current_stream = ctx.state.chat_manager.get_current_stream(
            x.chatId,
            **_chat_manager_kwargs(ctx),
        )
        messages = chat.messages
        merge_db_messages_with_current_stream(messages, current_stream)
        return GetLLMChatRequestResponse(
            messages=messages,
            waitingForResponse=waiting_for_response,
            llmConfig=chat.llmConfig,
        )

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


@router.post(Route.GET_AI_FOLLOW_SNAPSHOT)
@require_project_context()
async def route_get_ai_follow_snapshot(
    x: GetAIFollowSnapshotRequest,
    ctx: RuntimeContextFromRequest,
) -> list[AIFollowToolArgumentsUpdateContent]:
    await ctx.enforce_llm_allowed()
    if ctx.share_mode:
        return ctx.state.chat_manager.get_ai_follow_snapshot(
            x.projectConfigId,
            **_chat_manager_kwargs(ctx),
        )
    return ctx.state.agent_runner.get_ai_follow_snapshot(x.projectConfigId)


def merge_db_messages_with_current_stream(
    db_messages: list[BaseChatMessageUnion], current_stream: list[BaseChatMessageUnion]
):
    # Create a set of existing message IDs for efficient lookup
    existing_ids = {message.id for message in db_messages}

    # Loop through current_stream and append messages that aren't already in chat
    for message in current_stream:
        if message.id not in existing_ids:
            db_messages.append(message)
            # Add to existing_ids to track what we've added
            existing_ids.add(message.id)
