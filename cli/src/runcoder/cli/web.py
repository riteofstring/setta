import asyncio
import json
import os
import subprocess
import tempfile
from pprint import pprint

import jedi
import parso
import websockets

from ..utils.constants import WEBSOCKET
from .export_selected import export_selected
from .generate_code import generate_code, get_import_text
from .type_checker import parse_and_type_check


def web(access_token, websocket_id):
    try:
        asyncio.run(connect(access_token, websocket_id))
    finally:
        killMyPyDaemon()


async def connect(access_token, websocket_id=None):
    address = f"{WEBSOCKET}/{websocket_id}" if websocket_id else WEBSOCKET
    try:
        async with websockets.connect(
            address,
            extra_headers={"cookie": f"connect.sid={access_token}"},
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
    async for message in websocket:
        message = json.loads(message)
        # create_task so that we don't have to await consumer message
        asyncio.create_task(getConsumerMessageAndSend(websocket, message))


async def getConsumerMessageAndSend(websocket, message):
    return_message, messageType = await consumer(message)
    if return_message is not None:
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
    if message["messageType"] == "typeCheckRequest":
        return await asyncio.create_task(typeCheckRequest(message))
    if message["messageType"] == "connection":
        return connectionEstablished(message)
    if message["messageType"] == "allConnections":
        return allConnections(message)
    raise ValueError


def codeCompletion(message):
    code = f'{get_import_text(message["message"])}; ${message["message"]}'
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
    code = f'${get_import_text(message["message"])}; ${message["message"]}('
    print("code", code)
    results = jedi.Script(code).get_signatures(line=1, column=len(code))[0].params
    output = []
    for x in results:
        curr = {"name": x.name}
        child = parso.parse(x.to_string()).children[0]
        while "defaultVal" not in curr:
            if isinstance(child, parso.python.tree.ExprStmt):
                child = child.get_rhs()
            elif isinstance(
                child,
                (
                    parso.python.tree.Keyword,
                    parso.python.tree.String,
                    parso.python.tree.Number,
                ),
            ):
                curr["defaultVal"] = child.value
            elif isinstance(child, parso.python.tree.PythonNode):
                child = child.children[1]
            else:
                curr["defaultVal"] = None
        output.append(curr)
    return output, "parameters"


async def typeCheckRequest(message):
    code_json = export_selected(message["message"])
    code = generate_code(code_json)
    with tempfile.TemporaryDirectory(dir=".") as temp_dir:
        # set delete=False because otherwise the mypy call gets Permission Denied
        with tempfile.NamedTemporaryFile(
            dir=temp_dir, mode="w+", suffix=".py", delete=False
        ) as temp_file:
            temp_file.write(code)
            temp_file_path = temp_file.name

        process = await asyncio.create_subprocess_shell(
            f'dmypy check "{temp_file_path}"',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await process.communicate()
        os.remove(temp_file_path)

    print("process.returncode", process.returncode)
    print("stdout", stdout)
    errors = stdout.decode("utf-8")
    output = parse_and_type_check(errors, code, code_json)
    return output, "typeCheck"


def connectionEstablished(message):
    print(f"Connected as {message['websocketId']}")
    return None, ""


def allConnections(message):
    print("All connections:")
    pprint(message["connections"])
    return None, ""


def startMyPyDaemon():
    subprocess.run(
        [
            "dmypy",
            "start",
            "--",
            "--show-error-end",
            "--no-error-summary",
            "--no-pretty",
            "--no-color-output",
        ]
    )


def killMyPyDaemon():
    subprocess.run(["dmypy", "stop"])
