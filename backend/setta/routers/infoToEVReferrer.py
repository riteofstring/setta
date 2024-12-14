from fastapi import APIRouter
from pydantic import BaseModel

from setta.utils.constants import C
from setta.utils.utils import replace_at_positions

router = APIRouter()


class MakeEVRefReplacementsRequest(BaseModel):
    codeAreaReplacements: dict
    codeInfoReplacements: dict
    paramEVReplacements: dict


@router.post(C.ROUTE_MAKE_EV_REF_REPLACEMENTS)
def route_make_ev_ref_replacements(x: MakeEVRefReplacementsRequest):
    newCodeAreaValues = {}
    for variantId, details in x.codeAreaReplacements.items():
        newCodeAreaValues[variantId] = replace_at_positions(
            details["string"], details["replacements"]
        )

    newCodeInfoValues = {}
    for codeInfoId, details in x.codeInfoReplacements.items():
        newCodeInfoValues[codeInfoId] = replace_at_positions(
            details["string"], details["replacements"]
        )

    newParamEVValues = {}
    for variantId, v in x.paramEVReplacements.items():
        newParamEVValues[variantId] = {}
        for referringParamInfoId, details in v.items():
            newParamEVValues[variantId][referringParamInfoId] = replace_at_positions(
                details["string"], details["replacements"]
            )

    return {
        "newCodeAreaValues": newCodeAreaValues,
        "newCodeInfoValues": newCodeInfoValues,
        "newParamEVValues": newParamEVValues,
    }
