from typing import TYPE_CHECKING

from setta.project_state.chats.load import load_chat
from setta.project_state.chats.utils import append_chat_messages, build_new_chat
from setta.types.chat import Chat
from setta.types.generated.chat_messages import BaseChatMessageUnion
from setta.types.id import ID
from setta.types.llm_config import LLMConfig

if TYPE_CHECKING:
    from setta.database.db_objs import DBE


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
