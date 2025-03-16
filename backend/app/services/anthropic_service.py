import os
import json
import aiohttp
from typing import List, Dict, Optional, Any, AsyncGenerator
import logging
from app.services.llm_service import LLMService

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AnthropicService(LLMService):
    """LLM service implementation using Anthropic Claude API."""

    def __init__(self):
        """Initialize the service with API key."""
        self.api_url = "https://api.anthropic.com/v1/messages"
        self.api_version = "2023-06-01"
        self.system_prompt = "You are a helpful AI assistant that provides accurate and concise information."

        # Default to environment variable if available
        self.default_api_key = os.environ.get("ANTHROPIC_API_KEY")

    def _get_api_key(self, request_headers=None):
        """Get API key from request headers or fallback to environment variable."""
        if request_headers:
            # Extract from Authorization header (Bearer token)
            auth_header = request_headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                api_key = auth_header[7:]  # Remove "Bearer " prefix
                logger.info(
                    f"Using API key from Authorization header: {api_key[:5]}..."
                )
                return api_key

        logger.info(
            f"Using default API key: {self.default_api_key[:5] if self.default_api_key else 'None'}"
        )
        return self.default_api_key

    def _map_model_name(self, model: str) -> str:
        """Map generic model names to actual Anthropic model names."""
        model_mapping = {
            "claude-3": "claude-3-opus-20240229",
            "claude-3-opus": "claude-3-opus-20240229",
            "claude-3-sonnet": "claude-3-sonnet-20240229",
            "claude-3-haiku": "claude-3-haiku-20240307",
        }

        mapped_model = model_mapping.get(model, model)
        logger.info(f"Mapped model name: {model} -> {mapped_model}")
        return mapped_model

    async def generate_stream(
        self, message: str, model: str, request_headers=None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Generate a response from Anthropic Claude API using streaming."""
        try:
            # Get API key from headers or environment
            api_key = self._get_api_key(request_headers)

            if not api_key:
                logger.error("No Anthropic API key provided")
                raise Exception(
                    "No Anthropic API key provided. Please add your API key in Settings."
                )

            # Map the model name to the correct Anthropic model identifier
            anthropic_model = self._map_model_name(model)

            # Prepare the API request
            headers = {
                "x-api-key": api_key,
                "anthropic-version": self.api_version,
                "content-type": "application/json",
            }

            payload = {
                "model": anthropic_model,
                "messages": [{"role": "user", "content": message}],
                "system": self.system_prompt,
                "stream": True,
                "max_tokens": 1024,
                "temperature": 0.7,
            }

            logger.info(f"Making request to Anthropic API for model: {anthropic_model}")
            logger.info(f"Request payload: {json.dumps(payload, indent=2)}")

            # Make the API request with streaming
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.api_url, json=payload, headers=headers
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(
                            f"Anthropic API error: {response.status} - {error_text}"
                        )
                        raise Exception(f"API error: {response.status} - {error_text}")

                    logger.info(
                        "Successfully connected to Anthropic API, streaming response..."
                    )
                    current_text = ""

                    # Process the streaming response
                    async for line in response:
                        line = line.decode("utf-8").strip()
                        if not line:
                            continue

                        try:
                            data = json.loads(line)
                            logger.debug(f"Received data chunk: {line[:100]}...")

                            # Handle content block delta events
                            if data.get("type") == "content_block_delta":
                                delta = data.get("delta", {})
                                if delta.get("type") == "text_delta":
                                    text = delta.get("text", "")
                                    if text:
                                        current_text += text
                                        yield {"role": "assistant", "content": text}

                        except json.JSONDecodeError:
                            logger.warning(f"Failed to parse JSON: {line}")
                            continue

                    logger.info("Finished streaming response")

        except Exception as e:
            logger.error(f"Error in Anthropic generate_stream: {str(e)}", exc_info=True)
            raise Exception(f"Error communicating with Anthropic API: {str(e)}")

    def get_available_models(self) -> List[Dict[str, str]]:
        """Get a list of available Claude models."""
        return [
            {"id": "claude-3-opus", "name": "Claude 3 Opus", "serviceId": "anthropic"},
            {
                "id": "claude-3-sonnet",
                "name": "Claude 3 Sonnet",
                "serviceId": "anthropic",
            },
            {
                "id": "claude-3-haiku",
                "name": "Claude 3 Haiku",
                "serviceId": "anthropic",
            },
        ]
