from setta.utils.constants import C
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler


class WMHChatManager(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def send_streaming_response(self, chatId, assistant_message_id, chunk):
        await self.websocket_manager.broadcast(
            {
                "chatId": chatId,
                "assistantMessageId": assistant_message_id,
                "chunk": chunk,
            },
            C.WS_LLM_STREAMING_RESPONSE,
            connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
        )
