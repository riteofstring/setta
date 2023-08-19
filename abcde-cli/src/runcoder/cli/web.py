import asyncio
import logging

import websockets

from ..utils.constants import WEBSOCKET

logger = logging.getLogger("websockets")
logger.setLevel(logging.DEBUG)
logger.addHandler(logging.StreamHandler())


def web(access_token):
    asyncio.run(connect(access_token))


async def connect(access_token):
    async with websockets.connect(
        WEBSOCKET, extra_headers={"cookie": f"connect.sid={access_token}"}
    ):
        print("connected")
        await asyncio.Future()  # run forever


# async def handler(websocket):
#     while True:
#         message = await websocket.recv()
#         print(message)
