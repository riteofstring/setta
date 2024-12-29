from typing import Any, Optional

from pydantic import BaseModel

from setta.code_gen.export_selected import get_gen_code_template_var
from setta.code_gen.find_placeholders import template_prefix
from setta.code_gen.python.generate_code import (
    position_to_line_col,
    replace_gen_code_template_var,
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
    templateVars: list
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
    matching_template_var = get_gen_code_template_var(message.templateVars)
    if matching_template_var and exporter_obj is None:
        return {"content": C.CODE_AREA_GEN_CODE_NOT_INITIALIZED}

    position = message.position
    if matching_template_var:
        startPos = matching_template_var["startPos"]
        keyword = matching_template_var["keyword"]
        endPos = startPos + len(keyword)
        if position >= endPos:
            fullText, _, [(position, *_), *_] = process_refs(
                fullText,
                message.evRefs,
                exporter_obj.get_ref_var_name,
                position,
            )
            fullText = replace_gen_code_template_var(
                fullText, matching_template_var, gen_code
            )
            position += len(gen_code) - len(keyword)
        elif startPos <= position < endPos:
            # if cursor is inside template str, then don't fetch autocomplete results
            return {"content": None}
        else:
            referencable_var_names = []
            generated_var_names = []
    else:
        referencable_var_names = []
        generated_var_names = []

    line, column = position_to_line_col(fullText, position)

    await lsp_writers["full"].send_document_update(
        message.projectConfigId,
        fullText,
        codeJson=exporter_obj.output if exporter_obj else None,
    )
    await lsp_writers["full"].send_autocomplete_request(
        line,
        column,
        code_id=message.projectConfigId,
        request_id=request_id,
        referencable_var_names=[
            *special_keywords_for_autocomplete(message.templateVars),
            *referencable_var_names,
        ],
        generated_var_names=generated_var_names,
    )

    return {"content": None}


def special_keywords_for_autocomplete(templateVars):
    if not get_gen_code_template_var(templateVars):
        return [template_prefix(C.SETTA_GENERATED_PYTHON)]
    return []


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
