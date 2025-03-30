import asyncio
import logging
from typing import List

from fastapi import APIRouter, Depends, WebSocket
from pydantic import BaseModel

from setta.utils.constants import C

from .dependencies import (
    get_code_state_from_websocket,
    get_lsp_writers_from_websocket,
    get_terminal_websockets,
    get_terminal_websockets_from_websocket,
)

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
    terminal_websockets=Depends(get_terminal_websockets_from_websocket),
    lsp_writers=Depends(get_lsp_writers_from_websocket),
    code_state=Depends(get_code_state_from_websocket),
):
    # First check if terminal exists
    isNew = terminal_websockets.new_terminal(projectConfigId, sectionId, isTemporary)

    # Start the background task for terminal handling
    async def handle_terminal():
        read_task = asyncio.get_running_loop().create_task(
            terminal_websockets.read_from_terminal(sectionId)
        )
        await read_task
        await terminal_websockets.delete_terminal(sectionId)

    # Create the background task
    if isNew:
        asyncio.get_running_loop().create_task(handle_terminal())

    try:
        await terminal_websockets.connect(websocket, sectionId, id)
        write_task = asyncio.get_running_loop().create_task(
            terminal_websockets.write_to_terminal(
                websocket, lsp_writers, code_state, sectionId
            )
        )
        await write_task
    except:
        pass
    finally:
        # Cleanup
        logger.debug(f"terminal_websocket_endpoint disconnect: {id}")
        terminal_websockets.disconnect(sectionId, id)


@router.post(C.ROUTE_DELETE_TERMINALS)
async def route_terminal_delete_terminals(
    x: DeleteTerminalsRequest, terminal_websockets=Depends(get_terminal_websockets)
):
    await terminal_websockets.delete_terminals(x.sectionIds)


@router.post(C.ROUTE_GET_EXISTING_TERMINALS)
def route_terminal_get_existing_terminals(
    projectConfigId, terminal_websockets=Depends(get_terminal_websockets)
):
    return terminal_websockets.get_existing_terminals(projectConfigId)


@router.post(C.ROUTE_KILL_SUBPROCESSES)
def route_kill_subprocesses(
    x: KillSubprocessesRequest, terminal_websockets=Depends(get_terminal_websockets)
):
    existing = terminal_websockets.get_existing_terminals(x.projectConfigId)
    ids = [x["id"] for x in existing]
    terminal_websockets.kill_processes(ids)
