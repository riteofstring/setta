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
    for startPos, r in replacements.items():
        oldName = r["originalEVRef"]["keyword"]
        newName = r["newName"]
        output.append((startPos, oldName, newName))
    return output


def create_new_ev_refs(replacements, newStartPositions):
    output = []
    for oldPos, startPos, newName in newStartPositions:
        output.append(
            {
                **replacements[oldPos]["originalEVRef"],
                "startPos": startPos,
                "keyword": newName,
            }
        )

    # frontend needs it sorted by startPos
    output = sorted(output, key=lambda x: x["startPos"])
    return output


def get_new_value_and_positions(details):
    return replace_at_positions(
        details["string"],
        create_replacements_array(details["replacements"]),
        return_positions=True,
    )


def convert_to_dict(replacements):
    output = {}
    for r in replacements:
        output[r["originalEVRef"]["startPos"]] = r
    return output


@router.post(C.ROUTE_MAKE_EV_REF_REPLACEMENTS)
def route_make_ev_ref_replacements(x: MakeEVRefReplacementsRequest):
    newCodeAreaValues = {}
    for variantId, details in x.codeAreaReplacements.items():
        details["replacements"] = convert_to_dict(details["replacements"])
        newValue, newStartPositions = get_new_value_and_positions(details)
        newCodeAreaValues[variantId] = [
            newValue,
            create_new_ev_refs(details["replacements"], newStartPositions),
        ]

    newCodeInfoValues = {}
    for codeInfoId, details in x.codeInfoReplacements.items():
        details["replacements"] = convert_to_dict(details["replacements"])
        newValue, newStartPositions = get_new_value_and_positions(details)
        newCodeInfoValues[codeInfoId] = [
            newValue,
            create_new_ev_refs(details["replacements"], newStartPositions),
        ]

    newParamEVValues = {}
    for variantId, v in x.paramEVReplacements.items():
        newParamEVValues[variantId] = {}
        for referringParamInfoId, details in v.items():
            details["replacements"] = convert_to_dict(details["replacements"])
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
