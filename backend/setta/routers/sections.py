from pathlib import Path
from pprint import pprint
from typing import Dict, List

import yaml
from fastapi import APIRouter
from pydantic import BaseModel

from setta.code_gen.export_selected import export_section_to_dict
from setta.database.db.projects.utils import save_json_source_data
from setta.database.db.sections.copy import (
    copy_relative_positions,
    copy_sections_and_other_info,
)
from setta.database.db.sections.load import load_json_sources_into_data_structures
from setta.utils.constants import C
from setta.utils.generate_new_filename import generate_new_filename

router = APIRouter()


class SectionsMakeCopyRequest(BaseModel):
    sectionsAndOtherInfo: dict


class SectionToDictRequest(BaseModel):
    codeInfo: dict
    codeInfoChildren: dict
    sectionVariant: dict
    pinnedIds: Dict[str, List[str]]
    unpinnedIds: Dict[str, List[str]]
    configLanguage: str


class LoadSectionJSONSourceRequest(BaseModel):
    project: dict
    sectionId: str


class SaveSectionJSONSourceRequest(BaseModel):
    project: dict
    sectionId: str


class NewJSONVersionNameRequest(BaseModel):
    filenameGlob: str


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


@router.post(C.ROUTE_SECTION_TO_YAML)
def route_section_to_yaml(x: SectionToDictRequest):
    pinned = export_section_to_dict(
        x.codeInfo,
        x.codeInfoChildren,
        x.sectionVariant,
        x.pinnedIds["topLevelParamIds"],
        x.configLanguage,
        x.pinnedIds["requiredParamIds"],
    )
    unpinned = export_section_to_dict(
        x.codeInfo,
        x.codeInfoChildren,
        x.sectionVariant,
        x.unpinnedIds["topLevelParamIds"],
        x.configLanguage,
        x.unpinnedIds["requiredParamIds"],
    )

    pinnedStr = yaml.dump(pinned.prettyOutput)
    unpinnedStr = yaml.dump(unpinned.prettyOutput)

    yamlValue = ""
    if x.sectionVariant["selectedItem"]:
        selectedItemName = x.codeInfo[x.sectionVariant["selectedItem"]]["name"]
        yamlValue += f"{selectedItemName}\n---\n"

    if len(pinned.prettyOutput) > 0:
        yamlValue += f"{pinnedStr}\n---\n"
    elif yamlValue != "":
        yamlValue += "\n---\n"
    if len(unpinned.prettyOutput) > 0:
        yamlValue += unpinnedStr

    return {
        "yamlValue": yamlValue,
        "originalObj": {
            "pinned": pinned.output,
            "unpinned": unpinned.output,
        },
    }


@router.post(C.ROUTE_LOAD_SECTION_JSON_SOURCE)
def route_load_section_json_source(x: LoadSectionJSONSourceRequest):
    p = x.project
    jsonSourceMissing = load_json_sources_into_data_structures(
        p["sections"],
        p["codeInfo"],
        p["codeInfoCols"],
        p["sectionVariants"],
        section_ids=[x.sectionId],
    )
    jsonSourceMissing = x.sectionId in jsonSourceMissing
    return {"project": p, "jsonSourceMissing": jsonSourceMissing}


@router.post(C.ROUTE_NEW_JSON_VERSION_NAME)
def route_new_json_version_name(x: NewJSONVersionNameRequest):
    new_filename = generate_new_filename(x.filenameGlob)
    Path(new_filename).parent.mkdir(parents=True, exist_ok=True)
    Path(new_filename).touch()
    return new_filename


@router.post(C.ROUTE_SAVE_SECTION_JSON_SOURCE)
def route_save_section_json_source(x: SaveSectionJSONSourceRequest):
    save_json_source_data(x.project, [x.sectionId])
