import json
import subprocess

import websockets

from setta.code_gen.create_runnable_scripts import runCode

from ..utils.constants import C


async def connect(websocket_id):
    try:
        extra_headers = {"isCLI": True}
        if websocket_id:
            extra_headers["websocketId"] = websocket_id
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
        if message["messageType"] == C.WS_RUN_CODE:
            command = runCode(message)
            run_code_as_subprocess(command)


def run_code_as_subprocess(command):
    subprocess.run(command, shell=True)
