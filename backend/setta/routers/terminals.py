import asyncio
from typing import List

from fastapi import APIRouter, Depends, WebSocket
from pydantic import BaseModel

from setta.utils.constants import C

from .dependencies import (
    get_terminal_websockets,
    get_terminal_websockets_from_websocket,
)

router = APIRouter()


class DeleteTerminalsRequest(BaseModel):
    sectionIds: List[str]


@router.websocket(C.ROUTE_TERMINAL)
async def terminal_websocket_endpoint(
    websocket: WebSocket,
    projectConfigId: str,
    sectionId: str,
    id: str,
    terminal_websockets=Depends(get_terminal_websockets_from_websocket),
):
    # First check if terminal exists
    isNew = terminal_websockets.new_terminal(projectConfigId, sectionId)

    # Start the background task for terminal handling
    async def handle_terminal():
        read_task = terminal_websockets.loop.create_task(
            terminal_websockets.read_from_terminal(sectionId)
        )
        await read_task

    # Create the background task
    if isNew:
        terminal_websockets.loop.create_task(handle_terminal())

    await terminal_websockets.connect(websocket, sectionId, id)
    try:
        write_task = terminal_websockets.loop.create_task(
            terminal_websockets.write_to_terminal(websocket, sectionId)
        )

        await write_task
    finally:
        # Cleanup
        print("terminal_websocket_endpoint disconnect", id, flush=True)
        terminal_websockets.disconnect(sectionId, id)


@router.post(C.ROUTE_GET_FREE_TERMINAL)
def route_terminal_get_free_terminal(
    projectConfigId, terminal_websockets=Depends(get_terminal_websockets)
):
    return terminal_websockets.get_free_terminal(projectConfigId)


@router.post(C.ROUTE_DELETE_TERMINALS)
def route_terminal_delete_terminals(
    x: DeleteTerminalsRequest, terminal_websockets=Depends(get_terminal_websockets)
):
    terminal_websockets.delete_terminals(x.sectionIds)
