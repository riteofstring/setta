import asyncio
import logging
import os
import secrets
from dataclasses import dataclass, field
from enum import Enum

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect, WebSocketState
from websockets.exceptions import ConnectionClosedError

from setta.types.websocket import (
    WebsocketConnectionInfo,
    WebsocketConnectionInfoWithSocket,
    WebsocketConnectionType,
    WebsocketMsg,
    WebsocketMsgAllConnections,
)
from setta.utils.generate_memorable_string import generate_memorable_string

logger = logging.getLogger(__name__)

_WEBSOCKET_SEND_TIMEOUT_ENV = "SETTA_WEBSOCKET_SEND_TIMEOUT_S"
_DEFAULT_WEBSOCKET_SEND_TIMEOUT_S = 5.0
_FRONTEND_AFFINITY_ADDRESS_MARKER = "#setta-ws-affinity="


@dataclass(slots=True)
class _PayloadSizeMetrics:
    count: int = 0
    total_bytes: int = 0
    min_bytes: int | None = None
    max_bytes: int | None = None

    def record(self, payload_bytes: int) -> None:
        self.count += 1
        self.total_bytes += payload_bytes
        if self.min_bytes is None or payload_bytes < self.min_bytes:
            self.min_bytes = payload_bytes
        if self.max_bytes is None or payload_bytes > self.max_bytes:
            self.max_bytes = payload_bytes

    def snapshot(self) -> dict[str, int | float | None]:
        avg_bytes: float | None = None
        if self.count > 0:
            avg_bytes = self.total_bytes / self.count
        return {
            "count": self.count,
            "totalBytes": self.total_bytes,
            "minBytes": self.min_bytes,
            "maxBytes": self.max_bytes,
            "avgBytes": avg_bytes,
        }


@dataclass(slots=True)
class _WebsocketPayloadMetricsBucket:
    messages: int = 0
    fanout_targets: int = 0
    payload_bytes: _PayloadSizeMetrics = field(default_factory=_PayloadSizeMetrics)
    transport_bytes: _PayloadSizeMetrics = field(default_factory=_PayloadSizeMetrics)

    def record(self, *, payload_bytes: int, target_count: int) -> None:
        self.messages += 1
        self.fanout_targets += target_count
        self.payload_bytes.record(payload_bytes)
        self.transport_bytes.record(payload_bytes * target_count)

    def snapshot(self) -> dict[str, object]:
        return {
            "messages": self.messages,
            "fanoutTargets": self.fanout_targets,
            "payloadBytes": self.payload_bytes.snapshot(),
            "transportBytes": self.transport_bytes.snapshot(),
        }


@dataclass(slots=True)
class _WebsocketPayloadMetricsState:
    total: _WebsocketPayloadMetricsBucket = field(
        default_factory=_WebsocketPayloadMetricsBucket
    )
    by_message_type: dict[str, _WebsocketPayloadMetricsBucket] = field(
        default_factory=dict
    )

    def reset(self) -> None:
        self.total = _WebsocketPayloadMetricsBucket()
        self.by_message_type.clear()

    def record(
        self, *, message_type: str, payload_bytes: int, target_count: int
    ) -> None:
        self.total.record(payload_bytes=payload_bytes, target_count=target_count)
        if message_type not in self.by_message_type:
            self.by_message_type[message_type] = _WebsocketPayloadMetricsBucket()
        self.by_message_type[message_type].record(
            payload_bytes=payload_bytes,
            target_count=target_count,
        )

    def snapshot(self) -> dict[str, object]:
        by_message_type_snapshot: dict[str, object] = {}
        for message_type in sorted(self.by_message_type.keys()):
            by_message_type_snapshot[message_type] = self.by_message_type[
                message_type
            ].snapshot()
        snapshot = self.total.snapshot()
        snapshot["byMessageType"] = by_message_type_snapshot
        return snapshot


def _resolve_message_type_name(message: WebsocketMsg) -> str:
    message_type = message.messageType
    if isinstance(message_type, Enum):
        return str(message_type.value)
    return str(message_type)


