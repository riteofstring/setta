import uuid
from typing import List, Optional

from dotenv import dotenv_values, load_dotenv
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.routers.dependencies import get_wmh_mcp_client
from setta.utils.constants import C

load_dotenv()
router = APIRouter()

# Dictionary to store conversation histories by session ID
conversation_histories = {}


class GetLLMResponseRequest(BaseModel):
    model: str  # Model identifier
    message: str  # Single message from user
    session_id: Optional[str] = None  # Session ID, optional


class LLMApiKey(BaseModel):
    providerName: str
    apiKey: str


class SetLLMApiKeysRequest(BaseModel):
    apiKeys: List[LLMApiKey]
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
            x.model, conversation_histories[session_id]
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
def route_set_llm_api_keys(x: SetLLMApiKeysRequest):
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
        for key in api_key_vars:
            del env_vars[key]
            print(f"Removed {key} from .env file")

        # Add back only the API keys that are in the current request
        for key in x.apiKeys:
            if not key.apiKey.strip():
                continue  # Skip empty keys

            # Format API key environment variable exactly as LiteLLM expects
            env_var_name = C.LLM_API_KEY_NAMES[key.providerName]

            # Ensure there are no spaces or special formatting that might cause issues
            api_key = key.apiKey.strip()

            # Save the API key
            env_vars[env_var_name] = api_key
            print(f"Saving {env_var_name} to .env file")

        # Write back to .env file
        with open(x.apiKeysFilepath, "w") as env_file:
            for key, value in env_vars.items():
                env_file.write(f"{key}={value}\n")

        # Reload the environment variables
        load_dotenv(override=True)

        print("Successfully updated API keys in .env file")
        return {"status": "success"}

    except Exception as e:
        print(f"Error updating .env file: {e}")
        return {"status": "error", "message": str(e)}


def get_llm_api_keys_from_env_vars(env_vars):
    return [key for key in env_vars.keys() if key in C.LLM_API_KEY_NAMES.values()]


@router.post(C.ROUTE_GET_LLM_API_KEYS)
def route_get_llm_api_keys(x: GetLLMApiKeysRequest):
    return dotenv_values(x.apiKeysFilepath)
