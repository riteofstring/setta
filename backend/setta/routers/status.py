from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route
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
