from fastapi import APIRouter
from pydantic import BaseModel
from dotenv import load_dotenv
from setta.utils.constants import C
from litellm import completion
from typing import Optional
import uuid

load_dotenv()
router = APIRouter()

# Dictionary to store conversation histories by session ID
conversation_histories = {}


class GetLLMResponseRequest(BaseModel):
    model: str  # Model identifier
    message: str  # Single message from user
    session_id: Optional[str] = None  # Session ID, optional


@router.post(C.ROUTE_GET_LLM_RESPONSE)
def route_get_llm_response(x: GetLLMResponseRequest):

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
    conversation_histories[session_id].append({"role": "user", "content": x.message})

    print("About to call completion with model:", x.model)
    print("Messages:", conversation_histories[session_id])

    # Get AI response
    response = completion(model=x.model, messages=conversation_histories[session_id])

    print("LiteLLM response received:", response)

    # Process and store AI response
    ai_content = response.choices[0].message.content
    conversation_histories[session_id].append(
        {"role": "assistant", "content": ai_content}
    )

    # Return response with session ID
    return {"content": ai_content, "session_id": session_id}
