import unittest

from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.generated.websocket_unions import PythonScriptWebsocketMsgTypeAdapter
from setta.types.id import ID
from setta.types.listener import (
    ListenerDependencyMode,
    ListenerRegisterCallback,
    RealtimeUIChangeContent,
)
from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsgListenerRealtimeEvent,
    WebsocketMsgRealtimeUIChange,
)
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_receiver import WMHFrontendReceiver
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


class FrontendReceiverShareModeTests(unittest.IsolatedAsyncioTestCase):
    async def test_share_receiver_requires_session_id(self) -> None:
        websocket_manager = WebsocketManager()
        listener_registry = ListenerRegistry()
        sender = WMHPythonScriptSender(websocket_manager, listener_registry)
        event_hub = RealtimeEventHub(sender)
        receiver = WMHFrontendReceiver(
            websocket_manager,
            project_manager=None,
            realtime_event_hub=event_hub,
            share_mode=True,
        )

        messages: list[Message] = []
        websocket = await _build_websocket(messages)
        websocket_id = await websocket_manager.on_connect(
            websocket,
            WebsocketConnectionType.FRONTEND,
            id="frontend-missing",
            shareSessionId=None,
        )

        with self.assertRaises(KeyError):
            await receiver.on_connect(websocket_id)

        await websocket.close()

    async def test_share_receiver_emits_realtime_delta(self) -> None:
        websocket_manager = WebsocketManager()
        listener_registry = ListenerRegistry()
        sender = WMHPythonScriptSender(websocket_manager, listener_registry)
        event_hub = RealtimeEventHub(sender)
        receiver = WMHFrontendReceiver(
            websocket_manager,
            project_manager=None,
            realtime_event_hub=event_hub,
            share_mode=True,
        )

        listener_messages: list[Message] = []
        listener_socket = await _build_websocket(listener_messages)
        listener_id = await websocket_manager.on_connect(
            listener_socket,
            WebsocketConnectionType.PYTHON_SCRIPT,
            id="python-listener",
            shareSessionId="session-a",
        )

        project_config_id = ID("share-project")
        dependency = create_dep_key(sectionId=ID("section-a"), codeObjId=ID("param-a"))
        listener_registry.upsert_registration(
            websocket_id=listener_id,
            project_config_id=project_config_id,
            callbacks={
                "cb": ListenerRegisterCallback(
                    dependencies=[dependency],
                    dependencyMode=ListenerDependencyMode.SPECIFIC,
                    actions=None,
                )
            },
            share_session_id="session-a",
        )

        frontend_messages: list[Message] = []
        frontend_socket = await _build_websocket(frontend_messages)
        frontend_id = await websocket_manager.on_connect(
            frontend_socket,
            WebsocketConnectionType.FRONTEND,
            id="frontend-share",
            shareSessionId="session-a",
        )
        await receiver.on_connect(frontend_id)

        content = RealtimeUIChangeContent(
            projectConfigId=project_config_id,
            dependencyKey=dependency,
            value=LiteralDependencyValue("hello"),
        )
        message = WebsocketMsgRealtimeUIChange(content=content)

        await receiver.process_json_str(message.model_dump_json(), frontend_id)

        sent = _sent_text_messages(listener_messages)
        self.assertEqual(1, len(sent))
        parsed = PythonScriptWebsocketMsgTypeAdapter.validate_json(sent[0])
        self.assertIsInstance(parsed, WebsocketMsgListenerRealtimeEvent)
        self.assertEqual(1, parsed.content.sequence)
        self.assertEqual(dependency, parsed.content.deltas[0].dependency)

        await frontend_socket.close()
        await listener_socket.close()


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
