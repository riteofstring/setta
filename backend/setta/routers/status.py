from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route
from setta.utils.init_status import BackendInitStatusResponse

router = SettaAPIRouter()


@router.get(Route.GET_BACKEND_INIT_STATUS)
def route_get_backend_init_status(
    state: AppStateFromRequest,
) -> BackendInitStatusResponse:
    return state.init_status.snapshot()
