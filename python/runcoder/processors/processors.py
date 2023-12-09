import subprocess
from asyncio import CancelledError
from pprint import pprint

import jedi

from ..code.export_selected import export_selected, get_script
from ..code.generate_code import (
    generate_code,
    generate_lines_of_code_without_imports,
    get_import_text,
    prepend_with_imports,
    set_line,
)
from ..code.type_checker import parse_and_type_check
from ..code.utils import get_var_name
from .utils import withTempFile


async def getConsumerMessage(message, tasks_obj, cache):
    try:
        print(f"Start processing message ID: {message.get('id', None)}", flush=True)
        fn = get_consumer_fn(message)
        maybe_read_cache(message, cache)
        result = await tasks_obj.run_non_blocking_subprocess(fn, message)
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
    if message["messageType"] == "textFieldCompletion":
        return textFieldCompletion
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


def maybe_read_cache(message, cache):
    if message["messageType"] == "textFieldCompletion":
        message = message["message"]
        message["cached"] = cache.text_field_generated_code[message["projectConfigId"]][
            message["sectionId"]
        ]


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
        code = f'{get_import_text(for_parser)[0]}; {message["message"]}'
    except SyntaxError as e:
        print(f"Syntax Error: {e}")
        return empty_output
    if code == "":
        return empty_output
    results = jedi.Script(code).complete()
    output = [
        f"{message['message']}{x.complete}"
        for x in results
        if x.type in ["module", "class", "function"] and x.complete
    ]
    output = [x for x in output if x]
    return {"output": output, "name": "codeCompletion", "cache": None}


def textFieldInitializeCode(message):
    message = message["message"]
    project = message["project"]
    codeJson = export_selected(project)
    sectionId = message["sectionId"]
    paramInfoId = message["paramInfoId"]
    push_var_name = get_var_name(codeJson, sectionId, paramInfoId)
    to_cache = generate_lines_of_code_without_imports(
        codeJson,
        push_var_name=push_var_name,
        force_appear_var_name=push_var_name,
    )
    print("textFieldInitializeCode", flush=True)
    print(to_cache, flush=True)
    return {
        "output": None,
        "name": "textFieldInitializeCode",
        "cache": [*to_cache, codeJson],
    }


def textFieldCompletion(message):
    message = message["message"]
    lines, var_name_to_line_num, codeJson = message.pop("cached")
    var_name = get_var_name(codeJson, message["sectionId"], message["paramInfoId"])
    set_line(lines, var_name_to_line_num, var_name, message["value"])
    code, var_name_to_line_num = prepend_with_imports(
        lines, var_name, var_name_to_line_num
    )
    print("textFieldCompletion", flush=True)
    output = jedi.Script(code).complete(line=var_name_to_line_num[var_name] + 1)
    output = [f"{message['value']}{x.complete}" for x in output]
    return {"output": output, "name": "textFieldCompletion", "cache": None}


def parametersRequest(message):
    code = f'${get_import_text(message["message"])[0]}; ${message["message"]}('
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
    print("typeCheckRequest", flush=True)
    try:
        code, _ = generate_code(code_json)
    except SyntaxError:
        print("typeCheckRequest SyntaxError", flush=True)
        return {"output": {}, "name": "typeCheck", "cache": None}

    def fn(temp_file_path):
        return subprocess.run(
            ["dmypy", "check", temp_file_path],
            capture_output=True,
            text=True,
            check=True,
        )

    process = withTempFile(write=code, in_file_with_suffix=".py", then_do=fn)
    stdout = process.stdout

    print("stdout", stdout, flush=True)
    errors = stdout
    output = parse_and_type_check(errors, code, code_json)
    print(output, flush=True)
    return {"output": output, "name": "typeCheck", "cache": None}


def connectionEstablished(message):
    print(f"Connected as {message['websocketId']}")
    return {"output": None, "name": None, "cache": None}


def allConnections(message):
    print("All connections:")
    pprint(message["connections"])
    return {"output": None, "name": None, "cache": None}


def double_braces(x):
    return f"{{{{ {x} }}}}"


def replace_keywords(bash_script, replacements):
    for key, value in replacements.items():
        bash_script = bash_script.replace(double_braces(key), value)
    return bash_script


def runCode(message):
    code = generate_code(export_selected(message["message"]))

    def write_bash(py_filepath):
        def execute_bash(sh_filepath):
            with subprocess.Popen(
                f"bash {sh_filepath}",
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            ) as process:
                for line in process.stdout:
                    print(line.decode("utf8"), flush=True)

        script = get_script(message["message"])
        if script in [None, ""]:
            script = f"python {py_filepath}"
        script = replace_keywords(script, {"RUNCODER_GENERATED_CODE": py_filepath})

        withTempFile(
            write=script,
            in_file_with_suffix=".sh",
            then_do=execute_bash,
        )

    withTempFile(
        write=code[0],
        in_file_with_suffix=".py",
        then_do=write_bash,
    )

    return {"output": None, "name": None, "cache": None}
