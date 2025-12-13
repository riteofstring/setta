from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route

router = SettaAPIRouter()


@router.get(Route.GET_BACKEND_INIT_STATUS)
def route_get_backend_init_status(state: AppStateFromRequest):
    return state.init_status.snapshot()
