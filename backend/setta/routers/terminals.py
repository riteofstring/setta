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
    ids: List[str]


@router.websocket(C.ROUTE_TERMINAL)
async def terminal_websocket_endpoint(
    websocket: WebSocket,
    projectConfigId: str,
    id: str,
    terminal_websockets=Depends(get_terminal_websockets_from_websocket),
):
    await terminal_websockets.connect(websocket, projectConfigId, id)
    try:
        # Start reading from and writing to the terminal
        read_task = terminal_websockets.loop.create_task(
            terminal_websockets.read_from_terminal(id)
        )
        write_task = terminal_websockets.loop.create_task(
            terminal_websockets.write_to_terminal(websocket, id)
        )

        # Wait for either task to complete
        _, pending = await asyncio.wait(
            [read_task, write_task], return_when=asyncio.FIRST_COMPLETED
        )

        # Cancel the remaining tasks
        for task in pending:
            task.cancel()
            await task  # Ensure task is properly cancelled
    finally:
        # Cleanup
        terminal_websockets.disconnect(websocket, id)


@router.post(C.ROUTE_GET_FREE_TERMINAL)
def route_terminal_get_free_terminal(
    projectConfigId, terminal_websockets=Depends(get_terminal_websockets)
):
    return terminal_websockets.get_free_terminal(projectConfigId)


@router.post(C.ROUTE_DELETE_TERMINALS)
def route_terminal_delete_terminals(
    x: DeleteTerminalsRequest, terminal_websockets=Depends(get_terminal_websockets)
):
    terminal_websockets.delete_terminals(x.ids)
