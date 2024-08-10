from fastapi import APIRouter, Depends

from setta.utils.constants import C

from .dependencies import get_settings_file

router = APIRouter()


@router.post(C.ROUTE_LOAD_SETTINGS)
def route_load_settings(settings_file=Depends(get_settings_file)):
    return settings_file.load()
