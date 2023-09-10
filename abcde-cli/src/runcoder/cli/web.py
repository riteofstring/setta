import asyncio
import json
import os
import re
import subprocess
import tempfile
from pprint import pprint

import jedi
import parso
import websockets

from ..utils.constants import WEBSOCKET


def web(access_token, websocket_id):
    asyncio.run(connect(access_token, websocket_id))


async def connect(access_token, websocket_id=None):
    address = f"{WEBSOCKET}/{websocket_id}" if websocket_id else WEBSOCKET
    async with websockets.connect(
        address,
        extra_headers={"cookie": f"connect.sid={access_token}"},
    ) as websocket:
        await consumer_handler(websocket)


async def consumer_handler(websocket):
    async for message in websocket:
        message = json.loads(message)
        return_message, messageType = await consumer(message)
        if return_message is not None:
            print(return_message)
            await websocket.send(
                json.dumps(
                    {
                        "id": message.get("id", None),
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
        return typeCheckRequest(message)
    if message["messageType"] == "connection":
        return connectionEstablished(message)
    if message["messageType"] == "allConnections":
        return allConnections(message)
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
    with tempfile.TemporaryDirectory(dir=".") as temp_dir:
        # set delete=False because otherwise the mypy call gets Permission Denied
        with tempfile.NamedTemporaryFile(
            dir=temp_dir, mode="w+", suffix=".py", delete=False
        ) as temp_file:
            temp_file.write(message["message"])
            temp_file_path = temp_file.name
        result = subprocess.run(
            [
                "mypy",
                temp_file_path,
                "--show-error-end",
                "--no-error-summary",
                "--no-pretty",
                "--no-color-output",
            ],
            capture_output=True,
            text=True,
        )
        os.remove(temp_file_path)

    print(result)
    pattern = r"^(?P<location>(?P<file>[^\n]+?):(?P<line>\d+):(?P<column>\d+):(?P<endLine>\d+):(?P<endColumn>\d+)): (?P<type>\w+): (?P<message>.*?)(?:  \[(?P<code>[\w-]+)\])?$"
    result = re.split(r"\r?\n", result.stdout)

    output = []
    for r in result:
        print(r)
        match = re.search(pattern, r)
        if match:
            # Extract all named groups as a dictionary
            all_groups = match.groupdict()
            output.append(all_groups)

    print(output)

    return output, "typeCheck"


def connectionEstablished(message):
    print(f"Connected as {message['websocketId']}")
    return None, ""


def allConnections(message):
    print("All connections:")
    pprint(message["connections"])
    return None, ""
