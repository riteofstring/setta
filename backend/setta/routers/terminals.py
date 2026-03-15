from fastapi import HTTPException
from pydantic import BaseModel

from setta.logging.project_id_route import require_project_context
from setta.project_state.project_manager_types import (
    RunCodeRequest,
)
from setta.routers.dependencies import (
    RuntimeContextFromRequest,
)
from setta.routers.setta_api_router import (
    SettaProjectContextNonLauncherAPIRouter,
)
from setta.share.policy import (
    SharePolicyGuard,
    enforce_share_policy_guard,
    ensure_share_param_value_allowed,
)
from setta.terminals.run_code import run_code
from setta.terminals.terminals import build_terminal_id
from setta.types.id import ID
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.routes import Route

terminals_http_router = SettaProjectContextNonLauncherAPIRouter()


class DeleteTerminalsRequest(BaseModel):
    sectionIds: list[ID]


class KillSubprocessesRequest(BaseModel):
    projectConfigId: ID


async def _validate_run_overrides(
    x: RunCodeRequest,
    ctx: RuntimeContextFromRequest,
    manager,
) -> None:
    if not ctx.deployment_mode:
        return
    if x.sectionVariantOverrides:
        await enforce_share_policy_guard(ctx, SharePolicyGuard.variant)
    if x.paramOverrides:
        for key in x.paramOverrides.keys():
            section_id_str, param_info_id_str = (key.split(":", 1) + [""])[:2]
            if not section_id_str or not param_info_id_str:
                raise HTTPException(
                    status_code=400, detail=f"Invalid paramOverrides key: {key!r}"
                )
            section_id = ID(section_id_str)
            param_info_id = ID(param_info_id_str)
            project_state = manager.get_single_config_state(x.projectConfigId)
            await ensure_share_param_value_allowed(
                policy=ctx.policy,
                frontend_sender=ctx.frontend_sender,
                project_state=project_state,
                section_id=section_id,
                param_info_id=param_info_id,
                share_session_id=ctx.share_session_id,
            )


@terminals_http_router.post(Route.DELETE_TERMINALS)
async def route_delete_terminals(
    x: DeleteTerminalsRequest,
    ctx: RuntimeContextFromRequest,
):
    share_session_id = ctx.share_session_id
    await ctx.enforce_run_allowed()
    terminal_ids = [
        build_terminal_id(section_id, share_session_id) for section_id in x.sectionIds
    ]
    await ctx.state.terminals.delete_terminals(terminal_ids)


@terminals_http_router.post(Route.KILL_SUBPROCESSES)
@require_project_context()
async def route_kill_subprocesses(
    x: KillSubprocessesRequest,
    ctx: RuntimeContextFromRequest,
):
    share_session_id = ctx.share_session_id
    await ctx.enforce_run_allowed()
    ids = ctx.state.terminals.get_existing_terminals(
        x.projectConfigId,
        share_session_id=share_session_id,
    )
    num_killed = ctx.state.terminals.kill_processes(ids)
    msg = (
        f"Killed {num_killed} processes"
        if num_killed > 0
        else "No subprocesses to kill"
    )
    await ctx.state.wmh_frontend_sender.log_and_broadcast_backend_log_event(
        msg,
        project_config_id=x.projectConfigId,
        share_session_id=share_session_id,
    )


@terminals_http_router.post(Route.RUN_CODE)
@require_project_context()
async def route_run_code(
    x: RunCodeRequest,
    ctx: RuntimeContextFromRequest,
):
    share_session_id = ctx.share_session_id
    manager = ctx.get_project_manager(x.projectConfigId)
    await ctx.enforce_run_allowed()
    reserved_single_run = await ctx.enforce_multiple_runs_allowed()
    try:
        await _validate_run_overrides(x, ctx, manager)
        await run_code(
            x,
            manager,
            ctx.state.terminals,
            share_session_id=share_session_id,
        )
    except Exception as exc:
        if reserved_single_run and ctx.deployment_mode and share_session_id is not None:
            await ctx.state.share_runtime_state.rollback_reserved_session_run_count(
                share_session_id
            )
        if isinstance(exc, (KeyError, ValueError)):
            detail = exc.args[0] if exc.args else str(exc)
            raise HTTPException(
                status_code=400,
                detail=str(detail),
            ) from exc
        raise
    if ctx.deployment_mode and share_session_id is not None and not reserved_single_run:
        ctx.state.share_runtime_state.increment_session_run_count(share_session_id)

    await ctx.state.wmh_frontend_sender.log_and_broadcast_backend_log_event(
        "Started command",
        project_config_id=x.projectConfigId,
        severity=SettaBackendLogEventSeverity.info,
        share_session_id=share_session_id,
    )
