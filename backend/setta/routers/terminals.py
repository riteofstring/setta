import logging

from fastapi import WebSocket
from pydantic import BaseModel
from starlette.websockets import WebSocketState

from setta.logging.context_bindings import bind_websocket_logging_context
from setta.logging.project_id_route import require_project_context
from setta.routers.dependencies import (
    RuntimeContextFromRequest,
    RuntimeContextFromWebsocket,
)
from setta.routers.setta_api_router import SettaAPIRouter, SettaProjectContextAPIRouter
from setta.terminals.run_code import run_code
from setta.terminals.terminal_ids import build_terminal_id
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


class RunCodeRequest(BaseModel):
    projectConfigId: ID
    sectionId: ID | None
    cliId: str | None = None


async def _close_with_code(websocket: WebSocket, code: int) -> None:
    if websocket.application_state == WebSocketState.CONNECTING:
        await websocket.accept()
    await websocket.close(code=code)


@terminals_ws_router.websocket(Route.TERMINAL)
async def terminal_websocket_endpoint(
    websocket: WebSocket,
    projectConfigId: ID,
    sectionId: ID,
    id: str,
    ctx: RuntimeContextFromWebsocket,
):
    share_session_id = ctx.share_session_id
    allowed = await ctx.enforce_run_allowed_ws(
        websocket,
        project_config_id=projectConfigId,
        section_ids=[sectionId],
    )
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
    await ctx.enforce_run_allowed(
        project_config_id=None,
        section_ids=x.sectionIds,
    )
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
    await ctx.enforce_run_allowed(
        project_config_id=x.projectConfigId,
    )
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
    resolved_section_id = x.sectionId
    if resolved_section_id is None:
        project_state = manager.get_single_config_state(x.projectConfigId)
        resolved_section_id = project_state.projectConfig.entryCodeBlockId

    await ctx.enforce_run_allowed(
        project_config_id=x.projectConfigId,
        section_ids=[resolved_section_id] if resolved_section_id else None,
    )

    await run_code(
        x.projectConfigId,
        x.sectionId,
        x.cliId,
        manager,
        ctx.state.terminals,
        ctx.state.wmh_cli_sender,
        share_session_id=share_session_id,
    )

    await ctx.state.wmh_frontend_sender.log_and_broadcast_backend_log_event(
        "Started command",
        project_config_id=x.projectConfigId,
        severity=SettaBackendLogEventSeverity.info,
        share_session_id=share_session_id,
    )
