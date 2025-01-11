import black
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.code_gen.export_selected import (
    get_section_code,
    get_section_type,
    simple_export_selected,
)
from setta.tasks.fns.utils import replace_template_vars_with_random_names
from setta.utils.constants import C
from setta.utils.utils import multireplace

from .dependencies import get_tasks

router = APIRouter()


class UpdateInteractiveCodeRequest(BaseModel):
    project: dict


class FormatCodeRequest(BaseModel):
    project: dict
    candidateTemplateVars: dict


@router.post(C.ROUTE_UPDATE_INTERACTIVE_CODE)
async def route_update_interactive_code(
    x: UpdateInteractiveCodeRequest, tasks=Depends(get_tasks)
):
    p = x.project
    exporter_obj = simple_export_selected(p)

    codeDict = {}
    for id in p["importCodeBlocks"]:
        codeDict[id] = get_section_code(p, id)

    projectConfigName = x.project["projectConfig"]["name"]
    task_metadata, error_msgs, content = await tasks.add_custom_fns(
        codeDict, projectConfigName, exporter_obj
    )
    return {"taskMetadata": task_metadata, "errorMsgs": error_msgs, "content": content}


@router.post(C.ROUTE_FORMAT_CODE)
async def route_format_code(x: FormatCodeRequest):
    p = x.project
    formattedCode = {}
    for id, s in p["sections"].items():
        if get_section_type(p, id) == C.CODE:
            if s["codeLanguage"] == "python":
                code = get_section_code(p, id)
                (
                    code,
                    _,
                    reverse_var_name_mapping,
                ) = replace_template_vars_with_random_names(
                    x.candidateTemplateVars[id], code
                )
                formattedCode[id] = multireplace(
                    format_python_code(code), reverse_var_name_mapping
                )

    return formattedCode


def format_python_code(code: str) -> str:
    try:
        return black.format_str(code, mode=black.Mode())
    except black.InvalidInput:
        pass
