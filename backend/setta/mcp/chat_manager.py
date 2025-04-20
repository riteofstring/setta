from setta.database.db.chats.load import load_all_chat_metadata, load_chat
from setta.database.db.chats.save import create_new_chat, delete_chat


class ChatManager:
    def __init__(self, dbq):
        self.dbq = dbq
        self.waiting_for_response = {}

    def get_chat(self, chat_id):
        with self.dbq as db:
            return load_chat(db, chat_id)

    def get_or_create_chat(self, chat_id, message):
        if not chat_id:
            return self.create_new_chat(message)
        return self.get_chat(chat_id)

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

    def notify_that_llm_is_responding(self, chat_id):
        self.waiting_for_response[chat_id] = True

    def notify_that_llm_is_done(self, chat_id):
        self.waiting_for_response[chat_id] = False

    def is_waiting_for_response(self, chat_id):
        return self.waiting_for_response.get(chat_id, False)
