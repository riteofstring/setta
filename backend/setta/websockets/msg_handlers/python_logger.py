from setta.utils.constants import C
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler


class WMHPythonLogger(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def process_message(self, message, *_, **__):
        msg_type = message["messageType"]
        if msg_type == C.WS_ARTIFACT:
            await self.websocket_manager.broadcast(
                message=message, connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND
            )
