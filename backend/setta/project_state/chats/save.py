from typing import TYPE_CHECKING

from setta.project_state.chats.load import load_chat
from setta.types.chat import Chat, ChatMetadata
from setta.types.chat_messages import MessageTextContent
from setta.types.generated.chat_messages import (
    BaseChatMessageTypeAdapter,
    BaseChatMessageUnion,
)
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.utils.generate_memorable_string import generate_memorable_string
from setta.utils.timestamps import get_now_timestamp

if TYPE_CHECKING:
    from setta.database.db_objs import DBE


def create_new_chat_name(first_message: BaseChatMessageUnion) -> str:
    for content_block in first_message.content:
        if isinstance(content_block, MessageTextContent) and content_block.text:
            return content_block.text[:30]
    return generate_memorable_string()


def copy_chat_message(message: BaseChatMessageUnion) -> BaseChatMessageUnion:
    return BaseChatMessageTypeAdapter.validate_python(message.model_dump(mode="json"))


def copy_chat_messages(
    messages: list[BaseChatMessageUnion],
) -> list[BaseChatMessageUnion]:
    return [copy_chat_message(message) for message in messages]


def build_new_chat(
    first_message: BaseChatMessageUnion,
    llm_config: LLMConfig,
    project_config_id: ID,
) -> Chat:
    name = create_new_chat_name(first_message)
    return Chat(
        name=name,
        messages=copy_chat_messages([first_message]),
        llmConfig=llm_config.model_copy(deep=True),
        projectConfigId=project_config_id,
    )


def append_chat_messages(
    chat: Chat,
    messages: list[BaseChatMessageUnion],
) -> bool:
    if len(messages) == 0:
        return False
    existing_ids = {message.id for message in chat.messages}
    new_messages = [message for message in messages if message.id not in existing_ids]
    if not new_messages:
        return False
    chat.messages.extend(copy_chat_messages(new_messages))
    chat.lastUpdated = get_now_timestamp()
    return True


def build_chat_metadata(chat: Chat) -> ChatMetadata:
    return ChatMetadata(
        id=chat.id,
        name=chat.name,
        lastUpdated=chat.lastUpdated,
        llmConfig=chat.llmConfig.model_copy(deep=True),
        projectConfigId=chat.projectConfigId,
    )


def _persist_chat(dbe: "DBE", chat: Chat) -> Chat:
    dbe.write_chat(chat.id, chat.model_dump(mode="json"))
    return chat


def create_new_chat(
    dbe: "DBE",
    first_message: BaseChatMessageUnion,
    llm_config: LLMConfig,
    project_config_id: ID,
) -> Chat:
    chat = build_new_chat(first_message, llm_config, project_config_id)
    return _persist_chat(dbe, chat)


def delete_chat(dbe: "DBE", chat_id: ID) -> None:
    dbe.delete_chat_file(chat_id)


def save_messages(
    dbe: "DBE", chat_id: ID, messages: list[BaseChatMessageUnion]
) -> Chat | None:
    if len(messages) == 0:
        return load_chat(dbe, chat_id)

    chat = load_chat(dbe, chat_id)
    if not chat:
        return None
    if append_chat_messages(chat, messages):
        return _persist_chat(dbe, chat)
    return chat


def set_system_prompt(dbe: "DBE", chat_id: ID, system_prompt: str) -> Chat | None:
    chat = load_chat(dbe, chat_id)
    if not chat:
        return None
    if chat.systemPrompt == system_prompt:
        return chat
    chat.systemPrompt = system_prompt
    return _persist_chat(dbe, chat)
