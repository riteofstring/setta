from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
from setta.types.listener import ListenerCoverageRequest, ListenerCoverageSnapshot
from setta.types.routes import Route

router = SettaProjectContextAPIRouter(require_project_context_by_default=True)


@router.post(Route.GET_LISTENER_COVERAGE)
async def route_get_listener_coverage(
    x: ListenerCoverageRequest,
    ctx: RuntimeContextFromRequest,
) -> ListenerCoverageSnapshot:
    share_session_id = ctx.share_session_id
    return ctx.state.wmh_python_script_receiver.listener_coverage_tracker.get_snapshot_for_project(
        x.projectConfigId,
        ctx.state.listener_registry.iter_registrations_for_project(
            x.projectConfigId,
            share_session_id=share_session_id,
        ),
        share_session_id=share_session_id,
    )
