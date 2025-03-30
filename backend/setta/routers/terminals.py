import asyncio
import logging
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, WebSocket
from pydantic import BaseModel

from setta.database.db.notifications.load import create_notification_dict
from setta.utils.constants import C

from .dependencies import get_terminals, get_terminals_from_websocket, get_wmh_terminals

logger = logging.getLogger(__name__)


router = APIRouter()


class DeleteTerminalsRequest(BaseModel):
    sectionIds: List[str]


class KillSubprocessesRequest(BaseModel):
    projectConfigId: str


@router.websocket(C.ROUTE_TERMINAL)
async def terminal_websocket_endpoint(
    websocket: WebSocket,
    projectConfigId: str,
    sectionId: str,
    id: str,
    isTemporary: bool,
    terminals=Depends(get_terminals_from_websocket),
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
    websocket_msg_handler=Depends(get_wmh_terminals),
):
    existing = terminals.get_existing_terminals(x.projectConfigId)
    ids = [x["id"] for x in existing]
    num_killed = terminals.kill_processes(ids)
    msg = (
        f"Killed {num_killed} processes"
        if num_killed > 0
        else "No subprocesses to kill"
    )
    notification = create_notification_dict(message=msg, temporary=True)
    background_tasks.add_task(
        websocket_msg_handler.broadcast_notification,
        notification,
        x.projectConfigId,
    )
