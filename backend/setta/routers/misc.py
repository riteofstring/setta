from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.utils.constants import C

from .dependencies import get_settings_file

router = APIRouter()


class SettingsSaveRequest(BaseModel):
    settings: dict


@router.post(C.ROUTE_LOAD_SETTINGS)
def route_load_settings(settings_file=Depends(get_settings_file)):
    return settings_file.load()


@router.post(C.ROUTE_SAVE_SETTINGS)
def route_save_settings(
    x: SettingsSaveRequest, settings_file=Depends(get_settings_file)
):
    return settings_file.save(x.settings)
