from setta.websockets.websocket_manager import WebsocketManager


class BaseWebsocketMsgReceiver:
    def __init__(self, websocket_manager: WebsocketManager):
        self.websocket_manager = websocket_manager

    async def on_connect(self, websocket_id):
        pass

    async def on_disconnect(self, websocket_id):
        pass

    async def process_message(self, message, fromWebsocketId):
        pass


class BaseWebsocketMsgSender:
    def __init__(self, websocket_manager: WebsocketManager):
        self.websocket_manager = websocket_manager
