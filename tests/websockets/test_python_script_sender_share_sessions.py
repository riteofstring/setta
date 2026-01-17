import unittest

from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.generated.websocket_unions import PythonScriptWebsocketMsgTypeAdapter
from setta.types.id import ID
from setta.types.listener import (
    ListenerDependencyMode,
    ListenerRealtimeDelta,
    ListenerRegisterCallback,
)
from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsgListenerForceRefresh,
    WebsocketMsgListenerRealtimeEvent,
)
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
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


class PythonScriptSenderShareSessionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.websocket_manager = WebsocketManager()
        self.listener_registry = ListenerRegistry()
        self.sender = WMHPythonScriptSender(
            self.websocket_manager, self.listener_registry
        )
        self.project_config_id = ID("share-project")
        self.dependency = create_dep_key(
            sectionId=ID("section-a"), codeObjId=ID("param-a")
        )
        self.messages_by_label: dict[str, list[Message]] = {}
        self.websockets: list[WebSocket] = []

        for label, share_session_id in (
            ("session-a", "session-a"),
            ("session-b", "session-b"),
            ("shared", None),
        ):
            messages: list[Message] = []
            websocket = await _build_websocket(messages)
            socket_id = await self.websocket_manager.on_connect(
                websocket,
                WebsocketConnectionType.PYTHON_SCRIPT,
                id=f"listener-{label}",
                shareSessionId=share_session_id,
            )
            self.messages_by_label[label] = messages
            self.websockets.append(websocket)
            self.listener_registry.record_bootstrap(
                websocket_id=socket_id,
                project_config_id=self.project_config_id,
                share_session_id=share_session_id,
            )
            self.listener_registry.upsert_registration(
                websocket_id=socket_id,
                project_config_id=self.project_config_id,
                callbacks={
                    "cb": ListenerRegisterCallback(
                        dependencies=[self.dependency],
                        dependencyMode=ListenerDependencyMode.ALWAYS,
                    )
                },
                share_session_id=share_session_id,
            )

    async def asyncTearDown(self) -> None:
        for websocket in self.websockets:
            await websocket.close()

    async def test_realtime_update_filters_by_share_session(self) -> None:
        delta = ListenerRealtimeDelta(
            dependency=self.dependency,
            value=LiteralDependencyValue("value"),
        )

        await self.sender.send_realtime_update(
            projectConfigId=self.project_config_id,
            deltas=[delta],
            sequence=1,
            share_session_id="session-a",
        )

        sent_a = _sent_text_messages(self.messages_by_label["session-a"])
        sent_b = _sent_text_messages(self.messages_by_label["session-b"])
        sent_shared = _sent_text_messages(self.messages_by_label["shared"])

        self.assertEqual(1, len(sent_a))
        self.assertEqual(0, len(sent_b))
        self.assertEqual(1, len(sent_shared))

        parsed = PythonScriptWebsocketMsgTypeAdapter.validate_json(sent_a[0])
        self.assertIsInstance(parsed, WebsocketMsgListenerRealtimeEvent)

    async def test_force_refresh_filters_by_share_session(self) -> None:
        await self.sender.send_force_refresh(
            projectConfigId=self.project_config_id,
            share_session_id="session-b",
        )

        sent_a = _sent_text_messages(self.messages_by_label["session-a"])
        sent_b = _sent_text_messages(self.messages_by_label["session-b"])
        sent_shared = _sent_text_messages(self.messages_by_label["shared"])

        self.assertEqual(0, len(sent_a))
        self.assertEqual(1, len(sent_b))
        self.assertEqual(1, len(sent_shared))

        parsed = PythonScriptWebsocketMsgTypeAdapter.validate_json(sent_b[0])
        self.assertIsInstance(parsed, WebsocketMsgListenerForceRefresh)
