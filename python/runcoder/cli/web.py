import asyncio
import json
import subprocess

import websockets

from ..processors.processors import Processors, getProcessorOutput
from ..processors.utils import killMyPyDaemon, startMyPyDaemon
from ..utils.cache import Cache
from ..utils.constants import C
from ..utils.tasks import Tasks
from ..utils.terminals import runCode


def web(websocket_id):
    try:
        asyncio.run(connect(websocket_id))
    finally:
        killMyPyDaemon()


async def connect(websocket_id):
    try:
        extra_headers = {} if not websocket_id else {"websocketId": websocket_id}
        async with websockets.connect(
            C.websocket,
            extra_headers=extra_headers,
        ) as websocket:
            await consumer_handler(websocket)
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
        if message["messageType"] == "runCode":
            runCode(message, command_callback=run_code_as_subprocess)

        # # create_task so that we don't have to await consumer message
        # await task_obj.create_task(
        #     message.get("id", None),
        #     getConsumerMessageAndSend(
        #         message, websocket.send, task_obj, cache, processors
        #     ),
        # )


async def getConsumerMessageAndSend(message, send_fn, tasks_obj, cache, processors):
    result = await getProcessorOutput(message, tasks_obj, cache, processors)
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


def run_code_as_subprocess(command):
    subprocess.run(command, shell=True)
