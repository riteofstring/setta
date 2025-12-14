import asyncio
import logging

from fastapi import BackgroundTasks, WebSocket
from pydantic import BaseModel

from setta.routers.dependencies import (
    AppStateFromRequest,
    AppStateFromWebsocket,
    ReadyAppStateFromRequest,
)
from setta.routers.setta_api_router import SettaAPIRouter
from setta.logging.context import get_logging_context
from setta.logging.context_bindings import (
    bind_websocket_logging_context,
    wrap_background_callable,
    wrap_background_coroutine,
)
from setta.terminals.run_code import run_code
from setta.types.id import ID
from setta.types.notifications import SettaNotification
from setta.types.routes import Route


router = SettaAPIRouter()


class DeleteTerminalsRequest(BaseModel):
    sectionIds: list[ID]


class KillSubprocessesRequest(BaseModel):
    projectConfigId: ID


class RunCodeRequest(BaseModel):
    projectConfigId: ID
    sectionId: ID | None
    cliId: str | None = None


@router.websocket(Route.TERMINAL)
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
        try:
            await state.terminals.connect(websocket, sectionId, id)
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
        except Exception:
            pass
        finally:
            logging.debug("terminal_websocket_endpoint disconnect: %s", id)
            state.terminals.disconnect(sectionId, id)


@router.post(Route.DELETE_TERMINALS)
async def route_delete_terminals(x: DeleteTerminalsRequest, state: AppStateFromRequest):
    await state.terminals.delete_terminals(x.sectionIds)


@router.post(Route.KILL_SUBPROCESSES)
def route_kill_subprocesses(
    x: KillSubprocessesRequest,
    background_tasks: BackgroundTasks,
    state: AppStateFromRequest,
):
    ids = state.terminals.get_existing_terminals(x.projectConfigId)
    num_killed = state.terminals.kill_processes(ids)
    msg = (
        f"Killed {num_killed} processes"
        if num_killed > 0
        else "No subprocesses to kill"
    )
    notification = SettaNotification(
        projectConfigId=x.projectConfigId,
        message=msg,
    )
    background_tasks.add_task(
        wrap_background_callable(
            state.terminals.websocket_msg_handler.broadcast_notification,
            label="terminals-kill-notification",
            project_id=x.projectConfigId,
            request_id=_current_request_id(),
        ),
        notification,
    )


@router.post(Route.RUN_CODE)
async def route_run_code(
    x: RunCodeRequest,
    background_tasks: BackgroundTasks,
    state: ReadyAppStateFromRequest,
):
    terminal_id = await run_code(
        x.projectConfigId,
        x.sectionId,
        x.cliId,
        state.project_manager_switcher.get(x.projectConfigId),
        state.terminals,
        state.wmh_cli_sender,
    )

    notification = SettaNotification(
        projectConfigId=x.projectConfigId,
        message="Started",
    )
    background_tasks.add_task(
        wrap_background_callable(
            state.wmh_frontend_sender.broadcast_notification,
            label="run-code-notification",
            project_id=x.projectConfigId,
            request_id=_current_request_id(),
        ),
        notification,
    )


def _current_request_id() -> str | None:
    return get_logging_context().get("request_id")
