import asyncio
import json

import jedi
import parso
import websockets

from ..utils.constants import WEBSOCKET


def web(access_token):
    asyncio.run(connect(access_token))


async def connect(access_token):
    async with websockets.connect(
        f"{WEBSOCKET}/computer-kevin",
        extra_headers={"cookie": f"connect.sid={access_token}"},
    ) as websocket:
        print("connected")
        # await websocket.send(json.dumps({"location": "computer:Kevin"}))
        await consumer_handler(websocket)


async def consumer_handler(websocket):
    async for message in websocket:
        message = json.loads(message)
        return_message, messageType = await consumer(message)
        print(return_message)
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


async def consumer(message):
    if message["messageType"] == "codeCompletionRequest":
        return codeCompletion(message)
    if message["messageType"] == "parametersRequest":
        return parametersRequest(message)
    raise ValueError


def codeCompletion(message):
    code = message["toComplete"]
    if code == "":
        return []
    results = jedi.Script(code).complete(line=1, column=len(code))
    output = [
        f"{message['message']}{x.complete}"
        for x in results
        if x.type in ["class", "function"]
    ]
    output = [x for x in output if x][:5]
    return output, "codeCompletion"


def parametersRequest(message):
    code = message["message"]
    print("code", code)
    results = jedi.Script(code).get_signatures(line=1, column=len(code))[0].params
    results = [
        {
            "name": x.name,
            "defaultVal": parso.parse(x.to_string()).children[0].get_rhs().value,
        }
        for x in results
    ]

    return results, "parameters"
