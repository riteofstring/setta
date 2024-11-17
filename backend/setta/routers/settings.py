from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.code_gen.export_selected import get_selected_section_variant
from setta.database.db.projects.utils import save_json_source_data
from setta.database.db.sections.load import load_json_sources_into_data_structures
from setta.utils.constants import C

from .dependencies import get_settings_file

router = APIRouter()


class SettingsSaveRequest(BaseModel):
    settingsProject: dict


@router.post(C.ROUTE_LOAD_SETTINGS)
def route_load_settings(settings_file=Depends(get_settings_file)):
    return settings_file.load()


@router.post(C.ROUTE_SAVE_SETTINGS)
def route_save_settings(
    x: SettingsSaveRequest, settings_file=Depends(get_settings_file)
):
    p = x.settingsProject
    save_json_source_data(p)
    # even though there should only be 1 section
    # loop through to find the setta-settings variant, just to be safe
    for s in p["sections"].values():
        variant = get_selected_section_variant(p, s["id"])
        if variant["name"].startswith("setta-settings"):
            settings_path = variant["name"]
            settings_file.meta_settings_file.update_settings_path(settings_path)
            break


@router.post(C.ROUTE_LOAD_SETTINGS_PROJECT)
def route_load_settings_project(settings_file=Depends(get_settings_file)):
    p = settings_file.meta_settings_file.load_settings_project()
    load_json_sources_into_data_structures(
        p["sections"], p["codeInfo"], p["codeInfoCols"], p["sectionVariants"]
    )
    return p
