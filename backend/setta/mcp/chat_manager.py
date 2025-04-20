from setta.database.db.chats.load import load_all_chat_metadata, load_chat
from setta.database.db.chats.save import create_new_chat, delete_chat


class ChatManager:
    def __init__(self, dbq):
        self.dbq = dbq

    def get_chat(self, chat_id, message=None):
        with self.dbq as db:
            chat = load_chat(db, chat_id)
        if message:
            chat["messages"].append({"role": "user", "content": message})
        return chat

    def update_chat(self, chat_id, chunk):
        pass

    def create_new_chat(self, first_message):
        with self.dbq as db:
            return create_new_chat(db, first_message)

    def get_all_chat_metadata(self):
        with self.dbq as db:
            return load_all_chat_metadata(db)

    def delete_chat(self, chat_id):
        with self.dbq as db:
            delete_chat(db, chat_id)
