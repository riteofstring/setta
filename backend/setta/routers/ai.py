import uuid
from typing import Dict, Optional

from dotenv import dotenv_values, load_dotenv
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.database.db.notifications.load import create_notification_dict
from setta.routers.dependencies import (
    get_wmh_mcp_client,
    get_wmh_specific_file_watcher,
)
from setta.utils.constants import C

load_dotenv()
router = APIRouter()

# Dictionary to store conversation histories by session ID
conversation_histories = {}


class GetLLMResponseRequest(BaseModel):
    model: str  # Model identifier
    message: str  # Single message from user
    deepThink: bool
    session_id: Optional[str] = None  # Session ID, optional


class SetLLMApiKeysRequest(BaseModel):
    apiKeys: Dict[str, str]
    apiKeysFilepath: str


class GetLLMApiKeysRequest(BaseModel):
    apiKeysFilepath: str


@router.post(C.ROUTE_GET_LLM_RESPONSE)
async def route_get_llm_response(
    x: GetLLMResponseRequest,
    websocket_msg_handler=Depends(get_wmh_mcp_client),
):
    try:
        print("========== DEBUGGING INFO ==========")
        print("Received request data:", x)
        print("Raw model value:", x.model)
        print("Message:", x.message)
        print("Session ID:", x.session_id)
        print("====================================")

        # Get or create session ID
        session_id = x.session_id or str(uuid.uuid4())

        # Initialize conversation history for new sessions
        if session_id not in conversation_histories:
            conversation_histories[session_id] = []

        # Add user message to conversation history
        conversation_histories[session_id].append(
            {"role": "user", "content": x.message}
        )

        print("About to call completion with model:", x.model)
        print("Messages:", conversation_histories[session_id])

        # Add process_query to background tasks
        await websocket_msg_handler.send_message_to_llm(
            x.model, conversation_histories[session_id], x.deepThink
        )

        # Return immediate response with session ID
        return {
            "status": "processing",
            "session_id": session_id,
            "message": "Query is being processed. Connect to websocket for results.",
        }

    except Exception as e:
        print(f"Error in route_get_llm_response: {str(e)}")
        # Return a more specific error message
        error_message = f"Error calling LLM: {str(e)}"
        return {
            "error": error_message,
            "session_id": session_id if "session_id" in locals() else None,
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
