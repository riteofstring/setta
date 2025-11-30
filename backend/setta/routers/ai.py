from fastapi import BackgroundTasks, HTTPException
from pydantic import BaseModel

from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.ai import IDToUUIDForLLM
from setta.types.chat import ChatMetadata
from setta.types.generated.chat_messages import (
    BaseChatMessageUnion,
    BaseChatMessageUnionWithDiscriminator,
)
from setta.types.llm_config import LLMConfig
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.routes import Route

router = SettaAPIRouter()


class GetLLMResponseRequest(BaseModel):
    chatId: str | None
    message: BaseChatMessageUnionWithDiscriminator
    llmConfigId: str
    deepThink: bool


class DeleteLLMChatRequest(BaseModel):
    chatId: str


class GetLLMChatRequest(BaseModel):
    chatId: str
    projectConfigId: str | None


class GetLLMChatRequestResponse(BaseModel):
    messages: list[BaseChatMessageUnionWithDiscriminator]
    waitingForResponse: bool
    llmConfig: LLMConfig


class StopLLMChatRequest(BaseModel):
    chatId: str


@router.post(Route.GET_LLM_RESPONSE)
async def route_get_llm_response(
    x: GetLLMResponseRequest,
    state: AppStateFromRequest,
) -> str | None:
    # try:
    print(x, flush=True)
    chat = state.chat_manager.get_or_create_chat(x.chatId, x.message, x.llmConfigId)

    if chat:
        state.chat_manager.start_processing_query(
            chat,
            x.deepThink,
        )
        return chat.id

    # except Exception as e:
    #     print(f"Error in route_get_llm_response: {str(e)}")
    #     # Return a more specific error message
    #     error_message = f"Error calling LLM: {str(e)}"
    #     return {
    #         "error": error_message,
    #         "status": "error",
    #     }


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
    background_tasks: BackgroundTasks,
    state: AppStateFromRequest,
) -> GetLLMChatRequestResponse:
    chat = state.chat_manager.get_chat(x.chatId)
    if not chat:
        # it's possible for projectConfigId to be null
        # if the llm chats are requested before a project is loaded to the frontend
        if x.projectConfigId:
            notification = SettaNotification(
                projectConfigId=x.projectConfigId,
                message="Chat not found!",
                type=SettaNotificationType.error,
            )
            background_tasks.add_task(
                state.wmh_frontend_sender.broadcast_notification,
                notification,
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


@router.post(Route.GET_UUID_MAPPING_FOR_LLM)
async def route_get_uuid_mapping_for_llm(
    state: AppStateFromRequest,
) -> IDToUUIDForLLM:
    id_to_uuid, _ = state.dbe.read_uuid_mapping()
    return id_to_uuid
