from typing import Any, Optional

from pydantic import BaseModel

from setta.code_gen.python.generate_code import (
    prepend_with_imports,
    set_line,
    var_declaration,
)
from setta.code_gen.utils import process_refs
from setta.tasks.fns.textFieldInitializeCode import get_cache_key
from setta.tasks.task_runner import RunType

from .utils import TaskDefinition


class CodeCompletionContent(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None
    beforeText: str
    fullText: str
    position: int
    evRefs: list
    cached: Optional[Any] = None


async def _textFieldCompletion(message, lsp_writer):
    return await completionHelper(
        message, "textFieldCompletion", textFieldCompletionFn(lsp_writer)
    )


def textFieldCompletionFn(lsp_writer):
    async def fn(
        code_id,
        request_id,
        code,
        codeJson,
        var_name_to_line_num,
        var_name,
        column,
        var_name_to_frontend_name,
        **_,
    ):
        await lsp_writer.send_document_update(code_id, code, codeJson)
        column = column + len(var_declaration(var_name, ""))
        line = var_name_to_line_num[var_name]
        await lsp_writer.send_autocomplete_request(
            line, column, code_id, request_id, var_name_to_frontend_name
        )

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
        code_id=message.projectConfigId,
        request_id=request_id,
        beforeText=message.beforeText,
        code=code,
        codeJson=exporter_obj.output,
        var_name_to_line_num=var_name_to_line_num,
        var_name=var_name,
        column=position,
        var_name_to_frontend_name=exporter_obj.var_name_to_frontend_name,
    )
    return {"output": None, "name": return_name, "cache": None}


def read_cache(cache, message):
    message = message.content
    message["cached"] = cache.get(
        get_cache_key(
            message["projectConfigId"], message["sectionId"], message["paramInfoId"]
        )
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
