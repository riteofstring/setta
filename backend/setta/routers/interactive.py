from pydantic import BaseModel

from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.base_ui_types import UITypeName
from setta.types.routes import Route
from setta.utils.format_code import ruff_format

router = SettaAPIRouter()


class FormatCodeRequest(BaseModel):
    project: dict


@router.post(Route.FORMAT_CODE)
async def route_format_code(x: FormatCodeRequest):
    p = x.project
    formattedCode = {}
    for id, s in p["sections"].items():
        if get_section_type(p, id) == UITypeName.CODE:
            if s["codeLanguage"] == "python":
                code = get_section_code(p, id)
                formattedCode[id] = format_python_code(code)

    return formattedCode


def format_python_code(code: str) -> str:
    try:
        return ruff_format(code)
    except Exception:
        pass
