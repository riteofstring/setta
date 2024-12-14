from typing import Any, Optional

from pydantic import BaseModel

from setta.code_gen.find_placeholders import double_braces
from setta.code_gen.python.generate_code import position_to_line_col, replace_keywords
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


async def _codeAreaAutocomplete(message, lsp_writers):
    request_id = message.id
    message = CodeAreaAutocompleteContent.parse_obj(message.content)

    (
        gen_code,
        generated_var_names,
        referencable_var_names,
        exporter_obj,
    ) = message.cached
    fullText = message.fullText
    template_str = double_braces(C.SETTA_GENERATED_PYTHON)
    gen_code_index = fullText.find(template_str)
    has_gen_code = gen_code_index != -1
    if has_gen_code and exporter_obj is None:
        return {"content": C.CODE_AREA_GEN_CODE_NOT_INITIALIZED}

    position = message.position
    cursor_is_after_gen_code = False
    if has_gen_code:
        if position >= (gen_code_index + len(template_str)):
            cursor_is_after_gen_code = True
        elif gen_code_index <= position < gen_code_index + len(template_str):
            # if cursor is inside template str, then don't fetch autocomplete results
            return {"content": None}

    if cursor_is_after_gen_code:
        fullText, _, [(position, *_), *_] = process_refs(
            fullText,
            message.evRefs,
            exporter_obj.get_ref_var_name,
            position,
        )

    code = replace_keywords(fullText, {C.SETTA_GENERATED_PYTHON: gen_code})

    if cursor_is_after_gen_code:
        position += len(gen_code) - len(template_str)
    else:
        referencable_var_names = []
        generated_var_names = []

    line, column = position_to_line_col(code, position)

    await lsp_writers["full"].send_document_update(
        message.projectConfigId,
        code,
        codeJson=exporter_obj.output if exporter_obj else None,
    )
    await lsp_writers["full"].send_autocomplete_request(
        line,
        column,
        code_id=message.projectConfigId,
        request_id=request_id,
        referencable_var_names=[
            *special_keywords_for_autocomplete(),
            *referencable_var_names,
        ],
        generated_var_names=generated_var_names,
    )

    return {"content": None}


def special_keywords_for_autocomplete():
    return [double_braces(C.SETTA_GENERATED_PYTHON)]


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
    run_as=RunType.NONE,
    server_dependencies=["lsp_writers"],
)
