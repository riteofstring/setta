from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import asyncio
from typing import List, Dict, Optional, AsyncGenerator

from app.services.llm_service import LLMService, get_llm_service

router = APIRouter()


class ChatRequest(BaseModel):
    """Request model for chat API."""

    message: str
    model: str


@router.get("/models")
async def get_models(
    llm_service: LLMService = Depends(get_llm_service),
) -> List[Dict[str, str]]:
    """Get available models."""
    try:
        return llm_service.get_available_models()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting models: {str(e)}")


async def stream_response(generator: AsyncGenerator) -> AsyncGenerator[str, None]:
    """Convert AsyncGenerator to SSE compatible generator."""
    try:
        async for chunk in generator:
            # Convert chunk to JSON string
            yield f"data: {json.dumps(chunk)}\n\n"
        # Add a final empty data to close the stream properly
        yield "data: [DONE]\n\n"
    except Exception as e:
        # Send error as a special message
        error_data = {"error": str(e)}
        yield f"data: {json.dumps(error_data)}\n\n"
        yield "data: [DONE]\n\n"


@router.post("/chat")
async def chat(
    request: ChatRequest,
    llm_service: LLMService = Depends(get_llm_service),
) -> StreamingResponse:
    """Chat with the LLM using streaming response."""
    try:
        # Get the generator from the LLM service
        response_generator = llm_service.generate_stream(
            message=request.message,
            model=request.model,
        )

        # Return a streaming response
        return StreamingResponse(
            stream_response(response_generator),
            media_type="text/event-stream",
        )
    except Exception as e:
        # If any exception occurs before streaming starts
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.post("/upload")
async def upload_file(
    request: Request,
    llm_service: LLMService = Depends(get_llm_service),
) -> Dict[str, str]:
    """Upload a file for LLM processing."""
    try:
        # This is a placeholder for future implementation
        # We'll just return a success message for now
        return {"status": "success", "message": "File upload not implemented yet"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")
