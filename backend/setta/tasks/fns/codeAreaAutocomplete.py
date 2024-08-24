import json
from typing import Any, Optional

from pydantic import BaseModel

from setta.code_gen.export_selected import export_selected, get_code
from setta.code_gen.find_placeholders import double_braces, needs_generated_python
from setta.code_gen.python.generate_code import (
    count_lines,
    find_line_number,
    generate_code,
    generate_lines_of_code_without_imports,
    prepend_with_imports,
    replace_keywords,
)
from setta.tasks.task_runner import RunType

from .codeAreaInitializeCode import get_cache_key
from .utils import TaskDefinition


class CodeAreaAutocompleteContent(BaseModel):
    projectConfigId: str
    sectionId: str
    beforeText: str
    fullText: str
    line: int
    column: int
    cached: Optional[Any] = None


async def _codeAreaAutocomplete(message, lsp_writer):
    request_id = message.id
    message = CodeAreaAutocompleteContent.parse_obj(message.content)

    (
        gen_code,
        num_gen_code_lines,
        generated_var_names,
        referencable_var_names,
        exporter_obj,
    ) = message.cached
    codeJson = exporter_obj.output if exporter_obj else None
    line = message.line
    gen_code_line_num = find_line_number(
        message.fullText, double_braces("SETTA_GENERATED_CODE")
    )
    if gen_code_line_num == -1 or message.line <= gen_code_line_num:
        referencable_var_names = []
    else:
        # Subtract 1 because one of the lines is taken up by the template string.
        # For example, imagine the generated code is 1 line long.
        # Then we're just replacing the template code line with another line.
        # So line == message.line.
        line += num_gen_code_lines - 1

    code = replace_keywords(message.fullText, {"SETTA_GENERATED_CODE": gen_code})

    print("line, column", line, message.column, flush=True)
    print("gen_code_line_num", gen_code_line_num, flush=True)
    print("code", code, flush=True)

    await lsp_writer.send_document_update(
        message.projectConfigId, code, codeJson=codeJson
    )
    await lsp_writer.send_autocomplete_request(
        line,
        message.column,
        code_id=message.projectConfigId,
        request_id=request_id,
        referencable_var_names=referencable_var_names,
        generated_var_names=generated_var_names,
    )

    return {"content": None}


def read_cache(cache, message):
    print("reading cache", cache)
    message = message.content
    message["cached"] = cache.get(
        get_cache_key(message["projectConfigId"], message["sectionId"])
    )


codeAreaAutocomplete = TaskDefinition(
    name="codeAreaAutocomplete",
    return_message_type="codeAreaAutocompleteReturn",
    fn=_codeAreaAutocomplete,
    read_cache=read_cache,
    run_as=RunType.THREAD,
    dependencies=["lsp_writer"],
)
