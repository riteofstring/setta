import asyncio
import json
import logging

from fastapi import WebSocket
from websockets.exceptions import ConnectionClosedError

from setta.database.utils import create_new_id
from setta.utils.constants import C
from setta.utils.generate_memorable_string import generate_memorable_string

logger = logging.getLogger(__name__)


# https://fastapi.tiangolo.com/advanced/websockets/#handling-disconnections-and-multiple-clients
class WebsocketManager:
    def __init__(self):
        self.sockets = {}
        self.main_id = "main"
        self.message_id_to_sender_id = {}
        self.pending_requests = {}

    async def on_connect(self, websocket: WebSocket, connectionType, id=None):
        await websocket.accept()
        if id and id in self.sockets:
            raise ValueError(f"websocket id already taken: {id}")
        while not id or id in self.sockets:
            id = generate_memorable_string()
        self.sockets[id] = {
            "websocket": websocket,
            "connectionType": connectionType,
            "location": None,
        }
        await self.broadcast_connections()
        return id

    async def on_disconnect(self, id):
        try:
            del self.sockets[id]
            await self.broadcast_connections()
        except ConnectionClosedError:
            pass

    def process_message(self, message, fromWebsocketId):
        if "id" in message:
            self.message_id_to_sender_id[message["id"]] = fromWebsocketId

        if "location" in message:
            self.sockets[fromWebsocketId]["location"] = message["location"]

    async def send_message(self, message, toWebsocketId):
        websocket = self.sockets[toWebsocketId]["websocket"]
        await websocket.send_text(json.dumps(message))

    async def return_to_requester(self, content, request_msg_id):
        await self.send_message(
            {"id": request_msg_id, "content": content},
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
                or (connectionType and v["connectionType"] == connectionType)
                or (location and v["location"] == location)
            ):
                await self.send_message(message, k)

    async def broadcast_connections(self):
        connections = []
        for id, s in self.sockets.items():
            connections.append(
                {"websocketId": id, "connectionType": s["connectionType"]}
            )
        connections.append(
            {
                "websocketId": self.main_id,
                "connectionType": C.WEBSOCKET_CONNECTION_TYPE_SERVER,
            }
        )
        await self.broadcast(connections, C.WS_ALL_CONNECTIONS)

    def create_pending_request(self):
        id = create_new_id()
        self.pending_requests[id] = asyncio.Future()
        return id

    def resolve_pending_request(self, request_id, result):
        if request_id in self.pending_requests:
            future = self.pending_requests[request_id]
            if not future.done():
                future.set_result(result)
            return True
        return False

    async def wait_for_pending_request(self, request_id, timeout=30):
        future = self.pending_requests.get(request_id)
        if future:
            try:
                result = await asyncio.wait_for(future, timeout=timeout)
                return result
            except asyncio.TimeoutError:
                logger.debug(f"Request {request_id} timed out")
                return None
            except Exception as e:
                logger.debug(f"Error waiting for response to {request_id}: {e}")
                return None
            finally:
                self.pending_requests.pop(request_id, None)
        return None
