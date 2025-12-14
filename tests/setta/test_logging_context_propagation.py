import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from setta.logging.context import (
    get_logging_context,
    push_logging_context,
    reset_logging_context,
)
from setta.lsp.reader import LanguageServerReader
from setta.lsp.server import LanguageServer
from setta.lsp.writer import LanguageServerWriter
from setta.utils.async_debouncer import AsyncDebouncer
from setta.utils.constants import C
from setta.websockets import connect as cli_connect


class AsyncDebouncerLoggingTests(unittest.IsolatedAsyncioTestCase):
    async def test_trigger_runs_job_with_current_context(self) -> None:
        contexts: list[dict[str, str]] = []
        done = asyncio.Event()

        async def _job() -> None:
            contexts.append(get_logging_context())
            done.set()

        debouncer = AsyncDebouncer(_job, wait=0.01, label="debounce-test")
        token = push_logging_context(project_id="proj-ctx", request_id="req-ctx")
        try:
            debouncer.trigger()
            await asyncio.wait_for(done.wait(), timeout=1)
        finally:
            reset_logging_context(token)

        self.assertEqual(contexts[0]["task"], "debounce-test")
        self.assertEqual(contexts[0]["project_id"], "proj-ctx")
        self.assertEqual(contexts[0]["request_id"], "req-ctx")


class LanguageServerLoggingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._tempdir = tempfile.TemporaryDirectory()
        self.workspace = Path(self._tempdir.name)

    def tearDown(self) -> None:
        self._tempdir.cleanup()

    async def test_writer_send_and_wait_binds_request_metadata(self) -> None:
        server = LanguageServer(self.workspace, settings={}, name="unit-writer")
        writer = LanguageServerWriter(server)
        contexts: list[dict[str, str]] = []
        request_id = "req-lsp"

        async def _fake_request() -> None:
            contexts.append(get_logging_context())
            writer.pending_requests[request_id].set_result("done")

        result = await writer.send_and_wait(_fake_request(), request_id)
        self.assertEqual(result, "done")
        self.assertEqual(contexts[0]["task"], "lsp-send-request")
        self.assertEqual(contexts[0]["lsp_request_id"], request_id)
        self.assertEqual(contexts[0]["lsp_server"], "unit-writer")

    async def test_reader_diagnostics_callback_carries_context(self) -> None:
        server = LanguageServer(self.workspace, settings={}, name="unit-reader")
        reader = LanguageServerReader(server)
        uri = "file:///tmp/example.py"
        contexts: list[dict[str, str]] = []
        notified = asyncio.Event()

        async def _diagnostics_callback(_payload) -> None:
            contexts.append(get_logging_context())
            notified.set()

        reader.add_diagnostics_response_callback(uri, _diagnostics_callback)
        reader.process_response_without_id(
            "textDocument/publishDiagnostics",
            {
                "params": {
                    "uri": uri,
                    "diagnostics": [
                        {
                            "range": {
                                "start": {"line": 0, "character": 0},
                                "end": {"line": 0, "character": 1},
                            },
                            "message": "stub",
                        }
                    ],
                }
            },
        )
        await asyncio.wait_for(notified.wait(), timeout=1)

        self.assertEqual(contexts[0]["task"], "lsp-diagnostics-callback")
        self.assertEqual(contexts[0]["uri"], uri)
        self.assertEqual(contexts[0]["lsp_server"], "unit-reader")


class WebsocketConnectLoggingTests(unittest.IsolatedAsyncioTestCase):
    async def test_cli_run_code_tasks_include_cli_metadata(self) -> None:
        messages = [
            json.dumps(
                {
                    "messageType": C.WS_RUN_CODE,
                    "content": "echo 'ok'",
                }
            )
        ]

        async def _websocket():
            for payload in messages:
                yield payload

        recorded: list[dict[str, str]] = []
        finished = asyncio.Event()

        async def _fake_run_code(command: str) -> None:
            recorded.append(get_logging_context())
            self.assertEqual(command, "echo 'ok'")
            finished.set()

        with patch.object(cli_connect, "run_code_as_subprocess", _fake_run_code):
            await cli_connect.consumer_handler(_websocket(), "cli-123")
            await asyncio.wait_for(finished.wait(), timeout=1)

        context = recorded[0]
        self.assertEqual(context["task"], "cli-run-code")
        self.assertEqual(context["cli_connection_id"], "cli-123")
        self.assertEqual(context["command"], "echo 'ok'")


if __name__ == "__main__":
    unittest.main()
