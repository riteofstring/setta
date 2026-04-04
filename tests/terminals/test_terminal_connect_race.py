import asyncio
from collections import deque
from pathlib import Path
from queue import Queue
from tempfile import TemporaryDirectory

from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.terminals.terminals import Terminals
from setta.utils.constants import C
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def test_connect_does_not_crash_if_disconnected_during_prompt_wait() -> None:
    results: Queue[bool] = Queue(maxsize=1)

    with TemporaryDirectory() as tmpdir:
        dbe = DBE(Path(tmpdir))
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        settings_file = SettingsFile(dbe, frontend_sender)
        terminals = Terminals(frontend_sender, settings_file)

        app = FastAPI()

        @app.websocket("/ws/{section_id}/{client_id}")
        async def ws_endpoint(
            websocket: WebSocket,
            section_id: str,
            client_id: str,
        ) -> None:
            terminals.PTY_PIDS[section_id] = {
                "terminalPromptIsReady": asyncio.Event(),
                "history": deque(maxlen=1000),
            }

            async def trigger_disconnect_then_prompt_ready() -> None:
                await asyncio.sleep(0.05)
                await websocket.close()
                terminals.PTY_PIDS[section_id]["terminalPromptIsReady"].set()
                await terminals.send_output_to_sectionId(
                    section_id,
                    C.SETTA_TERMINAL_READY,
                    setSentReadyMsg=True,
                )

            asyncio.create_task(trigger_disconnect_then_prompt_ready())
            did_connect = await terminals.connect(websocket, section_id, client_id)
            results.put(did_connect)

        client = TestClient(app)
        try:
            with client.websocket_connect("/ws/terminal-section/client-1"):
                did_connect = results.get(timeout=2.0)
            assert did_connect is False
        finally:
            client.close()
