import asyncio
from typing import List

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
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
    isTemporary: bool,
    terminal_websockets=Depends(get_terminal_websockets_from_websocket),
):
    try:
        isNew = terminal_websockets.new_terminal(
            projectConfigId, sectionId, isTemporary
        )
        pty_info = terminal_websockets.PTY_PIDS[sectionId]

        async def handle_terminal():
            try:
                read_task = terminal_websockets.loop.create_task(
                    terminal_websockets.read_from_terminal(sectionId)
                )
                pty_info["initialized"].set()
                await read_task
            except Exception as e:
                print(f"Terminal handling error: {e}", flush=True)
            finally:
                if not pty_info.get(
                    "closing", False
                ):  # Only delete if not already closing
                    print("read_task finished*", flush=True)
                    await terminal_websockets.delete_terminal(sectionId)

        if isNew:
            terminal_websockets.loop.create_task(handle_terminal())
            try:
                await asyncio.wait_for(pty_info["initialized"].wait(), timeout=5.0)
            except asyncio.TimeoutError:
                print(f"Terminal initialization timeout for {sectionId}", flush=True)
                await websocket.close(1000)
                return

        try:
            await terminal_websockets.connect(websocket, sectionId, id)
        except (WebSocketDisconnect, RuntimeError):
            print(f"WebSocket disconnected during connect for {sectionId}", flush=True)
            return

        try:
            write_task = terminal_websockets.loop.create_task(
                terminal_websockets.write_to_terminal(websocket, sectionId)
            )
            await write_task
        except (WebSocketDisconnect, RuntimeError):
            print(f"WebSocket disconnected during write for {sectionId}", flush=True)
    except Exception as e:
        print(f"Terminal endpoint error: {e}", flush=True)
        try:
            await websocket.close(1000)
        except:
            pass
    finally:
        print("terminal_websocket_endpoint disconnect", id, flush=True)
        if sectionId in terminal_websockets.section_to_socket_ids:
            terminal_websockets.disconnect(sectionId, id)


@router.post(C.ROUTE_GET_FREE_TERMINAL)
def route_terminal_get_free_terminal(
    projectConfigId, terminal_websockets=Depends(get_terminal_websockets)
):
    return terminal_websockets.get_free_terminal(projectConfigId)


@router.post(C.ROUTE_DELETE_TERMINALS)
async def route_terminal_delete_terminals(
    x: DeleteTerminalsRequest, terminal_websockets=Depends(get_terminal_websockets)
):
    await asyncio.gather(
        *(terminal_websockets.delete_terminal(s) for s in x.sectionIds)
    )


@router.post(C.ROUTE_GET_EXISTING_TERMINALS)
def route_terminal_get_existing_terminals(
    projectConfigId, terminal_websockets=Depends(get_terminal_websockets)
):
    return terminal_websockets.get_existing_terminals(projectConfigId)
