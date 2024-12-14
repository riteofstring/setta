from typing import Any, Optional

from pydantic import BaseModel

from setta.code_gen.python.generate_code import (
    maybe_prepend_with_imports_and_replace_templated_code,
    position_to_line_col,
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


async def _textFieldCompletion(message, lsp_writers):
    return await completionHelper(message, textFieldCompletionFn(lsp_writers))


def textFieldCompletionFn(lsp_writers):
    async def fn(
        code_id,
        request_id,
        code,
        codeJson,
        var_name_to_line_num,
        referencable_var_names,
        line,
        column,
        **_,
    ):
        # print("code", code, flush=True)
        # print("line, column", line, column, flush=True)

        await lsp_writers["full"].send_document_update(code_id, code, codeJson)
        await lsp_writers["full"].send_autocomplete_request(
            line,
            column,
            code_id,
            request_id,
            referencable_var_names,
            var_name_to_line_num.keys(),
        )

    return fn


async def completionHelper(message, fn):
    request_id = message.id
    message = CodeCompletionContent.parse_obj(message.content)
    cached = message.cached
    if cached is None:
        return {"content": []}

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
    fullText, _, [(position, *_), *_] = process_refs(
        message.fullText,
        message.evRefs,
        exporter_obj.get_ref_var_name,
        message.position,
    )
    set_line(lines, var_name_to_line_num, var_name, fullText)

    code, var_name_to_line_num = maybe_prepend_with_imports_and_replace_templated_code(
        lines,
        templatedCode,
        var_name,
        var_name_to_line_num,
    )

    line_within_fullText, column = position_to_line_col(fullText, position)
    # print("line_within_fullText, column", line_within_fullText, column, flush=True)
    if line_within_fullText == 0:
        column += len(var_declaration(var_name, ""))
    line = line_within_fullText + var_name_to_line_num[var_name]

    output = await fn(
        code_id=message.projectConfigId,
        request_id=request_id,
        beforeText=message.beforeText,
        code=code,
        codeJson=exporter_obj.output,
        var_name_to_line_num=var_name_to_line_num,
        referencable_var_names=referencable_var_names,
        line=line,
        column=column,
    )
    return {"content": output}


def read_cache(cache, message):
    message = message.content
    message["cached"] = cache.get(
        get_cache_key(
            message["projectConfigId"], message["sectionId"], message["paramInfoId"]
        )
    )


textFieldCompletion = TaskDefinition(
    name="textFieldCompletion",
    return_message_type="textFieldCompletionReturn",
    fn=_textFieldCompletion,
    read_cache=read_cache,
    run_as=RunType.NONE,
    server_dependencies=["lsp_writers"],
)
