import asyncio
import logging

from fastapi import BackgroundTasks, WebSocket
from pydantic import BaseModel

from setta.routers.dependencies import AppStateFromRequest, AppStateFromWebsocket
from setta.routers.setta_api_router import SettaAPIRouter
from setta.terminals.run_code import run_code
from setta.types.notifications import SettaNotification
from setta.types.routes import Route

logger = logging.getLogger(__name__)


router = SettaAPIRouter()


class DeleteTerminalsRequest(BaseModel):
    sectionIds: list[str]


class KillSubprocessesRequest(BaseModel):
    projectConfigId: str


class RunCodeRequest(BaseModel):
    projectConfigId: str
    sectionId: str | None
    cliId: str | None = None


@router.websocket(Route.TERMINAL)
async def terminal_websocket_endpoint(
    websocket: WebSocket,
    projectConfigId: str,
    sectionId: str,
    id: str,
    state: AppStateFromWebsocket,
):
    # First check if terminal exists
    state.terminals.new_terminal(projectConfigId, sectionId)

    try:
        await state.terminals.connect(websocket, sectionId, id)
        write_task = asyncio.create_task(
            state.terminals.write_to_terminal(websocket, sectionId)
        )
        await write_task
    except:
        pass
    finally:
        # Cleanup
        logger.debug(f"terminal_websocket_endpoint disconnect: {id}")
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
        state.terminals.websocket_msg_handler.broadcast_notification,
        notification,
    )


@router.post(Route.RUN_CODE)
async def route_run_code(
    x: RunCodeRequest, background_tasks: BackgroundTasks, state: AppStateFromRequest
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
        state.wmh_frontend_sender.broadcast_notification,
        notification,
    )
