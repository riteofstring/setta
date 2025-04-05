from fastapi import APIRouter
from pydantic import BaseModel
from dotenv import load_dotenv
from setta.utils.constants import C
from litellm import completion
from typing import Optional, List
import uuid
import os

load_dotenv()
router = APIRouter()

# Dictionary to store conversation histories by session ID
conversation_histories = {}


class GetLLMResponseRequest(BaseModel):
    model: str  # Model identifier
    message: str  # Single message from user
    session_id: Optional[str] = None  # Session ID, optional


class ApiKey(BaseModel):
    modelId: str
    providerName: str
    apiKey: str


class ApiKeysRequest(BaseModel):
    apiKeys: List[ApiKey]


@router.post(C.ROUTE_GET_LLM_RESPONSE)
def route_get_llm_response(x: GetLLMResponseRequest):
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

        # Let LiteLLM handle model identification automatically
        # Most standard model names are recognized without provider prefixes
        response = completion(
            model=x.model, messages=conversation_histories[session_id]
        )

        print("LiteLLM response received:", response)

        # Process and store AI response
        ai_content = response.choices[0].message.content
        conversation_histories[session_id].append(
            {"role": "assistant", "content": ai_content}
        )

        # Return response with session ID
        return {"content": ai_content, "session_id": session_id}

    except Exception as e:
        print(f"Error in route_get_llm_response: {str(e)}")
        # Return a more specific error message
        error_message = f"Error calling LLM: {str(e)}"
        return {
            "error": error_message,
            "session_id": session_id if "session_id" in locals() else None,
            "status": "error",
        }


@router.post(C.ROUTE_SET_API_KEYS)
def route_set_api_keys(x: ApiKeysRequest):
    """
    Write API keys to .env file to be used by litellm

    This endpoint accepts a list of API keys with their associated model IDs
    and provider names, then writes them to the .env file in the correct format.
    """
    try:
        env_file_path = ".env"

        # Read existing .env file if it exists
        env_vars = {}
        if os.path.exists(env_file_path):
            with open(env_file_path, "r") as env_file:
                for line in env_file:
                    if line.strip() and not line.startswith("#"):
                        if "=" in line:
                            key, value = line.strip().split("=", 1)
                            env_vars[key] = value

        # Remove all existing API key variables first
        # This ensures keys that were deleted on the frontend are also removed here
        api_key_vars = [
            key for key in list(env_vars.keys()) if key.endswith("_API_KEY")
        ]
        for key in api_key_vars:
            del env_vars[key]
            print(f"Removed {key} from .env file")

        # Add back only the API keys that are in the current request
        for key in x.apiKeys:
            if not key.apiKey.strip():
                continue  # Skip empty keys

            # Format API key environment variable exactly as LiteLLM expects
            provider_name = key.providerName.lower()
            if provider_name == "anthropic":
                env_var_name = "ANTHROPIC_API_KEY"
            elif provider_name == "openai":
                env_var_name = "OPENAI_API_KEY"
            else:
                # Fallback to generic format
                env_var_name = f"{provider_name.upper().replace(' ', '_')}_API_KEY"

            # Ensure there are no spaces or special formatting that might cause issues
            api_key = key.apiKey.strip()

            # Save the API key
            env_vars[env_var_name] = api_key
            print(f"Saving {env_var_name} to .env file")

        # Write back to .env file
        with open(env_file_path, "w") as env_file:
            for key, value in env_vars.items():
                env_file.write(f"{key}={value}\n")

        # Reload the environment variables
        load_dotenv(override=True)

        print(f"Successfully updated API keys in .env file")
        return {"status": "success"}

    except Exception as e:
        print(f"Error updating .env file: {e}")
        return {"status": "error", "message": str(e)}
