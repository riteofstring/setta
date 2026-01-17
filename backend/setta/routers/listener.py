from setta.llm.chat_store import DBEChatStore
from setta.llm.chat_toolkit import ChatHistory, ToolRunner
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
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
from setta.types.listener import ListenerCoverageRequest, ListenerCoverageSnapshot
from setta.types.routes import Route

router = SettaProjectContextAPIRouter(require_project_context_by_default=True)


def _chat_history(ctx: RuntimeContextFromRequest) -> ChatHistory:
    return ChatHistory(DBEChatStore(ctx.state.dbe))


def _resolve_llm_config(ctx: RuntimeContextFromRequest, llm_config_id: str):
    return ctx.state.chat_manager.config.resolve_config(llm_config_id)


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
    llm_config = _resolve_llm_config(ctx, x.llmConfigId)
    return history.create(
        first_message=x.firstMessage,
        llm_config=llm_config,
        project_config_id=x.projectConfigId,
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
    x: GetAllChatMetadataRequest,
    ctx: RuntimeContextFromRequest,
) -> list[ChatMetadata]:
    await ctx.enforce_llm_allowed()
    history = _chat_history(ctx)
    metadata = history.list_metadata()
    return [entry for entry in metadata if entry.projectConfigId == x.projectConfigId]


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
    server_ids = ctx.state.chat_manager.config.resolve_mcp_server_ids(chat.llmConfig)
    runner = ToolRunner(
        ctx.state.mcp_client,
        allowed_server_ids=set(server_ids),
        share_session_id=ctx.share_session_id,
    )
    return await runner.run(x.toolCalls)


@router.post(Route.EMIT_CHAT_STREAM_DELTA)
async def route_emit_chat_stream_delta(
    x: EmitChatStreamDeltaRequest,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    await ctx.state.websocket_msg_handler.send_streaming_response(
        chatId=x.chatId,
        chunk=x.chunk,
        section_id=x.sectionId,
        share_session_id=ctx.share_session_id,
    )
