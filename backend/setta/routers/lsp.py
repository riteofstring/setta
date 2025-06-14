from fastapi import Depends
from pydantic import BaseModel

from setta.lsp.managers import restart_lsps
from setta.project_state.project_manager import ProjectManager
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route

from .dependencies import get_lsps, get_project_manager

router = SettaAPIRouter()


class TypeCheckRequest(BaseModel):
    projectConfigId: str


@router.post(Route.RESTART_LANGUAGE_SERVER)
async def route_restart_language_server(lsps=Depends(get_lsps)):
    lsps, lsp_readers, lsp_writers = lsps
    await restart_lsps(lsps, lsp_readers, lsp_writers)


@router.post(Route.TYPE_CHECK)
async def route_type_check(
    x: TypeCheckRequest, project_manager: ProjectManager = Depends(get_project_manager)
):
    return await project_manager.type_check(x.projectConfigId)
