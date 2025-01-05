from fastapi import APIRouter
from pydantic import BaseModel

from setta.utils.constants import C
from setta.utils.utils import replace_at_positions

router = APIRouter()


class MakeEVRefReplacementsRequest(BaseModel):
    codeAreaReplacements: dict
    codeInfoReplacements: dict
    paramEVReplacements: dict


def create_replacements_array(replacements):
    output = []
    for r in replacements:
        startPos = r["originalEVRef"]["startPos"]
        oldName = r["originalEVRef"]["keyword"]
        newName = r["newName"]
        output.append((startPos, oldName, newName))
    return output


def create_new_ev_refs(replacements, newStartPositions):
    output = []
    for idx, (oldStartPos, startPos, newName) in enumerate(newStartPositions):
        output.append(
            (
                oldStartPos,
                {
                    **replacements[idx]["originalEVRef"],
                    "startPos": startPos,
                    "keyword": newName,
                },
            )
        )
    return output


def get_new_value_and_positions(details):
    return replace_at_positions(
        details["string"],
        create_replacements_array(details["replacements"]),
        return_positions=True,
    )


@router.post(C.ROUTE_MAKE_EV_REF_REPLACEMENTS)
def route_make_ev_ref_replacements(x: MakeEVRefReplacementsRequest):
    newCodeAreaValues = {}
    for variantId, details in x.codeAreaReplacements.items():
        newValue, newStartPositions = get_new_value_and_positions(details)
        newCodeAreaValues[variantId] = [
            newValue,
            create_new_ev_refs(details["replacements"], newStartPositions),
        ]

    newCodeInfoValues = {}
    for codeInfoId, details in x.codeInfoReplacements.items():
        newValue, newStartPositions = get_new_value_and_positions(details)
        newCodeInfoValues[codeInfoId] = [
            newValue,
            create_new_ev_refs(details["replacements"], newStartPositions),
        ]

    newParamEVValues = {}
    for variantId, v in x.paramEVReplacements.items():
        newParamEVValues[variantId] = {}
        for referringParamInfoId, details in v.items():
            newValue, newStartPositions = get_new_value_and_positions(details)
            newParamEVValues[variantId][referringParamInfoId] = [
                newValue,
                create_new_ev_refs(details["replacements"], newStartPositions),
            ]

    return {
        "newCodeAreaValues": newCodeAreaValues,
        "newCodeInfoValues": newCodeInfoValues,
        "newParamEVValues": newParamEVValues,
    }
