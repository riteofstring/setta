import logging

from fastapi import WebSocket
from starlette.websockets import WebSocketState
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
        self.message_id_to_sender_id = {}
        self.pending_requests = {}

    async def on_connect(
        self,
        websocket: WebSocket,
        connectionType: WebsocketConnectionType,
        id: str | None = None,
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
        )
        await self.broadcast_connections()
        return id

    async def on_disconnect(self, id: str):
        removed = self.sockets.pop(id, None)
        if removed is None:
            return
        await self.broadcast_connections()

    def process_json_str(self, json_str: str, fromWebsocketId: str):
        message = WebsocketMsg.model_validate_json(json_str)
        if message.id:
            self.message_id_to_sender_id[message.id] = fromWebsocketId

    def update_current_address(self, currentAddress: str, websocketId: str):
        self.sockets[websocketId].currentAddress = currentAddress

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
        except (RuntimeError, ConnectionClosedError):
            logger.debug("Websocket %s is closed; removing.", toWebsocketId)
            self.sockets.pop(toWebsocketId, None)

    async def return_to_requester(self, message: WebsocketMsg, request_msg_id: str):
        await self.send_message(
            message,
            self.message_id_to_sender_id[request_msg_id],
        )

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

    async def broadcast_connections(self):
        connections: list[WebsocketConnectionInfo] = []
        for id, s in self.sockets.items():
            connections.append(
                WebsocketConnectionInfo(
                    id=id,
                    connectionType=s.connectionType,
                    currentAddress=s.currentAddress,
                )
            )
        connections.append(
            WebsocketConnectionInfo(
                id=self.main_id,
                connectionType=WebsocketConnectionType.SERVER,
                currentAddress=None,
            )
        )
        await self.broadcast(
            WebsocketMsgAllConnections(
                content=connections,
            ),
            connectionType=WebsocketConnectionType.FRONTEND,
        )
