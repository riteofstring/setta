import asyncio
import inspect
import os
import uuid
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import IsolatedAsyncioTestCase

from lsprotocol import types as LSPTypes
import litellm

from setta.project_state.lsp_response_handlers.completion import (
    process_completion_response,
)
from setta.project_state.lsp_response_handlers.signatureHelp import (
    process_signature_help_response,
)
from setta.types.generated.settings_state import SettingsState
from tests.utils.lsp_harness import start_lsp


def _skip_completion_signature_tests() -> bool:
    return os.environ.get("SETTA_LSP_TEST_ONLY_DIAGNOSTICS") == "1"


def _unwrap_completion_items(response: object) -> list[object]:
    if not isinstance(response, dict):
        return []
    result = response.get("result")
    if isinstance(result, list):
        return result
    if isinstance(result, dict):
        items = result.get("items")
        if isinstance(items, list):
            return items
    return []


async def _poll_until(
    *,
    timeout_s: float,
    interval_s: float,
    request_fn,
    predicate_fn,
):
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_s
    last_value = None
    while loop.time() < deadline:
        last_value = await request_fn()
        if predicate_fn(last_value):
            return last_value
        await asyncio.sleep(interval_s)
    return last_value


async def _request_signature_help(harness, filepath: Path, line: int, character: int):
    request_id = str(uuid.uuid4())
    harness.writer.pending_requests[request_id] = asyncio.Future()
    await harness.writer.send_signature_help_request(
        filepath=filepath,
        line=line,
        character=character,
        request_id=request_id,
    )
    try:
        return await harness.writer.wait_for_response(request_id, timeout=2.0)
    except asyncio.TimeoutError:
        return None


