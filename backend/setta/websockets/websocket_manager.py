import json
import logging

from fastapi import WebSocket
from websockets.exceptions import ConnectionClosedError

from setta.utils.constants import C
from setta.utils.generate_memorable_string import generate_memorable_string

logger = logging.getLogger(__name__)


# https://fastapi.tiangolo.com/advanced/websockets/#handling-disconnections-and-multiple-clients
class WebsocketManager:
    def __init__(self):
        self.sockets = {}
        self.self_id = "main"
        self.message_id_to_sender_id = {}

    async def connect(self, websocket: WebSocket, connectionType, id=None):
        await websocket.accept()
        while not id or id in self.sockets:
            id = generate_memorable_string()
        self.sockets[id] = {
            "websocket": websocket,
            "connectionType": connectionType,
            "location": None,
        }
        await self.broadcast_connections()
        return id

    async def disconnect(self, id):
        try:
            del self.sockets[id]
            await self.broadcast_connections()
        except ConnectionClosedError:
            pass

    # returns False if the message is invalid
    def process_message(self, message, fromWebsocketId):
        if "toWebsocketId" not in message:
            return False

        if "id" in message:
            self.message_id_to_sender_id[message["id"]] = fromWebsocketId

        if "location" in message:
            self.sockets[fromWebsocketId]["location"] = message["location"]

        return True

    async def send_message(self, message, toWebsocketId):
        websocket = self.sockets[toWebsocketId]["websocket"]
        await websocket.send_text(json.dumps(message))

    async def return_to_requester(self, content, request_msg_id):
        await self.send_message(
            {"id": request_msg_id, "content": content},
            self.message_id_to_sender_id[request_msg_id],
        )

    async def send_message_to_location(self, message, location):
        for k, w in self.sockets.items():
            if w["location"] == location:
                await self.send_message(message, k)

    async def broadcast(self, content, messageType):
        for k in self.sockets.keys():
            await self.send_message({"content": content, "messageType": messageType}, k)

    async def broadcast_connections(self):
        connections = []
        for id, s in self.sockets.items():
            connections.append(
                {"websocketId": id, "connectionType": s["connectionType"]}
            )
        connections.append(
            {
                "websocketId": self.self_id,
                "connectionType": C.WEBSOCKET_CONNECTION_TYPE_SERVER,
            }
        )
        await self.broadcast(connections, C.WS_ALL_CONNECTIONS)
