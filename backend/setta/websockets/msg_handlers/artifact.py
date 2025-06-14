from setta.types.artifact import Artifact
from setta.types.websocket import WebsocketConnectionType, WebsocketMsgArtifact
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler
from setta.websockets.websocket_manager import WebsocketManager


class WMHArtifact(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager: WebsocketManager):
        self.websocket_manager = websocket_manager

    async def broadcast_artifact(self, artifact: Artifact):
        await self.websocket_manager.broadcast(
            message=WebsocketMsgArtifact(content=artifact),
            connectionType=WebsocketConnectionType.FRONTEND,
        )
