from pydantic import BaseModel

from setta.lsp.managers import restart_lsps
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route

from .dependencies import AppStateFromRequest

router = SettaAPIRouter()


class TypeCheckRequest(BaseModel):
    projectConfigId: str


@router.post(Route.RESTART_LANGUAGE_SERVER)
async def route_restart_language_server(state: AppStateFromRequest):
    await restart_lsps(state.lsps, state.lsp_readers, state.lsp_writers)


@router.post(Route.TYPE_CHECK)
async def route_type_check(x: TypeCheckRequest, state: AppStateFromRequest):
    return await state.project_manager.type_check(x.projectConfigId)
