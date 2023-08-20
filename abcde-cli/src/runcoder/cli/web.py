import asyncio
import json

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
        await consumer(message)


# async def producer_handler(websocket):
#     while True:
#         message = await producer()
#         print("sending:", message)
#         await websocket.send(message)


async def consumer(message):
    print(message)


# async def producer():
#     await asyncio.sleep(60)
#     # doesn't do anything right now
