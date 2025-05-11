from fastapi import APIRouter
from pydantic import BaseModel

from setta.utils.constants import C

router = APIRouter()


class MakeEVRefTemplateVarReplacementsRequest(BaseModel):
    codeAreaReplacements: dict
    codeInfoReplacements: dict
    paramEVReplacements: dict


@router.post(C.ROUTE_MAKE_REPLACEMENTS)
def route_make_ev_ref_template_var_replacements(
    x: MakeEVRefTemplateVarReplacementsRequest,
):
    pass
