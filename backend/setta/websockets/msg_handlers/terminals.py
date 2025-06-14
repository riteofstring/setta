from setta.types.websocket_manager import (
    WebsocketConnectionType,
    WebsocketMsgNewTerminalCreated,
    WebsocketMsgTerminalMetadata,
)
from setta.utils.constants import C
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler
from setta.websockets.websocket_manager import WebsocketManager


class WMHTerminals(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager: WebsocketManager):
        self.websocket_manager = websocket_manager

    async def send_command(self, command, cliId):
        message = {"content": command, "messageType": C.WS_RUN_CODE}
        await self.websocket_manager.send_message(message, cliId)

    async def broadcast_terminal_metadata(self, terminal_metadata):
        await self.websocket_manager.broadcast(
            WebsocketMsgTerminalMetadata(content=terminal_metadata),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def send_new_terminal_id(self, projectConfigId, terminalId):
        await self.websocket_manager.broadcast(
            WebsocketMsgNewTerminalCreated(
                content={"projectConfigId": projectConfigId, "terminalId": terminalId}
            ),
            connectionType=WebsocketConnectionType.FRONTEND,
        )
