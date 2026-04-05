import pytest
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


@pytest.mark.asyncio
async def test_sequences_reset_per_share_session() -> None:
    websocket_manager = WebsocketManager()
    listener_registry = ListenerRegistry()
    sender = WMHPythonScriptSender(websocket_manager, listener_registry)
    event_hub = RealtimeEventHub(sender)
    project_config_id = ID("share-project")
    dependency = create_dep_key(sectionId=ID("section-a"), codeObjId=ID("param-a"))
    messages: list[Message] = []
    websocket = await _build_websocket(messages)
    websocket_id = await websocket_manager.on_connect(
        websocket,
        WebsocketConnectionType.PYTHON_SCRIPT,
        id="python-1",
    )
    listener_registry.upsert_registration(
        websocket_id=websocket_id,
        project_config_id=project_config_id,
        callbacks={
            "cb": ListenerRegisterCallback(
                dependencies=[dependency],
                dependencyMode=ListenerDependencyMode.ALWAYS,
            )
        },
    )

    try:
        delta = ListenerRealtimeDelta(
            dependency=dependency,
            value=LiteralDependencyValue("value"),
        )

        await event_hub.emit_realtime_delta(
            project_config_id=project_config_id,
            deltas=[delta],
            share_session_id="session-a",
        )
        await event_hub.emit_realtime_delta(
            project_config_id=project_config_id,
            deltas=[delta],
            share_session_id="session-a",
        )
        await event_hub.emit_realtime_delta(
            project_config_id=project_config_id,
            deltas=[delta],
            share_session_id="session-b",
        )

        sent_messages = _sent_text_messages(messages)
        assert len(sent_messages) == 3
        parsed = [
            PythonScriptWebsocketMsgTypeAdapter.validate_json(text)
            for text in sent_messages
        ]
        for message in parsed:
            assert isinstance(message, WebsocketMsgListenerRealtimeEvent)
            assert message.content.projectConfigId == project_config_id

        sequences = [message.content.sequence for message in parsed]
        assert sequences == [1, 2, 1]
    finally:
        await websocket.close()
