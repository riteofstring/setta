import asyncio
import logging
from typing import List

from fastapi import APIRouter, Depends, WebSocket
from pydantic import BaseModel

from setta.utils.constants import C

from .dependencies import (
    get_code_state_from_websocket,
    get_lsp_writers_from_websocket,
    get_terminals,
    get_terminals_from_websocket,
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
    terminals=Depends(get_terminals_from_websocket),
    lsp_writers=Depends(get_lsp_writers_from_websocket),
    code_state=Depends(get_code_state_from_websocket),
):
    # First check if terminal exists
    terminals.new_terminal(projectConfigId, sectionId, isTemporary)

    try:
        await terminals.connect(websocket, sectionId, id)
        write_task = asyncio.get_running_loop().create_task(
            terminals.write_to_terminal(websocket, lsp_writers, code_state, sectionId)
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
    x: KillSubprocessesRequest, terminals=Depends(get_terminals)
):
    existing = terminals.get_existing_terminals(x.projectConfigId)
    ids = [x["id"] for x in existing]
    terminals.kill_processes(ids)
