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
        return_message = await consumer(message)
        await websocket.send(
            json.dumps(
                {
                    "id": message["id"],
                    "message": return_message,
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
    print(code)
    results = jedi.Script(code).complete(line=1, column=len(code))
    output = [x.full_name for x in results if x.type in ["class", "function"]]
    output = [x for x in output if x][:5]
    print(output)
    return output


# async def producer():
#     await asyncio.sleep(60)
#     # doesn't do anything right now
