import asyncio
import json
import subprocess
from pprint import pprint

import docstring_parser

from runcoder.autocomplete.python.jedi.autocomplete import (
    autocomplete as jedi_autocomplete,
)
from runcoder.autocomplete.python.jedi.autocomplete import (
    get_parameters as jedi_get_parameters,
)
from runcoder.type_checkers.python.mypy.type_checker import parse_and_type_check

from ..code_gen.export_selected import export_selected, get_code
from ..code_gen.python.extract_args_from_help import extract_args_from_help
from ..code_gen.python.generate_code import (
    append_to_line,
    generate_code,
    generate_lines_of_code_without_imports,
    prepend_with_imports,
    set_line,
    var_declaration,
)
from ..code_gen.utils import process_refs
from ..utils.constants import BUILT_INS, C, set_constants
from .cache import Cache
from .task_runner import TaskRunner
from .utils import withTempFiles


class Tasks:
    def __init__(self):
        self.task_runner = TaskRunner()
        self.cache = Cache()
        self.fns = {
            "codeCompletion": codeCompletion,
            "textFieldInitializeCode": textFieldInitializeCode,
            "textFieldCompletion": textFieldCompletion,
            "parametersRequest": parametersRequest,
            "typeCheckRequest": typeCheckRequest,
            "extractArgparseArgs": extractArgparseArgs,
        }
        self.interactive_fns = {}

    async def __call__(self, fn_name, message):
        try:
            print(f"Start processing message ID: {message.get('id', None)}", flush=True)
            if fn_name in self.interactive_fns:
                fn = self.interactive_fns[fn_name]
                use_thread = True
            else:
                fn = self.fns[fn_name]
                use_thread = False
            self.maybe_read_cache(fn_name, message)
            result = await self.task_runner.run_non_blocking_subprocess(
                self.copyConstsThenRunFn, use_thread, C, fn, message
            )
            self.maybe_cache_result(message, result)
            return result
        except asyncio.CancelledError:
            print(f"Task for {message.get('id', None)} was cancelled.", flush=True)
            return {"output": None, "name": None}

    def maybe_read_cache(self, fn_name, message):
        if fn_name in [
            "parametersRequest",
            "codeCompletion",
            "textFieldCompletion",
        ]:
            message = message["message"]
            message["cached"] = self.cache.text_field_generated_code.get(
                message["projectConfigId"], {}
            ).get(message["sectionId"], None)

    def maybe_cache_result(self, message, result):
        if result["cache"] is None:
            return
        if result["name"] == "textFieldInitializeCode":
            project = message["message"]["project"]
            sectionId = message["message"]["sectionId"]
            self.cache.add_text_field_generated_code(
                project["projectConfig"]["id"], sectionId, result["cache"]
            )

    def add_interactive_fn(self, key, fn):
        self.interactive_fns[key] = fn

    def copyConstsThenRunFn(self, inputC, fn, message):
        set_constants(**vars(inputC))
        return fn(message)


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


def autocomplete(code, var_name_to_line_num, var_name, column):
    column = column + len(var_declaration(var_name, ""))
    line = var_name_to_line_num[var_name] + 1
    return jedi_autocomplete(code, line, column), line


def textFieldCompletionFn(return_types):
    def fn(
        beforeText, code, var_name_to_line_num, var_name, referencable_var_names, column
    ):
        params = []
        variables = []
        builtins = []
        the_rest = []
        results, _ = autocomplete(code, var_name_to_line_num, var_name, column)
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








def extractArgparseArgs(message):
    script_path = message["message"]
    output = extract_args_from_help(script_path)
    return {"output": output, "name": "extractArgparseArgs", "cache": None}
