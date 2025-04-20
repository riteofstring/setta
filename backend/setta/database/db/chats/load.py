import json


def load_chat(db, chat_id):
    """
    Load chat metadata and all messages for a given chat_id.

    Args:
        db: Database connection object with execute method
        chat_id: ID of the chat to load

    Returns:
        dict: Chat data with metadata and messages
    """
    # First get chat metadata
    chat_query = """
        SELECT id, updated
        FROM Chat
        WHERE id = :chat_id
    """

    db.execute(chat_query, {"chat_id": chat_id})
    chat_row = db.fetchone()

    if not chat_row:
        return None  # Chat not found

    # Create the base chat object
    chat = {"id": chat_row[0], "updated": chat_row[1], "messages": []}

    # Now get all messages for this chat
    messages_query = """
        SELECT role, streamSequence
        FROM ChatMessage
        WHERE chatId = :chat_id
        ORDER BY "order" ASC
    """

    db.execute(messages_query, {"chat_id": chat_id})

    # Process each message
    for row in db.fetchall():
        message = {
            "role": row[0],
            "streamSequence": json.loads(row[1]) if row[1] else [],
        }
        chat["messages"].append(message)

    return chat
