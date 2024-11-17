from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.database.db.projects.utils import (
    remove_json_source_data,
    save_json_source_data,
)
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
    remove_json_source_data(p, keepCodeInfoThatHaveUITypes=False)
    p["uiTypes"] = {k: v for k, v in p["uiTypes"].items() if v["presetType"] != "BASE"}
    settings_file.meta_settings_file.save(p)


@router.post(C.ROUTE_LOAD_SETTINGS_PROJECT)
def route_load_settings_project(settings_file=Depends(get_settings_file)):
    p = settings_file.meta_settings_file.load()
    load_json_sources_into_data_structures(
        p["sections"], p["codeInfo"], p["codeInfoCols"], p["sectionVariants"]
    )
    return p
