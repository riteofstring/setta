from setta.types.notifications import SettaNotification
from setta.types.websocket_manager import WebsocketConnectionType
from setta.types.websocket_msgs import WebsocketMsgForFrontend
from setta.websockets.websocket_manager import WebsocketManager


class BaseWebsocketMsgHandler:
    def __init__(self, websocket_manager: WebsocketManager):
        self.websocket_manager = websocket_manager

    async def on_connect(self, websocket_id):
        pass

    async def on_disconnect(self, websocket_id):
        pass

    async def process_message(self, message, fromWebsocketId):
        pass

    async def broadcast_notification(self, notification: SettaNotification):
        await self.websocket_manager.broadcast(
            notification.model_dump(),
            WebsocketMsgForFrontend.WS_NOTIFICATION,
            connectionType=WebsocketConnectionType.FRONTEND,
        )
