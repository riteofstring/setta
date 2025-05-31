import asyncio
import json

from anthropic import AsyncAnthropic
from anthropic.types import (
    CacheControlEphemeralParam,
    ContentBlock,
    MessageParam,
    RawContentBlockDeltaEvent,
    RawContentBlockStartEvent,
    RawMessageStartEvent,
    TextBlock,
    TextBlockParam,
    ThinkingBlock,
    ThinkingBlockParam,
    ThinkingConfigDisabledParam,
    ThinkingConfigEnabledParam,
    ToolResultBlockParam,
    ToolTextEditor20250124Param,
    ToolUseBlock,
    ToolUseBlockParam,
)
from pydantic import BaseModel

from setta.database.db.chats.load import load_all_chat_metadata, load_chat
from setta.database.db.chats.save import create_new_chat, delete_chat, save_messages
from setta.database.db_objs import DBQueue
from setta.database.utils import create_new_id
from setta.mcp.client import MCPClient
from setta.mcp.server import CHAT_ID_ARG_NAME
from setta.types.chat_messages import (
    Chat,
    ChatMessage,
    FullMessageStop,
    ToolResult,
)
from setta.utils.constants import C
from setta.utils.utils import get_absolute_path
from setta.websockets.msg_handlers.chat_manager import WMHChatManager
from setta.websockets.websocket_manager import WebsocketManager


