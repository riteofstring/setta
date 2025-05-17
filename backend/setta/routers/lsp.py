from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.lsp.managers import restart_lsps
from setta.utils.constants import C

from .dependencies import get_lsps, get_project_manager

router = APIRouter()


class TypeCheckRequest(BaseModel):
    projectConfigId: str


@router.post(C.ROUTE_RESTART_LANGUAGE_SERVER)
async def route_restart_language_server(lsps=Depends(get_lsps)):
    lsps, lsp_readers, lsp_writers = lsps
    await restart_lsps(lsps, lsp_readers, lsp_writers)


@router.post(C.ROUTE_TYPE_CHECK)
async def route_type_check(
    x: TypeCheckRequest, project_manager=Depends(get_project_manager)
):
    return await project_manager.type_check(x.projectConfigId)
