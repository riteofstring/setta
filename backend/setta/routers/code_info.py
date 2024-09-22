from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.database.db.codeInfo.save import save_code_info
from setta.utils.constants import C

from .dependencies import get_dbq

router = APIRouter()


class SaveCodeInfoRequest(BaseModel):
    codeInfo: dict


@router.post(C.ROUTE_GET_COLLECTIONS_AND_MODULES)
def route_get_collections_and_modules():
    pass


@router.post(C.ROUTE_SAVE_CODE_INFO)
def route_save_code_info(x: SaveCodeInfoRequest, dbq=Depends(get_dbq)):
    with dbq as db:
        save_code_info(db, x.codeInfo)


@router.post(C.ROUTE_GET_COLLECTION_DETAILS)
def route_get_collection_details():
    pass
