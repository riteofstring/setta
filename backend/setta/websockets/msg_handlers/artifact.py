from setta.utils.constants import C
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler


class WMHArtifact(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def broadcast_artifact(self, content):
        await self.websocket_manager.broadcast(
            content, C.WS_ARTIFACT, connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND
        )
