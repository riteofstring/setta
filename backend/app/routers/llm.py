from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import asyncio
import traceback
from typing import List, Dict, Optional, AsyncGenerator, Any
import logging

from app.services.llm_service import LLMService, get_llm_service

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter()


class ChatRequest(BaseModel):
    """Request model for chat API."""

    message: str
    model: str


@router.get("/models")
async def get_models(request: Request) -> List[Dict[str, Any]]:
    """Get available models."""
    try:
        # Get the LLM service
        llm_service = await get_llm_service(request)
        return llm_service.get_available_models()
    except Exception as e:
        logger.error(f"Error getting models: {str(e)}", exc_info=True)
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
        # Log the error
        logger.error(f"Error in stream_response: {str(e)}", exc_info=True)
        # Send error as a special message
        error_data = {
            "error": str(e),
            "role": "assistant",
            "content": f"Error: {str(e)}",
        }
        yield f"data: {json.dumps(error_data)}\n\n"
        yield "data: [DONE]\n\n"


@router.post("/chat")
async def chat(request: Request, chat_request: ChatRequest) -> StreamingResponse:
    """Chat with the LLM using streaming response."""
    try:
        # Extract headers for potential API key
        headers = request.headers

        # Log model information
        logger.info(f"Chat request received for model: {chat_request.model}")
        logger.info(f"Has Authorization header: {bool(headers.get('authorization'))}")

        # Get the LLM service
        llm_service = await get_llm_service(request)
        logger.info(f"Using LLM service: {llm_service.__class__.__name__}")

        # Pass the model-specific API key from request headers if provided
        if (
            hasattr(llm_service, "generate_stream")
            and "request_headers" in llm_service.generate_stream.__code__.co_varnames
        ):
            logger.info("Using service with request_headers support")
            response_generator = llm_service.generate_stream(
                message=chat_request.message,
                model=chat_request.model,
                request_headers=headers,
            )
        else:
            # Fallback to standard interface if service doesn't accept headers
            logger.info("Using service without request_headers support")
            response_generator = llm_service.generate_stream(
                message=chat_request.message,
                model=chat_request.model,
            )

        # Return a streaming response
        logger.info("Returning streaming response")
        return StreamingResponse(
            stream_response(response_generator),
            media_type="text/event-stream",
        )
    except Exception as e:
        # Capture the full traceback
        error_traceback = traceback.format_exc()
        logger.error(f"Error in chat endpoint: {str(e)}\n{error_traceback}")
        # If any exception occurs before streaming starts
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.post("/upload")
async def upload_file(request: Request) -> Dict[str, str]:
    """Upload a file for LLM processing."""
    try:
        # This is a placeholder for future implementation
        # We'll just return a success message for now
        return {"status": "success", "message": "File upload not implemented yet"}
    except Exception as e:
        logger.error(f"Error uploading file: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")
