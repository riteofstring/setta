from typing import Any, Dict

from dotenv import dotenv_values, load_dotenv
from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel

from setta.database.db.notifications.load import create_notification_dict
from setta.mcp.chat_manager import maybe_pydantic_model_dump
from setta.routers.dependencies import (
    get_chat_manager,
    get_wmh_database,
    get_wmh_specific_file_watcher,
)
from setta.utils.constants import C

load_dotenv()
router = APIRouter()


class GetLLMResponseRequest(BaseModel):
    chatId: str | None
    message: Dict[str, Any]
    model: str
    deepThink: bool


class SetLLMApiKeysRequest(BaseModel):
    apiKeys: Dict[str, str]
    apiKeysFilepath: str


class GetLLMApiKeysRequest(BaseModel):
    apiKeysFilepath: str


class DeleteLLMChatRequest(BaseModel):
    chatId: str


class GetLLMChatRequest(BaseModel):
    chatId: str
    projectConfigId: str


class StopLLMChatRequest(BaseModel):
    chatId: str


@router.post(C.ROUTE_GET_LLM_RESPONSE)
async def route_get_llm_response(
    x: GetLLMResponseRequest,
    background_tasks: BackgroundTasks,
    chat_manager=Depends(get_chat_manager),
):
    # try:
    print(x, flush=True)
    chat = chat_manager.get_or_create_chat(x.chatId, x.message)

    background_tasks.add_task(
        chat_manager.process_query,
        chat,
        x.model,
        x.deepThink,
    )

    # Return immediate response with session ID
    return chat["id"]

    # except Exception as e:
    #     print(f"Error in route_get_llm_response: {str(e)}")
    #     # Return a more specific error message
    #     error_message = f"Error calling LLM: {str(e)}"
    #     return {
    #         "error": error_message,
    #         "status": "error",
    #     }


@router.post(C.ROUTE_SET_LLM_API_KEYS)
async def route_set_llm_api_keys(
    x: SetLLMApiKeysRequest,
    websocket_msg_handler=Depends(get_wmh_specific_file_watcher),
):
    """
    Write API keys to .env file to be used by litellm

    This endpoint accepts a list of API keys with their associated model IDs
    and provider names, then writes them to the .env file in the correct format.
    """
    try:
        env_vars = dotenv_values(x.apiKeysFilepath)

        # Remove all existing API key variables first
        # This ensures keys that were deleted on the frontend are also removed here
        api_key_vars = get_llm_api_keys_from_env_vars(env_vars)
        env_vars = {k: v for k, v in env_vars.items() if k not in api_key_vars}

        # Add back only the API keys that are in the current request
        for api_key_name, api_key in x.apiKeys.items():
            api_key = api_key.strip()
            if not api_key:
                continue  # Skip empty keys
            # Save the API key
            env_vars[api_key_name] = api_key

        # Write back to .env file
        with open(x.apiKeysFilepath, "w") as env_file:
            for key, value in env_vars.items():
                env_file.write(f"{key}={value}\n")

        # Reload the environment variables
        load_dotenv(override=True)

        print("Successfully updated API keys in .env file", flush=True)
        notification = create_notification_dict("Saved LLM API keys", temporary=True)

    except Exception:
        notification = create_notification_dict(
            "Error saving LLM API keys", type=C.NOTIFICATION_TYPE_ERROR, temporary=True
        )

    await websocket_msg_handler.broadcast_notification(notification)


def get_llm_api_keys_from_env_vars(env_vars):
    return {
        key: value
        for key, value in env_vars.items()
        if key in C.LLM_API_KEY_NAMES.values()
    }


@router.post(C.ROUTE_GET_LLM_API_KEYS)
def route_get_llm_api_keys(x: GetLLMApiKeysRequest):
    return get_llm_api_keys_from_env_vars(dotenv_values(x.apiKeysFilepath))


@router.post(C.ROUTE_GET_ALL_LLM_CHAT_METADATA)
def route_get_all_llm_chat_metadata(chat_manager=Depends(get_chat_manager)):
    return chat_manager.get_all_chat_metadata()


@router.post(C.ROUTE_DELETE_LLM_CHAT)
def route_delete_llm_chat(
    x: DeleteLLMChatRequest, chat_manager=Depends(get_chat_manager)
):
    return chat_manager.delete_chat(x.chatId)


@router.post(C.ROUTE_STOP_LLM_CHAT)
async def route_stop_llm_chat(
    x: StopLLMChatRequest,
    chat_manager=Depends(get_chat_manager),
):
    await chat_manager.request_stop_streaming(x.chatId)


@router.post(C.ROUTE_GET_LLM_CHAT)
async def route_get_llm_chat(
    x: GetLLMChatRequest,
    background_tasks: BackgroundTasks,
    chat_manager=Depends(get_chat_manager),
    websocket_msg_handler=Depends(get_wmh_database),
):
    chat = chat_manager.get_chat(x.chatId)
    if not chat:
        notification = create_notification_dict(
            "Chat not found!", type="NOTIFICATION_TYPE_ERROR", temporary=True
        )
        background_tasks.add_task(
            websocket_msg_handler.broadcast_notification,
            notification,
            x.projectConfigId,
        )
        return {"messages": [], "waitingForResponse": False}

    waiting_for_response = chat_manager.is_waiting_for_response(x.chatId)
    current_stream = chat_manager.get_current_stream(x.chatId)
    messages = chat["messages"]
    merge_db_messages_with_current_stream(messages, current_stream)
    messages, tool_results = chat_manager.separate_tool_results(messages)

    return {
        "messages": messages,
        "toolResults": tool_results,
        "waitingForResponse": waiting_for_response,
    }


def merge_db_messages_with_current_stream(db_messages, current_stream):
    # Create a set of existing message IDs for efficient lookup
    existing_ids = {message["id"] for message in db_messages}

    # Loop through current_stream and append messages that aren't already in chat
    for message in current_stream:
        message = maybe_pydantic_model_dump(message)
        if message["id"] not in existing_ids:
            db_messages.append(message)
            # Add to existing_ids to track what we've added
            existing_ids.add(message["id"])
