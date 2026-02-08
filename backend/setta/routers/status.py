from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route
from setta.types.server_mode import ServerModeResponse
from setta.utils.init_status import (
    AuthRefreshStatusResponse,
    BackendInitStatusResponse,
    get_auth_refresh_status,
)

router = SettaAPIRouter()


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
