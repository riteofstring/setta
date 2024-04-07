import subprocess
from pprint import pprint

import docstring_parser
import jedi

from ..code.export_selected import export_selected, get_code
from ..code.extract_args_from_help import extract_args_from_help
from ..code.generate_code import (
    generate_code,
    generate_lines_of_code_without_imports,
    get_line_from_string,
    prepend_with_imports,
    set_line,
    var_declaration,
)
from ..code.type_checker import parse_and_type_check
from ..code.utils import get_var_name
from .utils import withTempFiles
import builtins
BUILT_INS = set(dir(builtins))

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
            "extractArgparseArgs": extractArgparseArgs,
        }
        self.interactive_projects = set()

    def add_fn(self, key, fn):
        self.fns[key] = fn
        self.interactive_projects.add(key)

    async def __call__(self, message, tasks_obj, cache):
        key = message["messageType"]
        fn = self.fns[key]
        use_thread = key in self.interactive_projects
        self.maybe_read_cache(message, cache)
        result = await tasks_obj.run_non_blocking_subprocess(fn, use_thread, message)
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
    print("to_cache", to_cache, flush=True)
    return {
        "output": None,
        "name": "textFieldInitializeCode",
        "cache": [*to_cache, codeJson, templatedCode],
    }


def textFieldCompletion(message):
    return completionHelper(message, "textFieldCompletion", textFieldCompletionFn(None))


def textFieldCompletionFn(return_types):
    def fn(message, code, var_name_to_line_num, var_name, column):
        params = []
        variables = []
        builtins = []
        the_rest = []
        column = column + len(var_declaration(var_name, "", "="))
        for c in jedi.Script(code).complete(line=var_name_to_line_num[var_name] + 1, column=column):
            if return_types and c.type not in return_types:
                continue
            completion = f"{message['beforeText']}{c.complete}"
            to_append = {"completion": completion, "type": c.type}
            if c.type == "param":
                params.append(to_append)
            elif completion in BUILT_INS:
                builtins.append(to_append)
            elif c.type == "statement":
                variables.append(to_append)
            else:
                the_rest.append(to_append)
        return params + variables + the_rest + builtins

    return fn


def completionHelper(message, return_name, fn):
    message = message["message"]
    cached = message.pop("cached")
    if cached is None:
        return {"output": [], "name": return_name, "cache": None}
    lines, var_name_to_line_num, codeJson, templatedCode = cached
    var_name = get_var_name(codeJson, message["sectionId"], message["paramInfoId"])
    set_line(lines, var_name_to_line_num, var_name, message["fullText"])
    code, var_name_to_line_num = prepend_with_imports(
        lines, templatedCode, var_name, var_name_to_line_num
    )
    print("completionHelper", flush=True)
    print(code, flush=True)
    output = fn(message, code, var_name_to_line_num, var_name, message["position"])
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
        templated_code = get_code(p)
        code, _ = generate_code(code_json, templated_code)
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


def extractArgparseArgs(message):
    script_path = message["message"]
    output = extract_args_from_help(script_path)
    return {"output": output, "name": "extractArgparseArgs", "cache": None}
