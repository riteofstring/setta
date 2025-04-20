import json

from setta.database.db.chats.load import load_all_chat_metadata, load_chat
from setta.database.db.chats.save import create_new_chat, delete_chat, update_chat
from setta.utils.constants import C


class ChatManager:
    def __init__(self, dbq):
        self.dbq = dbq
        self.current_stream = {}
        self.waiting_for_response = {}

    def get_chat(self, chat_id):
        with self.dbq as db:
            return load_chat(db, chat_id)

    def get_or_create_chat(self, chat_id, message):
        if not chat_id:
            return self.create_new_chat(message)
        self.update_chat(chat_id, [message])
        return self.get_chat(chat_id)

    def update_chat(self, chat_id, new_messages):
        with self.dbq as db:
            print("new_messages", new_messages, flush=True)
            update_chat(db, chat_id, new_messages)

    def create_new_chat(self, first_message):
        with self.dbq as db:
            return create_new_chat(db, first_message)

    def get_all_chat_metadata(self):
        with self.dbq as db:
            return load_all_chat_metadata(db)

    def delete_chat(self, chat_id):
        with self.dbq as db:
            delete_chat(db, chat_id)

    def set_llm_is_responding(self, chat_id):
        self.waiting_for_response[chat_id] = True

    def set_llm_is_done(self, chat_id):
        self.waiting_for_response[chat_id] = False

    def is_waiting_for_response(self, chat_id):
        return self.waiting_for_response.get(chat_id, False)

    async def stream_responses(self, chatId, stream, per_event_callback):
        # sends streaming response to frontend
        # and also constructs the full message for use in process_query
        assistant_message_id = None
        self.current_stream[chatId] = []
        llm_msgs = self.current_stream[chatId]

        async for event in stream.parse():
            if event.type == C.LLM_MESSAGE_START:
                assistant_message_id = event.message.id
            if event.type == C.LLM_CONTENT_BLOCK_START:
                while len(llm_msgs) <= event.index:
                    llm_msgs.append(None)
                llm_msgs[event.index] = event.content_block
            elif event.type == C.LLM_CONTENT_BLOCK_DELTA:
                curr_msg = llm_msgs[event.index]
                if event.delta.type == C.LLM_TEXT_DELTA:
                    curr_msg.text += event.delta.text
                elif event.delta.type == C.LLM_THINKING_DELTA:
                    curr_msg.thinking += event.delta.thinking
                elif event.delta.type == C.LLM_SIGNATURE_DELTA:
                    curr_msg.signature = event.delta.signature
                elif event.delta.type == C.LLM_INPUT_JSON_DELTA:
                    if not isinstance(curr_msg.text, str):
                        curr_msg.text = ""
                    curr_msg.text += event.delta.partial_json
            elif event.type == C.LLM_CONTENT_BLOCK_STOP:
                curr_msg = llm_msgs[event.index]
                if curr_msg.type == C.LLM_TOOL_USE and curr_msg.text:
                    curr_msg.input = json.loads(curr_msg.text)
                    delattr(curr_msg, "text")
            await per_event_callback(chatId, assistant_message_id, event.model_dump())

        return assistant_message_id
