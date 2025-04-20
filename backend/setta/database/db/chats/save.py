import json

from setta.database.utils import create_new_id


def create_new_chat(db, first_message):
    chat_id = create_new_id()

    # Create new chat
    query = """
        INSERT INTO Chat (id) 
        VALUES (:chat_id)
        ON CONFLICT (id)
        DO NOTHING
    """
    db.execute(query, {"chat_id": chat_id})

    query = """
        INSERT INTO ChatMessage (id, chatId, "order", role, content) 
        VALUES (:id, :chat_id, :order, :role, :content)
    """
    db.execute(
        query,
        {
            "id": first_message["id"],
            "chat_id": chat_id,
            "order": 0,
            "role": first_message["role"],
            "content": json.dumps(first_message["content"]),
        },
    )

    return {"id": chat_id, "messages": [first_message]}


def delete_chat(db, chat_id):
    query = """
        DELETE FROM CHAT
        WHERE ID = :chatId
    """
    db.execute(query, {"chatId": chat_id})
