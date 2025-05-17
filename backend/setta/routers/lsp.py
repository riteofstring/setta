from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.lsp.utils import restart_lsps
from setta.utils.constants import C

from .dependencies import get_code_tasks, get_lsps

router = APIRouter()


class TypeCheckRequest(BaseModel):
    project: dict


@router.post(C.ROUTE_RESTART_LANGUAGE_SERVER)
async def route_restart_language_server(lsps=Depends(get_lsps)):
    lsps, lsp_readers, lsp_writers = lsps
    await restart_lsps(lsps, lsp_readers, lsp_writers)


@router.post(C.ROUTE_TYPE_CHECK)
async def route_type_check(x: TypeCheckRequest, code_tasks=Depends(get_code_tasks)):
    return await code_tasks.process_post_request(x.project, C.ROUTE_TYPE_CHECK)
