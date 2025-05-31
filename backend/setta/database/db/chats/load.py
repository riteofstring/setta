import json

from setta.database.db_objs import DB
from setta.types.chat_messages import Chat, ChatMessage


def load_chat(db: DB, chat_id: str):
    chat_query = """
        SELECT id, name, lastUpdated
        FROM Chat
        WHERE id = :chat_id
    """

    db.execute(chat_query, {"chat_id": chat_id})
    chat_row = db.fetchone()

    if not chat_row:
        return None  # Chat not found

    # Create the base chat object
    chat = Chat(
        id=chat_row[0],
        name=chat_row[1],
        lastUpdated=chat_row[2],
        messages=[],
    )

    # Now get all messages for this chat
    messages_query = """
        SELECT id, role, content
        FROM ChatMessage
        WHERE chatId = :chat_id
        ORDER BY "order" ASC
    """

    db.execute(messages_query, {"chat_id": chat_id})

    # Process each message
    for row in db.fetchall():
        message = ChatMessage(
            id=row[0],
            role=row[1],
            content=json.loads(row[2]),
        )
        chat.messages.append(message)

    return chat


def load_all_chat_metadata(db):
    # First get chat metadata
    chat_query = """
        SELECT id, name, lastUpdated
        FROM Chat
        ORDER BY lastUpdated DESC
    """

    db.execute(chat_query)

    output = []
    for row in db.fetchall():
        output.append({"id": row[0], "name": row[1], "lastUpdated": row[2]})
    return output


def load_uuid_mapping_for_llm(db):
    query = """
        SELECT id, uuid
        FROM UUIDMappingForLLM
    """

    db.execute(query)

    id_to_uuid, uuid_to_id = {}, {}
    for row in db.fetchall():
        id_to_uuid[str(row["id"])] = row["uuid"]
        uuid_to_id[row["uuid"]] = str(row["id"])

    return id_to_uuid, uuid_to_id
