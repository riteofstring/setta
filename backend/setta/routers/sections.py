from pprint import pprint
from typing import Dict, List

from fastapi import APIRouter
from pydantic import BaseModel

from setta.code_gen.export_selected import export_section_to_dict
from setta.database.db.sections.copy import (
    copy_relative_positions,
    copy_sections_and_other_info,
)
from setta.database.db.sections.load import load_json_source
from setta.utils.constants import C

router = APIRouter()


class SectionsMakeCopyRequest(BaseModel):
    sectionsAndOtherInfo: dict


class SectionToDictRequest(BaseModel):
    codeInfo: dict
    sectionVariant: dict
    sectionId: str
    pinnedIds: Dict[str, List[str]]
    unpinnedIds: Dict[str, List[str]]
    configLanguage: str


class LoadSectionJSONSourceRequest(BaseModel):
    jsonSource: str


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
        x.codeInfo,
        x.sectionVariant,
        x.sectionId,
        x.pinnedIds["topLevelParamIds"],
        x.configLanguage,
        x.pinnedIds["requiredParamIds"],
    )
    unpinned = export_section_to_dict(
        x.codeInfo,
        x.sectionVariant,
        x.sectionId,
        x.unpinnedIds["topLevelParamIds"],
        x.configLanguage,
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
    new_code_infos, new_variant_values, jsonSourceMissing = load_json_source(
        x.jsonSource
    )

    pprint(new_code_infos)

    return {
        "newCodeInfos": new_code_infos,
        "newVariantValues": new_variant_values,
        "jsonSourceMissing": jsonSourceMissing,
    }
