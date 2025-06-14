from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsgTypeForFrontend,
)
from setta.websockets.msg_handlers.base import BaseWebsocketMsgReceiver


class WMHPythonLoggerReceiver(BaseWebsocketMsgReceiver):
    async def process_message(self, message, *_, **__):
        msg_type = message["messageType"]
        if msg_type == WebsocketMsgTypeForFrontend.Artifact:
            await self.websocket_manager.broadcast(
                message=message, connectionType=WebsocketConnectionType.FRONTEND
            )
