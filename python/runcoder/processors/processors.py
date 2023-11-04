import os
import subprocess
import tempfile
from asyncio import CancelledError
from pprint import pprint

import jedi

from ..code.export_selected import export_selected
from ..code.generate_code import generate_code, get_import_text
from ..code.type_checker import parse_and_type_check


async def getConsumerMessage(message, tasks_obj):
    try:
        print(f"Start processing message ID: {message.get('id', None)}", flush=True)
        return await tasks_obj.loop.run_in_executor(
            tasks_obj.executor, consumer, message
        )
    except CancelledError:
        print(f"Task for {message.get('id', None)} was cancelled.", flush=True)
        return None, None


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
    results = jedi.Script(code).complete()
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
    signatures = jedi.Script(code).get_signatures()
    output = []
    if signatures:
        signature = signatures[0]
        for param in signature.params:
            # If a default value is present, it will be included in the bracket.
            defaultVal = (
                param.description.split("=")[-1].strip()
                if "=" in param.description
                else None
            )
            output.append({"name": param.name, "defaultVal": defaultVal})
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


def runCode(message):
    code = generate_code(export_selected(message["message"]))
    print(code)
    exec(code)
    print("DONE")
    return None, None
