from fastapi import HTTPException

from setta.agentic.engine_resolver import resolve_engine_config
from setta.llm.chat_store import AgentRunChatStore
from setta.llm.chat_toolkit import ChatHistory, ToolRunner
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.frontend_websocket_id import require_frontend_websocket_id
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
from setta.types.agentic import EngineType
from setta.types.chat import Chat, ChatMetadata
from setta.types.chat_messages import ToolChatMessage
from setta.types.chat_toolkit import (
    AppendChatMessagesRequest,
    CreateChatRequest,
    DeleteChatRequest,
    EmitChatStreamDeltaRequest,
    GetAllChatMetadataRequest,
    GetChatRequest,
    RunMcpToolsRequest,
    SetChatSystemPromptRequest,
)
from setta.types.id import ID
from setta.types.listener import ListenerCoverageRequest, ListenerCoverageSnapshot
from setta.types.llm_config import build_scriptable_llm_config
from setta.types.routes import Route

router = SettaProjectContextAPIRouter(require_project_context_by_default=True)


def _chat_history(ctx: RuntimeContextFromRequest) -> ChatHistory:
    return ChatHistory(AgentRunChatStore(ctx.state.dbe))


def _resolve_engine_llm_config(
    ctx: RuntimeContextFromRequest,
    engine_config_id: ID | None,
):
    if engine_config_id is None:
        return build_scriptable_llm_config()
    resolved = resolve_engine_config(
        ctx.state.dbe,
        ctx.state.agent_runner.config,
        engine_config_id,
    )
    if resolved.engine_config.engineType != EngineType.setta_llm:
        raise HTTPException(status_code=400, detail="Engine config is not internal")
    if resolved.llm_config is None:
        raise HTTPException(status_code=500, detail="Engine config missing LLM config")
    return resolved.llm_config


@router.post(Route.GET_LISTENER_COVERAGE)
async def route_get_listener_coverage(
    x: ListenerCoverageRequest,
    ctx: RuntimeContextFromRequest,
) -> ListenerCoverageSnapshot:
    share_session_id = ctx.share_session_id
    return ctx.state.wmh_python_script_receiver.listener_coverage_tracker.get_snapshot_for_project(
        x.projectConfigId,
        ctx.state.listener_registry.iter_registrations_for_project(
            x.projectConfigId,
            share_session_id=share_session_id,
        ),
        share_session_id=share_session_id,
    )


@router.post(Route.CREATE_CHAT)
async def route_create_chat(
    x: CreateChatRequest,
    ctx: RuntimeContextFromRequest,
) -> Chat:
    await ctx.enforce_llm_allowed()
    history = _chat_history(ctx)
    llm_config = _resolve_engine_llm_config(ctx, x.engineConfigId)
    return history.create(
        first_message=x.firstMessage,
        llm_config=llm_config,
    )


@router.post(Route.GET_CHAT)
async def route_get_chat(
    x: GetChatRequest,
    ctx: RuntimeContextFromRequest,
) -> Chat:
    await ctx.enforce_llm_allowed()
    history = _chat_history(ctx)
    chat = history.get(x.chatId)
    if chat is None:
        raise KeyError(f"Chat {x.chatId} not found")
    return chat


@router.post(Route.APPEND_CHAT_MESSAGES)
async def route_append_chat_messages(
    x: AppendChatMessagesRequest,
    ctx: RuntimeContextFromRequest,
) -> Chat:
    await ctx.enforce_llm_allowed()
    history = _chat_history(ctx)
    return history.append(x.chatId, x.messages)


@router.post(Route.DELETE_CHAT)
async def route_delete_chat(
    x: DeleteChatRequest,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    history = _chat_history(ctx)
    history.delete(x.chatId)


@router.post(Route.SET_CHAT_SYSTEM_PROMPT)
async def route_set_chat_system_prompt(
    x: SetChatSystemPromptRequest,
    ctx: RuntimeContextFromRequest,
) -> Chat:
    await ctx.enforce_llm_allowed()
    history = _chat_history(ctx)
    return history.set_system_prompt(x.chatId, x.systemPrompt)


@router.post(Route.GET_ALL_CHAT_METADATA)
async def route_get_all_chat_metadata(
    _request: GetAllChatMetadataRequest,
    ctx: RuntimeContextFromRequest,
) -> list[ChatMetadata]:
    await ctx.enforce_llm_allowed()
    history = _chat_history(ctx)
    metadata = history.list_metadata()
    return metadata


@router.post(Route.RUN_MCP_TOOLS)
async def route_run_mcp_tools(
    x: RunMcpToolsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[ToolChatMessage]:
    await ctx.enforce_llm_allowed()
    history = _chat_history(ctx)
    chat = history.get(x.chatId)
    if chat is None:
        raise KeyError(f"Chat {x.chatId} not found")
    project_config_id = chat.projectConfigId
    if project_config_id is None:
        raise KeyError(f"Chat {x.chatId} missing project config id")
    server_ids = ctx.state.agent_runner.config.resolve_mcp_server_ids(chat.llmConfig)
    frontend_websocket_id = require_frontend_websocket_id(x.frontendWebsocketId)
    runner = ToolRunner(
        ctx.state.mcp_client,
        allowed_server_ids=set(server_ids),
        share_session_id=ctx.share_session_id,
        project_config_id=project_config_id,
        chat_id=x.chatId,
        section_id=x.sectionId,
        frontend_websocket_id=frontend_websocket_id,
    )
    return await runner.run(x.toolCalls)


@router.post(Route.EMIT_CHAT_STREAM_DELTA)
async def route_emit_chat_stream_delta(
    x: EmitChatStreamDeltaRequest,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    await ctx.frontend_sender.send_streaming_response(
        chatId=x.chatId,
        chunk=x.chunk,
        section_id=x.sectionId,
        project_config_id=x.projectConfigId,
        share_session_id=ctx.share_session_id,
    )
