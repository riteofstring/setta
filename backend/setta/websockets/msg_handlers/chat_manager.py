from setta.types.chat_messages import LLMStreamingResponse, LLMStreamingResponseChunk
from setta.types.websocket_manager import (
    WebsocketConnectionType,
    WebsocketMsgLLMStreamingResponse,
)
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler
from setta.websockets.websocket_manager import WebsocketManager


class WMHChatManager(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager: WebsocketManager = websocket_manager

    async def send_streaming_response(
        self,
        chatId: str,
        assistant_message_id: str | None,
        chunk: LLMStreamingResponseChunk,
    ):
        await self.websocket_manager.broadcast(
            WebsocketMsgLLMStreamingResponse(
                content=LLMStreamingResponse(
                    chatId=chatId,
                    assistantMessageId=assistant_message_id,
                    chunk=chunk,
                )
            ),
            connectionType=WebsocketConnectionType.FRONTEND,
        )
