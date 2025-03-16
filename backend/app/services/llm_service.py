import os
import json
import aiohttp
from typing import List, Dict, Optional, Any, AsyncGenerator
from abc import ABC, abstractmethod
import logging
from fastapi import Request

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class LLMService(ABC):
    """Abstract base class for LLM services."""

    @abstractmethod
    async def generate_stream(
        self, message: str, model: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Generate a response from the LLM using streaming."""
        pass

    @abstractmethod
    def get_available_models(self) -> List[Dict[str, str]]:
        """Get a list of available models."""
        pass


class HuggingFaceInferenceService(LLMService):
    """LLM service implementation using HuggingFace Inference API."""

    def __init__(self):
        """Initialize the service with API key."""
        self.api_key = os.environ.get("HUGGINGFACE_API_KEY")
        if not self.api_key:
            logger.warning("HUGGINGFACE_API_KEY not found in environment variables")
            self.api_key = "hf_demo"  # Use demo key for testing (very limited)

    async def generate_stream(
        self, message: str, model: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Generate a response from the LLM using streaming."""
        # Map from our model IDs to actual HuggingFace model IDs
        model_mapping = {
            "gpt-4": "mistralai/Mixtral-8x7B-Instruct-v0.1",  # Fallback to Mixtral
            "mixtral": "mistralai/Mixtral-8x7B-Instruct-v0.1",
            "llama-3": "meta-llama/Llama-2-7b-chat-hf",  # Fallback to Llama 2
            "claude-3": "mistralai/Mistral-7B-Instruct-v0.2",  # Fallback to Mistral
        }

        # Default to Mistral if model not found in mapping
        hf_model = model_mapping.get(model, "mistralai/Mistral-7B-Instruct-v0.2")

        # Prepare the prompt
        prompt = f"<s>[INST] {message} [/INST]"

        # Set up the API request
        api_url = f"https://api-inference.huggingface.co/models/{hf_model}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "inputs": prompt,
            "parameters": {
                "max_new_tokens": 1024,
                "temperature": 0.7,
                "top_p": 0.95,
                "return_full_text": False,
                "stream": True,
            },
        }

        try:
            # Make the API request with streaming
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    api_url, json=payload, headers=headers
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise Exception(f"API error: {response.status} - {error_text}")

                    # Track the accumulated response for reasoning extraction
                    accumulated_text = ""
                    reasoning = None

                    # Process the streaming response
                    async for line in response:
                        line = line.decode("utf-8").strip()
                        if not line:
                            continue

                        try:
                            data = json.loads(line)

                            # Check if this is the final response with full generated text
                            if "generated_text" in data:
                                full_text = data["generated_text"]
                                # Extract reasoning if available (from a custom field or by parsing)
                                reasoning = data.get(
                                    "reasoning", self._extract_reasoning(full_text)
                                )
                                # Yield the last piece with reasoning
                                yield {
                                    "role": "assistant",
                                    "content": full_text,
                                    "reasoning": reasoning,
                                }
                                break

                            # Process token-by-token streaming
                            if "token" in data and "text" in data["token"]:
                                token_text = data["token"]["text"]
                                accumulated_text += token_text
                                yield {"role": "assistant", "content": token_text}
                        except json.JSONDecodeError:
                            logger.warning(f"Failed to parse JSON: {line}")
                            continue

        except Exception as e:
            logger.error(f"Error in generate_stream: {str(e)}")
            raise

    def _extract_reasoning(self, text: str) -> Optional[str]:
        """Extract reasoning from the generated text if possible."""
        # This is a simple implementation for demo purposes
        # In a real system, you might use more sophisticated parsing or prompt engineering
        reasoning_markers = [
            "My reasoning:",
            "Here's my thought process:",
            "Let me explain my thinking:",
            "Reasoning:",
        ]

        for marker in reasoning_markers:
            if marker in text:
                parts = text.split(marker, 1)
                if len(parts) > 1:
                    return parts[1].strip()

        return None

    def get_available_models(self) -> List[Dict[str, str]]:
        """Get a list of available models."""
        # For simplicity, return a static list of models
        # In a production environment, this would fetch from HuggingFace API
        return [
            {"id": "mixtral", "name": "Mixtral 8x7B"},
            {"id": "llama-3", "name": "Llama 2 7B"},
            {"id": "gpt-4", "name": "GPT-4 (via Mixtral)"},
            {"id": "claude-3", "name": "Claude 3 (via Mistral)"},
        ]


# Factory function to get the LLM service
async def get_llm_service(request: Optional[Request] = None) -> LLMService:
    """Get the configured LLM service.

    Args:
        request: Optional FastAPI request object to extract headers

    Returns:
        An instance of the configured LLM service
    """
    # Check if we should use the Anthropic service based on model name from path
    if (
        request
        and hasattr(request, "path_params")
        and request.path_params.get("model", "").startswith("claude")
    ):
        # Import here to avoid circular imports
        from app.services.anthropic_service import AnthropicService

        return AnthropicService()

    # Check for chat requests from JSON body
    if request and request.method == "POST" and request.url.path.endswith("/chat"):
        try:
            # Try to access the request body if it's available
            if hasattr(request, "json"):
                body = await request.json()
                model = body.get("model", "")
                if model and model.startswith("claude"):
                    from app.services.anthropic_service import AnthropicService

                    return AnthropicService()
        except Exception as e:
            logger.warning(f"Error checking request body: {str(e)}")

    # Check environment variables for service configuration
    service_type = os.environ.get("LLM_SERVICE_TYPE", "huggingface")

    if service_type.lower() == "anthropic":
        # Import here to avoid circular imports
        from app.services.anthropic_service import AnthropicService

        return AnthropicService()
    elif service_type.lower() == "huggingface":
        return HuggingFaceInferenceService()
    else:
        # Default to HuggingFace
        logger.warning(
            f"Unknown LLM service type: {service_type}, defaulting to HuggingFace"
        )
        return HuggingFaceInferenceService()
