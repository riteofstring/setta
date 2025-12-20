from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.listener import ListenerCoverageRequest, ListenerCoverageSnapshot
from setta.types.routes import Route

router = SettaAPIRouter()


@router.post(Route.GET_LISTENER_COVERAGE)
async def route_get_listener_coverage(
    x: ListenerCoverageRequest,
    state: AppStateFromRequest,
) -> ListenerCoverageSnapshot:
    return state.wmh_python_script_receiver.listener_coverage_tracker.get_snapshot_for_project(
        x.projectConfigId,
        state.listener_registry.iter_registrations_for_project(x.projectConfigId),
    )
