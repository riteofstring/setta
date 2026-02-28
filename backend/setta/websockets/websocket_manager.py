import asyncio
import logging
import os

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
        if broadcast_connections:
            await self.broadcast_connections()
        return id

    async def on_disconnect(self, id: str, *, broadcast_connections: bool = True):
        removed = self.sockets.pop(id, None)
        if removed is None:
            return
        if broadcast_connections:
            await self.broadcast_connections()

    def update_current_address(self, currentAddress: str, websocketId: str):
        self.sockets[websocketId].currentAddress = currentAddress

    def get_share_session_id(self, websocketId: str) -> str | None:
        if websocketId not in self.sockets:
            raise KeyError(f"Unknown websocket id: {websocketId}")
        return self.sockets[websocketId].shareSessionId

    async def send_message(self, message: WebsocketMsg, toWebsocketId: str) -> bool:
        socket_info = self.sockets.get(toWebsocketId)
        if not socket_info:
            return False
        websocket = socket_info.websocket
        if websocket.application_state != WebSocketState.CONNECTED:
            self.sockets.pop(toWebsocketId, None)
            return False
        try:
            payload = message.model_dump_json()
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
                self.sockets.pop(toWebsocketId, None)
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
            self.sockets.pop(toWebsocketId, None)
            return False
        except (RuntimeError, ConnectionClosedError, WebSocketDisconnect):
            logger.debug("Websocket %s is closed; removing.", toWebsocketId)
            self.sockets.pop(toWebsocketId, None)
            return False

    async def send_bytes(self, payload: bytes, toWebsocketId: str) -> None:
        socket_info = self.sockets.get(toWebsocketId)
        if not socket_info:
            return
        websocket = socket_info.websocket
        if websocket.application_state != WebSocketState.CONNECTED:
            self.sockets.pop(toWebsocketId, None)
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
                self.sockets.pop(toWebsocketId, None)
                send_task.cancel()
                return
            send_task.result()
        except asyncio.TimeoutError:
            logger.warning(
                "Websocket %s send_bytes timed out after %.2fs; removing.",
                toWebsocketId,
                self._send_timeout_s,
            )
            self.sockets.pop(toWebsocketId, None)
        except (RuntimeError, ConnectionClosedError, WebSocketDisconnect):
            logger.debug("Websocket %s is closed; removing.", toWebsocketId)
            self.sockets.pop(toWebsocketId, None)

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
        await asyncio.gather(
            *(self.send_message(message, websocket_id) for websocket_id in target_ids)
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
        await asyncio.gather(
            *(self.send_message(message, websocket_id) for websocket_id in target_ids)
        )

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
