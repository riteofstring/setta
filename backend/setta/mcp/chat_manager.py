import json

from anthropic import AsyncAnthropic

from setta.database.db.chats.load import load_all_chat_metadata, load_chat
from setta.database.db.chats.save import create_new_chat, delete_chat, update_chat
from setta.database.utils import create_new_id
from setta.utils.constants import CONSTANTS_FOLDER, C
from setta.utils.utils import get_absolute_path


class ChatManager:
    def __init__(self, dbq, mcp_client, websocket_msg_handler):
        self.dbq = dbq
        self.mcp_client = mcp_client
        self.websocket_msg_handler = websocket_msg_handler
        self.current_stream = {}
        self.waiting_for_response = {}
        self.anthropic = AsyncAnthropic()
        with open(
            get_absolute_path(__file__, CONSTANTS_FOLDER / "system_prompt.md"), "r"
        ) as f:
            self.system_prompt = f.read()

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

    async def process_query(self, chat, model, deepThink):
        chatId = chat["id"]
        self.set_llm_is_responding(chatId)
        messages = chat["messages"]

        while True:
            new_messages = []
            assistant_message_content = []
            has_tool_call = False
            thinking = (
                {"type": "enabled", "budget_tokens": 10000}
                if deepThink
                else {"type": "disabled"}
            )

            # Only need to specify cache_control once.
            # Everything up to the first occurence of cache_control is cached.
            # The read ordering is tools, system prompt, messages.
            # By putting the system prompt in the cache, the tools are also included.
            # https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
            stream = await self.anthropic.messages.with_raw_response.create(
                model=model,
                max_tokens=20000,
                messages=[
                    {"role": m["role"], "content": m["content"]} for m in messages
                ],
                tools=self.mcp_client.available_tools,
                stream=True,
                system=[
                    {
                        "type": "text",
                        "text": self.system_prompt,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                thinking=thinking,
            )

            print(
                "remaining requests",
                stream.headers.get("anthropic-ratelimit-requests-remaining"),
                flush=True,
            )

            print(
                "remaining input tokens",
                stream.headers.get("anthropic-ratelimit-input-tokens-remaining"),
                flush=True,
            )

            print(
                "remaining output tokens",
                stream.headers.get("anthropic-ratelimit-output-tokens-remaining"),
                flush=True,
            )

            assistant_message_id = await self.stream_responses(chatId, stream)
            complete_messages = self.current_stream[chatId]

            for msg in complete_messages:
                assistant_message_content.append(msg.model_dump())
                if msg.type == C.LLM_TOOL_USE:
                    has_tool_call = True
                    result = await self.mcp_client.call_tool(msg.name, msg.input)
                    tool_result = {
                        "type": C.LLM_TOOL_RESULT,
                        "tool_use_id": msg.id,
                        "content": result.content,
                    }
                    await self.send_streaming_response(chatId, tool_result)
                    new_messages.append(
                        {
                            "id": assistant_message_id,
                            "role": C.LLM_ASSISTANT_ROLE,
                            "content": assistant_message_content,
                        }
                    )
                    new_messages.append(
                        {
                            "id": create_new_id(),
                            "role": "user",
                            "content": [tool_result],
                        }
                    )
                    break

            # If we processed the entire response without finding tool calls, we're done
            if not has_tool_call:
                if assistant_message_content:
                    new_messages.append(
                        {
                            "id": assistant_message_id,
                            "role": C.LLM_ASSISTANT_ROLE,
                            "content": assistant_message_content,
                        }
                    )
                    self.update_chat(chatId, new_messages)
                break
            # Otherwise continue the loop to get the next response after tool use

            self.update_chat(chatId, new_messages)
            messages = [*messages, *new_messages]

        chunk = {"type": C.LLM_FULL_MESSAGE_STOP}
        await self.send_streaming_response(chatId, assistant_message_id, chunk)
        self.set_llm_is_done(chatId)

    async def stream_responses(self, chatId, stream):
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
            await self.send_streaming_response(
                chatId, assistant_message_id, event.model_dump()
            )

        return assistant_message_id

    async def send_streaming_response(self, chatId, assistant_message_id, chunk):
        await self.websocket_msg_handler.send_streaming_response(
            chatId, assistant_message_id, chunk
        )
