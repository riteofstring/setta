import subprocess
from pprint import pprint

import docstring_parser
import jedi

from ..code.export_selected import export_selected, get_code, get_script
from ..code.extract_args_from_help import extract_args_from_help
from ..code.find_placeholders import needs_python_code, needs_yaml
from ..code.generate_code import (
    generate_code,
    generate_lines_of_code_without_imports,
    generate_script,
    get_line_from_string,
    prepend_with_imports,
    set_line,
)
from ..code.generate_yaml import generate_yaml
from ..code.type_checker import parse_and_type_check
from ..code.utils import get_var_name
from .utils import withTempFiles


class Processors:
    def __init__(self):
        self.fns = {
            "codeCompletionRequest": codeCompletion,
            "textFieldInitializeCode": textFieldInitializeCode,
            "textFieldCompletion": textFieldCompletion,
            "parametersRequest": parametersRequest,
            "typeCheckRequest": typeCheckRequest,
            "connection": connectionEstablished,
            "allConnections": allConnections,
            "runCode": runCode,
            "extractArgparseArgs": extractArgparseArgs,
        }
        self.interactive_projects = set()

    def add_fn(self, key, fn):
        self.fns[key] = fn
        self.interactive_projects.add(key)

    async def __call__(self, message, tasks_obj, cache, send_fn):
        key = message["messageType"]
        fn = self.fns[key]
        use_thread = key == "runCode" or (key in self.interactive_projects)
        self.maybe_read_cache(message, cache)
        args = [message]
        if (key == "runCode"):
            args.extend([send_fn, tasks_obj.loop])
        result = await tasks_obj.run_non_blocking_subprocess(
            fn, use_thread, *args
        )
        self.maybe_cache_result(message, result, cache)
        return result

    def maybe_read_cache(self, message, cache):
        if message["messageType"] in [
            "parametersRequest",
            "codeCompletionRequest",
            "textFieldCompletion",
        ]:
            message = message["message"]
            message["cached"] = cache.text_field_generated_code.get(
                message["projectConfigId"], {}
            ).get(message["sectionId"], None)

    def maybe_cache_result(self, message, result, cache):
        if result["cache"] is None:
            return
        if result["name"] == "textFieldInitializeCode":
            project = message["message"]["project"]
            sectionId = message["message"]["sectionId"]
            cache.add_text_field_generated_code(
                project["projectConfig"]["id"], sectionId, result["cache"]
            )


def codeCompletion(message):
    return completionHelper(
        message,
        "codeCompletion",
        textFieldCompletionFn(["module", "class", "function"]),
    )


def textFieldInitializeCode(message):
    message = message["message"]
    project = message["project"]
    codeJson = export_selected(project)
    templatedCode = get_code(project)
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
        "cache": [*to_cache, codeJson, templatedCode],
    }


def textFieldCompletion(message):
    return completionHelper(message, "textFieldCompletion", textFieldCompletionFn(None))


def textFieldCompletionFn(return_types):
    def fn(message, code, var_name_to_line_num, var_name):
        output = []
        for c in jedi.Script(code).complete(line=var_name_to_line_num[var_name] + 1):
            if return_types and c.type not in return_types:
                continue
            output.append(f"{message['value']}{c.complete}")
        return output

    return fn


def completionHelper(message, return_name, fn):
    message = message["message"]
    cached = message.pop("cached")
    if cached is None:
        return {"output": [], "name": return_name, "cache": None}
    lines, var_name_to_line_num, codeJson, templatedCode = cached
    var_name = get_var_name(codeJson, message["sectionId"], message["paramInfoId"])
    set_line(lines, var_name_to_line_num, var_name, message["value"])
    code, var_name_to_line_num = prepend_with_imports(
        lines, templatedCode, var_name, var_name_to_line_num
    )
    print("completionHelper", flush=True)
    output = fn(message, code, var_name_to_line_num, var_name)
    return {"output": output, "name": return_name, "cache": None}


def parametersRequestFn(message, code, var_name_to_line_num, var_name):
    print("parametersRequest", flush=True)
    line = var_name_to_line_num[var_name] + 1
    results = jedi.Script(code).complete(
        line=line, column=len(get_line_from_string(code, line)) - 2
    )[0]
    parsed = docstring_parser.parse(results.docstring(raw=True))
    descriptions = {v.arg_name: v.description for v in parsed.params}

    signatures = jedi.Script(code).get_signatures(line=line)
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
            output.append(
                {
                    "name": param.name,
                    "defaultVal": defaultVal,
                    "description": descriptions.get(param.name, ""),
                }
            )

    return output


def parametersRequest(message):
    return completionHelper(message, "parameters", parametersRequestFn)


def typeCheckRequest(message):
    p = message["message"]
    code_json = export_selected(p)
    print("typeCheckRequest", flush=True)
    try:
        code, _ = generate_code(code_json, p)
    except SyntaxError:
        print("typeCheckRequest SyntaxError", flush=True)
        return {"output": {}, "name": "typeCheck", "cache": None}

    def fn(temp_file_paths):
        return subprocess.run(
            ["dmypy", "check", temp_file_paths[0]],
            capture_output=True,
            text=True,
            check=True,
        )

    process = withTempFiles(write=[code], in_file_with_suffix=[".py"], then_do=fn)
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


import json
import asyncio

def runCode(message, send_fn, loop):
    p = message["message"]
    selected = export_selected(p)

    def write_bash(filepaths_for_bash):
        def execute_bash(temp_filepaths):
            with subprocess.Popen(
                f"bash {temp_filepaths[0]}",
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            ) as process:
                for line in process.stdout:
                    # print(line.decode("utf8"), flush=True)
                    asyncio.run_coroutine_threadsafe(send_fn(
                        json.dumps(
                            {
                                "id": message["id"],
                                "message": line.decode("utf8"),
                                "toWebsocketId": message["websocketId"],
                                "messageType": "runCode",
                            }
                        )
                    ), loop)

        script = generate_script(p, selected, filepaths_for_bash)
        withTempFiles(
            write=[script],
            in_file_with_suffix=[".sh"],
            then_do=execute_bash,
        )

    unprocessed_script = get_script(p)
    write = []
    in_file_with_suffix = []
    if needs_python_code(unprocessed_script):
        code, _ = generate_code(selected, p)
        write.append(code)
        in_file_with_suffix.append(".py")
    if needs_yaml(unprocessed_script):
        yaml_dict = generate_yaml(selected)
        write.append(yaml_dict)
        in_file_with_suffix.append(".yaml")

    withTempFiles(
        write=write,
        in_file_with_suffix=in_file_with_suffix,
        then_do=write_bash,
    )

    return {"output": None, "name": None, "cache": None}


def extractArgparseArgs(message):
    script_path = message["message"]
    output = extract_args_from_help(script_path)
    return {"output": output, "name": "extractArgparseArgs", "cache": None}
