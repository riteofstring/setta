from fastapi import BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from setta.llm.config_store import (
    DEFAULT_GATEWAY_URL,
    LLMConfig,
    LLMModelConfig,
    LLMProviderConfig,
    load_llm_config,
    save_llm_config,
)
from setta.llm.models import JSONValue
from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.ai import IDToUUIDForLLM
from setta.types.chat_messages import ChatMessage, ChatMetadata, ToolResult
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.routes import Route

router = SettaAPIRouter()


class GetLLMResponseRequest(BaseModel):
    projectConfigId: str
    chatId: str | None
    message: ChatMessage
    model: str
    deepThink: bool


class LLMModelConfigPayload(BaseModel):
    model_id: str
    display_name: str
    supports_reasoning: bool = False
    default_parameters: JSONValue | None = None


class LLMProviderConfigPayload(BaseModel):
    provider_id: str
    display_name: str
    api_key: str = ""
    base_url: str | None = None
    default_model_id: str | None = None
    extra_headers: dict[str, str] | None = None
    models: list[LLMModelConfigPayload] = Field(default_factory=list)


class LLMConfigPayload(BaseModel):
    gateway_url: str = DEFAULT_GATEWAY_URL
    providers: list[LLMProviderConfigPayload] = Field(default_factory=list)


class DeleteLLMChatRequest(BaseModel):
    chatId: str


class GetLLMChatRequest(BaseModel):
    chatId: str
    projectConfigId: str | None


class GetLLMChatRequestResponse(BaseModel):
    messages: list[ChatMessage]
    toolResults: dict[str, ToolResult]
    waitingForResponse: bool


class StopLLMChatRequest(BaseModel):
    chatId: str


@router.post(Route.GET_LLM_RESPONSE)
async def route_get_llm_response(
    x: GetLLMResponseRequest,
    background_tasks: BackgroundTasks,
    state: AppStateFromRequest,
) -> str | None:
    # try:
    print(x, flush=True)
    chat = state.chat_manager.get_or_create_chat(x.chatId, x.message)

    if chat:
        background_tasks.add_task(
            state.chat_manager.process_query,
            x.projectConfigId,
            chat,
            x.model,
            x.deepThink,
        )

        # Return immediate response with session ID
        return chat.id

    # except Exception as e:
    #     print(f"Error in route_get_llm_response: {str(e)}")
    #     # Return a more specific error message
    #     error_message = f"Error calling LLM: {str(e)}"
    #     return {
    #         "error": error_message,
    #         "status": "error",
    #     }


@router.post(Route.GET_LLM_CONFIG)
def route_get_llm_config() -> LLMConfigPayload:
    config = load_llm_config()
    return _payload_from_config(config)


@router.post(Route.SET_LLM_CONFIG)
async def route_set_llm_config(
    payload: LLMConfigPayload,
    state: AppStateFromRequest,
) -> LLMConfigPayload:
    config = _config_from_payload(payload)

    try:
        save_llm_config(config)
    except Exception as exc:  # pragma: no cover - defensive logging path
        notification = SettaNotification(
            message="Error saving LLM configuration",
            type=SettaNotificationType.error,
        )
        await state.wmh_frontend_sender.broadcast_notification(notification)
        raise HTTPException(
            status_code=500, detail="Failed to save LLM config"
        ) from exc

    notification = SettaNotification(message="Saved LLM configuration")
    await state.wmh_frontend_sender.broadcast_notification(notification)
    return _payload_from_config(config)


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
    messages, tool_results = state.chat_manager.separate_tool_results(messages)
    return GetLLMChatRequestResponse(
        messages=messages,
        toolResults=tool_results,
        waitingForResponse=waiting_for_response,
    )


def merge_db_messages_with_current_stream(
    db_messages: list[ChatMessage], current_stream: list[ChatMessage]
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


def _payload_from_config(config: LLMConfig) -> LLMConfigPayload:
    return LLMConfigPayload(
        gateway_url=config.gateway_url,
        providers=[
            LLMProviderConfigPayload(
                provider_id=provider.provider_id,
                display_name=provider.display_name,
                api_key=provider.api_key,
                base_url=provider.base_url,
                default_model_id=provider.default_model_id,
                extra_headers=provider.extra_headers,
                models=[
                    LLMModelConfigPayload(
                        model_id=model.model_id,
                        display_name=model.display_name,
                        supports_reasoning=model.supports_reasoning,
                        default_parameters=model.default_parameters,
                    )
                    for model in provider.models
                ],
            )
            for provider in config.providers
        ],
    )


def _config_from_payload(payload: LLMConfigPayload) -> LLMConfig:
    return LLMConfig(
        gateway_url=payload.gateway_url,
        providers=[
            LLMProviderConfig(
                provider_id=provider.provider_id,
                display_name=provider.display_name,
                api_key=provider.api_key,
                base_url=provider.base_url,
                default_model_id=provider.default_model_id,
                extra_headers=provider.extra_headers,
                models=[
                    LLMModelConfig(
                        model_id=model.model_id,
                        display_name=model.display_name,
                        supports_reasoning=model.supports_reasoning,
                        default_parameters=model.default_parameters,
                    )
                    for model in provider.models
                ],
            )
            for provider in payload.providers
        ],
    )
