from fastapi import APIRouter
from pydantic import BaseModel
from dotenv import load_dotenv
from setta.utils.constants import C
from litellm import completion
import uuid

load_dotenv()
router = APIRouter()

# Dictionary to store conversation histories by session ID
conversation_histories = {}


class GetLLMResponseRequest(BaseModel):
    message: str  # Single message from user
    model: str  # Model identifier
    session_id: str = None  # Session ID, optional


@router.post(C.ROUTE_GET_LLM_RESPONSE)
def route_get_llm_response(request: GetLLMResponseRequest):
    # Get or create session ID
    session_id = request.session_id or str(uuid.uuid4())

    # Initialize conversation history for new sessions
    if session_id not in conversation_histories:
        conversation_histories[session_id] = []

    # Add user message to conversation history
    conversation_histories[session_id].append(
        {"role": "user", "content": request.message}
    )

    # Get AI response
    response = completion(
        model=request.model, messages=conversation_histories[session_id]
    )

    # Process and store AI response
    ai_content = response.choices[0].message.content
    conversation_histories[session_id].append(
        {"role": "assistant", "content": ai_content}
    )

    # Return response with session ID
    return {"content": ai_content, "session_id": session_id}
