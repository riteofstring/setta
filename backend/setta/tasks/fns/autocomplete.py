from typing import Any, Optional

from pydantic import BaseModel

from setta.code_gen.python.generate_code import (
    prepend_with_imports,
    set_line,
    var_declaration,
)
from setta.code_gen.utils import process_refs
from setta.tasks.task_runner import RunType
from setta.utils.constants import BUILT_INS

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


def _codeCompletion(message, lsp_writer):
    return completionHelper(
        message,
        "codeCompletion",
        textFieldCompletionFn(["module", "class", "function"], lsp_writer),
    )


async def _textFieldCompletion(message, lsp_writer):
    return await completionHelper(
        message, "textFieldCompletion", textFieldCompletionFn(None, lsp_writer)
    )


def textFieldCompletionFn(return_types, lsp_writer):
    async def fn(
        code_id,
        request_id,
        beforeText,
        code,
        codeJson,
        var_name_to_line_num,
        var_name,
        referencable_var_names,
        column,
    ):
        await lsp_writer.send_document_update(code_id, code, codeJson)
        column = column + len(var_declaration(var_name, ""))
        line = var_name_to_line_num[var_name]
        await lsp_writer.send_autocomplete_request(line, column, code_id, request_id)
        # for c in results:
        #     if return_types and c.type not in return_types:
        #         continue
        #     completion = f"{beforeText}{c.complete}"
        #     if completion in var_name_to_line_num:
        #         continue
        #     to_append = {"label": completion, "type": c.type}
        #     if c.type == "param":
        #         params.append(to_append)
        #     elif completion in BUILT_INS:
        #         builtins.append(to_append)
        #     elif c.type == "statement":
        #         variables.append(to_append)
        #     else:
        #         the_rest.append(to_append)
        # return (
        #     params
        #     + variables
        #     + the_rest
        #     + builtins
        #     + [{"label": x, "type": None, "boost": 10} for x in referencable_var_names]
        # )

    return fn


async def completionHelper(message, return_name, fn):
    request_id = message.id
    message = CodeCompletionContent.parse_obj(message.content)
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
    # print("exporter_obj.output", exporter_obj.output, flush=True)
    await fn(
        message.projectConfigId,
        request_id,
        message.beforeText,
        code,
        exporter_obj.output,
        var_name_to_line_num,
        var_name,
        referencable_var_names,
        position,
    )
    return {"output": None, "name": return_name, "cache": None}


def read_cache(cache, message):
    message = message.content
    message["cached"] = cache.get(message["projectConfigId"], {}).get(
        message["sectionId"], None
    )


codeCompletion = TaskDefinition(
    name="codeCompletion",
    fn=_codeCompletion,
    read_cache=read_cache,
    run_as=RunType.THREAD,
    is_built_in=True,
    dependencies=["lsp_writer"],
)
textFieldCompletion = TaskDefinition(
    name="textFieldCompletion",
    fn=_textFieldCompletion,
    read_cache=read_cache,
    run_as=RunType.THREAD,
    is_built_in=True,
    dependencies=["lsp_writer"],
)
