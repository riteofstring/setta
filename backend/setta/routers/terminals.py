import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, WebSocket
from pydantic import BaseModel

from setta.database.utils import create_new_id
from setta.project_state.project_manager import ProjectManager
from setta.terminals.terminals import Terminals
from setta.types.notifications import SettaNotification
from setta.types.project_state import ProjectUpdateState
from setta.utils.constants import C
from setta.websockets.msg_handlers.terminals import WMHTerminals

from .dependencies import (
    get_project_manager,
    get_terminals,
    get_terminals_from_websocket,
    get_wmh_terminals,
)

logger = logging.getLogger(__name__)


router = APIRouter()


class DeleteTerminalsRequest(BaseModel):
    sectionIds: list[str]


class KillSubprocessesRequest(BaseModel):
    projectConfigId: str


class RunCodeRequest(BaseModel):
    project: ProjectUpdateState
    entryCodeBlock: str | None
    cliId: str | None = None


@router.websocket(C.ROUTE_TERMINAL)
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


@router.post(C.ROUTE_DELETE_TERMINALS)
async def route_terminal_delete_terminals(
    x: DeleteTerminalsRequest, terminals=Depends(get_terminals)
):
    await terminals.delete_terminals(x.sectionIds)


@router.post(C.ROUTE_GET_EXISTING_TERMINALS)
def route_terminal_get_existing_terminals(
    projectConfigId, terminals=Depends(get_terminals)
):
    return terminals.get_existing_terminals(projectConfigId)


@router.post(C.ROUTE_KILL_SUBPROCESSES)
def route_kill_subprocesses(
    x: KillSubprocessesRequest,
    background_tasks: BackgroundTasks,
    terminals=Depends(get_terminals),
    websocket_msg_handler: WMHTerminals = Depends(get_wmh_terminals),
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
        websocket_msg_handler.broadcast_notification,
        notification,
    )


@router.post(C.ROUTE_RUN_CODE)
async def route_run_code(
    x: RunCodeRequest,
    background_tasks: BackgroundTasks,
    project_manager: ProjectManager = Depends(get_project_manager),
    terminals: Terminals = Depends(get_terminals),
    websocket_msg_handler: WMHTerminals = Depends(get_wmh_terminals),
):
    terminal_id, new_terminal_created = None, None

    command = await project_manager.create_run_command(x.project, x.entryCodeBlock)
    if x.cliId:
        await websocket_msg_handler.send_command(command, x.cliId)
    else:
        projectConfigId = x.project.projectConfigId
        terminal_id = terminals.get_free_terminal(projectConfigId)

        new_terminal_created = False
        if not terminal_id:
            terminal_id = create_new_id()
            terminals.new_terminal(projectConfigId, terminal_id, True)
            new_terminal_created = True

        asyncio.create_task(terminals.run_command_in_terminal(terminal_id, command))

    notification = SettaNotification(
        projectConfigId=x.project.projectConfigId, message="Started", temporary=True
    )
    background_tasks.add_task(
        websocket_msg_handler.broadcast_notification,
        notification,
    )

    return {"terminalId": terminal_id, "newTerminalCreated": new_terminal_created}
