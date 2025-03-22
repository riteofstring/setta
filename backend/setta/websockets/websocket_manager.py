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

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        id = websocket.headers.get("websocketId")
        while (not id) or id in self.sockets:
            id = generate_memorable_string()
        self.sockets[id] = {
            "websocket": websocket,
            "connectionType": websocket.headers.get(
                "connectionType", C.WEBSOCKET_CONNECTION_TYPE_FRONTEND
            ),
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

    async def process_message(self, message, fromWebsocketId, message_handler):
        wid = message.get("toWebsocketId", None)
        if not wid:
            return

        if "id" in message:
            self.message_id_to_sender_id[message["id"]] = fromWebsocketId

        if "location" in message:
            self.sockets[fromWebsocketId]["location"] = message["location"]

        # process task and send any results back to requester
        await message_handler(message)

    async def return_to_requester(self, id, content, messageType=None):
        # just send data to target websocket
        websocket = self.sockets[self.message_id_to_sender_id[id]]["websocket"]
        return_val = {"id": id, "content": content}
        if messageType:
            return_val["messageType"] = messageType
        await websocket.send_text(json.dumps(return_val))

    async def send_message_to_location(self, content, messageType, location):
        for w in self.sockets.values():
            if w["location"] == location:
                websocket = w["websocket"]
                await websocket.send_text(
                    json.dumps({"content": content, "messageType": messageType})
                )

    async def broadcast(self, message):
        logger.debug(f"broadcasting message {message}")
        for s in self.sockets.values():
            logger.debug(f"sending to {s}")
            await s["websocket"].send_text(json.dumps(message))

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
        await self.broadcast(
            {"messageType": C.WS_ALL_CONNECTIONS, "connections": connections}
        )
