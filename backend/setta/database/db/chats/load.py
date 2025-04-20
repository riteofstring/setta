import json


def load_chat(db, chat_id):
    chat_query = """
        SELECT id, lastUpdated
        FROM Chat
        WHERE id = :chat_id
    """

    db.execute(chat_query, {"chat_id": chat_id})
    chat_row = db.fetchone()

    if not chat_row:
        return None  # Chat not found

    # Create the base chat object
    chat = {"id": chat_row[0], "lastUpdated": chat_row[1], "messages": []}

    # Now get all messages for this chat
    messages_query = """
        SELECT role, content
        FROM ChatMessage
        WHERE chatId = :chat_id
        ORDER BY "order" ASC
    """

    db.execute(messages_query, {"chat_id": chat_id})

    # Process each message
    for row in db.fetchall():
        message = {
            "role": row[0],
            "content": json.loads(row[1]),
        }
        chat["messages"].append(message)

    return chat


def load_all_chat_metadata(db):
    # First get chat metadata
    chat_query = """
        SELECT id, lastUpdated
        FROM Chat
        ORDER BY lastUpdated DESC
    """

    db.execute(chat_query)

    output = []
    for row in db.fetchall():
        output.append({"id": row[0], "lastUpdated": row[1]})
    return output
