import logging

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


# https://fastapi.tiangolo.com/advanced/websockets/#handling-disconnections-and-multiple-clients
class WebsocketManager:
    def __init__(self):
        self.sockets: dict[str, WebsocketConnectionInfoWithSocket] = {}
        self.main_id = "main"

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

    async def send_message(self, message: WebsocketMsg, toWebsocketId: str):
        socket_info = self.sockets.get(toWebsocketId)
        if not socket_info:
            return
        websocket = socket_info.websocket
        if websocket.application_state != WebSocketState.CONNECTED:
            self.sockets.pop(toWebsocketId, None)
            return
        try:
            await websocket.send_text(message.model_dump_json())
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
        for k, v in sockets_snapshot:
            if (
                (not connectionType and not currentAddress)
                or (connectionType and v.connectionType == connectionType)
                or (currentAddress and v.currentAddress == currentAddress)
            ):
                await self.send_message(message, k)

    async def broadcast_to_session(
        self,
        message: WebsocketMsg,
        *,
        share_session_id: str,
        connectionType: WebsocketConnectionType | None = None,
        currentAddress: str | None = None,
    ):
        sockets_snapshot = list(self.sockets.items())
        for k, v in sockets_snapshot:
            if v.shareSessionId != share_session_id:
                continue
            if (
                (not connectionType and not currentAddress)
                or (connectionType and v.connectionType == connectionType)
                or (currentAddress and v.currentAddress == currentAddress)
            ):
                await self.send_message(message, k)

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
