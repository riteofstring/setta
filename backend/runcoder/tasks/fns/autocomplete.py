from typing import Any, Optional

from pydantic import BaseModel

from runcoder.autocomplete.python.jedi.autocomplete import (
    autocomplete as jedi_autocomplete,
)
from runcoder.code_gen.python.generate_code import (
    prepend_with_imports,
    set_line,
    var_declaration,
)
from runcoder.code_gen.utils import process_refs
from runcoder.utils.constants import BUILT_INS

from .utils import TaskDefinition, TaskMessage


class CodeCompletionContent(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None
    beforeText: str
    fullText: str
    position: int
    evRefs: list
    cached: Optional[Any] = None


class CodeCompletionMessage(TaskMessage):
    content: CodeCompletionContent


def _codeCompletion(message: CodeCompletionMessage):
    return completionHelper(
        message,
        "codeCompletion",
        textFieldCompletionFn(["module", "class", "function"]),
    )


def _textFieldCompletion(message: CodeCompletionMessage):
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


def completionHelper(message: CodeCompletionMessage, return_name, fn):
    message = message.content
    cached = message.cached
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
        (message.sectionId, message.paramInfoId, False)
    ]
    fullText, position = process_refs(
        message.fullText,
        message.evRefs,
        exporter_obj.get_ref_var_name,
        message.position,
    )
    set_line(lines, var_name_to_line_num, var_name, fullText)
    code, var_name_to_line_num = prepend_with_imports(
        lines, templatedCode, var_name, var_name_to_line_num
    )
    # print("completionHelper", flush=True)
    # print(code, flush=True)
    output = fn(
        message.beforeText,
        code,
        var_name_to_line_num,
        var_name,
        referencable_var_names,
        position,
    )
    return {"output": output, "name": return_name, "cache": None}


def read_cache(cache, message: CodeCompletionMessage):
    message = message.content
    message.cached = cache.get(message.projectConfigId, {}).get(message.sectionId, None)


codeCompletion = TaskDefinition(
    name="codeCompletion",
    fn=_codeCompletion,
    read_cache=read_cache,
    as_subprocess=True,
    is_built_in=True,
)
textFieldCompletion = TaskDefinition(
    name="textFieldCompletion",
    fn=_textFieldCompletion,
    read_cache=read_cache,
    as_subprocess=True,
    is_built_in=True,
)
