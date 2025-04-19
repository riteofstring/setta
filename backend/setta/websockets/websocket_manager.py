import asyncio
import json
import logging
import threading  # Add this import
import time

from fastapi import WebSocket
from websockets.exceptions import ConnectionClosedError

from setta.database.utils import create_new_id
from setta.utils.constants import C
from setta.utils.generate_memorable_string import generate_memorable_string

logger = logging.getLogger(__name__)


class WebsocketManager:
    def __init__(self):
        self.sockets = {}
        self.main_id = "main"
        self.message_id_to_sender_id = {}
        self.pending_requests = {}
        self.message_queue = asyncio.Queue()

        # Create a separate event loop for the worker
        self.worker_loop = asyncio.new_event_loop()

        # Start the worker in a separate thread
        self.worker_thread = threading.Thread(
            target=self._run_worker_in_thread, daemon=True, name="websocket-worker"
        )
        self.worker_thread.start()
        logger.info("Started WebsocketManager message queue worker in separate thread")

    def _run_worker_in_thread(self):
        """Run the worker in a separate thread with its own event loop"""
        asyncio.set_event_loop(self.worker_loop)
        try:
            self.worker_loop.run_until_complete(self._process_message_queue())
        except Exception as e:
            logger.error(f"Worker thread crashed: {e}")

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

    async def _process_message_queue(self):
        """Worker that processes all messages in order"""
        logger.debug("Message queue worker started")

        # Add a delay between messages - this is the key to proper streaming
        STREAMING_DELAY = 0.05  # 50ms between streaming messages

        try:
            while True:
                # Get message from queue
                message, recipient_info = await self.message_queue.get()

                start_time = time.time()
                logger.debug(
                    f"Processing message of type: {message.get('messageType')}"
                )

                try:
                    # Find targets
                    target_ids = []
                    if recipient_info["type"] == "direct":
                        target_ids = [recipient_info["id"]]
                    else:
                        connection_type = recipient_info.get("connectionType")
                        location = recipient_info.get("location")

                        # Need to handle accessing self.sockets which could be modified in the main thread
                        # Make a local copy to avoid race conditions
                        sockets_copy = dict(self.sockets)
                        for k, v in sockets_copy.items():
                            if (
                                (not connection_type and not location)
                                or (
                                    connection_type
                                    and v["connectionType"] == connection_type
                                )
                                or (location and v["location"] == location)
                            ):
                                target_ids.append(k)

                    # Send immediately to each target
                    for websocket_id in target_ids:
                        # Check if socket still exists
                        if websocket_id in self.sockets:
                            websocket = self.sockets[websocket_id]["websocket"]
                            await websocket.send_text(json.dumps(message))

                    # Add delay for streaming messages
                    if message.get("messageType") == C.WS_LLM_STREAMING_RESPONSE:
                        # Don't delay for message_stop
                        if not (
                            isinstance(message.get("content"), dict)
                            and message["content"].get("type") == "message_stop"
                        ):
                            await asyncio.sleep(STREAMING_DELAY)

                except Exception as e:
                    logger.error(f"Error sending message: {e}")
                finally:
                    self.message_queue.task_done()
                    elapsed = time.time() - start_time
                    logger.debug(f"Message processed in {elapsed:.4f}s")

        except asyncio.CancelledError:
            logger.debug("Message queue worker cancelled")
        except Exception as e:
            logger.error(f"Message queue worker crashed: {e}")
            # Restart
            asyncio.create_task(self._process_message_queue())

    def process_message(self, message, fromWebsocketId):
        if "id" in message:
            self.message_id_to_sender_id[message["id"]] = fromWebsocketId

        if "location" in message:
            self.sockets[fromWebsocketId]["location"] = message["location"]

    async def send_message(self, message, toWebsocketId):
        """Queue a direct message to a specific websocket"""
        await self.message_queue.put((message, {"type": "direct", "id": toWebsocketId}))

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

        # Queue broadcast message
        recipient_info = {
            "type": "broadcast",
            "connectionType": connectionType,
            "location": location,
        }

        logger.debug(f"Queueing message of type: {messageType}")
        await self.message_queue.put((message, recipient_info))

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
