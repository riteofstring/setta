import logging

from fastapi import WebSocket
from websockets.exceptions import ConnectionClosedError

from setta.types.websocket_manager import (
    WebsocketConnectionInfo,
    WebsocketConnectionInfoWithSocket,
    WebsocketConnectionType,
)
from setta.types.websocket_manager import (
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
            id=id, websocket=websocket, connectionType=connectionType, location=None
        )
        await self.broadcast_connections()
        return id

    async def on_disconnect(self, id: str):
        try:
            del self.sockets[id]
            await self.broadcast_connections()
        except ConnectionClosedError:
            pass

    def process_message(self, message: WebsocketMsg, fromWebsocketId: str):
        if message.id:
            self.message_id_to_sender_id[message.id] = fromWebsocketId

    async def send_message(self, message: WebsocketMsg, toWebsocketId: str):
        websocket = self.sockets[toWebsocketId].websocket
        await websocket.send_text(message.model_dump_json())

    async def return_to_requester(self, message: WebsocketMsg, request_msg_id: str):
        await self.send_message(
            message,
            self.message_id_to_sender_id[request_msg_id],
        )

    async def broadcast(
        self,
        message: WebsocketMsg,
        connectionType: WebsocketConnectionType | None = None,
        location: str | None = None,
    ):
        for k, v in self.sockets.items():
            if (
                (not connectionType and not location)
                or (connectionType and v.connectionType == connectionType)
                or (location and v.location == location)
            ):
                await self.send_message(message, k)

    async def broadcast_connections(self):
        connections: list[WebsocketConnectionInfo] = []
        for id, s in self.sockets.items():
            connections.append(
                WebsocketConnectionInfo(
                    id=id, connectionType=s.connectionType, location=s.location
                )
            )
        connections.append(
            WebsocketConnectionInfo(
                id=self.main_id,
                connectionType=WebsocketConnectionType.SERVER,
                location=None,
            )
        )
        await self.broadcast(WebsocketMsgAllConnections(content=connections))
