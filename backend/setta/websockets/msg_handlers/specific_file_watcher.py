from setta.types.websocket_manager import WebsocketConnectionType
from setta.types.websocket_msgs import WebsocketMsgTypeForFrontend
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler


class WMHSpecificFileWatcher(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def broadcast_file_updates(self, content):
        await self.websocket_manager.broadcast(
            content,
            WebsocketMsgTypeForFrontend.SPECIFIC_FILE_WATCHER_UPDATE,
            connectionType=WebsocketConnectionType.FRONTEND,
        )
