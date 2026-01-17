from setta.llm.chat_store import ChatStore
from setta.types.chat import Chat, ChatMetadata
from setta.types.generated.chat_messages import BaseChatMessageUnion
from setta.types.id import ID
from setta.types.llm_config import LLMConfig


class ChatHistory:
    def __init__(self, chat_store: ChatStore) -> None:
        self._chat_store = chat_store

    def get(self, chat_id: ID) -> Chat | None:
        return self._chat_store.get_chat(chat_id)

    def require(self, chat_id: ID) -> Chat:
        chat = self.get(chat_id)
        if chat is None:
            raise KeyError(f"Chat {chat_id} not found")
        return chat

    def list_metadata(self) -> list[ChatMetadata]:
        return self._chat_store.get_all_chat_metadata()

    def create(
        self,
        first_message: BaseChatMessageUnion,
        llm_config: LLMConfig,
        project_config_id: ID | None = None,
    ) -> Chat:
        return self._chat_store.create_new_chat(
            first_message=first_message,
            llm_config=llm_config,
            project_config_id=project_config_id,
        )

    def append(
        self,
        chat_id: ID,
        messages: list[BaseChatMessageUnion],
    ) -> Chat:
        chat = self._chat_store.save_messages(chat_id, messages)
        if chat is None:
            raise KeyError(f"Chat {chat_id} not found")
        return chat

    def set_system_prompt(self, chat_id: ID, system_prompt: str) -> Chat:
        chat = self._chat_store.set_system_prompt(chat_id, system_prompt)
        if chat is None:
            raise KeyError(f"Chat {chat_id} not found")
        return chat

    def delete(self, chat_id: ID) -> None:
        self._chat_store.delete_chat(chat_id)
