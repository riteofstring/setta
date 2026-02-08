import logging

from fastapi import HTTPException, WebSocket
from pydantic import BaseModel

from setta.logging.context_bindings import bind_websocket_logging_context
from setta.logging.project_id_route import require_project_context
from setta.project_state.project_manager_types import (
    RunCodeRequest,
    SetParamEnteredValueRequest,
    SetSectionVariantRequest,
)
from setta.routers.dependencies import (
    RuntimeContextFromRequest,
    RuntimeContextFromWebsocket,
)
from setta.routers.setta_api_router import SettaAPIRouter, SettaProjectContextAPIRouter
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

terminals_http_router = SettaProjectContextAPIRouter()
terminals_ws_router = SettaAPIRouter()
logger = logging.getLogger(__name__)


class DeleteTerminalsRequest(BaseModel):
    sectionIds: list[ID]


class KillSubprocessesRequest(BaseModel):
    projectConfigId: ID


async def _apply_run_overrides(
    x: RunCodeRequest, ctx: RuntimeContextFromRequest, manager
) -> None:
    if x.sectionVariantOverrides:
        await enforce_share_policy_guard(ctx, SharePolicyGuard.variant)
        for section_id, variant_id in x.sectionVariantOverrides.items():
            await manager.set_section_variant(
                SetSectionVariantRequest(
                    projectConfigId=x.projectConfigId,
                    sectionId=section_id,
                    variantId=variant_id,
                )
            )
    if x.paramOverrides:
        for key, value in x.paramOverrides.items():
            section_id_str, param_info_id_str = (key.split(":", 1) + [""])[:2]
            if not section_id_str or not param_info_id_str:
                raise HTTPException(
                    status_code=400, detail=f"Invalid paramOverrides key: {key!r}"
                )
            section_id = ID(section_id_str)
            param_info_id = ID(param_info_id_str)
            if ctx.deployment_mode:
                project_state = manager.get_single_config_state(x.projectConfigId)
                await ensure_share_param_value_allowed(
                    policy=ctx.policy,
                    frontend_sender=ctx.frontend_sender,
                    project_state=project_state,
                    section_id=section_id,
                    param_info_id=param_info_id,
                    share_session_id=ctx.share_session_id,
                )
            await manager.set_param_entered_value(
                SetParamEnteredValueRequest(
                    projectConfigId=x.projectConfigId,
                    sectionId=section_id,
                    paramInfoId=param_info_id,
                    value=value,
                )
            )


@terminals_ws_router.websocket(Route.TERMINAL)
async def terminal_websocket_endpoint(
    websocket: WebSocket,
    projectConfigId: ID,
    sectionId: ID,
    id: str,
    ctx: RuntimeContextFromWebsocket,
):
    share_session_id = ctx.share_session_id
    allowed = await ctx.enforce_run_allowed_ws(websocket)
    if not allowed:
        return
    terminal_id = build_terminal_id(sectionId, share_session_id)
    ctx.state.terminals.new_terminal(
        projectConfigId,
        terminal_id,
        share_session_id=share_session_id,
    )

    extra_values = {
        "section_id": sectionId,
        "client_id": id,
    }
    if share_session_id is not None:
        extra_values["share_session_id"] = share_session_id

    async with bind_websocket_logging_context(
        websocket,
        project_config_id=projectConfigId,
        extra_values=extra_values,
    ):
        context = {
            "terminal_project_id": str(projectConfigId),
            "terminal_section_id": str(sectionId),
            "terminal_client_id": id,
        }
        if share_session_id is not None:
            context["terminal_share_session_id"] = share_session_id
        try:
            did_connect = await ctx.state.terminals.connect(websocket, terminal_id, id)
            if not did_connect:
                return
            touch_session = None
            if share_session_id is not None:

                def touch_session() -> None:
                    ctx.state.share_session_store.touch_session(share_session_id)

            await ctx.state.terminals.write_to_terminal(
                websocket,
                terminal_id,
                allow_input=not ctx.deployment_mode,
                on_activity=touch_session,
            )
        except Exception as exc:
            await ctx.state.wmh_frontend_sender.log_failure_and_broadcast_backend_log_event(
                exc,
                label="terminal-websocket",
                message=f"Terminal websocket error: {projectConfigId}/{sectionId} (client {id})",
                severity=SettaBackendLogEventSeverity.error,
                project_config_id=projectConfigId,
                context=context,
            )
            raise
        finally:
            logger.debug("terminal_websocket_endpoint disconnect: %s", id)
            ctx.state.terminals.disconnect(terminal_id, id)


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
        await _apply_run_overrides(x, ctx, manager)
        await run_code(
            x,
            manager,
            ctx.state.terminals,
            ctx.state.wmh_cli_sender,
            share_session_id=share_session_id,
        )
    except Exception:
        if reserved_single_run and ctx.deployment_mode and share_session_id is not None:
            await ctx.state.share_runtime_state.rollback_reserved_session_run_count(
                share_session_id
            )
        raise
    if ctx.deployment_mode and share_session_id is not None and not reserved_single_run:
        ctx.state.share_runtime_state.increment_session_run_count(share_session_id)

    await ctx.state.wmh_frontend_sender.log_and_broadcast_backend_log_event(
        "Started command",
        project_config_id=x.projectConfigId,
        severity=SettaBackendLogEventSeverity.info,
        share_session_id=share_session_id,
    )
