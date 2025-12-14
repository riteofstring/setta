import unittest
from typing import Annotated, Any

from pydantic import BaseModel, Field
from setta.logging.context_models import SensitiveLoggingField
from setta.logging.context_sources import (
    ProjectContextModel,
    attach_request_context_models,
    attach_websocket_context_models,
    build_background_task_context,
    build_request_context,
    build_websocket_context,
    ensure_request_context,
    ensure_websocket_context,
    get_project_id_from_payload,
)
from starlette.requests import Request
from starlette.types import Scope
from starlette.websockets import WebSocket


class SamplePayload(ProjectContextModel):
    projectConfigId: str

    def get_project_config_id_for_context(self) -> str | None:
        return self.projectConfigId


class NestedPayload(ProjectContextModel):
    content: SamplePayload

    def get_project_config_id_for_context(self) -> str | None:
        return self.content.projectConfigId


class LoggingContextSourcesTests(unittest.TestCase):
    def test_build_request_context_infers_project_and_request_id(self) -> None:
        request = _make_request(
            method="post",
            path="/api/projects/alpha/load",
            path_params={"project_id": "alpha"},
        )
        context = build_request_context(request)
        self.assertEqual(context["project_id"], "alpha")
        first_request_id = context["request_id"]
        second_request_id = build_request_context(request)["request_id"]
        self.assertEqual(first_request_id, second_request_id)
        self.assertTrue(first_request_id.startswith("req-"))

    def test_build_request_context_uses_query_params_as_fallback(self) -> None:
        request = _make_request(
            method="get",
            path="/api/projects",
            query_string="projectConfigId=beta",
        )
        context = build_request_context(request)
        self.assertEqual(context["project_id"], "beta")
        self.assertEqual(ensure_request_context(request), context["request_id"])

    def test_attach_request_context_models_merges_fields(self) -> None:
        class ExamplePayload(BaseModel):
            projectId: str
            sectionId: int
            token: Annotated[str, SensitiveLoggingField()]
            apiKey: str = Field(..., json_schema_extra={"setta_sensitive": True})

        request = _make_request(method="post", path="/api/projects")
        attach_request_context_models(
            request,
            ExamplePayload(
                projectId="omega",
                sectionId=9,
                token="secret",
                apiKey="hidden",
            ),
        )
        context = build_request_context(request)
        self.assertEqual(context["example_payload_projectId"], "omega")
        self.assertEqual(context["example_payload_sectionId"], 9)
        self.assertNotIn("example_payload_token", context)
        self.assertNotIn("example_payload_apiKey", context)

    def test_build_websocket_context_uses_path_params(self) -> None:
        websocket = _make_websocket(
            path="/api/ws",
            path_params={"projectConfigId": "delta"},
        )
        context = build_websocket_context(websocket)
        websocket_id = context["websocket_id"]
        self.assertEqual(context["project_id"], "delta")
        self.assertTrue(websocket_id.startswith("ws-"))
        self.assertEqual(websocket_id, ensure_websocket_context(websocket))

    def test_attach_websocket_context_models_merges_fields(self) -> None:
        class ExamplePayload(BaseModel):
            projectId: str
            counter: int

        websocket = _make_websocket(path="/api/ws")
        attach_websocket_context_models(
            websocket,
            ExamplePayload(projectId="pi", counter=3),
            ExamplePayload(projectId="pi", counter=4),
        )
        context = build_websocket_context(websocket)
        self.assertEqual(context["example_payload_projectId"], "pi")
        self.assertEqual(context["example_payload_counter"], 3)
        self.assertEqual(context["example_payload_2_counter"], 4)

    def test_build_background_task_context_merges_values(self) -> None:
        context = build_background_task_context(
            label="autosave",
            project_id="alpha",
            request_id="req-zeta",
            websocket_id="ws-2",
            extra_values={"section_id": "sec-9"},
        )
        self.assertEqual(
            context,
            {
                "task": "autosave",
                "project_id": "alpha",
                "request_id": "req-zeta",
                "websocket_id": "ws-2",
                "section_id": "sec-9",
            },
        )

    def test_background_task_context_includes_models(self) -> None:
        class BackgroundPayload(BaseModel):
            taskId: str
            retryCount: int

        context = build_background_task_context(
            label="sync",
            context_models=(BackgroundPayload(taskId="a", retryCount=2),),
        )
        self.assertEqual(context["task"], "sync")
        self.assertEqual(context["background_payload_taskId"], "a")
        self.assertEqual(context["background_payload_retryCount"], 2)

    def test_get_project_id_from_payload(self) -> None:
        payload = SamplePayload(projectConfigId="gamma")
        self.assertEqual(get_project_id_from_payload(payload), "gamma")

    def test_get_project_id_from_nested_payload(self) -> None:
        payload = NestedPayload(content=SamplePayload(projectConfigId="theta"))
        self.assertEqual(get_project_id_from_payload(payload), "theta")


def _make_request(
    *,
    method: str,
    path: str,
    headers: list[tuple[bytes, bytes]] | None = None,
    query_string: str | None = None,
    path_params: dict[str, Any] | None = None,
) -> Request:
    scope: Scope = {
        "type": "http",
        "http_version": "1.1",
        "scheme": "http",
        "method": method.upper(),
        "path": path,
        "root_path": "",
        "query_string": query_string.encode() if query_string else b"",
        "headers": headers or [],
        "client": ("127.0.0.1", 8000),
        "server": ("testserver", 80),
        "path_params": path_params or {},
        "app": object(),
        "state": {},
    }

    async def empty_receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, empty_receive)


def _make_websocket(
    *,
    path: str,
    headers: list[tuple[bytes, bytes]] | None = None,
    query_string: str | None = None,
    path_params: dict[str, Any] | None = None,
) -> WebSocket:
    scope: Scope = {
        "type": "websocket",
        "path": path,
        "query_string": query_string.encode() if query_string else b"",
        "scheme": "ws",
        "headers": headers or [],
        "client": ("127.0.0.1", 9000),
        "server": ("testserver", 80),
        "subprotocols": [],
        "extensions": {},
        "state": {},
        "path_params": path_params or {},
        "app": object(),
    }

    async def empty_receive() -> dict[str, Any]:
        return {
            "type": "websocket.receive",
            "bytes": b"",
            "text": "",
            "more_body": False,
        }

    async def empty_send(message: dict[str, Any]) -> None:
        return None

    return WebSocket(scope, empty_receive, empty_send)


if __name__ == "__main__":
    unittest.main()
