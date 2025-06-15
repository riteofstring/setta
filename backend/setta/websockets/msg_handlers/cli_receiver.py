from setta.websockets.msg_handlers.base import (
    BaseWebsocketMsgReceiver,
)


class WMHCLIReceiver(BaseWebsocketMsgReceiver):
    async def process_json_str(self, json_str, *_, **__):
        await self.websocket_manager.send_message(message, message["toWebsocketId"])
