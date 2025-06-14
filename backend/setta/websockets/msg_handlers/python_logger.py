from setta.types.websocket_manager import (
    WebsocketConnectionType,
    WebsocketMsgTypeForFrontend,
)
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler


class WMHPythonLogger(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def process_message(self, message, *_, **__):
        msg_type = message["messageType"]
        if msg_type == WebsocketMsgTypeForFrontend.Artifact:
            await self.websocket_manager.broadcast(
                message=message, connectionType=WebsocketConnectionType.FRONTEND
            )
