from typing import Any, Optional

from pydantic import BaseModel

from setta.code_gen.python.generate_code import (
    maybe_prepend_with_imports,
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
        var_name,
        var_name_to_line_num,
        referencable_var_names,
        exporter_obj,
    ) = cached

    position = message.position
    fullText, new_positions = process_refs(
        message.fullText,
        message.evRefs,
        exporter_obj.get_ref_var_name,
        cursor_position=position,
    )
    position = new_positions["cursor"][0][0]
    set_line(lines, var_name_to_line_num, var_name, fullText)

    fullText, new_positions = process_refs(
        exporter_obj.section_variant_with_code_gen_template_var["code"],
        message.evRefs,
        exporter_obj.get_ref_var_name,
        cursor_position=position,
        templateVars=[
            exporter_obj.section_variant_with_code_gen_template_var["templateVar"]
        ],
        get_template_var_replacement_value=...,
    )

    code, var_name_to_line_num = maybe_prepend_with_imports(
        lines,
        exporter_obj.section_variant_with_code_gen_template_var["code"],
        # exporter_obj.section_variant_with_code_gen_template_var["templateVar"],
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
