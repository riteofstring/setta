import unittest

from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.id import ID
from setta.types.listener import (
    DependencyEvent,
    ListenerDependencyMode,
    ListenerRegisterCallback,
    ListenerRealtimeDelta,
)
from setta.types.websocket import (
    WebsocketConnectionInfoWithSocket,
    WebsocketConnectionType,
    WebsocketMsgListenerDependencyEvent,
    WebsocketMsgListenerRealtimeEvent,
)
from setta.types.generated.websocket_unions import (
    PythonScriptWebsocketMsgTypeAdapter,
)
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.realtime_event_hub import RealtimeEventHub
from setta.websockets.websocket_manager import WebsocketManager


async def _build_connected_websocket(messages: list[Message]) -> WebSocket:
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
    websocket = WebSocket(scope=scope, receive=receive, send=send)
    await websocket.accept()
    return websocket


def _sent_text_messages(messages: list[Message]) -> list[str]:
    return [
        message["text"]
        for message in messages
        if message.get("type") == "websocket.send" and "text" in message
    ]


class ActionEventDispatchTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.websocket_manager = WebsocketManager()
        self.listener_registry = ListenerRegistry()
        self.sender = WMHPythonScriptSender(
            self.websocket_manager, self.listener_registry
        )
        self.event_hub = RealtimeEventHub(self.sender)
        self.project_config_id = ID("proj-actions")
        self._messages_by_socket: dict[str, list[Message]] = {}
        self._websockets: dict[str, WebSocket] = {}

        for socket_id in (
            "socket-specific",
            "socket-wildcard",
            "socket-none",
            "socket-other",
        ):
            await self._register_socket(socket_id)

    async def asyncTearDown(self) -> None:
        for socket_id, websocket in self._websockets.items():
            self.websocket_manager.sockets.pop(socket_id, None)
            await websocket.close()

    async def _register_socket(self, socket_id: str) -> None:
        messages: list[Message] = []
        websocket = await _build_connected_websocket(messages)
        self.websocket_manager.sockets[socket_id] = WebsocketConnectionInfoWithSocket(
            id=socket_id,
            connectionType=WebsocketConnectionType.PYTHON_SCRIPT,
            currentAddress=None,
            websocket=websocket,
        )
        self._messages_by_socket[socket_id] = messages
        self._websockets[socket_id] = websocket

    async def test_send_action_event_targets_action_subscribers(self) -> None:
        action_dependency = create_dep_key(sectionId=ID("section-action"))
        self.listener_registry.upsert_registration(
            websocket_id="socket-specific",
            project_config_id=self.project_config_id,
            callbacks={
                "cb-specific": ListenerRegisterCallback(
                    dependencies=[action_dependency],
                    dependencyMode=ListenerDependencyMode.REALTIME_ONLY,
                )
            },
        )
        self.listener_registry.upsert_registration(
            websocket_id="socket-wildcard",
            project_config_id=self.project_config_id,
            callbacks={
                "cb-wildcard": ListenerRegisterCallback(
                    dependencies=[],
                    dependencyMode=ListenerDependencyMode.REALTIME_ONLY,
                )
            },
        )
        self.listener_registry.upsert_registration(
            websocket_id="socket-none",
            project_config_id=self.project_config_id,
            callbacks={
                "cb-none": ListenerRegisterCallback(
                    dependencies=[],
                    dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
                )
            },
        )
        self.listener_registry.upsert_registration(
            websocket_id="socket-other",
            project_config_id=ID("proj-other"),
            callbacks={
                "cb-other": ListenerRegisterCallback(
                    dependencies=[],
                    dependencyMode=ListenerDependencyMode.REALTIME_ONLY,
                )
            },
        )

        action_event = DependencyEvent(
            dependencyKey=action_dependency,
            payload=None,
            timestampMs=123,
        )

        await self.sender.send_dependency_event(
            projectConfigId=self.project_config_id,
            dependencyEvents=[action_event],
            sequence=3,
        )

        specific_messages = _sent_text_messages(
            self._messages_by_socket["socket-specific"]
        )
        wildcard_messages = _sent_text_messages(
            self._messages_by_socket["socket-wildcard"]
        )
        none_messages = _sent_text_messages(self._messages_by_socket["socket-none"])
        other_messages = _sent_text_messages(self._messages_by_socket["socket-other"])

        self.assertEqual(1, len(specific_messages))
        self.assertEqual(1, len(wildcard_messages))
        self.assertEqual(0, len(none_messages))
        self.assertEqual(0, len(other_messages))

        parsed_specific = PythonScriptWebsocketMsgTypeAdapter.validate_json(
            specific_messages[0]
        )
        self.assertIsInstance(parsed_specific, WebsocketMsgListenerDependencyEvent)
        self.assertEqual(self.project_config_id, parsed_specific.content.projectConfigId)
        self.assertEqual(3, parsed_specific.content.sequence)
        self.assertEqual(1, len(parsed_specific.content.dependencyEvents))
        self.assertEqual(
            action_dependency, parsed_specific.content.dependencyEvents[0].dependencyKey
        )

        parsed_wildcard = PythonScriptWebsocketMsgTypeAdapter.validate_json(
            wildcard_messages[0]
        )
        self.assertIsInstance(parsed_wildcard, WebsocketMsgListenerDependencyEvent)
        self.assertEqual(self.project_config_id, parsed_wildcard.content.projectConfigId)
        self.assertEqual(3, parsed_wildcard.content.sequence)

    async def test_emit_action_event_increments_sequence(self) -> None:
        action_dependency = create_dep_key(sectionId=ID("section-action"))
        self.listener_registry.upsert_registration(
            websocket_id="socket-wildcard",
            project_config_id=self.project_config_id,
            callbacks={
                "cb-wildcard": ListenerRegisterCallback(
                    dependencies=[],
                    dependencyMode=ListenerDependencyMode.REALTIME_ONLY,
                )
            },
        )

        action_event = DependencyEvent(
            dependencyKey=action_dependency,
            payload=None,
            timestampMs=123,
        )

        await self.event_hub.emit_dependency_event(
            project_config_id=self.project_config_id,
            dependency_events=[action_event],
        )
        await self.event_hub.emit_dependency_event(
            project_config_id=self.project_config_id,
            dependency_events=[action_event],
        )

        wildcard_messages = _sent_text_messages(
            self._messages_by_socket["socket-wildcard"]
        )
        self.assertEqual(2, len(wildcard_messages))

        parsed_first = PythonScriptWebsocketMsgTypeAdapter.validate_json(
            wildcard_messages[0]
        )
        parsed_second = PythonScriptWebsocketMsgTypeAdapter.validate_json(
            wildcard_messages[1]
        )
        self.assertIsInstance(parsed_first, WebsocketMsgListenerDependencyEvent)
        self.assertIsInstance(parsed_second, WebsocketMsgListenerDependencyEvent)
        self.assertEqual(1, parsed_first.content.sequence)
        self.assertEqual(2, parsed_second.content.sequence)

    async def test_emit_action_event_shares_sequence_with_realtime_delta(self) -> None:
        dependency = create_dep_key(
            sectionId=ID("section-a"),
            codeObjId=ID("param-a"),
        )
        action_dependency = create_dep_key(sectionId=ID("section-action"))
        self.listener_registry.upsert_registration(
            websocket_id="socket-specific",
            project_config_id=self.project_config_id,
            callbacks={
                "cb-specific": ListenerRegisterCallback(
                    dependencies=[dependency, action_dependency],
                    dependencyMode=ListenerDependencyMode.REALTIME_ONLY,
                )
            },
        )

        delta = ListenerRealtimeDelta(
            dependency=dependency,
            value=LiteralDependencyValue("value-1"),
        )
        await self.event_hub.emit_realtime_delta(
            project_config_id=self.project_config_id,
            deltas=[delta],
        )

        action_event = DependencyEvent(
            dependencyKey=action_dependency,
            payload=None,
            timestampMs=321,
        )
        await self.event_hub.emit_dependency_event(
            project_config_id=self.project_config_id,
            dependency_events=[action_event],
        )

        specific_messages = _sent_text_messages(
            self._messages_by_socket["socket-specific"]
        )
        self.assertEqual(2, len(specific_messages))

        parsed_delta = PythonScriptWebsocketMsgTypeAdapter.validate_json(
            specific_messages[0]
        )
        parsed_action = PythonScriptWebsocketMsgTypeAdapter.validate_json(
            specific_messages[1]
        )
        self.assertIsInstance(parsed_delta, WebsocketMsgListenerRealtimeEvent)
        self.assertIsInstance(parsed_action, WebsocketMsgListenerDependencyEvent)
        self.assertEqual(1, parsed_delta.content.sequence)
        self.assertEqual(2, parsed_action.content.sequence)

    async def test_emit_action_event_rejects_empty_payload(self) -> None:
        with self.assertRaises(ValueError):
            await self.event_hub.emit_dependency_event(
                project_config_id=self.project_config_id,
                dependency_events=[],
            )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
