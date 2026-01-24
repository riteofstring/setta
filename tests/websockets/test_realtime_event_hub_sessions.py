import unittest

from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.id import ID
from setta.types.listener import (
    ListenerDependencyMode,
    ListenerRegisterCallback,
    ListenerRealtimeDelta,
)
from setta.types.generated.websocket_unions import PythonScriptWebsocketMsgTypeAdapter
from setta.types.websocket import WebsocketConnectionType, WebsocketMsgListenerRealtimeEvent
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.realtime_event_hub import RealtimeEventHub
from setta.websockets.websocket_manager import WebsocketManager


async def _build_websocket(messages: list[Message]) -> WebSocket:
    receive_queue: list[Message] = [{"type": "websocket.connect"}]

    async def receive() -> Message:
        if receive_queue:
            return receive_queue.pop(0)
        return {"type": "websocket.receive"}

    async def send(message: Message) -> None:
        messages.append(message)

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
    return WebSocket(scope=scope, receive=receive, send=send)


def _sent_text_messages(messages: list[Message]) -> list[str]:
    return [
        message["text"]
        for message in messages
        if message.get("type") == "websocket.send" and "text" in message
    ]


class RealtimeEventHubShareSessionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.websocket_manager = WebsocketManager()
        self.listener_registry = ListenerRegistry()
        self.sender = WMHPythonScriptSender(
            self.websocket_manager, self.listener_registry
        )
        self.event_hub = RealtimeEventHub(self.sender)
        self.project_config_id = ID("share-project")
        self.dependency = create_dep_key(
            sectionId=ID("section-a"), codeObjId=ID("param-a")
        )
        self.messages: list[Message] = []
        websocket = await _build_websocket(self.messages)
        self.websocket_id = await self.websocket_manager.on_connect(
            websocket,
            WebsocketConnectionType.PYTHON_SCRIPT,
            id="python-1",
        )
        self.websocket = websocket
        self.listener_registry.upsert_registration(
            websocket_id=self.websocket_id,
            project_config_id=self.project_config_id,
            callbacks={
                "cb": ListenerRegisterCallback(
                    dependencies=[self.dependency],
                    dependencyMode=ListenerDependencyMode.SPECIFIC,
                    actions=None,
                )
            },
        )

    async def asyncTearDown(self) -> None:
        await self.websocket.close()

    async def test_sequences_reset_per_share_session(self) -> None:
        delta = ListenerRealtimeDelta(
            dependency=self.dependency,
            value=LiteralDependencyValue("value"),
        )

        await self.event_hub.emit_realtime_delta(
            project_config_id=self.project_config_id,
            deltas=[delta],
            share_session_id="session-a",
        )
        await self.event_hub.emit_realtime_delta(
            project_config_id=self.project_config_id,
            deltas=[delta],
            share_session_id="session-a",
        )
        await self.event_hub.emit_realtime_delta(
            project_config_id=self.project_config_id,
            deltas=[delta],
            share_session_id="session-b",
        )

        messages = _sent_text_messages(self.messages)
        self.assertEqual(3, len(messages))
        parsed = [
            PythonScriptWebsocketMsgTypeAdapter.validate_json(text)
            for text in messages
        ]
        for message in parsed:
            self.assertIsInstance(message, WebsocketMsgListenerRealtimeEvent)
            self.assertEqual(
                self.project_config_id, message.content.projectConfigId
            )

        sequences = [message.content.sequence for message in parsed]
        self.assertEqual([1, 2, 1], sequences)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
