from setta.code_gen.python.generate_code import position_to_line_col
from setta.tasks.task_runner import RunType

from .textFieldAutocomplete import (
    CodeCompletionContent,
    get_code_and_cursor_position,
    read_cache,
)
from .utils import TaskDefinition, send_document_open_request


async def _parametersRequest(message, lsp_writers):
    request_id = message.id
    message = CodeCompletionContent.parse_obj(message.content)
    cached = message.cached
    if cached is None:
        return {"content": []}

    (
        gen_code_dict,
        var_name,
        _,
        _,
        exporter_obj,
    ) = cached

    code, cursor_position = get_code_and_cursor_position(
        message,
        gen_code_dict,
        var_name,
        exporter_obj,
        lsp_writers,
    )
    code = code[:cursor_position] + "()" + code[cursor_position + 2 :]
    # move cursor into parentheses
    cursor_position += 1
    line, column = position_to_line_col(code, cursor_position)
    code_id = await send_document_open_request(
        lsp_writers,
        code,
        exporter_obj,
        message.projectConfigName,
        gen_code_dict["name"],
        is_gen_code=True,
    )
    await lsp_writers["full"].send_signature_help_request(
        line, column, code_id, request_id
    )
    return None


parametersRequest = TaskDefinition(
    name="parametersRequest",
    return_message_type="parametersRequestReturn",
    fn=_parametersRequest,
    read_cache=read_cache,
    run_as=RunType.NONE,
    server_dependencies=["lsp_writers"],
)
