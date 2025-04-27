from fastapi import APIRouter
from pydantic import BaseModel

from setta.project_state.code_task_fns.utils import (
    find_candidate_template_vars,
    replace_template_vars_with_random_names,
)
from setta.code_gen.export_selected import get_section_code, get_section_type
from setta.utils.constants import C
from setta.utils.format_code import ruff_format
from setta.utils.utils import multireplace

router = APIRouter()


class FormatCodeRequest(BaseModel):
    project: dict


@router.post(C.ROUTE_FORMAT_CODE)
async def route_format_code(x: FormatCodeRequest):
    p = x.project
    formattedCode = {}
    for id, s in p["sections"].items():
        if get_section_type(p, id) == C.CODE:
            if s["codeLanguage"] == "python":
                candidateTemplateVars = find_candidate_template_vars()
                code = get_section_code(p, id)
                (
                    code,
                    _,
                    reverse_var_name_mapping,
                ) = replace_template_vars_with_random_names(candidateTemplateVars, code)
                formattedCode[id] = multireplace(
                    format_python_code(code), reverse_var_name_mapping
                )

    return formattedCode


def format_python_code(code: str) -> str:
    try:
        return ruff_format(code)
    except Exception:
        pass
