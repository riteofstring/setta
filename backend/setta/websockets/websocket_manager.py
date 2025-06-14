import dataclasses
import json
import logging

from fastapi import WebSocket
from websockets.exceptions import ConnectionClosedError

from setta.types.websocket_manager import (
    WebsocketConnectionInfo,
    WebsocketConnectionInfoWithSocket,
    WebsocketConnectionType,
)
from setta.types.websocket_msgs import WebsocketMsgTypeForFrontend
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

    def process_message(self, message, fromWebsocketId: str):
        if "id" in message:
            self.message_id_to_sender_id[message["id"]] = fromWebsocketId

        if "location" in message:
            self.sockets[fromWebsocketId].location = message["location"]

    async def send_message(self, message, toWebsocketId: str):
        websocket = self.sockets[toWebsocketId].websocket
        await websocket.send_text(json.dumps(message))

    async def return_to_requester(self, content, request_msg_id, messageType=None):
        message = {"id": request_msg_id, "content": content}
        if messageType:
            message["messageType"] = messageType
        await self.send_message(
            message,
            self.message_id_to_sender_id[request_msg_id],
        )

    async def broadcast(
        self,
        content=None,
        messageType=None,
        id=None,
        message=None,
        connectionType=None,
        location=None,
    ):
        if message is None:
            message = {"content": content, "messageType": messageType}
            if id:
                message["id"] = id
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
        await self.broadcast(
            [dataclasses.asdict(x) for x in connections],
            WebsocketMsgTypeForFrontend.ALL_CONNECTIONS,
        )
