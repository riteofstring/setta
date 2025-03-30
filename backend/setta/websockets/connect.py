import json
import logging
import subprocess

import websockets

from setta.gen_code.create_runnable_scripts import runCode

from ..utils.constants import C

logger = logging.getLogger(__name__)


async def connect(websocket_id):
    try:
        if websocket_id:
            endpoint = f"{C.WEBSOCKET}{C.ROUTE_WEBSOCKET_CLI_WITH_ID}"
            endpoint = endpoint.format(id=websocket_id)
        else:
            endpoint = f"{C.WEBSOCKET}{C.ROUTE_WEBSOCKET_CLI}"
        async with websockets.connect(endpoint) as websocket:
            await consumer_handler(websocket)
    except websockets.ConnectionClosedError:
        logger.debug("Connection closed unexpectedly")
    except ConnectionRefusedError:
        logger.debug("Connection refused")


async def consumer_handler(websocket):
    async for message in websocket:
        message = json.loads(message)
        if message["messageType"] == C.WS_RUN_CODE:
            # TODO: now that runCode requires lsp_writers
            # this will have to be changed, probably needs to communicate
            # with host setta process via websocket instead of calling
            # runCode
            command = await runCode(message)
            run_code_as_subprocess(command)


def run_code_as_subprocess(command):
    subprocess.run(command, shell=True)
