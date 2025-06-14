from setta.websockets.msg_handlers.base import (
    BaseWebsocketMsgReceiver,
)


class WMHCLIReceiver(BaseWebsocketMsgReceiver):
    async def process_message(self, message, *_, **__):
        await self.websocket_manager.send_message(message, message["toWebsocketId"])