def _resolve_websocket_send_timeout_s() -> float | None:
    raw = os.environ.get(_WEBSOCKET_SEND_TIMEOUT_ENV)
    if raw is None:
        return _DEFAULT_WEBSOCKET_SEND_TIMEOUT_S
    try:
        value = float(raw.strip())
    except ValueError:
        return _DEFAULT_WEBSOCKET_SEND_TIMEOUT_S
    if value <= 0:
        return None
    return value


# https://fastapi.tiangolo.com/advanced/websockets/#handling-disconnections-and-multiple-clients
class WebsocketManager:
    def __init__(self):
        self.sockets: dict[str, WebsocketConnectionInfoWithSocket] = {}
        self.main_id = "main"
        self._send_timeout_s = _resolve_websocket_send_timeout_s()
        self._frontend_affinity_token_by_websocket_id: dict[str, str] = {}
        self._frontend_websocket_id_by_affinity_token: dict[str, str] = {}
        self._payload_metrics = _WebsocketPayloadMetricsState()

    async def on_connect(
        self,
        websocket: WebSocket,
        connectionType: WebsocketConnectionType,
        id: str | None = None,
        shareSessionId: str | None = None,
        *,
        broadcast_connections: bool = True,
    ):
        await websocket.accept()
        if id and id in self.sockets:
            raise ValueError(f"websocket id already taken: {id}")
        while not id or id in self.sockets:
            id = generate_memorable_string()
        self.sockets[id] = WebsocketConnectionInfoWithSocket(
            id=id,
            websocket=websocket,
            connectionType=connectionType,
            currentAddress=None,
            shareSessionId=shareSessionId,
        )
        if connectionType is WebsocketConnectionType.FRONTEND:
            frontend_affinity_token = self._generate_frontend_affinity_token()
            self._set_frontend_affinity_token_for_websocket_id(
                id, frontend_affinity_token
            )
        if broadcast_connections:
            await self.broadcast_connections()
        return id

    async def on_disconnect(self, id: str, *, broadcast_connections: bool = True):
        removed = self._remove_socket(id)
        if removed is None:
            return
        if broadcast_connections:
            await self.broadcast_connections()

    def update_current_address(self, currentAddress: str, websocketId: str):
        connection_info = self.sockets[websocketId]
        connection_info.currentAddress = self._sanitize_current_address(currentAddress)

    def get_share_session_id(self, websocketId: str) -> str | None:
        if websocketId not in self.sockets:
            raise KeyError(f"Unknown websocket id: {websocketId}")
        return self.sockets[websocketId].shareSessionId

    def get_frontend_affinity_token(self, websocket_id: str) -> str | None:
        return self._frontend_affinity_token_by_websocket_id.get(websocket_id)

    def resolve_frontend_websocket_id_from_affinity_token(
        self,
        *,
        affinity_token: str,
        share_session_id: str | None = None,
    ) -> str | None:
        normalized_affinity_token = affinity_token.strip()
        if normalized_affinity_token == "":
            return None
        websocket_id = self._frontend_websocket_id_by_affinity_token.get(
            normalized_affinity_token
        )
        if websocket_id is None:
            return None
        connection_info = self.sockets.get(websocket_id)
        if connection_info is None:
            self._frontend_websocket_id_by_affinity_token.pop(
                normalized_affinity_token, None
            )
            self._remove_frontend_affinity_token_for_websocket_id(websocket_id)
            return None
        if connection_info.connectionType is not WebsocketConnectionType.FRONTEND:
            self._frontend_websocket_id_by_affinity_token.pop(
                normalized_affinity_token, None
            )
            return None
        if connection_info.websocket.application_state != WebSocketState.CONNECTED:
            self._remove_socket(websocket_id)
            return None
        if (
            share_session_id is not None
            and connection_info.shareSessionId != share_session_id
        ):
            return None
        return websocket_id

    @staticmethod
    def _generate_frontend_affinity_token() -> str:
        return secrets.token_urlsafe(24)

    @staticmethod
    def _sanitize_current_address(current_address: str) -> str:
        marker_index = current_address.find(_FRONTEND_AFFINITY_ADDRESS_MARKER)
        if marker_index == -1:
            return current_address
        stripped_address = current_address[:marker_index].strip()
        if stripped_address == "":
            return "/"
        return stripped_address

    def _set_frontend_affinity_token_for_websocket_id(
        self,
        websocket_id: str,
        frontend_affinity_token: str,
    ) -> None:
        previous_token = self._frontend_affinity_token_by_websocket_id.get(websocket_id)
        self._frontend_affinity_token_by_websocket_id[websocket_id] = (
            frontend_affinity_token
        )
        if previous_token is not None and previous_token != frontend_affinity_token:
            mapped_websocket_id = self._frontend_websocket_id_by_affinity_token.get(
                previous_token
            )
            if mapped_websocket_id == websocket_id:
                self._frontend_websocket_id_by_affinity_token.pop(previous_token, None)
        self._frontend_websocket_id_by_affinity_token[frontend_affinity_token] = (
            websocket_id
        )

    def _remove_frontend_affinity_token_for_websocket_id(
        self,
        websocket_id: str,
    ) -> None:
        token = self._frontend_affinity_token_by_websocket_id.pop(websocket_id, None)
        if token is None:
            return
        mapped_websocket_id = self._frontend_websocket_id_by_affinity_token.get(token)
        if mapped_websocket_id == websocket_id:
            self._frontend_websocket_id_by_affinity_token.pop(token, None)

    def _remove_socket(
        self, websocket_id: str
    ) -> WebsocketConnectionInfoWithSocket | None:
        removed = self.sockets.pop(websocket_id, None)
        self._remove_frontend_affinity_token_for_websocket_id(websocket_id)
        return removed

    async def _send_text_payload(self, payload: str, toWebsocketId: str) -> bool:
        socket_info = self.sockets.get(toWebsocketId)
        if not socket_info:
            return False
        websocket = socket_info.websocket
        if websocket.application_state != WebSocketState.CONNECTED:
            self._remove_socket(toWebsocketId)
            return False
        try:
            if self._send_timeout_s is None:
                await websocket.send_text(payload)
                return True
            send_task = asyncio.create_task(websocket.send_text(payload))
            _done, pending = await asyncio.wait(
                {send_task},
                timeout=self._send_timeout_s,
            )
            if pending:
                logger.warning(
                    "Websocket %s send_text timed out after %.2fs; removing.",
                    toWebsocketId,
                    self._send_timeout_s,
                )
                self._remove_socket(toWebsocketId)
                send_task.cancel()
                return False
            # If the task completed, re-raise any exceptions so we can clean up sockets.
            send_task.result()
            return True
        except asyncio.TimeoutError:
            logger.warning(
                "Websocket %s send_text timed out after %.2fs; removing.",
                toWebsocketId,
                self._send_timeout_s,
            )
            self._remove_socket(toWebsocketId)
            return False
        except (RuntimeError, ConnectionClosedError, WebSocketDisconnect):
            logger.debug("Websocket %s is closed; removing.", toWebsocketId)
            self._remove_socket(toWebsocketId)
            return False

    async def send_message(self, message: WebsocketMsg, toWebsocketId: str) -> bool:
        payload = message.model_dump_json()
        self._record_payload_metrics(
            message=message,
            payload_bytes=len(payload.encode("utf-8")),
            target_count=1,
        )
        return await self._send_text_payload(payload, toWebsocketId)

    async def send_bytes(self, payload: bytes, toWebsocketId: str) -> None:
        socket_info = self.sockets.get(toWebsocketId)
        if not socket_info:
            return
        websocket = socket_info.websocket
        if websocket.application_state != WebSocketState.CONNECTED:
            self._remove_socket(toWebsocketId)
            return
        try:
            if self._send_timeout_s is None:
                await websocket.send_bytes(payload)
                return
            send_task = asyncio.create_task(websocket.send_bytes(payload))
            _done, pending = await asyncio.wait(
                {send_task},
                timeout=self._send_timeout_s,
            )
            if pending:
                logger.warning(
                    "Websocket %s send_bytes timed out after %.2fs; removing.",
                    toWebsocketId,
                    self._send_timeout_s,
                )
                self._remove_socket(toWebsocketId)
                send_task.cancel()
                return
            send_task.result()
        except asyncio.TimeoutError:
            logger.warning(
                "Websocket %s send_bytes timed out after %.2fs; removing.",
                toWebsocketId,
                self._send_timeout_s,
            )
            self._remove_socket(toWebsocketId)
        except (RuntimeError, ConnectionClosedError, WebSocketDisconnect):
            logger.debug("Websocket %s is closed; removing.", toWebsocketId)
            self._remove_socket(toWebsocketId)

    async def broadcast(
        self,
        message: WebsocketMsg,
        connectionType: WebsocketConnectionType | None = None,
        currentAddress: str | None = None,
    ):
        sockets_snapshot = list(self.sockets.items())
        target_ids: list[str] = []
        for websocket_id, connection_info in sockets_snapshot:
            if (
                (not connectionType and not currentAddress)
                or (connectionType and connection_info.connectionType == connectionType)
                or (currentAddress and connection_info.currentAddress == currentAddress)
            ):
                target_ids.append(websocket_id)
        if not target_ids:
            return
        payload = message.model_dump_json()
        self._record_payload_metrics(
            message=message,
            payload_bytes=len(payload.encode("utf-8")),
            target_count=len(target_ids),
        )
        await self._broadcast_payload(payload, target_ids)

    async def _broadcast_payload(self, payload: str, target_ids: list[str]) -> None:
        await asyncio.gather(
            *(
                self._send_text_payload(payload, websocket_id)
                for websocket_id in target_ids
            )
        )

    async def broadcast_to_session(
        self,
        message: WebsocketMsg,
        *,
        share_session_id: str,
        connectionType: WebsocketConnectionType | None = None,
        currentAddress: str | None = None,
    ):
        sockets_snapshot = list(self.sockets.items())
        target_ids: list[str] = []
        for websocket_id, connection_info in sockets_snapshot:
            if connection_info.shareSessionId != share_session_id:
                continue
            if (
                (not connectionType and not currentAddress)
                or (connectionType and connection_info.connectionType == connectionType)
                or (currentAddress and connection_info.currentAddress == currentAddress)
            ):
                target_ids.append(websocket_id)
        if not target_ids:
            return
        payload = message.model_dump_json()
        self._record_payload_metrics(
            message=message,
            payload_bytes=len(payload.encode("utf-8")),
            target_count=len(target_ids),
        )
        await self._broadcast_payload(payload, target_ids)

    def _record_payload_metrics(
        self,
        *,
        message: WebsocketMsg,
        payload_bytes: int,
        target_count: int,
    ) -> None:
        if target_count <= 0:
            return
        self._payload_metrics.record(
            message_type=_resolve_message_type_name(message),
            payload_bytes=payload_bytes,
            target_count=target_count,
        )

    def get_payload_metrics_snapshot(self) -> dict[str, object]:
        return self._payload_metrics.snapshot()

    def reset_payload_metrics(self) -> None:
        self._payload_metrics.reset()

    async def broadcast_connections(self):
        connections: list[WebsocketConnectionInfo] = []
        for id, s in self.sockets.items():
            connections.append(
                WebsocketConnectionInfo(
                    id=id,
                    connectionType=s.connectionType,
                    currentAddress=s.currentAddress,
                    shareSessionId=s.shareSessionId,
                )
            )
        connections.append(
            WebsocketConnectionInfo(
                id=self.main_id,
                connectionType=WebsocketConnectionType.SERVER,
                currentAddress=None,
                shareSessionId=None,
            )
        )
        await self.broadcast(
            WebsocketMsgAllConnections(
                content=connections,
            ),
            connectionType=WebsocketConnectionType.FRONTEND,
        )
