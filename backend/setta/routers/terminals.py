import logging

from fastapi import WebSocket
from pydantic import BaseModel

from setta.logging.context_bindings import bind_websocket_logging_context
from setta.logging.project_id_route import require_project_context
from setta.routers.dependencies import (
    AppStateFromRequest,
    AppStateFromWebsocket,
    ReadyAppStateFromRequest,
)
from setta.routers.setta_api_router import SettaAPIRouter, SettaProjectContextAPIRouter
from setta.share.policy import ensure_share_run_allowed, ensure_share_run_allowed_ws
from setta.terminals.run_code import run_code
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


@terminals_ws_router.websocket(Route.TERMINAL)
async def terminal_websocket_endpoint(
    websocket: WebSocket,
    projectConfigId: ID,
    sectionId: ID,
    id: str,
    state: AppStateFromWebsocket,
):
    allowed = await ensure_share_run_allowed_ws(
        state,
        websocket,
        project_config_id=projectConfigId,
        section_ids=[sectionId],
    )
    if not allowed:
        return
    state.terminals.new_terminal(projectConfigId, sectionId)

    extra_values = {
        "section_id": sectionId,
        "client_id": id,
    }

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
        try:
            did_connect = await state.terminals.connect(websocket, sectionId, id)
            if not did_connect:
                return
            await state.terminals.write_to_terminal(websocket, sectionId)
        except Exception as exc:
            await state.wmh_frontend_sender.log_failure_and_broadcast_backend_log_event(
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
            state.terminals.disconnect(sectionId, id)


@terminals_http_router.post(Route.DELETE_TERMINALS)
async def route_delete_terminals(x: DeleteTerminalsRequest, state: AppStateFromRequest):
    await ensure_share_run_allowed(
        state,
        project_config_id=None,
        section_ids=x.sectionIds,
    )
    await state.terminals.delete_terminals(x.sectionIds)


@terminals_http_router.post(Route.KILL_SUBPROCESSES)
@require_project_context()
async def route_kill_subprocesses(
    x: KillSubprocessesRequest,
    state: AppStateFromRequest,
):
    await ensure_share_run_allowed(
        state,
        project_config_id=x.projectConfigId,
    )
    ids = state.terminals.get_existing_terminals(x.projectConfigId)
    num_killed = state.terminals.kill_processes(ids)
    msg = (
        f"Killed {num_killed} processes"
        if num_killed > 0
        else "No subprocesses to kill"
    )
    await state.wmh_frontend_sender.log_and_broadcast_backend_log_event(
        msg,
        project_config_id=x.projectConfigId,
    )


@terminals_http_router.post(Route.RUN_CODE)
@require_project_context()
async def route_run_code(
    x: RunCodeRequest,
    state: ReadyAppStateFromRequest,
):
    await ensure_share_run_allowed(
        state,
        project_config_id=x.projectConfigId,
        section_ids=[x.sectionId] if x.sectionId else None,
    )
    await run_code(
        x.projectConfigId,
        x.sectionId,
        x.cliId,
        state.project_manager_switcher.get(x.projectConfigId),
        state.terminals,
        state.wmh_cli_sender,
    )

    await state.wmh_frontend_sender.log_and_broadcast_backend_log_event(
        "Started command",
        project_config_id=x.projectConfigId,
        severity=SettaBackendLogEventSeverity.info,
    )
