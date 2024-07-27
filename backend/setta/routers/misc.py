from fastapi import APIRouter, Depends

from setta.database.db.settings.load import load_settings
from setta.utils.constants import C

from .dependencies import get_dbs

router = APIRouter()


@router.post(C.ROUTE_LOAD_SETTINGS)
def route_load_settings(dbs=Depends(get_dbs)):
    with dbs:
        return load_settings(dbs)
