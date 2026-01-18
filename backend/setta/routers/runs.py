from fastapi import HTTPException, status

from setta.logging.project_id_route import require_project_context
from setta.project_state.project_manager_types import (
    CancelRunRequest,
    GetRunStatusRequest,
    RunDetachedRequest,
    RunDetachedResponse,
    RunStatusResponse,
)
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
from setta.run_manager import DetachedRunSpec
from setta.types.routes import Route

router = SettaProjectContextAPIRouter()


@router.post(Route.RUN_DETACHED)
@require_project_context()
async def route_run_detached(
    x: RunDetachedRequest,
    ctx: RuntimeContextFromRequest,
) -> RunDetachedResponse:
    await ctx.enforce_run_allowed()
    if ctx.state.share_mode:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Detached runs are not supported in share mode.",
        )
    manager = ctx.get_project_manager(x.projectConfigId)
    (
        command,
        snapshot_path,
        entry_section_id,
    ) = await manager.create_run_command_with_overrides(x)
    run = ctx.state.detached_run_manager.start_run(
        DetachedRunSpec(
            command=command,
            snapshot_path=snapshot_path,
            project_config_id=x.projectConfigId,
            entry_section_id=entry_section_id,
            tags=x.tags or {},
        )
    )
    return RunDetachedResponse(runId=run.runId, status=run.status)


@router.post(Route.GET_RUN_STATUS)
async def route_get_run_status(
    x: GetRunStatusRequest,
    ctx: RuntimeContextFromRequest,
) -> RunStatusResponse:
    await ctx.enforce_run_allowed()
    return ctx.state.detached_run_manager.get_status(x.runId)


@router.post(Route.CANCEL_RUN)
async def route_cancel_run(
    x: CancelRunRequest,
    ctx: RuntimeContextFromRequest,
) -> RunStatusResponse:
    await ctx.enforce_run_allowed()
    return ctx.state.detached_run_manager.cancel_run(x.runId)
