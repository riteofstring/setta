from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient
import pytest
from setta.logging.context import get_logging_context
from setta.logging.context_sources import ensure_request_context
from setta.middleware import LoggingContextMiddleware, bind_request_logging_context


def _build_test_app() -> FastAPI:
    app = FastAPI(dependencies=[Depends(bind_request_logging_context)])
    app.add_middleware(LoggingContextMiddleware)

    @app.get("/projects/{project_config_id}/status")
    async def get_project_status(project_config_id: str, request: Request):
        return {
            "context": get_logging_context(),
            "state_request_id": ensure_request_context(request),
        }

    return app


@pytest.fixture
def client() -> TestClient:
    client = TestClient(_build_test_app())
    try:
        yield client
    finally:
        client.close()


def test_middleware_populates_request_metadata(client: TestClient) -> None:
    response = client.get("/projects/sample/status")
    response.raise_for_status()
    payload = response.json()

    context = payload["context"]
    assert context["path"] == "/projects/sample/status"
    assert context["method"] == "GET"
    assert context["endpoint"] == "get_project_status"
    assert context["request_id"].startswith("req-")
    assert payload["state_request_id"] == context["request_id"]


def test_requests_receive_distinct_context(client: TestClient) -> None:
    first = client.get("/projects/alpha/status").json()
    second = client.get("/projects/beta/status").json()

    first_context = first["context"]
    second_context = second["context"]

    assert first_context["request_id"] != second_context["request_id"]
    assert first_context["path"] == "/projects/alpha/status"
    assert second_context["path"] == "/projects/beta/status"
