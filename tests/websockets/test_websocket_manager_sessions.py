import unittest

from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from setta.types.notifications import SettaNotification
from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsgAllConnections,
    WebsocketMsgNotification,
)
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


class WebsocketManagerSessionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.websocket_manager = WebsocketManager()
        self.messages_by_socket: dict[str, list[Message]] = {}
        self.websockets: dict[str, WebSocket] = {}
        for suffix in ("a", "b"):
            messages: list[Message] = []
            websocket = await _build_websocket(messages)
            socket_id = f"frontend-{suffix}"
            await self.websocket_manager.on_connect(
                websocket,
                WebsocketConnectionType.FRONTEND,
                id=socket_id,
                shareSessionId=f"session-{suffix}",
            )
            self.messages_by_socket[socket_id] = messages
            self.websockets[socket_id] = websocket
        for messages in self.messages_by_socket.values():
            messages.clear()

    async def asyncTearDown(self) -> None:
        for websocket in self.websockets.values():
            await websocket.close()

    async def test_broadcast_to_session_filters_connections(self) -> None:
        notification = SettaNotification(message="Hello share")
        message = WebsocketMsgNotification(content=notification)

        await self.websocket_manager.broadcast_to_session(
            message,
            share_session_id="session-a",
            connectionType=WebsocketConnectionType.FRONTEND,
        )

        messages_a = _sent_text_messages(self.messages_by_socket["frontend-a"])
        messages_b = _sent_text_messages(self.messages_by_socket["frontend-b"])

        self.assertEqual(1, len(messages_a))
        self.assertEqual(0, len(messages_b))

        parsed = WebsocketMsgNotification.model_validate_json(messages_a[0])
        self.assertEqual("Hello share", parsed.content.message)

    async def test_broadcast_connections_includes_session_ids(self) -> None:
        for messages in self.messages_by_socket.values():
            messages.clear()

        await self.websocket_manager.broadcast_connections()

        messages = _sent_text_messages(self.messages_by_socket["frontend-a"])
        self.assertEqual(1, len(messages))

        parsed = WebsocketMsgAllConnections.model_validate_json(messages[0])
        connections = {conn.id: conn for conn in parsed.content}

        self.assertEqual("session-a", connections["frontend-a"].shareSessionId)
        self.assertEqual("session-b", connections["frontend-b"].shareSessionId)

    async def test_on_connect_can_skip_connection_broadcast(self) -> None:
        messages_c: list[Message] = []
        websocket_c = await _build_websocket(messages_c)
        await self.websocket_manager.on_connect(
            websocket_c,
            WebsocketConnectionType.FRONTEND,
            id="frontend-c",
            shareSessionId="session-c",
            broadcast_connections=False,
        )

        messages_a = _sent_text_messages(self.messages_by_socket["frontend-a"])
        messages_b = _sent_text_messages(self.messages_by_socket["frontend-b"])
        messages_c_text = _sent_text_messages(messages_c)

        self.assertEqual(0, len(messages_a))
        self.assertEqual(0, len(messages_b))
        self.assertEqual(0, len(messages_c_text))

        await self.websocket_manager.on_disconnect(
            "frontend-c",
            broadcast_connections=False,
        )
        await websocket_c.close()


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
