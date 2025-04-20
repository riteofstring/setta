from setta.database.db.chats.load import load_all_chat_metadata, load_chat
from setta.database.db.chats.save import create_new_chat


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

    def create_new_chat(self):
        with self.dbq as db:
            chatId = create_new_chat(db)
            all_chat_metadata = load_all_chat_metadata(db)
            return {"chatId": chatId, "messages": [], "allChatMetadata": all_chat_metadata}
