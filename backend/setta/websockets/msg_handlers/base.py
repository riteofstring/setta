from setta.websockets.websocket_manager import WebsocketManager


class BaseWebsocketMsgReceiver:
    def __init__(self, websocket_manager: WebsocketManager):
        self.websocket_manager = websocket_manager

    def require_share_session_id(self, websocket_id: str) -> str:
        share_session_id = self.websocket_manager.get_share_session_id(websocket_id)
        if share_session_id is None:
            raise KeyError(f"Missing share session id for websocket {websocket_id}")
        return share_session_id

    async def on_connect(self, websocket_id):
        pass

    async def on_disconnect(self, websocket_id):
        pass

    async def process_json_str(self, json_str, fromWebsocketId):
        pass

    async def process_bytes(self, payload: bytes, fromWebsocketId):
        pass


class BaseWebsocketMsgSender:
    def __init__(self, websocket_manager: WebsocketManager):
        self.websocket_manager = websocket_manager
