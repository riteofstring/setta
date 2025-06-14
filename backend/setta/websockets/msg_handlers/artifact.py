from setta.types.websocket_manager import WebsocketConnectionType
from setta.types.websocket_msgs import (
    WebsocketMsgForFrontend,
    WebsocketMsgTypeForFrontend,
)
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler
from setta.websockets.websocket_manager import WebsocketManager


class WMHArtifact(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager: WebsocketManager):
        self.websocket_manager = websocket_manager

    async def broadcast_artifact(self, content):
        await self.websocket_manager.broadcast(
            message=WebsocketMsgForFrontend(
                content=content, messageType=WebsocketMsgTypeForFrontend.ARTIFACT
            ),
            connectionType=WebsocketConnectionType.FRONTEND,
        )
