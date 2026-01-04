from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

from setta.project_state.chats.load import load_all_chat_metadata, load_chat
from setta.project_state.chats.save import (
    create_new_chat,
    create_new_chat_name,
    save_messages,
)
from setta.project_state.chats.save import (
    delete_chat as delete_chat_record,
)
from setta.types.chat import Chat, ChatMetadata
from setta.types.generated.chat_messages import (
    BaseChatMessageTypeAdapter,
    BaseChatMessageUnion,
)
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.utils.timestamps import get_now_timestamp

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
        project_config_id: ID,
    ) -> Chat:
        raise NotImplementedError

    @abstractmethod
    def save_messages(
        self, chat_id: ID, messages: list[BaseChatMessageUnion]
    ) -> Chat | None:
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
        project_config_id: ID,
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
            output.append(
                ChatMetadata(
                    id=chat.id,
                    name=chat.name,
                    lastUpdated=chat.lastUpdated,
                    llmConfig=chat.llmConfig,
                    projectConfigId=chat.projectConfigId,
                )
            )
        output.sort(key=lambda entry: entry.lastUpdated)
        return output

    def create_new_chat(
        self,
        first_message: BaseChatMessageUnion,
        llm_config: LLMConfig,
        project_config_id: ID,
    ) -> Chat:
        name = create_new_chat_name(first_message)
        chat = Chat(
            name=name,
            messages=_copy_messages([first_message]),
            llmConfig=llm_config.model_copy(deep=True),
            projectConfigId=project_config_id,
        )
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
        existing_ids = {message.id for message in chat.messages}
        new_messages = [
            message for message in messages if message.id not in existing_ids
        ]
        if not new_messages:
            return chat.model_copy(deep=True)
        chat.messages.extend(_copy_messages(new_messages))
        chat.lastUpdated = get_now_timestamp()
        return chat.model_copy(deep=True)

    def delete_chat(self, chat_id: ID) -> None:
        if chat_id not in self._chats:
            return
        del self._chats[chat_id]


def _copy_message(message: BaseChatMessageUnion) -> BaseChatMessageUnion:
    return BaseChatMessageTypeAdapter.validate_python(message.model_dump(mode="json"))


def _copy_messages(
    messages: list[BaseChatMessageUnion],
) -> list[BaseChatMessageUnion]:
    return [_copy_message(message) for message in messages]
