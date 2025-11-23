from typing import TYPE_CHECKING

from setta.project_state.chats.load import load_chat
from setta.types.chat_messages import Chat, ChatMessage, MessageTextContent
from setta.utils.generate_memorable_string import generate_memorable_string
from setta.utils.timestamps import get_now_timestamp

if TYPE_CHECKING:
    from setta.database.db_objs import DBE


def create_new_chat_name(first_message: ChatMessage) -> str:
    for content_block in first_message.content:
        if isinstance(content_block, MessageTextContent) and content_block.text:
            return content_block.text[:30]
    return generate_memorable_string()


def _persist_chat(dbe: "DBE", chat: Chat) -> Chat:
    dbe.write_chat(chat.id, chat.model_dump(mode="json"))
    return chat


def _copy_message(message: ChatMessage) -> ChatMessage:
    return ChatMessage.model_validate(message.model_dump(mode="json"))


def _copy_messages(messages: list[ChatMessage]) -> list[ChatMessage]:
    return [_copy_message(message) for message in messages]


def create_new_chat(dbe: "DBE", first_message: ChatMessage) -> Chat:
    name = create_new_chat_name(first_message)
    chat = Chat(
        name=name,
        messages=_copy_messages([first_message]),
    )
    return _persist_chat(dbe, chat)


def delete_chat(dbe: "DBE", chat_id: str) -> None:
    dbe.delete_chat_file(chat_id)


def save_messages(dbe: "DBE", chat_id: str, messages: list[ChatMessage]) -> Chat | None:
    if len(messages) == 0:
        return load_chat(dbe, chat_id)

    chat = load_chat(dbe, chat_id)
    if not chat:
        return None

    existing_ids = {message.id for message in chat.messages}
    new_messages = [message for message in messages if message.id not in existing_ids]
    if not new_messages:
        return chat

    chat.messages.extend(_copy_messages(new_messages))
    chat.lastUpdated = get_now_timestamp()
    return _persist_chat(dbe, chat)
