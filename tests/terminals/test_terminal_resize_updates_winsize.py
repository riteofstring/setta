import json
import os
import time
import warnings
from collections import deque
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.terminals.terminals import Terminals
from setta.utils.constants import C
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def test_terminal_resize_message_updates_winsize_and_cached_rows_cols() -> None:
    """Integration coverage for the resize JSON path in write_to_terminal().

    Validates:
    - The resize message updates the cached `rows`/`cols` on the PTY info dict.
    - The PTY file descriptor reflects the new winsize (best-effort; platforms may vary).
    """

    try:
        from ptyprocess import PtyProcessUnicode as PtyProcess
    except Exception as exc:  # pragma: no cover - platform-specific dependency
        raise RuntimeError("ptyprocess is required for terminal resize tests") from exc

    with TemporaryDirectory() as tmpdir:
        dbe = DBE(Path(tmpdir))
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        settings_file = SettingsFile(dbe, frontend_sender)
        terminals = Terminals(frontend_sender, settings_file)

        section_id = "terminal-section"
        # Python 3.13+ warns about forkpty in multi-threaded processes; ptyprocess
        # relies on forkpty, so suppress the specific deprecation noise here.
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message=(
                    r"This process .* use of forkpty\(\) may lead to deadlocks in the child\."
                ),
                category=DeprecationWarning,
                module="pty",
            )
            pty_process = PtyProcess.spawn(["bash"])
        try:
            terminals.PTY_PIDS[section_id] = {
                "process": pty_process,
                "history": deque(maxlen=1000),
                "rows": None,
                "cols": None,
            }

            app = FastAPI()

            @app.websocket("/ws")
            async def ws_endpoint(websocket: WebSocket) -> None:
                await websocket.accept()
                await terminals.write_to_terminal(websocket, section_id)

            client = TestClient(app)
            try:
                with client.websocket_connect("/ws") as websocket:
                    websocket.send_text(
                        json.dumps(
                            {
                                "messageType": C.WS_TERMINAL_RESIZE,
                                "rows": 24,
                                "cols": 80,
                            }
                        )
                    )
                    # Wait for the server loop to process the resize.
                    deadline = time.time() + 2.0
                    while time.time() < deadline:
                        rows = terminals.PTY_PIDS[section_id].get("rows")
                        cols = terminals.PTY_PIDS[section_id].get("cols")
                        if rows == 24 and cols == 80:
                            break
                        time.sleep(0.01)
                    websocket.close()

                # write_to_terminal() should have recorded the requested dims.
                assert terminals.PTY_PIDS[section_id]["rows"] == 24
                assert terminals.PTY_PIDS[section_id]["cols"] == 80

                # Best-effort: confirm the underlying fd reflects the new size.
                deadline = time.time() + 2.0
                size = os.get_terminal_size(pty_process.fd)
                while time.time() < deadline and (
                    size.lines != 24 or size.columns != 80
                ):
                    time.sleep(0.01)
                    size = os.get_terminal_size(pty_process.fd)
                assert size.lines == 24
                assert size.columns == 80
            finally:
                client.close()
        finally:
            pty_process.terminate(force=True)
