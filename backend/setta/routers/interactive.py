import black
from fastapi import APIRouter
from pydantic import BaseModel

from setta.code_gen.create_runnable_scripts import sanitize_section_path_full_name
from setta.code_gen.export_selected import get_section_code, get_section_type
from setta.tasks.fns.utils import replace_template_vars_with_random_names
from setta.utils.constants import C
from setta.utils.utils import multireplace

router = APIRouter()


class UpdateInteractiveCodeRequest(BaseModel):
    projects: list


class FormatCodeRequest(BaseModel):
    project: dict
    candidateTemplateVars: dict


class KillInMemorySubprocessesRequest(BaseModel):
    projectConfigId: str


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


def create_in_memory_module_name(p, sectionId):
    projectConfigName = p["projectConfig"]["name"]
    sanitized_full_name = sanitize_section_path_full_name(
        p["sectionPathFullNames"][sectionId]
    )
    return f"setta_in_memory_{projectConfigName}_{sanitized_full_name}"
