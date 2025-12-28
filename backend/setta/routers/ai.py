from fastapi import HTTPException
from pydantic import BaseModel

from setta.logging.project_id_route import require_project_context
from setta.routers.dependencies import (
    AppStateFromRequest,
    MaybeShareSessionIdFromRequest,
)
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
from setta.share.policy import ensure_share_llm_allowed
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


def _require_share_session(
    state: AppStateFromRequest, share_session_id: str | None
) -> str | None:
    if not state.share_mode:
        return None
    if share_session_id is None:
        raise KeyError("Missing share session id")
    state.share_session_store.get_session(share_session_id)
    state.share_project_manager.get_or_create_session_state(share_session_id)
    return share_session_id


@router.post(Route.GET_LLM_RESPONSE)
@require_project_context()
async def route_get_llm_response(
    x: GetLLMResponseRequest,
    state: AppStateFromRequest,
    share_session_id: MaybeShareSessionIdFromRequest,
) -> str | None:
    share_session_id = _require_share_session(state, share_session_id)
    await ensure_share_llm_allowed(
        state,
        project_config_id=x.projectConfigId,
        share_session_id=share_session_id,
    )
    try:
        chat = state.chat_manager.get_or_create_chat(
            x.chatId,
            x.message,
            x.llmConfigId,
            x.projectConfigId,
            share_session_id=share_session_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail="Failed to enqueue LLM request"
        ) from exc

    if chat:
        state.chat_manager.start_processing_query(
            chat,
            x.deepThink,
            share_session_id=share_session_id,
        )
        return chat.id


@router.post(Route.GET_ALL_LLM_CHAT_METADATA)
async def route_get_all_llm_chat_metadata(
    state: AppStateFromRequest,
    share_session_id: MaybeShareSessionIdFromRequest,
) -> list[ChatMetadata]:
    share_session_id = _require_share_session(state, share_session_id)
    await ensure_share_llm_allowed(
        state,
        project_config_id=None,
        share_session_id=share_session_id,
    )
    return state.chat_manager.get_all_chat_metadata(share_session_id=share_session_id)


@router.post(Route.DELETE_LLM_CHAT)
async def route_delete_llm_chat(
    x: DeleteLLMChatRequest,
    state: AppStateFromRequest,
    share_session_id: MaybeShareSessionIdFromRequest,
) -> None:
    share_session_id = _require_share_session(state, share_session_id)
    await ensure_share_llm_allowed(
        state,
        project_config_id=None,
        share_session_id=share_session_id,
    )
    return state.chat_manager.delete_chat(
        x.chatId,
        share_session_id=share_session_id,
    )


@router.post(Route.STOP_LLM_CHAT)
async def route_stop_llm_chat(
    x: StopLLMChatRequest,
    state: AppStateFromRequest,
    share_session_id: MaybeShareSessionIdFromRequest,
) -> None:
    share_session_id = _require_share_session(state, share_session_id)
    await ensure_share_llm_allowed(
        state,
        project_config_id=None,
        share_session_id=share_session_id,
    )
    await state.chat_manager.request_stop_streaming(
        x.chatId,
        share_session_id=share_session_id,
    )


@router.post(Route.GET_LLM_CHAT)
async def route_get_llm_chat(
    x: GetLLMChatRequest,
    state: AppStateFromRequest,
    share_session_id: MaybeShareSessionIdFromRequest,
) -> GetLLMChatRequestResponse:
    share_session_id = _require_share_session(state, share_session_id)
    await ensure_share_llm_allowed(
        state,
        project_config_id=x.projectConfigId,
        share_session_id=share_session_id,
    )
    chat = state.chat_manager.get_chat(
        x.chatId,
        share_session_id=share_session_id,
    )
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    waiting_for_response = state.chat_manager.is_waiting_for_response(
        x.chatId, share_session_id=share_session_id
    )
    current_stream = state.chat_manager.get_current_stream(
        x.chatId, share_session_id=share_session_id
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
    state: AppStateFromRequest,
    share_session_id: MaybeShareSessionIdFromRequest,
) -> list[AIFollowToolArgumentsUpdateContent]:
    share_session_id = _require_share_session(state, share_session_id)
    await ensure_share_llm_allowed(
        state,
        project_config_id=x.projectConfigId,
        share_session_id=share_session_id,
    )
    return state.chat_manager.get_ai_follow_snapshot(
        x.projectConfigId, share_session_id=share_session_id
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
