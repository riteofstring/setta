from typing import Any, Optional

from pydantic import BaseModel

from setta.code_gen.python.generate_code import (
    maybe_prepend_with_imports,
    position_to_line_col,
    var_declaration,
)
from setta.code_gen.python.make_parseable import maybe_add_newline
from setta.code_gen.utils import process_refs
from setta.tasks.fns.textFieldInitializeCode import get_cache_key
from setta.tasks.task_runner import RunType

from .utils import TaskDefinition, send_document_open_request


class CodeCompletionContent(BaseModel):
    projectConfigId: str
    projectConfigName: str
    sectionId: str
    paramInfoId: str | None
    beforeText: str
    fullText: str
    position: int
    evRefs: list
    cached: Optional[Any] = None


def textFieldCompletionFn(lsp_writers):
    async def fn(
        code_id,
        request_id,
        code,
        codeJson,
        var_name_to_position,
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
            var_name_to_position.keys(),
        )

    return fn


async def _textFieldCompletion(message, lsp_writers):
    request_id = message.id
    message = CodeCompletionContent.parse_obj(message.content)
    cached = message.cached
    if cached is None:
        return {"content": []}

    (
        code,
        code_gen_section_name,
        var_name,
        var_name_to_position,
        referencable_var_names,
        exporter_obj,
    ) = cached

    var_value, new_positions, _ = process_refs(
        message.fullText,
        message.evRefs,
        exporter_obj.get_ref_var_name,
        cursor_position=message.position,
    )

    new_var_decl = var_declaration(var_name, var_value)
    startPos, old_var_decl = var_name_to_position[var_name]
    endPos = startPos + len(old_var_decl)
    code = code[:startPos] + maybe_add_newline(new_var_decl) + code[endPos:]

    cursor_position = new_positions["cursor"][0][0]
    cursor_position += len(new_var_decl) - len(
        var_value
    )  # shift by length of var declaration (like x = ...)
    cursor_position += startPos  # shift by location of var declaration

    line, column = position_to_line_col(code, cursor_position)

    print("****code", code, flush=True)

    code_id = await send_document_open_request(
        lsp_writers,
        code,
        exporter_obj,
        message.projectConfigName,
        code_gen_section_name,
        is_gen_code=True,
    )
    await lsp_writers["full"].send_autocomplete_request(
        line,
        column,
        code_id,
        request_id,
        referencable_var_names,
        var_name_to_position.keys(),
    )

    return {"content": None}


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
