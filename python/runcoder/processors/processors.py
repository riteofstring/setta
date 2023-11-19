import os
import subprocess
import tempfile
from asyncio import CancelledError
from pprint import pprint

import jedi

from ..code.export_selected import export_selected
from ..code.generate_code import (
    generate_code,
    generate_lines_of_code_without_imports,
    get_import_text,
)
from ..code.type_checker import parse_and_type_check


async def getConsumerMessage(message, tasks_obj, cache):
    try:
        print(f"Start processing message ID: {message.get('id', None)}", flush=True)
        fn = get_consumer_fn(message)
        result = await tasks_obj.loop.run_in_executor(tasks_obj.executor, fn, message)
        maybe_cache_result(message, result, cache)
        return result
    except CancelledError:
        print(f"Task for {message.get('id', None)} was cancelled.", flush=True)
        return {"output": None, "name": None}


def get_consumer_fn(message):
    if message["messageType"] == "codeCompletionRequest":
        return codeCompletion
    if message["messageType"] == "textFieldInitializeCode":
        return textFieldInitializeCode
    if message["messageType"] == "parametersRequest":
        return parametersRequest
    if message["messageType"] == "typeCheckRequest":
        return typeCheckRequest
    if message["messageType"] == "connection":
        return connectionEstablished
    if message["messageType"] == "allConnections":
        return allConnections
    if message["messageType"] == "runCode":
        return runCode
    raise ValueError


def maybe_cache_result(message, result, cache):
    if result["cache"] is None:
        return
    if result["name"] == "textFieldInitializeCode":
        project = message["message"]["project"]
        sectionId = message["message"]["sectionId"]
        cache.add_text_field_generated_code(
            project["projectConfig"]["id"], sectionId, result["cache"]
        )


def codeCompletion(message):
    for_parser = message["message"].rstrip(".")
    empty_output = {"output": [], "name": "codeCompletion", "cache": None}
    try:
        code = f'{get_import_text(for_parser)}; {message["message"]}'
    except SyntaxError as e:
        print(f"Syntax Error: {e}")
        return empty_output
    if code == "":
        return empty_output
    results = jedi.Script(code).complete()
    output = [
        f"{message['message']}{x.complete}"
        for x in results
        if x.type in ["class", "function"]
    ]
    output = [x for x in output if x][:5]
    return {"output": output, "name": "codeCompletion", "cache": None}


def textFieldInitializeCode(message):
    message = message["message"]
    project = message["project"]
    codeJson = export_selected(project)
    sectionId = message["sectionId"]
    paramInfoId = message["paramInfoId"]
    push_var_name = None
    for k, v in codeJson.items():
        if v["sectionId"] == sectionId and v["paramInfoId"] == paramInfoId:
            push_var_name = k
            break
    to_cache = generate_lines_of_code_without_imports(
        codeJson,
        push_var_name=push_var_name,
        force_appear_var_name=push_var_name,
    )
    print(to_cache, flush=True)
    return {"output": None, "name": "textFieldInitializeCode", "cache": to_cache}


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
    return {"output": output, "name": "parameters", "cache": None}


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
    return {"output": output, "name": "typeCheck", "cache": None}


def connectionEstablished(message):
    print(f"Connected as {message['websocketId']}")
    return {"output": None, "name": None, "cache": None}


def allConnections(message):
    print("All connections:")
    pprint(message["connections"])
    return {"output": None, "name": None, "cache": None}


def runCode(message):
    code = generate_code(export_selected(message["message"]))
    print(code)
    exec(code)
    print("DONE")
    return {"output": None, "name": None, "cache": None}
