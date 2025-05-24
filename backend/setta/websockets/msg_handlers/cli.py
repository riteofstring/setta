from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler


class WMHCLI(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def process_message(self, message, *_):
        await self.websocket_manager.send_message(message, message["toWebsocketId"])
