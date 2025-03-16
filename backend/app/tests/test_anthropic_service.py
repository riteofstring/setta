import pytest
import json
from unittest.mock import patch, AsyncMock, MagicMock
import asyncio
from aiohttp import ClientResponse, ClientSession
from app.services.anthropic_service import AnthropicService


@pytest.fixture
def anthropic_service():
    """Create an AnthropicService for testing."""
    with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "fake-api-key"}):
        service = AnthropicService()
        yield service


@pytest.mark.asyncio
async def test_anthropic_generate_stream():
    """Test streaming generation from Anthropic API."""
    # Mock the API key from request header
    api_key = "test-anthropic-key"

    # Create the service
    service = AnthropicService()

    # Setup request headers
    request_headers = {"authorization": f"Bearer {api_key}"}

    # Mock the aiohttp ClientSession
    with patch("aiohttp.ClientSession") as mock_session:
        # Setup the mock response for streaming
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.__aiter__.return_value = [
            b'{"type": "message_start", "message": {"id": "msg_123", "type": "message", "role": "assistant", "content": [], "model": "claude-3-opus-20240229"}}\n',
            b'{"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}\n',
            b'{"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hello"}}\n',
            b'{"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": " world"}}\n',
            b'{"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "!"}}\n',
            b'{"type": "content_block_stop", "index": 0}\n',
            b'{"type": "message_stop"}\n',
        ]

        # Setup the mock session
        mock_session_instance = MagicMock()
        mock_session_instance.__aenter__.return_value = mock_session_instance
        mock_session_instance.post.return_value.__aenter__.return_value = mock_response
        mock_session.return_value = mock_session_instance

        # Call the method under test
        response_stream = service.generate_stream(
            message="Hi there", model="claude-3-opus", request_headers=request_headers
        )

        # Collect all responses
        responses = [chunk async for chunk in response_stream]

        # Verify the responses
        assert len(responses) == 3
        assert responses[0] == {"role": "assistant", "content": "Hello"}
        assert responses[1] == {"role": "assistant", "content": " world"}
        assert responses[2] == {"role": "assistant", "content": "!"}

        # Verify the API was called correctly
        mock_session_instance.post.assert_called_once()
        args, kwargs = mock_session_instance.post.call_args

        # Check URL
        assert "api.anthropic.com" in args[0]

        # Check headers
        assert "x-api-key" in kwargs["headers"]
        assert kwargs["headers"]["x-api-key"] == api_key
        assert kwargs["headers"]["anthropic-version"] == "2023-06-01"

        # Check JSON payload
        assert "messages" in kwargs["json"]
        assert kwargs["json"]["messages"][0]["role"] == "user"
        assert kwargs["json"]["messages"][0]["content"] == "Hi there"
        assert kwargs["json"]["model"].startswith("claude-3")


@pytest.mark.asyncio
async def test_anthropic_error_handling():
    """Test error handling in Anthropic API."""
    # Create the service
    service = AnthropicService()

    # Mock the aiohttp ClientSession to raise an exception
    with patch("aiohttp.ClientSession") as mock_session:
        mock_response = AsyncMock()
        mock_response.status = 400
        mock_response.text = AsyncMock(
            return_value='{"error":{"type":"invalid_request_error","message":"API key is invalid"}}'
        )

        mock_session_instance = MagicMock()
        mock_session_instance.__aenter__.return_value = mock_session_instance
        mock_session_instance.post.return_value.__aenter__.return_value = mock_response
        mock_session.return_value = mock_session_instance

        # Call the method under test and expect it to raise
        with pytest.raises(Exception, match="API error: 400"):
            response_stream = service.generate_stream(
                message="Hi there",
                model="claude-3-opus",
                request_headers={"authorization": "Bearer invalid-key"},
            )
            # Force the generator to start
            await response_stream.__anext__()


def test_get_available_models():
    """Test getting available models from Anthropic."""
    # Create the service
    service = AnthropicService()

    # Call the method
    models = service.get_available_models()

    # Verify the models list
    assert len(models) >= 3

    # Check for claude models
    claude_models = [m for m in models if m["id"].startswith("claude-3")]
    assert len(claude_models) >= 3

    # Ensure each model has the required fields
    for model in models:
        assert "id" in model
        assert "name" in model
        assert "serviceId" in model
        assert model["serviceId"] == "anthropic"
