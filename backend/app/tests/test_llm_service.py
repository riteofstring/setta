import pytest
import json
from unittest.mock import patch, AsyncMock, MagicMock
from app.services.llm_service import LLMService, HuggingFaceInferenceService


@pytest.fixture
def hf_service():
    """Create a HuggingFaceInferenceService for testing."""
    with patch.dict("os.environ", {"HUGGINGFACE_API_KEY": "fake-api-key"}):
        service = HuggingFaceInferenceService()
        yield service


@pytest.mark.asyncio
async def test_huggingface_inference_generate_stream(hf_service):
    """Test streaming generation from HuggingFace Inference API."""
    # Mock the aiohttp ClientSession
    with patch("aiohttp.ClientSession") as mock_session:
        # Setup the mock response
        mock_response = AsyncMock()
        mock_response.__aiter__.return_value = [
            b'{"token": {"text": "Hello"}}\n',
            b'{"token": {"text": " world"}}\n',
            b'{"token": {"text": "!"}}\n',
            b'{"generated_text": "Hello world!", "reasoning": "Simple greeting"}\n',
        ]

        # Setup the mock session
        mock_session_instance = MagicMock()
        mock_session_instance.__aenter__.return_value = mock_session_instance
        mock_session_instance.post.return_value.__aenter__.return_value = mock_response
        mock_session.return_value = mock_session_instance

        # Call the method under test
        response_stream = hf_service.generate_stream(
            message="Hi there", model="mistralai/Mistral-7B-Instruct-v0.2"
        )

        # Collect all responses
        responses = [chunk async for chunk in response_stream]

        # Verify the responses
        assert len(responses) == 4
        assert responses[0] == {"role": "assistant", "content": "Hello"}
        assert responses[1] == {"role": "assistant", "content": " world"}
        assert responses[2] == {"role": "assistant", "content": "!"}
        assert responses[3] == {
            "role": "assistant",
            "content": "Hello world!",
            "reasoning": "Simple greeting",
        }

        # Verify the API was called correctly
        mock_session_instance.post.assert_called_once()
        args, kwargs = mock_session_instance.post.call_args

        # Check URL
        assert "api.huggingface.co" in args[0]

        # Check headers
        assert "Authorization" in kwargs["headers"]
        assert kwargs["headers"]["Authorization"] == "Bearer fake-api-key"

        # Check payload
        assert "inputs" in kwargs["json"]
        assert "Hi there" in kwargs["json"]["inputs"]


@pytest.mark.asyncio
async def test_huggingface_inference_error_handling(hf_service):
    """Test error handling in HuggingFace Inference API."""
    # Mock the aiohttp ClientSession to raise an exception
    with patch("aiohttp.ClientSession") as mock_session:
        mock_session_instance = MagicMock()
        mock_session_instance.__aenter__.return_value = mock_session_instance
        mock_session_instance.post.side_effect = Exception("API Error")
        mock_session.return_value = mock_session_instance

        # Call the method under test and expect it to raise
        with pytest.raises(Exception, match="API Error"):
            response_stream = hf_service.generate_stream(
                message="Hi there", model="mistralai/Mistral-7B-Instruct-v0.2"
            )
            # Force the generator to start
            await response_stream.__anext__()


def test_get_available_models(hf_service):
    """Test getting available models."""
    models = hf_service.get_available_models()

    # Verify models are returned in the correct format
    assert isinstance(models, list)
    assert len(models) > 0
    for model in models:
        assert "id" in model
        assert "name" in model
