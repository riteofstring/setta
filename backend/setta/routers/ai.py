from fastapi import HTTPException
from pydantic import BaseModel

from setta.logging.project_id_route import require_project_context
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
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


class GetLLMResponseRequest(BaseModel):
    chatId: ID | None
    message: BaseChatMessageUnionWithDiscriminator
    llmConfigId: str
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
    chat_manager_kwargs = _chat_manager_kwargs(ctx)
    try:
        chat = ctx.state.chat_manager.get_or_create_chat(
            x.chatId,
            x.message,
            x.llmConfigId,
            x.projectConfigId,
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
            **chat_manager_kwargs,
        )
        return chat.id


@router.post(Route.GET_ALL_LLM_CHAT_METADATA)
async def route_get_all_llm_chat_metadata(
    ctx: RuntimeContextFromRequest,
) -> list[ChatMetadata]:
    await ctx.enforce_llm_allowed()
    return ctx.state.chat_manager.get_all_chat_metadata(**_chat_manager_kwargs(ctx))


@router.post(Route.DELETE_LLM_CHAT)
async def route_delete_llm_chat(
    x: DeleteLLMChatRequest,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    return ctx.state.chat_manager.delete_chat(
        x.chatId,
        **_chat_manager_kwargs(ctx),
    )


@router.post(Route.STOP_LLM_CHAT)
async def route_stop_llm_chat(
    x: StopLLMChatRequest,
    ctx: RuntimeContextFromRequest,
) -> None:
    await ctx.enforce_llm_allowed()
    await ctx.state.chat_manager.request_stop_streaming(
        x.chatId,
        **_chat_manager_kwargs(ctx),
    )


@router.post(Route.GET_LLM_CHAT)
async def route_get_llm_chat(
    x: GetLLMChatRequest,
    ctx: RuntimeContextFromRequest,
) -> GetLLMChatRequestResponse:
    await ctx.enforce_llm_allowed()
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


@router.post(Route.GET_AI_FOLLOW_SNAPSHOT)
@require_project_context()
async def route_get_ai_follow_snapshot(
    x: GetAIFollowSnapshotRequest,
    ctx: RuntimeContextFromRequest,
) -> list[AIFollowToolArgumentsUpdateContent]:
    await ctx.enforce_llm_allowed()
    return ctx.state.chat_manager.get_ai_follow_snapshot(
        x.projectConfigId,
        **_chat_manager_kwargs(ctx),
    )


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
