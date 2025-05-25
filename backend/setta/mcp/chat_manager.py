import asyncio
import json

from anthropic import AsyncAnthropic
from pydantic import BaseModel

from setta.database.db.chats.load import load_all_chat_metadata, load_chat
from setta.database.db.chats.save import create_new_chat, delete_chat, save_messages
from setta.database.db_objs import DBQueue
from setta.database.utils import create_new_id
from setta.mcp.client import MCPClient
from setta.mcp.server import CHAT_ID_ARG_NAME
from setta.project_state.chat_messages import Chat
from setta.utils.constants import C
from setta.utils.utils import get_absolute_path
from setta.websockets.msg_handlers.chat_manager import WMHChatManager


class ChatManager:
    def __init__(
        self, dbq: DBQueue, mcp_client: MCPClient, websocket_msg_handler: WMHChatManager
    ):
        self.dbq = dbq
        self.mcp_client = mcp_client
        self.websocket_msg_handler = websocket_msg_handler
        self.current_streams = {}
        self.stream_tasks = {}
        self.anthropic = AsyncAnthropic()
        with open(get_absolute_path(__file__, "system_prompt.md"), "r") as f:
            self.system_prompt = f.read()
        self.max_tokens = 20000
        self.thinking_budget_tokens = 10000
        self.cache_trigger_tokens = 1000

    def get_chat(self, chat_id):
        with self.dbq as db:
            return load_chat(db, chat_id)

    def get_or_create_chat(self, chat_id, message):
        if not chat_id or not self.get_chat(chat_id):
            return self.create_new_chat(message)
        self.save_messages_to_db(chat_id, [message])
        return self.get_chat(chat_id)

    def save_messages_to_db(self, chat_id, messages):
        if len(messages) == 0:
            return
        with self.dbq as db:
            save_messages(db, chat_id, messages)

    def save_current_stream_to_db(self, chat_id):
        messages = self.get_current_stream(chat_id)
        messages = [maybe_pydantic_model_dump(m) for m in messages]
        messages = self.remove_incomplete_tool_uses(messages)
        self.save_messages_to_db(
            chat_id,
            messages,
        )
        chat = self.get_chat(chat_id)
        if not chat:
            raise ValueError
        return chat

    def create_new_chat(self, first_message):
        with self.dbq as db:
            return create_new_chat(db, first_message)

    def get_all_chat_metadata(self):
        with self.dbq as db:
            return load_all_chat_metadata(db)

    def delete_chat(self, chat_id):
        with self.dbq as db:
            delete_chat(db, chat_id)

    def is_waiting_for_response(self, chat_id):
        return chat_id in self.current_streams

    def init_current_stream(self, chatId):
        self.current_streams[chatId] = []

    def end_current_stream(self, chatId):
        self.current_streams.pop(chatId, None)

    def get_current_stream(self, chatId):
        return self.current_streams.get(chatId, [])

    async def process_query(self, chat: Chat, model: str, deepThink: bool):
        chatId = chat.id
        self.stream_tasks[chatId] = asyncio.current_task()
        try:
            await self._process_query(chat, model, deepThink)
        except asyncio.CancelledError:
            pass
        finally:
            # Clean up
            self.stream_tasks.pop(chatId, None)
            chat = self.save_current_stream_to_db(chatId)
            self.end_current_stream(chatId)
            messages, tool_results = self.separate_tool_results(chat.messages)
            chunk = {
                "type": C.LLM_FULL_MESSAGE_STOP,
                "messages": messages,
                "toolResults": tool_results,
            }
            await self.send_streaming_response(chatId, None, chunk)

    async def _process_query(self, chat: Chat, model: str, deepThink: bool):
        chatId = chat.id
        original_messages = chat.messages
        self.init_current_stream(chatId)
        curr_stream = self.current_streams[chatId]
        while True:
            has_tool_call = False

            (
                tools,
                system,
                messages,
                thinking,
            ) = await self.get_tools_system_messages_thinking(
                original_messages, curr_stream, model, deepThink
            )

            print(f"{messages}\n\n\n", flush=True)

            # Only need to specify cache_control once.
            # Everything up to the first occurence of cache_control is cached.
            # The read ordering is tools, system prompt, messages.
            # By putting the system prompt in the cache, the tools are also included.
            # https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
            stream = await self.anthropic.messages.with_raw_response.create(
                model=model,
                max_tokens=self.max_tokens,
                tools=tools,
                system=system,
                messages=messages,
                thinking=thinking,
                stream=True,
            )

            # print(
            #     "remaining requests",
            #     stream.headers.get("anthropic-ratelimit-requests-remaining"),
            #     flush=True,
            # )

            # print(
            #     "remaining input tokens",
            #     stream.headers.get("anthropic-ratelimit-input-tokens-remaining"),
            #     flush=True,
            # )

            # print(
            #     "remaining output tokens",
            #     stream.headers.get("anthropic-ratelimit-output-tokens-remaining"),
            #     flush=True,
            # )

            assistant_message_id = await self.stream_responses(chatId, stream)

            if len(curr_stream) == 0:
                break

            latest_msg = curr_stream[-1]
            newer_msgs = []

            for sub_msg in latest_msg["content"]:
                if sub_msg["type"] == C.LLM_TOOL_USE:
                    has_tool_call = True
                    result = await self.mcp_client.call_tool(
                        sub_msg["name"], {CHAT_ID_ARG_NAME: chatId, **sub_msg["input"]}
                    )
                    result = self.process_tool_result(result)
                    tool_result = {
                        "type": C.LLM_TOOL_RESULT,
                        "tool_use_id": sub_msg["id"],
                        "content": result["content"],
                        "is_error": result["isError"],
                    }
                    await self.send_streaming_response(
                        chatId, assistant_message_id, tool_result
                    )
                    newer_msgs.append(
                        {
                            "id": create_new_id(),
                            "role": C.LLM_USER_ROLE,
                            "content": [tool_result],
                        }
                    )

            curr_stream.extend(newer_msgs)
            self.save_current_stream_to_db(chatId)

            # If we processed the entire response without finding tool calls, we're done
            if not has_tool_call:
                break

    async def stream_responses(self, chatId, stream):
        # sends streaming response to frontend
        # and also constructs the full message for use in process_query
        assistant_message_id = None
        llm_msgs = None

        async for event in stream.parse():
            if event.type == C.LLM_MESSAGE_START:
                print(event.message.usage, flush=True)
                assistant_message_id = event.message.id
                self.current_streams[chatId].append(event.message)
                llm_msgs = self.current_streams[chatId][-1].content
            elif llm_msgs is None:
                continue

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
                    if not isinstance(curr_msg.input, str):
                        curr_msg.input = ""
                    curr_msg.input += event.delta.partial_json
            elif event.type == C.LLM_CONTENT_BLOCK_STOP:
                curr_msg = llm_msgs[event.index]
                if curr_msg.type == C.LLM_TOOL_USE:
                    curr_msg.input = self.tool_use_input_str_to_dict(curr_msg.input)

            await self.send_streaming_response(
                chatId, assistant_message_id, maybe_pydantic_model_dump(event)
            )

        self.current_streams[chatId][-1] = maybe_pydantic_model_dump(
            self.current_streams[chatId][-1]
        )

        return assistant_message_id

    async def send_streaming_response(self, chatId, assistant_message_id, chunk):
        await self.websocket_msg_handler.send_streaming_response(
            chatId, assistant_message_id, chunk
        )

    def process_tool_result(self, result):
        result = maybe_pydantic_model_dump(result)
        for c in result["content"]:
            c.pop("annotations", None)
        return result

    async def request_stop_streaming(self, chat_id):
        task = self.stream_tasks.get(chat_id)
        if task:
            task.cancel()

    def remove_incomplete_tool_uses(self, messages):
        tool_use_has_result = set()
        for m in messages:
            for c in m["content"]:
                if c["type"] == C.LLM_TOOL_USE:
                    if not isinstance(c["input"], dict):
                        c["input"] = self.tool_use_input_str_to_dict(c["input"])
                elif c["type"] == C.LLM_TOOL_RESULT:
                    tool_use_has_result.add(c["tool_use_id"])

        for m in messages:
            new_content = []
            for c in m["content"]:
                if c["type"] == C.LLM_TOOL_USE and c["id"] not in tool_use_has_result:
                    continue
                new_content.append(c)
            m["content"] = new_content

        return [m for m in messages if len(m["content"]) > 0]

    def tool_use_input_str_to_dict(self, input):
        if isinstance(input, str) and input:
            return json.loads(input)
        return {}

    def separate_tool_results(self, messages):
        tool_results = {}
        filtered_messages = []
        for m in messages:
            if len(m["content"]) == 0:
                continue
            c = m["content"][0]
            if c.get("type") == C.LLM_TOOL_RESULT:
                tool_results[c["tool_use_id"]] = m["content"][0]
            else:
                filtered_messages.append(m)
        return filtered_messages, tool_results

    async def get_tools_system_messages_thinking(
        self, messages, curr_stream, model: str, deepThink: bool
    ):
        tools = self.mcp_client.available_tools
        tools = tools + maybe_get_str_replace_editor_tool(model)

        system = [
            {
                "type": "text",
                "text": self.system_prompt,
            }
        ]

        self.set_cache_control(system[0])

        messages = [
            {
                "role": m["role"],
                "content": m["content"],
            }
            for m in [*messages, *curr_stream]
        ]

        thinking = (
            {"type": "enabled", "budget_tokens": self.thinking_budget_tokens}
            if deepThink
            else {"type": "disabled"}
        )

        did_set_cache_control = False
        for m in reversed(messages):
            for c in reversed(m["content"]):
                if did_set_cache_control:
                    c.pop("cache_control", None)
                elif c["type"] != C.LLM_THINKING:
                    self.set_cache_control(c)
                    did_set_cache_control = True

        return tools, system, messages, thinking

    def set_cache_control(self, x):
        x["cache_control"] = {"type": "ephemeral"}


def maybe_pydantic_model_dump(x):
    if isinstance(x, BaseModel):
        return x.model_dump()
    return x


def maybe_get_str_replace_editor_tool(model_name):
    if "claude-3-7-sonnet" in model_name:
        return [{"type": "text_editor_20250124", "name": C.LLM_STR_REPLACE_EDITOR_TOOL}]
    if "claude-3-5-sonnet" in model_name:
        return [{"type": "text_editor_20241022", "name": C.LLM_STR_REPLACE_EDITOR_TOOL}]
    return []
