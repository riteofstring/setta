from setta.database.db.chats.load import load_chat
from setta.database.utils import create_new_id


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