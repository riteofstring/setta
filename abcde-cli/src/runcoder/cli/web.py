import asyncio
import json

import jedi
import websockets

from ..utils.constants import WEBSOCKET


def web(access_token):
    asyncio.run(connect(access_token))


async def connect(access_token):
    async with websockets.connect(
        WEBSOCKET, extra_headers={"cookie": f"connect.sid={access_token}"}
    ) as websocket:
        print("connected")
        await websocket.send(json.dumps({"location": "computer:Kevin"}))
        await consumer_handler(websocket)


async def consumer_handler(websocket):
    async for message in websocket:
        message = json.loads(message)
        x = await consumer(message)
        await websocket.send(
            json.dumps(
                {
                    "message": x,
                    "toLocation": message["location"],
                    "messageType": "codeCompletion",
                }
            )
        )


# async def producer_handler(websocket):
#     while True:
#         message = await producer()
#         print("sending:", message)
#         await websocket.send(message)


async def consumer(message):
    code = message["message"]
    if code == "":
        return []
    return [x.name for x in jedi.Script(code).complete(line=1, column=len(code))[:5]]


# async def producer():
#     await asyncio.sleep(60)
#     # doesn't do anything right now
