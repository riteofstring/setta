from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

from setta.project_state.chats.load import load_all_chat_metadata, load_chat
from setta.project_state.chats.save import (
    append_chat_messages,
    build_chat_metadata,
    build_new_chat,
    create_new_chat,
    save_messages,
    set_system_prompt,
)
from setta.project_state.chats.save import delete_chat as delete_chat_record
from setta.types.chat import Chat, ChatMetadata
from setta.types.generated.chat_messages import BaseChatMessageUnion
from setta.types.id import ID
from setta.types.llm_config import LLMConfig

if TYPE_CHECKING:
    from setta.database.db_objs import DBE


class ChatStore(ABC):
    @abstractmethod
    def get_chat(self, chat_id: ID) -> Chat | None:
        raise NotImplementedError

    @abstractmethod
    def get_all_chat_metadata(self) -> list[ChatMetadata]:
        raise NotImplementedError

    @abstractmethod
    def create_new_chat(
        self,
        first_message: BaseChatMessageUnion,
        llm_config: LLMConfig,
        project_config_id: ID | None = None,
    ) -> Chat:
        raise NotImplementedError

    @abstractmethod
    def save_messages(
        self, chat_id: ID, messages: list[BaseChatMessageUnion]
    ) -> Chat | None:
        raise NotImplementedError

    @abstractmethod
    def set_system_prompt(self, chat_id: ID, system_prompt: str) -> Chat | None:
        raise NotImplementedError

    @abstractmethod
    def delete_chat(self, chat_id: ID) -> None:
        raise NotImplementedError


class DBEChatStore(ChatStore):
    def __init__(self, dbe: "DBE") -> None:
        self.dbe = dbe

    def get_chat(self, chat_id: ID) -> Chat | None:
        return load_chat(self.dbe, chat_id)

    def get_all_chat_metadata(self) -> list[ChatMetadata]:
        return load_all_chat_metadata(self.dbe)

    def create_new_chat(
        self,
        first_message: BaseChatMessageUnion,
        llm_config: LLMConfig,
        project_config_id: ID | None = None,
    ) -> Chat:
        return create_new_chat(
            self.dbe,
            first_message,
            llm_config,
            project_config_id=project_config_id,
        )

    def save_messages(
        self, chat_id: ID, messages: list[BaseChatMessageUnion]
    ) -> Chat | None:
        return save_messages(self.dbe, chat_id, messages)

    def set_system_prompt(self, chat_id: ID, system_prompt: str) -> Chat | None:
        return set_system_prompt(self.dbe, chat_id, system_prompt)

    def delete_chat(self, chat_id: ID) -> None:
        delete_chat_record(self.dbe, chat_id)


class MemoryChatStore(ChatStore):
    def __init__(self) -> None:
        self._chats: dict[ID, Chat] = {}

    def get_chat(self, chat_id: ID) -> Chat | None:
        if chat_id not in self._chats:
            return None
        return self._chats[chat_id].model_copy(deep=True)

    def get_all_chat_metadata(self) -> list[ChatMetadata]:
        output: list[ChatMetadata] = []
        for chat in self._chats.values():
            output.append(build_chat_metadata(chat))
        output.sort(key=lambda entry: entry.lastUpdated)
        return output

    def create_new_chat(
        self,
        first_message: BaseChatMessageUnion,
        llm_config: LLMConfig,
        project_config_id: ID | None = None,
    ) -> Chat:
        chat = build_new_chat(first_message, llm_config, project_config_id)
        self._chats[chat.id] = chat
        return chat.model_copy(deep=True)

    def save_messages(
        self, chat_id: ID, messages: list[BaseChatMessageUnion]
    ) -> Chat | None:
        if len(messages) == 0:
            return self.get_chat(chat_id)
        if chat_id not in self._chats:
            return None
        chat = self._chats[chat_id]
        append_chat_messages(chat, messages)
        return chat.model_copy(deep=True)

    def set_system_prompt(self, chat_id: ID, system_prompt: str) -> Chat | None:
        if chat_id not in self._chats:
            return None
        chat = self._chats[chat_id]
        if chat.systemPrompt == system_prompt:
            return chat.model_copy(deep=True)
        chat.systemPrompt = system_prompt
        return chat.model_copy(deep=True)

    def delete_chat(self, chat_id: ID) -> None:
        if chat_id not in self._chats:
            return
        del self._chats[chat_id]
