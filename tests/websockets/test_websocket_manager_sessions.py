import asyncio

import pytest
import pytest_asyncio
from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from setta.types.notifications import SettaNotification
from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsgAllConnections,
    WebsocketMsgNotification,
    WebsocketMsgTypeForFrontend,
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


class TestWebsocketManagerSession:
    pytestmark = pytest.mark.asyncio

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self) -> None:
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

        yield

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

        assert len(messages_a) == 1
        assert len(messages_b) == 0

        parsed = WebsocketMsgNotification.model_validate_json(messages_a[0])
        assert parsed.content.message == "Hello share"

    async def test_broadcast_connections_includes_session_ids(self) -> None:
        for messages in self.messages_by_socket.values():
            messages.clear()

        await self.websocket_manager.broadcast_connections()

        messages = _sent_text_messages(self.messages_by_socket["frontend-a"])
        assert len(messages) == 1

        parsed = WebsocketMsgAllConnections.model_validate_json(messages[0])
        connections = {conn.id: conn for conn in parsed.content}

        assert connections["frontend-a"].shareSessionId == "session-a"
        assert connections["frontend-b"].shareSessionId == "session-b"

    async def test_broadcast_sends_to_targets_concurrently(self, monkeypatch) -> None:
        notification = SettaNotification(message="Concurrent fanout")
        message = WebsocketMsgNotification(content=notification)
        active = 0
        max_active = 0

        async def fake_send_payload(_payload: str, _to_websocket_id: str) -> bool:
            nonlocal active, max_active
            active += 1
            max_active = max(max_active, active)
            await asyncio.sleep(0.02)
            active -= 1
            return True

        monkeypatch.setattr(
            self.websocket_manager,
            "_send_text_payload",
            fake_send_payload,
        )

        await self.websocket_manager.broadcast(
            message,
            connectionType=WebsocketConnectionType.FRONTEND,
        )

        assert max_active >= 2

    async def test_broadcast_serializes_payload_once_for_all_targets(
        self, monkeypatch
    ) -> None:
        message = WebsocketMsgNotification(
            content=SettaNotification(message="Serialize once")
        )
        dump_calls = 0
        original_dump = WebsocketMsgNotification.model_dump_json

        def record_dump(self, *args, **kwargs):
            nonlocal dump_calls
            dump_calls += 1
            return original_dump(self, *args, **kwargs)

        monkeypatch.setattr(
            WebsocketMsgNotification,
            "model_dump_json",
            record_dump,
        )

        await self.websocket_manager.broadcast(
            message,
            connectionType=WebsocketConnectionType.FRONTEND,
        )

        messages_a = _sent_text_messages(self.messages_by_socket["frontend-a"])
        messages_b = _sent_text_messages(self.messages_by_socket["frontend-b"])
        assert len(messages_a) == 1
        assert len(messages_b) == 1
        assert dump_calls == 1

        parsed_a = WebsocketMsgNotification.model_validate_json(messages_a[0])
        parsed_b = WebsocketMsgNotification.model_validate_json(messages_b[0])
        assert parsed_a.content.message == "Serialize once"
        assert parsed_b.content.message == "Serialize once"

    async def test_broadcast_skips_serialization_when_no_targets(
        self, monkeypatch
    ) -> None:
        message = WebsocketMsgNotification(
            content=SettaNotification(message="No targets")
        )
        dump_calls = 0
        original_dump = WebsocketMsgNotification.model_dump_json

        def record_dump(self, *args, **kwargs):
            nonlocal dump_calls
            dump_calls += 1
            return original_dump(self, *args, **kwargs)

        monkeypatch.setattr(
            WebsocketMsgNotification,
            "model_dump_json",
            record_dump,
        )

        # No python-script sockets are connected in this fixture.
        await self.websocket_manager.broadcast(
            message,
            connectionType=WebsocketConnectionType.PYTHON_SCRIPT,
        )

        assert dump_calls == 0

    async def test_broadcast_to_session_serializes_payload_once_for_targets(
        self, monkeypatch
    ) -> None:
        messages_c: list[Message] = []
        websocket_c = await _build_websocket(messages_c)
        await self.websocket_manager.on_connect(
            websocket_c,
            WebsocketConnectionType.FRONTEND,
            id="frontend-c",
            shareSessionId="session-a",
            broadcast_connections=False,
        )
        dump_calls = 0
        original_dump = WebsocketMsgNotification.model_dump_json

        def record_dump(self, *args, **kwargs):
            nonlocal dump_calls
            dump_calls += 1
            return original_dump(self, *args, **kwargs)

        monkeypatch.setattr(
            WebsocketMsgNotification,
            "model_dump_json",
            record_dump,
        )
        message = WebsocketMsgNotification(
            content=SettaNotification(message="Serialize once per session")
        )
        try:
            await self.websocket_manager.broadcast_to_session(
                message,
                share_session_id="session-a",
                connectionType=WebsocketConnectionType.FRONTEND,
            )
        finally:
            await self.websocket_manager.on_disconnect(
                "frontend-c",
                broadcast_connections=False,
            )
            await websocket_c.close()

        messages_a = _sent_text_messages(self.messages_by_socket["frontend-a"])
        messages_b = _sent_text_messages(self.messages_by_socket["frontend-b"])
        messages_c_text = _sent_text_messages(messages_c)
        assert len(messages_a) == 1
        assert len(messages_c_text) == 1
        assert len(messages_b) == 0
        assert dump_calls == 1

    async def test_broadcast_to_session_skips_serialization_when_no_targets(
        self, monkeypatch
    ) -> None:
        message = WebsocketMsgNotification(
            content=SettaNotification(message="No session targets")
        )
        dump_calls = 0
        original_dump = WebsocketMsgNotification.model_dump_json

        def record_dump(self, *args, **kwargs):
            nonlocal dump_calls
            dump_calls += 1
            return original_dump(self, *args, **kwargs)

        monkeypatch.setattr(
            WebsocketMsgNotification,
            "model_dump_json",
            record_dump,
        )

        # Session id does not exist, so broadcast should return before serialization.
        await self.websocket_manager.broadcast_to_session(
            message,
            share_session_id="missing-session",
            connectionType=WebsocketConnectionType.FRONTEND,
        )

        assert dump_calls == 0

    async def test_send_message_returns_delivery_status(self) -> None:
        message = WebsocketMsgNotification(
            content=SettaNotification(message="Delivery status")
        )
        delivered = await self.websocket_manager.send_message(message, "frontend-a")
        assert delivered is True

        await self.websockets["frontend-a"].close()
        self.websockets.pop("frontend-a", None)
        delivered_after_close = await self.websocket_manager.send_message(
            message,
            "frontend-a",
        )
        assert delivered_after_close is False

    async def test_payload_metrics_capture_bytes_and_fanout_counts(self) -> None:
        self.websocket_manager.reset_payload_metrics()
        message = WebsocketMsgNotification(
            content=SettaNotification(message="Payload metrics")
        )
        payload_bytes = len(message.model_dump_json().encode("utf-8"))

        # Cover single-send, multi-target broadcast, and session-scoped broadcast.
        await self.websocket_manager.send_message(message, "frontend-a")
        await self.websocket_manager.broadcast(
            message,
            connectionType=WebsocketConnectionType.FRONTEND,
        )
        await self.websocket_manager.broadcast_to_session(
            message,
            share_session_id="session-a",
            connectionType=WebsocketConnectionType.FRONTEND,
        )

        snapshot = self.websocket_manager.get_payload_metrics_snapshot()
        assert snapshot["messages"] == 3
        assert snapshot["fanoutTargets"] == 4

        payload_snapshot = snapshot["payloadBytes"]
        assert isinstance(payload_snapshot, dict)
        assert payload_snapshot["count"] == 3
        assert payload_snapshot["totalBytes"] == payload_bytes * 3

        transport_snapshot = snapshot["transportBytes"]
        assert isinstance(transport_snapshot, dict)
        assert transport_snapshot["count"] == 3
        assert transport_snapshot["totalBytes"] == payload_bytes * 4

        by_message_type = snapshot["byMessageType"]
        assert isinstance(by_message_type, dict)
        notification_snapshot = by_message_type[
            WebsocketMsgTypeForFrontend.Notification.value
        ]
        assert isinstance(notification_snapshot, dict)
        assert notification_snapshot["messages"] == 3
        assert notification_snapshot["fanoutTargets"] == 4

    async def test_payload_metrics_skip_no_target_broadcasts(self) -> None:
        self.websocket_manager.reset_payload_metrics()
        message = WebsocketMsgNotification(
            content=SettaNotification(message="No targets for metrics")
        )

        # No PYTHON_SCRIPT sockets are connected in this fixture.
        await self.websocket_manager.broadcast(
            message,
            connectionType=WebsocketConnectionType.PYTHON_SCRIPT,
        )
        await self.websocket_manager.broadcast_to_session(
            message,
            share_session_id="missing-session",
            connectionType=WebsocketConnectionType.FRONTEND,
        )

        snapshot = self.websocket_manager.get_payload_metrics_snapshot()
        assert snapshot["messages"] == 0
        assert snapshot["fanoutTargets"] == 0
        assert snapshot["byMessageType"] == {}

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

        assert len(messages_a) == 0
        assert len(messages_b) == 0
        assert len(messages_c_text) == 0

        await self.websocket_manager.on_disconnect(
            "frontend-c",
            broadcast_connections=False,
        )
        await websocket_c.close()

    async def test_frontend_affinity_token_stays_server_owned_across_reconnects(
        self,
    ) -> None:
        first_websocket = await _build_websocket([])
        first_websocket_id = await self.websocket_manager.on_connect(
            first_websocket,
            WebsocketConnectionType.FRONTEND,
            id="frontend-reconnect-a",
            shareSessionId="session-reconnect",
            broadcast_connections=False,
        )

        try:
            first_affinity_token = self.websocket_manager.get_frontend_affinity_token(
                first_websocket_id
            )
            assert first_affinity_token is not None
            self.websocket_manager.update_current_address(
                "/project#setta-ws-affinity=tab-stable",
                first_websocket_id,
            )
            assert (
                self.websocket_manager.sockets[first_websocket_id].currentAddress
                == "/project"
            )
            stable_affinity_token = self.websocket_manager.get_frontend_affinity_token(
                first_websocket_id
            )
            assert stable_affinity_token == first_affinity_token

            await self.websocket_manager.on_disconnect(
                first_websocket_id,
                broadcast_connections=False,
            )
            await first_websocket.close()

            second_websocket = await _build_websocket([])
            second_websocket_id = await self.websocket_manager.on_connect(
                second_websocket,
                WebsocketConnectionType.FRONTEND,
                id="frontend-reconnect-b",
                shareSessionId="session-reconnect",
                broadcast_connections=False,
            )
            try:
                second_connection_token = (
                    self.websocket_manager.get_frontend_affinity_token(
                        second_websocket_id
                    )
                )
                assert second_connection_token is not None

                self.websocket_manager.update_current_address(
                    "/project#setta-ws-affinity=tab-stable",
                    second_websocket_id,
                )
                assert (
                    self.websocket_manager.sockets[second_websocket_id].currentAddress
                    == "/project"
                )
                rebound_affinity_token = (
                    self.websocket_manager.get_frontend_affinity_token(
                        second_websocket_id
                    )
                )
                assert rebound_affinity_token == second_connection_token
                assert rebound_affinity_token != stable_affinity_token
                assert (
                    self.websocket_manager.resolve_frontend_websocket_id_from_affinity_token(
                        affinity_token=stable_affinity_token,
                        share_session_id="session-reconnect",
                    )
                    is None
                )
                assert (
                    self.websocket_manager.resolve_frontend_websocket_id_from_affinity_token(
                        affinity_token=rebound_affinity_token,
                        share_session_id="session-reconnect",
                    )
                    == second_websocket_id
                )
            finally:
                await self.websocket_manager.on_disconnect(
                    second_websocket_id,
                    broadcast_connections=False,
                )
                await second_websocket.close()
        finally:
            if first_websocket_id in self.websocket_manager.sockets:
                await self.websocket_manager.on_disconnect(
                    first_websocket_id,
                    broadcast_connections=False,
                )

    async def test_broadcast_connections_redacts_affinity_marker_from_current_address(
        self,
    ) -> None:
        self.websocket_manager.update_current_address(
            "/project#setta-ws-affinity=tab-secret",
            "frontend-a",
        )
        await self.websocket_manager.broadcast_connections()

        messages = _sent_text_messages(self.messages_by_socket["frontend-a"])
        assert len(messages) == 1
        payload = WebsocketMsgAllConnections.model_validate_json(messages[0])
        by_id = {connection.id: connection for connection in payload.content}
        assert by_id["frontend-a"].currentAddress == "/project"

    async def test_current_address_updates_cannot_rebind_other_frontend_affinity(
        self,
    ) -> None:
        frontend_a_token = self.websocket_manager.get_frontend_affinity_token(
            "frontend-a"
        )
        assert frontend_a_token is not None

        self.websocket_manager.update_current_address(
            "/project#setta-ws-affinity=spoofed-tab",
            "frontend-b",
        )
        resolved_id = (
            self.websocket_manager.resolve_frontend_websocket_id_from_affinity_token(
                affinity_token=frontend_a_token,
                share_session_id="session-a",
            )
        )
        assert resolved_id == "frontend-a"
