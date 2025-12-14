import asyncio
import logging

from fastapi import WebSocket
from pydantic import BaseModel

from setta.logging.context import get_logging_context
from setta.logging.context_bindings import (
    bind_websocket_logging_context,
    wrap_background_coroutine,
)
from setta.routers.dependencies import (
    AppStateFromRequest,
    AppStateFromWebsocket,
    ReadyAppStateFromRequest,
)
from setta.routers.setta_api_router import SettaAPIRouter
from setta.terminals.run_code import run_code
from setta.types.id import ID
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.routes import Route

terminals_http_router = SettaAPIRouter()
terminals_ws_router = SettaAPIRouter()


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
    state.terminals.new_terminal(projectConfigId, sectionId)

    extra_values = {
        "section_id": sectionId,
        "client_id": id,
    }

    async with bind_websocket_logging_context(
        websocket,
        project_id=projectConfigId,
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
            websocket_id = get_logging_context().get("websocket_id")
            write_task = asyncio.create_task(
                wrap_background_coroutine(
                    state.terminals.write_to_terminal(websocket, sectionId),
                    label="terminal-write-loop",
                    project_id=projectConfigId,
                    websocket_id=websocket_id,
                    extra_values=extra_values,
                )
            )
            await write_task
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
            logging.debug("terminal_websocket_endpoint disconnect: %s", id)
            state.terminals.disconnect(sectionId, id)


@terminals_http_router.post(Route.DELETE_TERMINALS)
async def route_delete_terminals(x: DeleteTerminalsRequest, state: AppStateFromRequest):
    await state.terminals.delete_terminals(x.sectionIds)


@terminals_http_router.post(Route.KILL_SUBPROCESSES)
async def route_kill_subprocesses(
    x: KillSubprocessesRequest,
    state: AppStateFromRequest,
):
    ids = state.terminals.get_existing_terminals(x.projectConfigId)
    num_killed = state.terminals.kill_processes(ids)
    msg = (
        f"Killed {num_killed} processes"
        if num_killed > 0
        else "No subprocesses to kill"
    )
    await state.wmh_frontend_sender.broadcast_backend_log_event(
        msg,
        project_config_id=x.projectConfigId,
    )


@terminals_http_router.post(Route.RUN_CODE)
async def route_run_code(
    x: RunCodeRequest,
    state: ReadyAppStateFromRequest,
):
    await run_code(
        x.projectConfigId,
        x.sectionId,
        x.cliId,
        state.project_manager_switcher.get(x.projectConfigId),
        state.terminals,
        state.wmh_cli_sender,
    )

    await state.wmh_frontend_sender.broadcast_backend_log_event(
        "Started command",
        project_config_id=x.projectConfigId,
        severity=SettaBackendLogEventSeverity.info,
    )
