import json
from typing import Any, Optional

from pydantic import BaseModel

from setta.code_gen.export_selected import export_selected, get_code
from setta.code_gen.find_placeholders import needs_generated_python
from setta.code_gen.python.generate_code import (
    count_lines,
    generate_code,
    generate_lines_of_code_without_imports,
    prepend_with_imports,
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

    gen_code, var_name_to_line_num, referencable_var_names, exporter_obj = message.cached

    await lsp_writer.send_document_update(
        message.projectConfigId, message.fullText, codeJson=None
    )
    await lsp_writer.send_autocomplete_request(
        message.line,
        message.column,
        code_id=message.projectConfigId,
        request_id=request_id,
        referencable_var_names=[],
        generated_var_names={},
    )

    return {"output": None, "name": "codeAreaAutocomplete", "cache": None}


def read_cache(cache, message):
    print('reading cache', cache)
    message = message.content
    message["cached"] = cache.get(
        get_cache_key(message["projectConfigId"], message["sectionId"])
    )


codeAreaAutocomplete = TaskDefinition(
    name="codeAreaAutocomplete",
    fn=_codeAreaAutocomplete,
    read_cache=read_cache,
    run_as=RunType.THREAD,
    is_built_in=True,
    dependencies=["lsp_writer"],
)
