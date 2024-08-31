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
    position_to_line_col,
    prepend_with_imports,
    replace_keywords,
)
from setta.code_gen.utils import process_refs
from setta.tasks.task_runner import RunType
from setta.utils.constants import C

from .codeAreaInitializeCode import get_cache_key
from .utils import TaskDefinition


class CodeAreaAutocompleteContent(BaseModel):
    projectConfigId: str
    sectionId: str
    beforeText: str
    fullText: str
    position: int
    evRefs: list
    cached: Optional[Any] = None


async def _codeAreaAutocomplete(message, lsp_writer):
    request_id = message.id
    message = CodeAreaAutocompleteContent.parse_obj(message.content)

    (
        gen_code,
        generated_var_names,
        referencable_var_names,
        exporter_obj,
    ) = message.cached
    codeJson = exporter_obj.output if exporter_obj else None
    template_str = double_braces(C.SETTA_GENERATED_PYTHON)
    gen_code_index = message.fullText.find(template_str)
    cursor_is_after_gen_code = gen_code_index != -1 and message.position > (
        gen_code_index + len(template_str)
    )

    fullText, _, position = process_refs(
        message.fullText,
        message.evRefs,
        exporter_obj.get_ref_var_name,
        message.position,
    )

    code = replace_keywords(fullText, {C.SETTA_GENERATED_PYTHON: gen_code})
    if cursor_is_after_gen_code:
        referencable_var_names = []
        generated_var_names = []
        position += len(gen_code) - len(template_str)

    line, column = position_to_line_col(code, position)

    await lsp_writer.send_document_update(
        message.projectConfigId, code, codeJson=codeJson
    )
    await lsp_writer.send_autocomplete_request(
        line,
        column,
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
