import asyncio
import json
import subprocess
from pprint import pprint

import docstring_parser
import jedi

from ..code.export_selected import export_selected, get_code
from ..code.extract_args_from_help import extract_args_from_help
from ..code.generate_code import (
    append_to_line,
    generate_code,
    generate_lines_of_code_without_imports,
    prepend_with_imports,
    set_line,
    var_declaration,
)
from ..code.type_checker import parse_and_type_check
from ..code.utils import process_refs
from ..utils.constants import BUILT_INS
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
    exporter_obj = export_selected(project)
    codeJson = exporter_obj.output
    templatedCode = get_code(project)
    sectionId = message["sectionId"]
    paramInfoId = message["paramInfoId"]
    push_var_name = exporter_obj.var_name_mapping[(sectionId, paramInfoId, False)]
    lines, var_name_to_line_num = generate_lines_of_code_without_imports(
        codeJson,
        push_var_name=push_var_name,
        force_appear_var_name=push_var_name,
    )
    infoToFullName = {
        tuple(json.loads(k)): v for k, v in project["infoToFullName"].items()
    }
    pushed_var_name_line_num = var_name_to_line_num[push_var_name]
    referencable_var_names = [
        infoToFullName[exporter_obj.var_name_reverse_mapping[v]]
        for v, line_num in var_name_to_line_num.items()
        if line_num < pushed_var_name_line_num
    ]
    print("textFieldInitializeCode", flush=True)
    print(referencable_var_names, flush=True)
    return {
        "output": None,
        "name": "textFieldInitializeCode",
        "cache": [
            lines,
            var_name_to_line_num,
            referencable_var_names,
            templatedCode,
            exporter_obj,
        ],
    }


def textFieldCompletion(message):
    return completionHelper(message, "textFieldCompletion", textFieldCompletionFn(None))


def jedi_complete(code, var_name_to_line_num, var_name, column):
    column = column + len(var_declaration(var_name, ""))
    line = var_name_to_line_num[var_name] + 1
    return jedi.Script(code).complete(line=line, column=column), line


def textFieldCompletionFn(return_types):
    def fn(
        beforeText, code, var_name_to_line_num, var_name, referencable_var_names, column
    ):
        params = []
        variables = []
        builtins = []
        the_rest = []
        results, _ = jedi_complete(code, var_name_to_line_num, var_name, column)
        for c in results:
            if return_types and c.type not in return_types:
                continue
            completion = f"{beforeText}{c.complete}"
            if completion in var_name_to_line_num:
                continue
            to_append = {"label": completion, "type": c.type}
            if c.type == "param":
                params.append(to_append)
            elif completion in BUILT_INS:
                builtins.append(to_append)
            elif c.type == "statement":
                variables.append(to_append)
            else:
                the_rest.append(to_append)
        return (
            params
            + variables
            + the_rest
            + builtins
            + [{"label": x, "type": None, "boost": 10} for x in referencable_var_names]
        )

    return fn


def completionHelper(message, return_name, fn):
    message = message["message"]
    cached = message.pop("cached")
    if cached is None:
        return {"output": [], "name": return_name, "cache": None}
    (
        lines,
        var_name_to_line_num,
        referencable_var_names,
        templatedCode,
        exporter_obj,
    ) = cached
    var_name = exporter_obj.var_name_mapping[
        (message["sectionId"], message["paramInfoId"], False)
    ]
    fullText, position = process_refs(
        message["fullText"],
        message["evRefs"],
        exporter_obj.get_ref_var_name,
        message["position"],
    )
    set_line(lines, var_name_to_line_num, var_name, fullText)
    code, var_name_to_line_num = prepend_with_imports(
        lines, templatedCode, var_name, var_name_to_line_num
    )
    print("completionHelper", flush=True)
    print(code, flush=True)
    output = fn(
        message["beforeText"],
        code,
        var_name_to_line_num,
        var_name,
        referencable_var_names,
        position,
    )
    return {"output": output, "name": return_name, "cache": None}


def parametersRequestFn(
    beforeText, code, var_name_to_line_num, var_name, referencable_var_names, column
):
    print("parametersRequest", flush=True)
    results, line = jedi_complete(code, var_name_to_line_num, var_name, column)
    parsed = docstring_parser.parse(results[0].docstring(raw=True))
    descriptions = {v.arg_name: v.description for v in parsed.params}

    code = append_to_line(code, line, "(")
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
    exporter_obj = export_selected(p)
    code_json = exporter_obj.output
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


async def getProcessorOutput(message, tasks_obj, cache, processors):
    try:
        print(f"Start processing message ID: {message.get('id', None)}", flush=True)
        return await processors(message, tasks_obj, cache)
    except asyncio.CancelledError:
        print(f"Task for {message.get('id', None)} was cancelled.", flush=True)
        return {"output": None, "name": None}
