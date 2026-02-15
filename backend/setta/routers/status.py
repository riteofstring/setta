from fastapi import Depends
from pydantic import BaseModel

from setta.routers.dependencies import AppStateFromRequest, require_ide_mode
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route
from setta.types.server_mode import ServerModeResponse
from setta.utils.init_status import (
    AuthRefreshStatusResponse,
    BackendInitStatusResponse,
    get_auth_refresh_status,
)
from setta.utils.setta_home import resolve_setta_home
from setta.utils.user_config import load_setta_user_config

router = SettaAPIRouter()


class SettaHomeInfoResponse(BaseModel):
    settaHome: str
    globalSettaFilesBase: str


@router.get(Route.GET_BACKEND_INIT_STATUS)
def route_get_backend_init_status(
    state: AppStateFromRequest,
) -> BackendInitStatusResponse:
    return state.init_status.snapshot()


@router.get(Route.GET_AUTH_REFRESH_STATUS)
def route_get_auth_refresh_status() -> AuthRefreshStatusResponse:
    return get_auth_refresh_status()


@router.get(Route.GET_SERVER_MODE)
def route_get_server_mode(state: AppStateFromRequest) -> ServerModeResponse:
    if state.app_mode:
        return ServerModeResponse(mode="app")
    if state.share_mode:
        return ServerModeResponse(mode="share")
    return ServerModeResponse(mode="ide")


@router.get(Route.GET_SETTA_HOME_INFO, dependencies=[Depends(require_ide_mode)])
def route_get_setta_home_info() -> SettaHomeInfoResponse:
    home = resolve_setta_home()
    config = load_setta_user_config(setta_home=home)
    return SettaHomeInfoResponse(
        settaHome=str(home),
        globalSettaFilesBase=str(config.global_setta_files_base),
    )