class ChatManager:
    def __init__(
        self, dbq: DBQueue, mcp_client: MCPClient, websocket_manager: WebsocketManager
    ):
        self.dbq = dbq
        self.mcp_client = mcp_client
        self.websocket_msg_handler = WMHChatManager(websocket_manager)
        self.current_streams: dict[str, list[ChatMessage]] = {}
        self.stream_tasks = {}
        self.anthropic = AsyncAnthropic()
        with open(get_absolute_path(__file__, "system_prompt.md"), "r") as f:
            self.system_prompt = f.read()
        self.max_tokens = 20000
        self.thinking_budget_tokens = 10000
        self.cache_trigger_tokens = 1000

    def get_chat(self, chat_id: str):
        with self.dbq as db:
            return load_chat(db, chat_id)

    def get_or_create_chat(self, chat_id: str | None, message: ChatMessage):
        if not chat_id or not self.get_chat(chat_id):
            return self.create_new_chat(message)
        self.save_messages_to_db(chat_id, [message])
        return self.get_chat(chat_id)

    def save_messages_to_db(self, chat_id: str, messages: list[ChatMessage]):
        if len(messages) == 0:
            return
        with self.dbq as db:
            save_messages(db, chat_id, messages)

    def save_current_stream_to_db(self, chat_id: str):
        messages = self.get_current_stream(chat_id)
        messages = self.remove_incomplete_tool_uses(messages)
        self.save_messages_to_db(
            chat_id,
            messages,
        )
        chat = self.get_chat(chat_id)
        if not chat:
            raise ValueError
        return chat

    def create_new_chat(self, first_message: ChatMessage):
        with self.dbq as db:
            return create_new_chat(db, first_message)

    def get_all_chat_metadata(self):
        with self.dbq as db:
            return load_all_chat_metadata(db)

    def delete_chat(self, chat_id: str):
        with self.dbq as db:
            delete_chat(db, chat_id)

    def is_waiting_for_response(self, chat_id: str):
        return chat_id in self.current_streams

    def init_current_stream(self, chatId: str):
        self.current_streams[chatId] = []

    def end_current_stream(self, chatId: str):
        self.current_streams.pop(chatId, None)

    def get_current_stream(self, chatId: str):
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
            chunk = FullMessageStop(
                type=C.LLM_FULL_MESSAGE_STOP,
                messages=messages,
                toolResults=tool_results,
            )
            await self.send_streaming_response(chatId, None, chunk)

    async def _process_query(self, chat: Chat, model, deepThink: bool):
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

            assistant_message_id, latest_msg = await self.stream_responses(
                chatId, stream
            )

            if latest_msg is None:
                break

            newer_msgs: list[ChatMessage] = []

            for sub_msg in latest_msg:
                if isinstance(sub_msg, ToolUseBlock):
                    has_tool_call = True
                    result = await self.mcp_client.call_tool(
                        sub_msg.name,
                        {
                            CHAT_ID_ARG_NAME: chatId,
                            **self.tool_use_input_str_to_dict(sub_msg.input),
                        },
                    )
                    tool_result = ToolResult(
                        type=C.LLM_TOOL_RESULT,
                        tool_use_id=sub_msg.id,
                        content=result.content,
                        is_error=result.isError,
                    )
                    await self.send_streaming_response(
                        chatId, assistant_message_id, tool_result
                    )
                    newer_msgs.append(
                        ChatMessage(
                            id=create_new_id(),
                            role=C.LLM_USER_ROLE,
                            content=[tool_result],
                        )
                    )

            curr_stream.extend(newer_msgs)
            self.save_current_stream_to_db(chatId)

            # If we processed the entire response without finding tool calls, we're done
            if not has_tool_call:
                break

    async def stream_responses(self, chatId: str, stream):
        # sends streaming response to frontend
        # and also constructs the full message for use in process_query
        assistant_message_id = None
        llm_msgs = None

        async for event in stream.parse():
            if isinstance(event, RawMessageStartEvent):
                print(event.message.usage, flush=True)
                assistant_message_id = event.message.id
                self.current_streams[chatId].append(
                    ChatMessage(
                        id=event.message.id,
                        role=event.message.role,
                        content=event.message.content,
                    )
                )
                llm_msgs = self.current_streams[chatId][-1].content
            elif llm_msgs is None:
                continue

            if isinstance(event, RawContentBlockStartEvent):
                while len(llm_msgs) <= event.index:
                    # append placeholder
                    llm_msgs.append(TextBlock(text="", type="text"))  # type: ignore
                llm_msgs[event.index] = event.content_block  # type: ignore
            elif isinstance(event, RawContentBlockDeltaEvent):
                curr_msg = llm_msgs[event.index]
                if event.delta.type == C.LLM_TEXT_DELTA and isinstance(
                    curr_msg, TextBlock
                ):
                    curr_msg.text += event.delta.text
                elif event.delta.type == C.LLM_THINKING_DELTA and isinstance(
                    curr_msg, ThinkingBlock
                ):
                    curr_msg.thinking += event.delta.thinking
                elif event.delta.type == C.LLM_SIGNATURE_DELTA and isinstance(
                    curr_msg, ThinkingBlock
                ):
                    curr_msg.signature = event.delta.signature
                elif event.delta.type == C.LLM_INPUT_JSON_DELTA and isinstance(
                    curr_msg, ToolUseBlock
                ):
                    if not isinstance(curr_msg.input, str):
                        curr_msg.input = ""
                    curr_msg.input += event.delta.partial_json

            await self.send_streaming_response(chatId, assistant_message_id, event)

        return assistant_message_id, llm_msgs

    async def send_streaming_response(
        self, chatId: str, assistant_message_id: str | None, chunk: BaseModel
    ):
        await self.websocket_msg_handler.send_streaming_response(
            chatId, assistant_message_id, chunk.model_dump()
        )

    async def request_stop_streaming(self, chat_id: str):
        task = self.stream_tasks.get(chat_id)
        if task:
            task.cancel()

    def remove_incomplete_tool_uses(self, messages: list[ChatMessage]):
        tool_use_has_result: set[str] = set()
        for m in messages:
            for c in m.content:
                if isinstance(c, ToolUseBlock):
                    if not isinstance(c.input, dict):
                        c.input = self.tool_use_input_str_to_dict(c.input)
                elif isinstance(c, ToolResult):
                    tool_use_has_result.add(c.tool_use_id)

        for m in messages:
            new_content = []
            for c in m.content:
                if isinstance(c, ToolUseBlock) and c.id not in tool_use_has_result:
                    continue
                new_content.append(c)
            m.content = new_content

        return [m for m in messages if len(m.content) > 0]

    def tool_use_input_str_to_dict(self, input: object):
        if isinstance(input, str) and input:
            return json.loads(input)
        return {}

    def separate_tool_results(self, messages: list[ChatMessage]):
        tool_results: dict[str, ToolResult] = {}
        filtered_messages: list[ChatMessage] = []
        for m in messages:
            if len(m.content) == 0:
                continue
            c = m.content[0]
            if isinstance(c, ToolResult):
                tool_results[c.tool_use_id] = c
            else:
                filtered_messages.append(m)
        return filtered_messages, tool_results

    async def get_tools_system_messages_thinking(
        self,
        messages: list[ChatMessage],
        curr_stream: list[ChatMessage],
        model: str,
        deepThink: bool,
    ):
        tools = self.mcp_client.available_tools
        tools = tools + maybe_get_str_replace_editor_tool(model)

        system = [
            TextBlockParam(
                type="text",
                text=self.system_prompt,
                cache_control=CacheControlEphemeralParam(type="ephemeral"),
            )
        ]

        did_set_cache_control = False
        output_messages: list[MessageParam] = []
        for m in reversed([*messages, *curr_stream]):
            content = []
            for c in reversed(m.content):
                c = convertToBlockParam(c)
                if not did_set_cache_control and c["type"] != C.LLM_THINKING:
                    c["cache_control"] = CacheControlEphemeralParam(type="ephemeral")
                    did_set_cache_control = True
                content.append(c)
            output_messages.append(MessageParam(role=m.role, content=reversed(content)))
        output_messages.reverse()

        if deepThink:
            thinking = ThinkingConfigEnabledParam(
                budget_tokens=self.thinking_budget_tokens, type="enabled"
            )
        else:
            thinking = ThinkingConfigDisabledParam(type="disabled")

        return tools, system, output_messages, thinking


def maybe_get_str_replace_editor_tool(model_name: str):
    if "claude-3-7-sonnet" in model_name:
        return [
            ToolTextEditor20250124Param(
                name="str_replace_editor", type="text_editor_20250124"
            )
        ]
    return []


def convertToBlockParam(c: ContentBlock | ToolResult):
    if isinstance(c, TextBlock):
        return TextBlockParam(**c.model_dump())
    elif isinstance(c, ToolResult):
        return ToolResultBlockParam(**c.model_dump(exclude_defaults=True))
    elif isinstance(c, ToolUseBlock):
        return ToolUseBlockParam(**c.model_dump())
    elif isinstance(c, ThinkingBlock):
        return ThinkingBlockParam(**c.model_dump())
    raise ValueError
