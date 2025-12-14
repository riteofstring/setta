from fastapi import HTTPException
from pydantic import BaseModel

from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.chat import ChatMetadata
from setta.types.generated.chat_messages import (
    BaseChatMessageUnion,
    BaseChatMessageUnionWithDiscriminator,
)
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.routes import Route

router = SettaAPIRouter()


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


@router.post(Route.GET_LLM_RESPONSE)
async def route_get_llm_response(
    x: GetLLMResponseRequest,
    state: AppStateFromRequest,
) -> str | None:
    try:
        chat = state.chat_manager.get_or_create_chat(
            x.chatId,
            x.message,
            x.llmConfigId,
            x.projectConfigId,
        )
    except Exception as exc:
        await state.wmh_frontend_sender.log_failure_and_broadcast_backend_log_event(
            exc,
            x,
            label="get-llm-response",
            message="Failed to enqueue LLM request",
            severity=SettaBackendLogEventSeverity.error,
            project_config_id=x.projectConfigId,
        )
        raise HTTPException(
            status_code=500, detail="Failed to enqueue LLM request"
        ) from exc

    if chat:
        state.chat_manager.start_processing_query(
            chat,
            x.deepThink,
        )
        return chat.id


@router.post(Route.GET_ALL_LLM_CHAT_METADATA)
def route_get_all_llm_chat_metadata(
    state: AppStateFromRequest,
) -> list[ChatMetadata]:
    return state.chat_manager.get_all_chat_metadata()


@router.post(Route.DELETE_LLM_CHAT)
def route_delete_llm_chat(
    x: DeleteLLMChatRequest,
    state: AppStateFromRequest,
) -> None:
    return state.chat_manager.delete_chat(x.chatId)


@router.post(Route.STOP_LLM_CHAT)
async def route_stop_llm_chat(
    x: StopLLMChatRequest,
    state: AppStateFromRequest,
) -> None:
    await state.chat_manager.request_stop_streaming(x.chatId)


@router.post(Route.GET_LLM_CHAT)
async def route_get_llm_chat(
    x: GetLLMChatRequest,
    state: AppStateFromRequest,
) -> GetLLMChatRequestResponse:
    chat = state.chat_manager.get_chat(x.chatId)
    if not chat:
        # it's possible for projectConfigId to be null
        # if the llm chats are requested before a project is loaded to the frontend
        if x.projectConfigId:
            await state.wmh_frontend_sender.broadcast_backend_log_event(
                "Chat not found!",
                severity=SettaBackendLogEventSeverity.error,
                project_config_id=x.projectConfigId,
            )
        raise HTTPException(status_code=404, detail="Chat not found")

    waiting_for_response = state.chat_manager.is_waiting_for_response(x.chatId)
    current_stream = state.chat_manager.get_current_stream(x.chatId)
    messages = chat.messages
    merge_db_messages_with_current_stream(messages, current_stream)
    return GetLLMChatRequestResponse(
        messages=messages,
        waitingForResponse=waiting_for_response,
        llmConfig=chat.llmConfig,
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
