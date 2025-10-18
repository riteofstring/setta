from setta.utils.constants import C
from setta.websockets.msg_handlers.base import BaseWebsocketMsgSender


class WMHCLISender(BaseWebsocketMsgSender):
    async def send_command(self, command, cliId):
        message = {"content": command, "messageType": C.WS_RUN_CODE}
        await self.websocket_manager.send_message(message, cliId)
