import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock, MagicMock

# Import our router
from app.routers.llm import router as llm_router
from app.services.llm_service import LLMService

# Create a test FastAPI app
app = FastAPI()
app.include_router(llm_router, prefix="/api")

# Create a test client
client = TestClient(app)


class AsyncMockLLMService(MagicMock):
    """Mock LLM service with async methods for testing."""

    async def __call__(self, *args, **kwargs):
        return self

    async def generate_stream(self, message, model, request_headers=None):
        # Mock async generator
        async def mock_generator():
            yield {"role": "assistant", "content": "Test response"}

        return mock_generator()


@pytest.fixture
def mock_llm_service():
    """Create a mock LLM service for testing."""
    # Create a mock for the async dependency
    mock_service = AsyncMockLLMService(spec=LLMService)
    mock_service.get_available_models.return_value = [
        {"id": "test-model", "name": "Test Model"}
    ]

    # Patch the get_llm_service function
    with patch(
        "app.routers.llm.get_llm_service", new_callable=AsyncMock
    ) as mock_get_service:
        mock_get_service.return_value = mock_service
        yield mock_service


def test_get_models(mock_llm_service):
    """Test the /api/models endpoint."""
    response = client.get("/api/models")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["id"] == "test-model"


def test_chat_endpoint(mock_llm_service):
    """Test the /api/chat endpoint."""
    response = client.post(
        "/api/chat",
        json={"message": "Hello, AI!", "model": "test-model"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "text/event-stream"


@pytest.mark.asyncio
async def test_chat_streaming_response(mock_llm_service):
    """Test the /api/chat endpoint with streaming response."""

    # Setup mock response generator
    async def mock_stream_response():
        yield {"role": "assistant", "content": "Hello"}
        yield {"role": "assistant", "content": " world"}
        yield {"role": "assistant", "content": "!", "reasoning": "Simple greeting"}

    mock_llm_service.generate_stream = AsyncMock()
    mock_llm_service.generate_stream.return_value = mock_stream_response()

    # Mock the response class
    with patch("app.routers.llm.StreamingResponse") as mock_streaming_response:
        mock_streaming_response.return_value = MagicMock()

        # Make request
        client.post("/api/chat", json={"message": "Hello", "model": "gpt-3.5-turbo"})

        # Verify the service was called correctly
        mock_llm_service.generate_stream.assert_called_once_with(
            message="Hello", model="gpt-3.5-turbo"
        )

        # Verify streaming response was created
        mock_streaming_response.assert_called_once()


@pytest.mark.asyncio
async def test_chat_error_handling(mock_llm_service):
    """Test error handling in the /api/chat endpoint."""
    # Setup mock to raise exception
    mock_llm_service.generate_stream = AsyncMock(side_effect=Exception("API Error"))

    # Make request
    response = client.post(
        "/api/chat", json={"message": "Hello", "model": "gpt-3.5-turbo"}
    )

    # Check response
    assert response.status_code == 500
    assert "error" in response.json()
    assert "API Error" in response.json()["error"]
