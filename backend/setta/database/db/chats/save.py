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


def update_chat(db, chat_id, new_messages):
    # First, get the maximum order value for this chat
    max_order_query = """
        SELECT MAX("order") FROM ChatMessage WHERE chatId = :chat_id
    """
    db.execute(max_order_query, {"chat_id": chat_id})
    result = db.fetchone()
    # If there are no existing messages, max_order would be None
    max_order = result[0] if result is not None else -1

    query = """
        INSERT INTO ChatMessage (id, chatId, "order", role, content) 
        VALUES (:id, :chat_id, :order, :role, :content)
    """
    query_params = []

    for idx, m in enumerate(new_messages):
        query_params.append(
            {
                "id": m["id"],
                "chat_id": chat_id,
                "order": max_order + 1 + idx,
                "role": m["role"],
                "content": json.dumps(m["content"]),
            }
        )

    db.executemany(query, query_params)