class TestLSPStack(IsolatedAsyncioTestCase):
    async def test_initialize_handshake_sets_is_initialized(self) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            async with start_lsp(workspace) as harness:
                self.assertTrue(harness.server.is_initialized)

    async def test_completion_on_open_document_returns_items(self) -> None:
        if _skip_completion_signature_tests():
            self.skipTest("SETTA_LSP_TEST_ONLY_DIAGNOSTICS=1")

        with TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            filepath = workspace / "completion_test.py"
            code = "import os\nos.pa\n"
            filepath.write_text(code)

            async with start_lsp(workspace) as harness:
                await harness.writer.send_document_open_request(filepath, code)

                async def request_completion():
                    request_id = str(uuid.uuid4())
                    harness.writer.pending_requests[request_id] = asyncio.Future()
                    await harness.writer.send_autocomplete_request(
                        filepath=filepath,
                        line=1,
                        character=5,
                        request_id=request_id,
                    )
                    try:
                        return await harness.writer.wait_for_response(
                            request_id, timeout=2.0
                        )
                    except asyncio.TimeoutError:
                        return None

                response = await _poll_until(
                    timeout_s=10.0,
                    interval_s=0.2,
                    request_fn=request_completion,
                    predicate_fn=lambda candidate: bool(
                        candidate
                        and _unwrap_completion_items(candidate)
                        and process_completion_response(candidate)
                    ),
                )

                self.assertIsNotNone(response)
                self.assertGreater(len(_unwrap_completion_items(response)), 0)
                self.assertGreater(len(process_completion_response(response)), 0)

    async def test_signature_help_returns_signature(self) -> None:
        if _skip_completion_signature_tests():
            self.skipTest("SETTA_LSP_TEST_ONLY_DIAGNOSTICS=1")

        with TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            filepath = workspace / "signature_test.py"
            code = (
                'def foo(a: int, b: str = "x") -> None:\n'
                "    pass\n"
                "\n"
                "foo(\n"
            )
            filepath.write_text(code)

            async with start_lsp(workspace) as harness:
                await harness.writer.send_document_open_request(filepath, code)

                async def request_signature_help():
                    request_id = str(uuid.uuid4())
                    harness.writer.pending_requests[request_id] = asyncio.Future()
                    await harness.writer.send_signature_help_request(
                        filepath=filepath,
                        line=3,
                        character=4,
                        request_id=request_id,
                    )
                    try:
                        return await harness.writer.wait_for_response(
                            request_id, timeout=2.0
                        )
                    except asyncio.TimeoutError:
                        return None

                response = await _poll_until(
                    timeout_s=10.0,
                    interval_s=0.2,
                    request_fn=request_signature_help,
                    predicate_fn=lambda candidate: bool(
                        candidate and candidate.result and candidate.result.signatures
                    ),
                )

                self.assertIsNotNone(response)
                self.assertIsInstance(
                    response, LSPTypes.TextDocumentSignatureHelpResponse
                )
                signature = response.result.signatures[0]
                self.assertIsNotNone(signature.parameters)
                self.assertEqual(len(signature.parameters), 2)
                settings = SettingsState()
                parsed = process_signature_help_response(settings, response)
                self.assertIsNotNone(parsed)

    async def test_signature_help_returns_signature_for_math_sqrt(self) -> None:
        if _skip_completion_signature_tests():
            self.skipTest("SETTA_LSP_TEST_ONLY_DIAGNOSTICS=1")

        with TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            filepath = workspace / "signature_math_test.py"
            call_line = "math.sqrt("
            code = f"import math\n{call_line}\n"
            filepath.write_text(code)

            async with start_lsp(workspace) as harness:
                await harness.writer.send_document_open_request(filepath, code)

                response = await _poll_until(
                    timeout_s=10.0,
                    interval_s=0.2,
                    request_fn=lambda: _request_signature_help(
                        harness, filepath, 1, len(call_line)
                    ),
                    predicate_fn=lambda candidate: bool(
                        candidate and candidate.result and candidate.result.signatures
                    ),
                )

                self.assertIsNotNone(response)
                self.assertIsInstance(
                    response, LSPTypes.TextDocumentSignatureHelpResponse
                )
                signature = response.result.signatures[0]
                self.assertIsNotNone(signature.parameters)
                self.assertEqual(len(signature.parameters), 1)
                settings = SettingsState()
                parsed = process_signature_help_response(settings, response)
                self.assertIsNotNone(parsed)

    async def test_signature_help_returns_signature_for_litellm_completion(
        self,
    ) -> None:
        if _skip_completion_signature_tests():
            self.skipTest("SETTA_LSP_TEST_ONLY_DIAGNOSTICS=1")

        with TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            filepath = workspace / "signature_litellm_test.py"
            call_line = "litellm.completion("
            code = f"import litellm\n{call_line}\n"
            filepath.write_text(code)

            async with start_lsp(workspace) as harness:
                await harness.writer.send_document_open_request(filepath, code)

                response = await _poll_until(
                    timeout_s=10.0,
                    interval_s=0.2,
                    request_fn=lambda: _request_signature_help(
                        harness, filepath, 1, len(call_line)
                    ),
                    predicate_fn=lambda candidate: bool(
                        candidate and candidate.result and candidate.result.signatures
                    ),
                )

                self.assertIsNotNone(response)
                self.assertIsInstance(
                    response, LSPTypes.TextDocumentSignatureHelpResponse
                )
                signature = response.result.signatures[0]
                expected_param_count = len(
                    inspect.signature(litellm.completion).parameters
                )
                self.assertIsNotNone(signature.parameters)
                self.assertGreaterEqual(len(signature.parameters), expected_param_count)
                settings = SettingsState()
                parsed = process_signature_help_response(settings, response)
                self.assertIsNotNone(parsed)

    async def test_publish_diagnostics_callback_fires_for_syntax_error(self) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            filepath = workspace / "diagnostics_test.py"
            code = "def broken(\n    pass\n"
            filepath.write_text(code)

            diagnostics_event = asyncio.Event()
            notifications: list[LSPTypes.TextDocumentPublishDiagnosticsNotification] = []

            async def diagnostics_callback(
                notification: LSPTypes.TextDocumentPublishDiagnosticsNotification,
            ) -> None:
                notifications.append(notification)
                if notification.params.diagnostics:
                    diagnostics_event.set()

            async with start_lsp(workspace) as harness:
                await harness.writer.send_document_open_request(
                    filepath,
                    code,
                    diagnostics_callback=diagnostics_callback,
                )

                try:
                    await asyncio.wait_for(diagnostics_event.wait(), timeout=10.0)
                except asyncio.TimeoutError:
                    observed_lengths = [
                        len(notification.params.diagnostics)
                        for notification in notifications
                    ]
                    self.fail(
                        "Expected non-empty diagnostics callback; "
                        f"observed diagnostics lengths={observed_lengths}"
                    )

                self.assertGreater(len(notifications), 0)
                self.assertGreater(len(notifications[-1].params.diagnostics), 0)
