import logging
import traceback

from fastapi import Depends, WebSocket, WebSocketDisconnect

from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route
from setta.types.websocket import WebsocketConnectionType, WebsocketMsg
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler
from setta.websockets.msg_handlers.cli import WMHCLI
from setta.websockets.msg_handlers.python_logger import WMHPythonLogger
from setta.websockets.msg_handlers.python_script import WMHPythonScript
from setta.websockets.websocket_manager import WebsocketManager

from .dependencies import (
    get_websocket_manager_from_websocket,
    get_wmh_cli_from_websocket,
    get_wmh_frontend_from_websocket,
    get_wmh_python_logger_from_websocket,
    get_wmh_python_script_from_websocket,
)

logger = logging.getLogger(__name__)

router = SettaAPIRouter()


async def websocket_route_loop(
    websocket: WebSocket,
    websocket_manager: WebsocketManager,
    websocket_msg_handler: BaseWebsocketMsgHandler,
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
async def route_websocket_frontend(
    websocket: WebSocket,
    websocket_manager=Depends(get_websocket_manager_from_websocket),
    websocket_msg_handler=Depends(get_wmh_frontend_from_websocket),
):
    await websocket_route_loop(
        websocket,
        websocket_manager,
        websocket_msg_handler,
        WebsocketConnectionType.FRONTEND,
    )


@router.websocket(Route.WEBSOCKET_CLI)
@router.websocket(Route.WEBSOCKET_CLI_WITH_ID)
async def route_websocket_cli(
    websocket: WebSocket,
    id: str | None = None,
    websocket_manager: WebsocketManager = Depends(get_websocket_manager_from_websocket),
    websocket_msg_handler: WMHCLI = Depends(get_wmh_cli_from_websocket),
):
    await websocket_route_loop(
        websocket,
        websocket_manager,
        websocket_msg_handler,
        WebsocketConnectionType.CLI,
        id=id,
    )


@router.websocket(Route.WEBSOCKET_PYTHON_SCRIPT)
async def route_websocket_python_script(
    websocket: WebSocket,
    id: str,
    websocket_manager: WebsocketManager = Depends(get_websocket_manager_from_websocket),
    websocket_msg_handler: WMHPythonScript = Depends(
        get_wmh_python_script_from_websocket
    ),
):
    await websocket_route_loop(
        websocket,
        websocket_manager,
        websocket_msg_handler,
        WebsocketConnectionType.PYTHON_SCRIPT,
        id=id,
    )


@router.websocket(Route.WEBSOCKET_PYTHON_LOGGER)
async def route_websocket_python_logger(
    websocket: WebSocket,
    websocket_manager: WebsocketManager = Depends(get_websocket_manager_from_websocket),
    websocket_msg_handler: WMHPythonLogger = Depends(
        get_wmh_python_logger_from_websocket
    ),
):
    await websocket_route_loop(
        websocket,
        websocket_manager,
        websocket_msg_handler,
        WebsocketConnectionType.PYTHON_LOGGER,
    )
