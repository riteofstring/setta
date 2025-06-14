from setta.types.websocket_manager import WebsocketConnectionType
from setta.types.websocket_msgs import WebsocketMsgForFrontend
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler


class WMHArtifact(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def broadcast_artifact(self, content):
        await self.websocket_manager.broadcast(
            content,
            WebsocketMsgForFrontend.WS_ARTIFACT,
            connectionType=WebsocketConnectionType.FRONTEND,
        )
