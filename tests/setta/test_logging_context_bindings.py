import asyncio
import unittest
from typing import Any

from starlette.types import Scope
from starlette.websockets import WebSocket

from setta.logging.context import (
    clear_logging_context,
    get_logging_context,
    reset_logging_context,
)
from setta.logging.context_bindings import (
    bind_background_task_logging_context,
    bind_websocket_logging_context,
    wrap_background_callable,
    wrap_background_coroutine,
)


class LoggingContextBindingsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._token = clear_logging_context()

    def tearDown(self) -> None:
        reset_logging_context(self._token)

    async def test_bind_websocket_logging_context_infers_metadata(self) -> None:
        websocket = _make_websocket(
            path="/api/ws/frontend",
            path_params={"projectConfigId": "alpha"},
        )
        async with bind_websocket_logging_context(
            websocket,
            websocket_id="ws-test",
        ):
            context = get_logging_context()
            self.assertEqual(context["websocket_id"], "ws-test")
            self.assertEqual(context["project_id"], "alpha")
            self.assertEqual(context["path"], "/api/ws/frontend")

    async def test_wrap_background_callable_handles_sync_and_async(self) -> None:
        calls: list[dict[str, str]] = []

        def _sync_job(value: str) -> str:
            calls.append(get_logging_context())
            return value

        async def _async_job(value: str) -> str:
            calls.append(get_logging_context())
            return value

        wrapped_sync = wrap_background_callable(
            _sync_job,
            label="sync-job",
            project_id="beta",
        )
        wrapped_async = wrap_background_callable(
            _async_job,
            label="async-job",
            project_id="gamma",
        )

        sync_result = await wrapped_sync("s-value")
        async_result = await wrapped_async("a-value")

        self.assertEqual(sync_result, "s-value")
        self.assertEqual(async_result, "a-value")
        self.assertEqual(calls[0]["task"], "sync-job")
        self.assertEqual(calls[0]["project_id"], "beta")
        self.assertEqual(calls[1]["task"], "async-job")
        self.assertEqual(calls[1]["project_id"], "gamma")

    async def test_wrap_background_coroutine_sets_context(self) -> None:
        async def _coro() -> str:
            return get_logging_context()["task"]

        wrapped = wrap_background_coroutine(
            _coro(),
            label="manual-task",
            request_id="req-123",
        )
        result = await wrapped
        self.assertEqual(result, "manual-task")

    async def test_bind_background_task_logging_context_context_manager(self) -> None:
        async def _bounded_call() -> dict[str, str]:
            with bind_background_task_logging_context(label="cm-task", websocket_id="ws-77"):
                return get_logging_context()

        context = await _bounded_call()
        self.assertEqual(context["task"], "cm-task")
        self.assertEqual(context["websocket_id"], "ws-77")


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
        "client": ("127.0.0.1", 9100),
        "server": ("testserver", 80),
        "subprotocols": [],
        "extensions": {},
        "state": {},
        "path_params": path_params or {},
        "app": object(),
    }

    async def empty_receive() -> dict[str, Any]:
        return {"type": "websocket.receive", "bytes": b"", "text": "", "more_body": False}

    async def empty_send(message: dict[str, Any]) -> None:
        return None

    return WebSocket(scope, empty_receive, empty_send)


if __name__ == "__main__":
    unittest.main()
