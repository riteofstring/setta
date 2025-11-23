from setta.database.db_objs import DBE
from setta.llm.config import LiteLLMConfig, load_litellm_config
from setta.mcp.client import MCPClient
from setta.types.chat_messages import Chat, ChatMessage
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class LitellmChatManager:
    """
    Placeholder implementation that replaces the Anthropic-specific ChatManager.

    The next steps in the refactor will flesh out this class to drive litellm
    streaming, tool calls, and persistence. For now we keep the interface the
    routers expect while intentionally failing fast when invoked.
    """

    def __init__(
        self,
        dbe: DBE,
        mcp_client: MCPClient,
        websocket_msg_handler: WMHFrontendSender,
    ) -> None:
        self.dbe = dbe
        self.mcp_client = mcp_client
        self.websocket_msg_handler = websocket_msg_handler
        self.config: LiteLLMConfig = load_litellm_config()

    def get_chat(self, chat_id: str) -> Chat:
        raise NotImplementedError("LitellmChatManager.get_chat is not implemented yet.")

    def get_or_create_chat(
        self,
        chat_id: str | None,
        message: ChatMessage,
    ) -> Chat:
        raise NotImplementedError(
            "LitellmChatManager.get_or_create_chat is not implemented yet."
        )

    def get_all_chat_metadata(self):
        raise NotImplementedError(
            "LitellmChatManager.get_all_chat_metadata is not implemented yet."
        )

    def delete_chat(self, chat_id: str) -> None:
        raise NotImplementedError("LitellmChatManager.delete_chat is not implemented yet.")

    async def process_query(
        self,
        projectConfigId: str,  # noqa: N803 (preserve existing API for now)
        chat: Chat,
        model: str,
        deepThink: bool,  # noqa: N803 (preserve existing API for now)
    ):
        raise NotImplementedError("LitellmChatManager.process_query is not implemented yet.")

    async def request_stop_streaming(self, chat_id: str) -> None:
        raise NotImplementedError(
            "LitellmChatManager.request_stop_streaming is not implemented yet."
        )

    def is_waiting_for_response(self, chat_id: str) -> bool:
        raise NotImplementedError(
            "LitellmChatManager.is_waiting_for_response is not implemented yet."
        )

    def get_current_stream(self, chat_id: str):
        raise NotImplementedError(
            "LitellmChatManager.get_current_stream is not implemented yet."
        )

    def separate_tool_results(self, messages: list[ChatMessage]):
        raise NotImplementedError(
            "LitellmChatManager.separate_tool_results is not implemented yet."
        )
