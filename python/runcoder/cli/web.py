import asyncio
import json
from concurrent.futures import ProcessPoolExecutor

import websockets

from ..processors.processors import getConsumerMessage
from ..processors.utils import killMyPyDaemon, startMyPyDaemon
from ..utils.constants import WEBSOCKET


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
    executor = ProcessPoolExecutor()
    loop = asyncio.get_event_loop()
    async for message in websocket:
        message = json.loads(message)
        print(message)
        # create_task so that we don't have to await consumer message
        asyncio.create_task(
            getConsumerMessageAndSend(websocket, message, executor, loop)
        )


async def getConsumerMessageAndSend(websocket, message, executor, loop):
    return_message, messageType = await getConsumerMessage(message, executor, loop)
    if return_message is not None:
        print(f"Done processing message ID {message.get('id', None)}")
        await websocket.send(
            json.dumps(
                {
                    "id": message["id"],
                    "message": return_message,
                    "toWebsocketId": message["websocketId"],
                    "messageType": messageType,
                }
            )
        )
