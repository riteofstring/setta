from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.database.db.projects.utils import save_json_source_data
from setta.database.db.sections.load import load_json_sources_into_data_structures
from setta.utils.constants import C, load_settings_project

from .dependencies import get_settings_file

router = APIRouter()


class SettingsSaveRequest(BaseModel):
    settingsProject: dict


@router.post(C.ROUTE_LOAD_SETTINGS)
def route_load_settings(settings_file=Depends(get_settings_file)):
    return settings_file.load()


@router.post(C.ROUTE_SAVE_SETTINGS)
def route_save_settings(x: SettingsSaveRequest):
    save_json_source_data(x.settingsProject)


@router.post(C.ROUTE_LOAD_SETTINGS_PROJECT)
def route_load_settings_project():
    p = load_settings_project()
    load_json_sources_into_data_structures(
        p["sections"], p["codeInfo"], p["codeInfoCols"], p["sectionVariants"]
    )
    return p
