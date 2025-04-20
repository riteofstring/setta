from typing import Dict

from dotenv import dotenv_values, load_dotenv
from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel

from setta.database.db.notifications.load import create_notification_dict
from setta.routers.dependencies import (
    get_mcp_client,
    get_wmh_specific_file_watcher,
)
from setta.utils.constants import C

load_dotenv()
router = APIRouter()


class GetLLMResponseRequest(BaseModel):
    chatId: str
    message: str
    model: str
    deepThink: bool


class SetLLMApiKeysRequest(BaseModel):
    apiKeys: Dict[str, str]
    apiKeysFilepath: str


class GetLLMApiKeysRequest(BaseModel):
    apiKeysFilepath: str


@router.post(C.ROUTE_GET_LLM_RESPONSE)
async def route_get_llm_response(
    x: GetLLMResponseRequest,
    background_tasks: BackgroundTasks,
    mcp_client=Depends(get_mcp_client),
):
    try:
        background_tasks.add_task(
            mcp_client.process_query,
            x.chatId,
            x.message,
            x.model,
            x.deepThink,
        )

        # Return immediate response with session ID
        return {
            "status": "processing",
            "message": "Query is being processed. Connect to websocket for results.",
        }

    except Exception as e:
        print(f"Error in route_get_llm_response: {str(e)}")
        # Return a more specific error message
        error_message = f"Error calling LLM: {str(e)}"
        return {
            "error": error_message,
            "status": "error",
        }


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
