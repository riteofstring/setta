import black
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.code_gen.export_selected import (
    get_section_type,
    get_selected_section_variant,
    simple_export_selected,
)
from setta.utils.constants import C

from .dependencies import get_tasks

router = APIRouter()


class UpdateInteractiveCodeRequest(BaseModel):
    project: dict


class FormatCodeRequest(BaseModel):
    project: dict


@router.post(C.ROUTE_UPDATE_INTERACTIVE_CODE)
async def route_update_interactive_code(
    x: UpdateInteractiveCodeRequest, tasks=Depends(get_tasks)
):
    p = x.project
    projectAsSimpleDict = simple_export_selected(p).output

    codeDict = {}
    for id in p["sections"].keys():
        if get_section_type(p, id) == C.INTERACTIVE_CODE:
            codeDict[id] = get_selected_section_variant(p, id)["code"]

    projectConfigName = x.project["projectConfig"]["name"]
    task_metadata, error_msgs, content = await tasks.add_custom_fns(
        codeDict, projectConfigName, projectAsSimpleDict
    )
    return {"taskMetadata": task_metadata, "errorMsgs": error_msgs, "content": content}


@router.post(C.ROUTE_FORMAT_CODE)
async def route_format_code(x: FormatCodeRequest):
    p = x.project
    formattedCode = {}
    for id, s in p["sections"].items():
        if get_section_type(p, id) in [C.CODE, C.INTERACTIVE_CODE]:
            code = get_selected_section_variant(p, id)["code"]
            if s["codeLanguage"] == "python":
                formattedCode[id] = format_python_code(code)

    return formattedCode


def format_python_code(code: str) -> str:
    try:
        return black.format_str(code, mode=black.Mode())
    except black.InvalidInput:
        pass
