from fastapi import APIRouter, Depends
from pydantic import BaseModel

from runcoder.database.db.codeInfo.save import save_code_info
from runcoder.utils.constants import C

from .dependencies import get_dbs

router = APIRouter()


class SaveCodeInfoRequest(BaseModel):
    codeInfo: dict


@router.post(C.ROUTE_GET_COLLECTIONS_AND_MODULES)
def route_get_collections_and_modules():
    pass


@router.post(C.ROUTE_SAVE_CODE_INFO)
def route_save_code_info(x: SaveCodeInfoRequest, dbs=Depends(get_dbs)):
    with dbs:
        save_code_info(dbs, x.codeInfo)


@router.post(C.ROUTE_GET_COLLECTION_DETAILS)
def route_get_collection_details():
    pass
