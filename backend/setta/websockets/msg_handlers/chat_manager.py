from setta.types.websocket_manager import WebsocketConnectionType
from setta.utils.constants import C
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler
from setta.websockets.websocket_manager import WebsocketManager


class WMHChatManager(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager: WebsocketManager = websocket_manager

    async def send_streaming_response(self, chatId, assistant_message_id, chunk):
        await self.websocket_manager.broadcast(
            {
                "chatId": chatId,
                "assistantMessageId": assistant_message_id,
                "chunk": chunk,
            },
            C.WS_LLM_STREAMING_RESPONSE,
            connectionType=WebsocketConnectionType.FRONTEND,
        )
