import asyncio
import json
import os
import subprocess
import tempfile
from concurrent.futures import ProcessPoolExecutor
from pprint import pprint

import jedi
import parso
import websockets

from ..utils.constants import WEBSOCKET
from .export_selected import export_selected
from .generate_code import generate_code, get_import_text
from .type_checker import parse_and_type_check


def web(websocket_id):
    try:
        asyncio.run(connect(websocket_id))
    finally:
        killMyPyDaemon()


async def connect(websocket_id=None):
    try:
        extra_headers = {} if not websocket_id else {"websocketId": websocket_id}
        async with websockets.connect(
            WEBSOCKET,
            extra_headers=extra_headers,
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
    executor = ProcessPoolExecutor()
    loop = asyncio.get_event_loop()
    async for message in websocket:
        message = json.loads(message)
        print(message)
        # create_task so that we don't have to await consumer message
        asyncio.create_task(
            getConsumerMessageAndSend(websocket, message, executor, loop)
        )


async def getConsumerMessageAndSend(websocket, message, executor, loop):
    print(f"Start processing message ID: {message.get('id', None)}")
    return_message, messageType = await loop.run_in_executor(
        executor, consumer, message
    )
    if return_message is not None:
        print(f"Done processing message ID {message.get('id', None)}")
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


def consumer(message):
    if message["messageType"] == "codeCompletionRequest":
        return codeCompletion(message)
    if message["messageType"] == "parametersRequest":
        return parametersRequest(message)
    if message["messageType"] == "typeCheckRequest":
        return typeCheckRequest(message)
    if message["messageType"] == "connection":
        return connectionEstablished(message)
    if message["messageType"] == "allConnections":
        return allConnections(message)
    if message["messageType"] == "runCode":
        return runCode(message)
    raise ValueError


def codeCompletion(message):
    for_parser = message["message"].rstrip(".")
    try:
        code = f'{get_import_text(for_parser)}; {message["message"]}'
    except SyntaxError as e:
        print(f"Syntax Error: {e}")
        return [], "codeCompletion"
    if code == "":
        return [], "codeCompletion"
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


def typeCheckRequest(message):
    code_json = export_selected(message["message"])
    code = generate_code(code_json)
    with tempfile.TemporaryDirectory(dir=".") as temp_dir:
        # set delete=False because otherwise the mypy call gets Permission Denied
        with tempfile.NamedTemporaryFile(
            dir=temp_dir, mode="w+", suffix=".py", delete=False
        ) as temp_file:
            temp_file.write(code)
            temp_file_path = temp_file.name

        try:
            process = subprocess.run(
                ["dmypy", "check", temp_file_path],
                capture_output=True,
                text=True,
                check=True,
            )
            stdout = process.stdout
        except subprocess.CalledProcessError as e:
            stdout = e.stdout

        os.remove(temp_file_path)

    print("stdout", stdout)
    errors = stdout
    output = parse_and_type_check(errors, code, code_json)
    print(output)
    return output, "typeCheck"


def connectionEstablished(message):
    print(f"Connected as {message['websocketId']}")
    return None, None


def allConnections(message):
    print("All connections:")
    pprint(message["connections"])
    return None, None


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


def runCode(message):
    code = generate_code(export_selected(message["message"]))
    print(code)
    exec(code)
    print("DONE")
    return None, None
