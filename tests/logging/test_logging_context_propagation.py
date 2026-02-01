import asyncio

import pytest

from setta.logging.context import (
    get_logging_context,
    push_logging_context,
    reset_logging_context,
)
from setta.lsp.reader import LanguageServerReader
from setta.lsp.server import LanguageServer
from setta.lsp.writer import LanguageServerWriter
from setta.utils.async_debouncer import AsyncDebouncer


@pytest.mark.asyncio
async def test_trigger_runs_job_with_current_context() -> None:
    contexts: list[dict[str, str]] = []
    done = asyncio.Event()

    async def _job() -> None:
        contexts.append(get_logging_context())
        done.set()

    debouncer = AsyncDebouncer(_job, wait=0.01, label="debounce-test")
    token = push_logging_context(project_config_id="proj-ctx", request_id="req-ctx")
    try:
        debouncer.trigger()
        await asyncio.wait_for(done.wait(), timeout=1)
    finally:
        reset_logging_context(token)

    assert contexts[0]["task"] == "debounce-test"
    assert contexts[0]["project_config_id"] == "proj-ctx"
    assert contexts[0]["request_id"] == "req-ctx"


@pytest.mark.asyncio
async def test_writer_send_and_wait_binds_request_metadata(tmp_path) -> None:
    server = LanguageServer(tmp_path, settings={}, name="unit-writer")
    writer = LanguageServerWriter(server)
    contexts: list[dict[str, str]] = []
    request_id = "req-lsp"

    async def _fake_request() -> None:
        contexts.append(get_logging_context())
        writer.pending_requests[request_id].set_result("done")

    result = await writer.send_and_wait(_fake_request(), request_id)
    assert result == "done"
    assert contexts[0]["task"] == "lsp-send-request"
    assert contexts[0]["lsp_request_id"] == request_id
    assert contexts[0]["lsp_server"] == "unit-writer"


@pytest.mark.asyncio
async def test_reader_diagnostics_callback_carries_context(tmp_path) -> None:
    server = LanguageServer(tmp_path, settings={}, name="unit-reader")
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

    assert contexts[0]["task"] == "lsp-diagnostics-callback"
    assert contexts[0]["uri"] == uri
    assert contexts[0]["lsp_server"] == "unit-reader"
