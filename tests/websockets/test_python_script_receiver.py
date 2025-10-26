import json
import unittest
from pathlib import Path

from setta.project_state.history import History
from setta.project_state.project_manager import ProjectManager
from setta.types.project_state import ProjectStateBackend
from setta.types.websocket import (
    WebsocketConnectionInfoWithSocket,
    WebsocketConnectionType,
)
from setta.utils.constants import C
from setta.websockets.msg_handlers.python_script_receiver import (
    WMHPythonScriptReceiver,
)
from setta.websockets.script_metadata import ScriptMetadata
from setta.websockets.websocket_manager import WebsocketManager
from starlette.types import Message, Scope
from starlette.websockets import WebSocket


class PythonScriptRequestFullStateTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        project_json_path = (
            Path(__file__).resolve().parents[2] / "setta_files" / "project.json"
        )
        project_state_backend = ProjectStateBackend.model_validate_json(
            project_json_path.read_text()
        )

        project_manager = object.__new__(ProjectManager)
        project_manager.history = History(project_state_backend)

        self.project_manager = project_manager
        self.websocket_manager = WebsocketManager()
        self.script_metadata = ScriptMetadata()
        self.receiver = WMHPythonScriptReceiver(
            self.websocket_manager, self.script_metadata, self.project_manager
        )

        self.websocket_id = "python-script-test-socket"
        self._sent_messages: list[Message] = []
        self._receive_counter = 0

        async def _receive() -> Message:
            if self._receive_counter == 0:
                self._receive_counter += 1
                return {"type": "websocket.connect"}
            return {"type": "websocket.receive"}

        async def _send(message: Message) -> None:
            self._sent_messages.append(message)

        scope: Scope = {
            "type": "websocket",
            "asgi": {"version": "3.0"},
            "scheme": "ws",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": [],
            "client": ("testclient", 0),
            "server": ("testserver", 80),
            "subprotocols": [],
        }
        self.websocket = WebSocket(scope=scope, receive=_receive, send=_send)
        await self.websocket.accept()

        self.websocket_manager.sockets[self.websocket_id] = (
            WebsocketConnectionInfoWithSocket(
                id=self.websocket_id,
                connectionType=WebsocketConnectionType.PYTHON_SCRIPT,
                currentAddress=None,
                websocket=self.websocket,
            )
        )

    async def asyncTearDown(self):
        self.websocket_manager.sockets.pop(self.websocket_id, None)
        await self.websocket.close()

    async def test_request_full_state_with_specific_config(self):
        self._sent_messages.clear()
        default_config_id = (
            self.project_manager.project_state_backend.defaultProjectConfigId
        )
        request_payload = {
            "messageType": C.WS_SCRIPT_REQUEST_FULL_STATE,
            "content": {"projectConfigId": default_config_id},
        }

        await self.receiver.process_json_str(
            json.dumps(request_payload), self.websocket_id
        )

        self.assertTrue(
            self._sent_messages, "Expected websocket snapshot response after request."
        )
        payload = json.loads(self._sent_messages[-1]["text"])
        self.assertEqual(payload["messageType"], C.WS_PROJECT_DATA)
        content = payload["content"]
        self.assertIsInstance(content, dict)
        self.assertEqual(content["projectConfigId"], default_config_id)
        self.assertIn("projectState", content)
        self.assertEqual(
            content["projectState"]["projectConfig"]["id"],
            default_config_id,
        )

    async def test_request_full_state_without_override_uses_default(self):
        self._sent_messages.clear()

        await self.receiver.process_json_str(
            json.dumps(
                {
                    "messageType": C.WS_SCRIPT_REQUEST_FULL_STATE,
                    "content": {},
                }
            ),
            self.websocket_id,
        )

        self.assertTrue(
            self._sent_messages, "Expected websocket snapshot response after request."
        )
        payload = json.loads(self._sent_messages[-1]["text"])
        self.assertEqual(payload["messageType"], C.WS_PROJECT_DATA)
        content = payload["content"]
        self.assertIsInstance(content, dict)
        self.assertEqual(
            content["projectConfigId"],
            self.project_manager.project_state_backend.defaultProjectConfigId,
        )
