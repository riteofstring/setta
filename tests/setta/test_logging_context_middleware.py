import unittest

from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient
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


class LoggingContextMiddlewareTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(_build_test_app())

    def tearDown(self) -> None:
        self.client.close()

    def test_middleware_populates_request_metadata(self) -> None:
        response = self.client.get("/projects/sample/status")
        response.raise_for_status()
        payload = response.json()

        context = payload["context"]
        self.assertEqual(context["path"], "/projects/sample/status")
        self.assertEqual(context["method"], "GET")
        self.assertEqual(context["project_config_id"], "sample")
        self.assertEqual(context["endpoint"], "get_project_status")
        self.assertTrue(context["request_id"].startswith("req-"))
        self.assertEqual(payload["state_request_id"], context["request_id"])

    def test_requests_receive_distinct_context(self) -> None:
        first = self.client.get("/projects/alpha/status").json()
        second = self.client.get("/projects/beta/status").json()

        first_context = first["context"]
        second_context = second["context"]

        self.assertNotEqual(first_context["request_id"], second_context["request_id"])
