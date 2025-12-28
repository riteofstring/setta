from fastapi import Request

from setta.routers.dependencies import (
    AppStateFromRequest,
    get_share_session_id_from_request,
)
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
from setta.types.listener import ListenerCoverageRequest, ListenerCoverageSnapshot
from setta.types.routes import Route

router = SettaProjectContextAPIRouter(require_project_context_by_default=True)


@router.post(Route.GET_LISTENER_COVERAGE)
async def route_get_listener_coverage(
    x: ListenerCoverageRequest,
    state: AppStateFromRequest,
    request: Request,
) -> ListenerCoverageSnapshot:
    share_session_id = None
    if state.share_mode:
        share_session_id = get_share_session_id_from_request(request)
        state.share_session_store.get_session(share_session_id)
    return state.wmh_python_script_receiver.listener_coverage_tracker.get_snapshot_for_project(
        x.projectConfigId,
        state.listener_registry.iter_registrations_for_project(
            x.projectConfigId,
            share_session_id=share_session_id,
        ),
    )
