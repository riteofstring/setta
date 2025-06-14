import logging
import traceback

from fastapi import WebSocket, WebSocketDisconnect

from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route
from setta.types.websocket import WebsocketConnectionType, WebsocketMsg
from setta.websockets.msg_handlers.base import (
    BaseWebsocketMsgReceiver,
)
from setta.websockets.websocket_manager import WebsocketManager

logger = logging.getLogger(__name__)

router = SettaAPIRouter()


async def websocket_route_loop(
    websocket: WebSocket,
    websocket_manager: WebsocketManager,
    websocket_msg_handler: BaseWebsocketMsgReceiver,
    connectionType: WebsocketConnectionType,
    id: str | None = None,
):
    fromWebsocketId = None
    try:
        fromWebsocketId = await websocket_manager.on_connect(
            websocket, connectionType, id=id
        )
        await websocket_msg_handler.on_connect(fromWebsocketId)
        while True:
            try:
                data = await websocket.receive_text()
                message = WebsocketMsg.model_validate_json(data)
                websocket_manager.process_message(message, fromWebsocketId)
                await websocket_msg_handler.process_message(message, fromWebsocketId)
            except WebSocketDisconnect:
                logger.debug("WebSocketDisconnect!")
                break
            except Exception as e:
                logger.debug(f"Exception details:\n{traceback.format_exc()}")
                logger.debug(e)
                logger.debug("caught the exception!")
    finally:
        if fromWebsocketId:
            await websocket_manager.on_disconnect(fromWebsocketId)
            await websocket_msg_handler.on_disconnect(fromWebsocketId)


@router.websocket(Route.WEBSOCKET_FRONTEND)
async def route_websocket_frontend(websocket: WebSocket, state: AppStateFromRequest):
    await websocket_route_loop(
        websocket,
        state.websocket_manager,
        state.wmh_frontend_receiver,
        WebsocketConnectionType.FRONTEND,
    )


@router.websocket(Route.WEBSOCKET_CLI)
@router.websocket(Route.WEBSOCKET_CLI_WITH_ID)
async def route_websocket_cli(
    websocket: WebSocket,
    state: AppStateFromRequest,
    id: str | None = None,
):
    await websocket_route_loop(
        websocket,
        state.websocket_manager,
        state.wmh_cli_receiver,
        WebsocketConnectionType.CLI,
        id=id,
    )


@router.websocket(Route.WEBSOCKET_PYTHON_SCRIPT)
async def route_websocket_python_script(
    websocket: WebSocket,
    state: AppStateFromRequest,
    id: str,
):
    await websocket_route_loop(
        websocket,
        state.websocket_manager,
        state.wmh_python_script_receiver,
        WebsocketConnectionType.PYTHON_SCRIPT,
        id=id,
    )


@router.websocket(Route.WEBSOCKET_PYTHON_LOGGER)
async def route_websocket_python_logger(
    websocket: WebSocket, state: AppStateFromRequest
):
    await websocket_route_loop(
        websocket,
        state.websocket_manager,
        state.wmh_python_logger_receiver,
        WebsocketConnectionType.PYTHON_LOGGER,
    )
