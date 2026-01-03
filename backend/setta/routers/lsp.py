from fastapi import Depends
from pydantic import BaseModel

from setta.logging.project_id_route import require_project_context
from setta.lsp.managers import restart_lsps
from setta.routers.dependencies import require_ide_mode
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
from setta.types.id import ID
from setta.types.routes import Route

from .dependencies import ReadyAppStateFromRequest as AppStateFromRequest

router = SettaProjectContextAPIRouter(dependencies=[Depends(require_ide_mode)])


class TypeCheckRequest(BaseModel):
    projectConfigId: ID


@router.post(Route.RESTART_LANGUAGE_SERVER)
async def route_restart_language_server(state: AppStateFromRequest):
    await restart_lsps(state.lsps, state.lsp_readers, state.lsp_writers)


@router.post(Route.TYPE_CHECK)
@require_project_context()
async def route_type_check(x: TypeCheckRequest, state: AppStateFromRequest):
    return await state.project_manager_switcher.get(x.projectConfigId).type_check(
        x.projectConfigId
    )
