from setta.database.utils import create_new_id


def create_new_chat(db):
    id = create_new_id()

    # Create new chat
    query = """
        INSERT INTO Chat (id) 
        VALUES (:chat_id)
        ON CONFLICT (id)
        DO NOTHING
    """
    db.execute(query, {"chat_id": id})

    return id
