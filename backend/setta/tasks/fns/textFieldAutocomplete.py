from typing import Any, Optional

from pydantic import BaseModel

from setta.code_gen.python.generate_code import position_to_line_col, var_declaration
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


def get_code_and_cursor_position(
    message, code, var_name, var_name_to_decl_position, exporter_obj
):
    var_value, new_positions = process_refs(
        message.fullText,
        message.evRefs,
        exporter_obj.get_ref_var_name,
        cursor_position=message.position,
    )

    new_var_decl = var_declaration(var_name, var_value)
    startPos, old_var_decl = var_name_to_decl_position[var_name]
    endPos = startPos + len(old_var_decl)
    code = code[:startPos] + maybe_add_newline(new_var_decl) + code[endPos:]

    cursor_position = new_positions["cursor"]
    cursor_position += len(new_var_decl) - len(
        var_value
    )  # shift by length of var declaration (like x = ...)
    cursor_position += startPos  # shift by location of var declaration

    return code, cursor_position


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
        var_name_to_decl_position,
        referencable_var_names,
        exporter_obj,
    ) = cached

    code, cursor_position = get_code_and_cursor_position(
        message, code, var_name, var_name_to_decl_position, exporter_obj
    )
    line, column = position_to_line_col(code, cursor_position)

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
        var_name_to_decl_position.keys(),
    )

    return None


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
