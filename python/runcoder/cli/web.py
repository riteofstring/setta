import asyncio
import json

import websockets

from ..processors.processors import Processors
from ..processors.utils import killMyPyDaemon, startMyPyDaemon
from ..utils.cache import Cache
from ..utils.constants import WEBSOCKET
from ..utils.tasks import Tasks


def web(websocket_id):
    try:
        asyncio.run(connect(websocket_id))
    finally:
        killMyPyDaemon()


async def connect(websocket_id=None):
    try:
        extra_headers = {} if not websocket_id else {"websocketId": websocket_id}
        async with websockets.connect(
            WEBSOCKET,
            extra_headers=extra_headers,
        ) as websocket:
            await consumer_handler(websocket)
    except websockets.InvalidStatusCode as e:
        if e.status_code == 401:
            print("Unauthorized")
    except websockets.ConnectionClosedError:
        print("Connection closed unexpectedly")
    except ConnectionRefusedError:
        print("Connection refused")


async def consumer_handler(websocket):
    startMyPyDaemon()
    task_obj = Tasks()
    cache = Cache()
    processors = Processors()
    async for message in websocket:
        message = json.loads(message)
        print(message)
        # create_task so that we don't have to await consumer message
        await task_obj.create_task(
            message.get("id", None),
            getConsumerMessageAndSend(
                message, websocket.send, task_obj, cache, processors
            ),
        )


async def getConsumerMessageAndSend(message, send_fn, tasks_obj, cache, processors):
    result = await getConsumerMessage(message, tasks_obj, cache, processors, send_fn)
    if result["output"] is not None:
        print(f"Done processing message ID {message.get('id', None)}", flush=True)
        await send_fn(
            json.dumps(
                {
                    "id": message["id"],
                    "message": result["output"],
                    "toWebsocketId": message["websocketId"],
                    "messageType": result["name"],
                }
            )
        )


async def getConsumerMessage(message, tasks_obj, cache, processors, send_fn):
    try:
        print(f"Start processing message ID: {message.get('id', None)}", flush=True)
        return await processors(message, tasks_obj, cache, send_fn)
    except asyncio.CancelledError:
        print(f"Task for {message.get('id', None)} was cancelled.", flush=True)
        return {"output": None, "name": None}
