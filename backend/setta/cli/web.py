import asyncio
import json
import subprocess

import websockets

from setta.terminals.terminals import runCode

from ..utils.constants import C


def web(websocket_id):
    asyncio.run(connect(websocket_id))


async def connect(websocket_id):
    try:
        extra_headers = {} if not websocket_id else {"websocketId": websocket_id}
        async with websockets.connect(
            C.WEBSOCKET,
            extra_headers=extra_headers,
        ) as websocket:
            await consumer_handler(websocket)
    except websockets.ConnectionClosedError:
        print("Connection closed unexpectedly")
    except ConnectionRefusedError:
        print("Connection refused")


async def consumer_handler(websocket):
    async for message in websocket:
        message = json.loads(message)
        if message["messageType"] == "runCode":
            runCode(message, command_callback=run_code_as_subprocess)


def run_code_as_subprocess(command):
    subprocess.run(command, shell=True)
