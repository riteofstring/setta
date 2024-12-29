from typing import Any, Optional

from pydantic import BaseModel

from setta.code_gen.create_runnable_scripts import generate_final_code_for_section
from setta.code_gen.export_selected import get_gen_code_template_var
from setta.code_gen.find_placeholders import template_prefix
from setta.code_gen.python.generate_code import (
    position_to_line_col,
)
from setta.tasks.task_runner import RunType
from setta.utils.constants import C

from .codeAreaInitializeCode import get_cache_key
from .utils import TaskDefinition, send_document_open_request


class CodeAreaAutocompleteContent(BaseModel):
    projectConfigId: str
    projectConfigName: str
    codeLanguage: str
    sectionId: str
    sectionName: str
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
        generated_var_names,
        referencable_var_names,
        exporter_obj,
    ) = message.cached
    code = message.fullText
    matching_template_var = get_gen_code_template_var(message.templateVars)
    if matching_template_var and exporter_obj is None:
        return {"content": C.CODE_AREA_GEN_CODE_NOT_INITIALIZED}

    code, _, _, new_positions = generate_final_code_for_section(
        code=code,
        codeLanguage=message.codeLanguage,
        evRefs=message.evRefs,
        templateVars=message.templateVars,
        exporter_obj=exporter_obj,
        folder_path=lsp_writers["full"].project_code_folder(message.projectConfigName),
        cursor_position=message.position,
    )

    line, column = position_to_line_col(code, new_positions["cursor"][0][0])

    code_id = await send_document_open_request(
        lsp_writers,
        code,
        exporter_obj,
        message.projectConfigName,
        message.sectionName,
        bool(matching_template_var),
    )

    await lsp_writers["full"].send_autocomplete_request(
        line,
        column,
        code_id=code_id,
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
