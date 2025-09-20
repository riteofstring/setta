from anthropic.types import TextBlock

from setta.database.utils import create_new_id
from setta.types.chat_messages import Chat, ChatMessage
from setta.utils.generate_memorable_string import generate_memorable_string


def create_new_chat_name(first_message: ChatMessage):
    name = None
    for c in first_message.content:
        if isinstance(c, TextBlock):
            name = c.text[:30]
            break
    if not name:
        name = generate_memorable_string()
    return name


def create_new_chat(db, first_message: ChatMessage):
    chat_id = create_new_id()
    name = create_new_chat_name(first_message)
    chat = Chat(id=chat_id, name=name, messages=[first_message])

    chat_msg_db_element = ChatMessageTable()
    chat_msg_db_element.id = first_message.id
    chat_msg_db_element.order = 0
    chat_msg_db_element.role = first_message.role
    chat_msg_db_element.content = [c.model_dump() for c in first_message.content]

    chat_db_element = ChatTable()
    chat_db_element.id = chat.id
    chat_db_element.name = chat.name
    chat_db_element.messages = [chat_msg_db_element]
    db.add(chat_db_element)

    return chat


def delete_chat(db, chat_id: str):
    stmt = delete(ChatTable).where(ChatTable.id == chat_id)
    db.execute(stmt)


def save_messages(db, chat_id: str, messages: list[ChatMessage]):
    stmt = select(func.max(ChatMessageTable.order)).where(
        ChatMessageTable.chatId == chat_id
    )
    max_order = db.scalar(stmt)

    # If there are no existing messages, max_order would be None
    if max_order is None:
        max_order = -1

    # Prepare the message objects
    cmt_list: list[dict] = []
    for idx, m in enumerate(messages):
        cmt = ChatMessageTable()
        cmt.id = m.id
        cmt.chatId = chat_id
        cmt.order = max_order + 1 + idx
        cmt.role = m.role
        cmt.content = [c.model_dump() for c in m.content]
        cmt_list.append(cmt.to_dict())

    stmt = (
        insert(ChatMessageTable)
        .values(cmt_list)
        .on_conflict_do_nothing(index_elements=["id"])
    )
    db.execute(stmt)
