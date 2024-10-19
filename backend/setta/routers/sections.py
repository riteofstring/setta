from typing import Dict, List
from fastapi import APIRouter
from pydantic import BaseModel

from setta.code_gen.export_selected import export_section_to_dict
from setta.database.db.sections.copy import (
    copy_relative_positions,
    copy_sections_and_other_info,
)
from setta.utils.constants import C
import copy
from setta.database.db.sections.load import load_json_sources

router = APIRouter()


class SectionsMakeCopyRequest(BaseModel):
    sectionsAndOtherInfo: dict


class SectionToDictRequest(BaseModel):
    project: dict
    sectionId: str
    pinnedIds: Dict[str, List[str]]
    unpinnedIds: Dict[str, List[str]]


class LoadSectionJSONSourceRequest(BaseModel):
    jsonSource: str
    sections: dict
    codeInfo: dict
    sectionVariants: dict


@router.post(C.ROUTE_SECTIONS)
def route_sections():
    pass


@router.post(C.ROUTE_COPY_SECTIONS)
def route_sections_make_copy(x: SectionsMakeCopyRequest):
    output = copy_sections_and_other_info(x.sectionsAndOtherInfo)
    relativePositions = copy_relative_positions(
        x.sectionsAndOtherInfo["relativePositions"], output["section_id_map"]
    )
    output.pop("section_id_map")
    return {**output, "relativePositions": relativePositions}


@router.post(C.ROUTE_SECTION_TO_DICT)
def route_section_to_yaml(x: SectionToDictRequest):
    pinned = export_section_to_dict(
        x.project,
        x.sectionId,
        x.pinnedIds["topLevelParamIds"],
        x.pinnedIds["requiredParamIds"],
    )
    unpinned = export_section_to_dict(
        x.project,
        x.sectionId,
        x.unpinnedIds["topLevelParamIds"],
        x.unpinnedIds["requiredParamIds"],
    )
    return {
        "pinned": pinned.output,
        "prettyPinned": pinned.prettyOutput,
        "unpinned": unpinned.output,
        "prettyUnpinned": unpinned.prettyOutput,
    }


@router.post(C.ROUTE_LOAD_SECTION_JSON_SOURCE)
def route_load_section_json_source(x: LoadSectionJSONSourceRequest):
    # sectionVariants = copy.deepcopy(x.sectionVariants)
    # codeInfo = copy.deepcopy(x.codeInfo)
    load_json_sources(x.sections, x.codeInfo, x.sectionVariants)
    return {"codeInfo": x.codeInfo, "sectionVariants": x.sectionVariants}