import asyncio
import sys
from pathlib import Path

import pytest

from setta.lsp.managers import (
    LSPReaders,
    LSPServers,
    LSPWriters,
    start_lsps,
    stop_file_watcher,
    stop_lsps,
)
from setta.lsp.registrations import RegisteredLanguageServer
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


@pytest.mark.asyncio
async def test_fixture_language_server_handles_diagnostics_and_completion(
    tmp_path: Path,
) -> None:
    # End-to-end integration: real stdio fixture server receives requests and returns diagnostics/completion.
    fixture_server_path = (
        Path(__file__).resolve().parents[1]
        / "fixtures"
        / "plugins"
        / "backend-language-server-e2e"
        / "backend"
        / "mini_language_server.py"
    )
    registration = RegisteredLanguageServer(
        plugin_id="setta-fixture-backend-language-server-e2e",
        name="setta-fixture-backend-language-server-e2e:fixturedsl",
        language="fixturedsl",
        command=sys.executable,
        args=(str(fixture_server_path),),
        settings_key="fixtureDslLanguageServer",
    )

    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager)
    lsps = LSPServers(
        {
            "fixtureDslLanguageServer": {
                "analysis": {
                    "emitDiagnostics": True,
                }
            }
        },
        workspace_root=tmp_path,
        plugin_language_servers=[registration],
    )
    writers = LSPWriters(lsps)
    readers = LSPReaders(lsps, frontend_sender)

    diagnostics_event = asyncio.Event()
    diagnostics_payload = {}

    async def diagnostics_callback(notification) -> None:
        diagnostics_payload["value"] = notification
        diagnostics_event.set()

    try:
        await start_lsps(lsps, readers, writers)
        writer = writers.get_for_language("fixturedsl")
        assert writer is not None

        file_path = tmp_path / "fixture.ts"
        await writer.send_document_open_request(
            filepath=file_path,
            code="const value = __fixture_error__;\n",
            diagnostics_callback=diagnostics_callback,
            language_id="fixturedsl",
        )

        await asyncio.wait_for(diagnostics_event.wait(), timeout=5)
        notification = diagnostics_payload.get("value")
        assert notification is not None
        diagnostics = notification.params.diagnostics
        assert len(diagnostics) == 1
        assert diagnostics[0].code == "fixture-ts"
        assert diagnostics[0].message == "Fixture TypeScript diagnostic"

        request_id = "fixture-completion"
        completion_response = await writer.send_and_wait(
            writer.send_autocomplete_request(
                filepath=file_path,
                line=0,
                character=2,
                request_id=request_id,
            ),
            request_id,
        )
        assert completion_response is not None
        assert (
            completion_response.get("result", {}).get("items", [])[0].get("label")
            == "fixtureCompletion"
        )
    finally:
        stop_file_watcher(writers)
        await stop_lsps(lsps, readers)
