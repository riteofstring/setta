from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsgTypeForFrontend,
)
from setta.websockets.msg_handlers.base import BaseWebsocketMsgReceiver


class WMHPythonLoggerReceiver(BaseWebsocketMsgReceiver):
    async def process_json_str(self, json_str, *_, **__):
        msg_type = json_str["messageType"]
        if msg_type == WebsocketMsgTypeForFrontend.Artifact:
            await self.websocket_manager.broadcast(
                message=json_str, connectionType=WebsocketConnectionType.FRONTEND
            )
