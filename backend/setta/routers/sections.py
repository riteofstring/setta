from pathlib import Path
from pprint import pprint
from typing import Dict, List

import yaml
from fastapi import APIRouter
from pydantic import BaseModel

from setta.code_gen.export_selected import (
    export_param_sweep_section_to_dict,
    export_section_to_dict,
)
from setta.code_gen.yaml.section_dict import (
    param_sweep_dict_to_yaml,
    section_dict_to_yaml,
)
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


class SectionToYamlRequest(BaseModel):
    codeInfo: dict
    codeInfoChildren: dict
    sectionVariant: dict
    pinnedIds: Dict[str, List[str]]
    unpinnedIds: Dict[str, List[str]]
    configLanguage: str


class ParamSweepSectionToYamlRequest(BaseModel):
    sweep: list
    codeInfo: dict
    codeInfoChildren: dict


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
def route_section_to_yaml(x: SectionToYamlRequest):
    output = export_section_to_dict(
        x.codeInfo,
        x.codeInfoChildren,
        x.sectionVariant,
        {"pinned": x.pinnedIds, "unpinned": x.unpinnedIds},
        x.configLanguage,
    )

    yamlValue = section_dict_to_yaml(output, x.codeInfo, x.sectionVariant)

    return {
        "yamlValue": yamlValue,
        "originalObj": {
            "pinned": output["pinned"].output,
            "unpinned": output["unpinned"].output,
        },
    }


@router.post(C.ROUTE_PARAM_SWEEP_SECTION_TO_YAML)
def route_param_sweep_section_to_yaml(x: ParamSweepSectionToYamlRequest):
    output = export_param_sweep_section_to_dict(x.sweep, x.codeInfo, x.codeInfoChildren)
    yamlValue = param_sweep_dict_to_yaml(output)
    return {"yamlValue": yamlValue}


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
