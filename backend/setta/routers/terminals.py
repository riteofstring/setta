import asyncio
import logging

from fastapi import BackgroundTasks, Depends, WebSocket
from pydantic import BaseModel

from setta.project_state.project_manager import ProjectManager
from setta.routers.setta_api_router import SettaAPIRouter
from setta.terminals.run_code import run_code
from setta.terminals.terminals import Terminals
from setta.types.notifications import SettaNotification
from setta.types.routes import Route

from .dependencies import (
    get_project_manager,
    get_terminals,
    get_terminals_from_websocket,
)

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
    isTemporary: bool,
    terminals: Terminals = Depends(get_terminals_from_websocket),
):
    # First check if terminal exists
    terminals.new_terminal(projectConfigId, sectionId, isTemporary)

    try:
        await terminals.connect(websocket, sectionId, id)
        write_task = asyncio.create_task(
            terminals.write_to_terminal(websocket, sectionId)
        )
        await write_task
    except:
        pass
    finally:
        # Cleanup
        logger.debug(f"terminal_websocket_endpoint disconnect: {id}")
        terminals.disconnect(sectionId, id)


@router.post(Route.DELETE_TERMINALS)
async def route_terminal_delete_terminals(
    x: DeleteTerminalsRequest, terminals=Depends(get_terminals)
):
    await terminals.delete_terminals(x.sectionIds)


@router.get(Route.GET_EXISTING_TERMINALS)
def route_terminal_get_existing_terminals(
    projectConfigId: str, terminals=Depends(get_terminals)
):
    return terminals.get_existing_terminals(projectConfigId)


@router.post(Route.KILL_SUBPROCESSES)
def route_kill_subprocesses(
    x: KillSubprocessesRequest,
    background_tasks: BackgroundTasks,
    terminals: Terminals = Depends(get_terminals),
):
    existing = terminals.get_existing_terminals(x.projectConfigId)
    ids = [x["id"] for x in existing]
    num_killed = terminals.kill_processes(ids)
    msg = (
        f"Killed {num_killed} processes"
        if num_killed > 0
        else "No subprocesses to kill"
    )
    notification = SettaNotification(
        projectConfigId=x.projectConfigId, message=msg, temporary=True
    )
    background_tasks.add_task(
        terminals.websocket_msg_handler.broadcast_notification,
        notification,
    )


@router.post(Route.RUN_CODE)
async def route_run_code(
    x: RunCodeRequest,
    background_tasks: BackgroundTasks,
    project_manager: ProjectManager = Depends(get_project_manager),
    terminals: Terminals = Depends(get_terminals),
):
    terminal_id, new_terminal_created = await run_code(
        x.projectConfigId,
        x.sectionId,
        x.cliId,
        project_manager,
        terminals,
    )

    notification = SettaNotification(
        projectConfigId=x.projectConfigId, message="Started", temporary=True
    )
    background_tasks.add_task(
        terminals.websocket_msg_handler.broadcast_notification,
        notification,
    )

    if new_terminal_created:
        await terminals.websocket_msg_handler.send_new_terminal_id(
            x.projectConfigId, terminal_id
        )
