import asyncio
import json
from contextlib import AsyncExitStack
from typing import Optional

import mcp.types
from anthropic import AsyncAnthropic
from mcp import ClientSession
from mcp.client.sse import sse_client

from setta.database.utils import create_new_id
from setta.utils.constants import CONSTANTS_FOLDER, C
from setta.utils.utils import get_absolute_path


# adapted from: https://github.com/modelcontextprotocol/quickstart-resources/blob/main/mcp-client-python/client.py
class MCPClient:
    def __init__(self, server_url, websocket_msg_handler, chat_manager):
        # Initialize session and client objects
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        self.anthropic = AsyncAnthropic()
        self.reader_task = None
        self.server_url = server_url
        self.websocket_msg_handler = websocket_msg_handler
        self.chat_manager = chat_manager
        self.available_tools = []
        with open(
            get_absolute_path(__file__, CONSTANTS_FOLDER / "system_prompt.md"), "r"
        ) as f:
            self.system_prompt = f.read()

    async def connect_to_server(self, retry_delay=1):
        """Connect to an MCP server over HTTP with retry logic

        Args:
            url: URL to the MCP server
            retry_delay: Delay between retry attempts in seconds
        """
        print("Starting MCP client connection...", flush=True)
        url = self.server_url

        while True:
            try:
                print(f"Attempting to connect to {url}...", flush=True)

                # Create and enter the SSE client context
                stdio_transport = await self.exit_stack.enter_async_context(
                    sse_client(url=url)
                )
                self.read, self.write = stdio_transport

                # Create and enter the client session context
                self.session = await self.exit_stack.enter_async_context(
                    ClientSession(self.read, self.write)
                )

                # Initialize the session
                await self.session.initialize()
                print(f"Connected to {url}...", flush=True)
                # List available tools to verify connection
                response = await self.session.list_tools()
                self.available_tools = [
                    {
                        "name": tool.name,
                        "description": tool.description,
                        "input_schema": tool.inputSchema,
                    }
                    for tool in response.tools
                ]

                # Keep the connection alive (this will block until an exception occurs)
                await self._keep_alive()

            except asyncio.TimeoutError:
                print(
                    f"Connection timed out, retrying in {retry_delay} seconds...",
                    flush=True,
                )
            except Exception as e:
                print(f"Connection error: {e}", flush=True)
                print(f"Retrying in {retry_delay} seconds...", flush=True)

            # Close any open contexts before retrying
            await self.exit_stack.aclose()
            self.exit_stack = (
                AsyncExitStack()
            )  # Create a new stack for the next attempt

            # Wait before retrying
            await asyncio.sleep(retry_delay)

    async def _keep_alive(self):
        """Keep the connection alive"""
        while True:
            await asyncio.sleep(10)
            await self.session.send_ping()

    async def process_query(self, chat, model, deepThink):
        chatId = chat["id"]
        self.chat_manager.notify_that_llm_is_responding(chatId)
        messages = [
            {"role": m["role"], "content": m["content"]} for m in chat["messages"]
        ]

        while True:
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
                messages=messages,
                tools=self.available_tools,
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

            complete_messages, assistant_message_id = await self.stream_responses(
                chatId, stream
            )

            for msg in complete_messages:
                assistant_message_content.append(msg)
                if msg.type == C.LLM_TOOL_USE:
                    has_tool_call = True
                    result = await self.session.call_tool(msg.name, msg.input)
                    tool_result = {
                        "type": C.LLM_TOOL_RESULT,
                        "tool_use_id": msg.id,
                        "content": result.content,
                    }
                    await self.send_streaming_response(chatId, tool_result)
                    messages.append(
                        {
                            "id": assistant_message_id,
                            "role": C.LLM_ASSISTANT_ROLE,
                            "content": assistant_message_content,
                        }
                    )
                    messages.append(
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
                    messages.append(
                        {
                            "id": assistant_message_id,
                            "role": C.LLM_ASSISTANT_ROLE,
                            "content": assistant_message_content,
                        }
                    )
                break
            # Otherwise continue the loop to get the next response after tool use

        chunk = {"type": C.LLM_FULL_MESSAGE_STOP}
        await self.send_streaming_response(chatId, assistant_message_id, chunk)

        self.chat_manager.notify_that_llm_is_done(chatId)

    async def stop(self):
        """Clean up resources properly for server shutdown"""
        # Cancel any running tasks first
        if hasattr(self, "_keep_alive_task") and self._keep_alive_task:
            self._keep_alive_task.cancel()
            try:
                await self._keep_alive_task
            except asyncio.CancelledError:
                pass

        if self.reader_task and not self.reader_task.done():
            self.reader_task.cancel()
            try:
                await self.reader_task
            except asyncio.CancelledError:
                pass

        # Then close the exit stack to release resources
        await self.exit_stack.aclose()

        # Set flags to indicate shutdown
        self._shutdown = True
        print("MCPClient resources cleaned up successfully")

    async def stream_responses(self, chatId, stream):
        # sends streaming response to frontend
        # and also constructs the full message for use in process_query
        llm_msgs = []
        assistant_message_id = None

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

        return llm_msgs, assistant_message_id

    def tool_call_result_formatted_for_frontend(self, result):
        output = []
        for r in result.content:
            if isinstance(r, mcp.types.TextContent):
                output.append(r.text)
            elif isinstance(r, mcp.types.ImageContent):
                output.append(r.data)
        if len(output) == 1:
            return output[0]
        return output

    async def send_streaming_response(self, chatId, assistant_message_id, chunk):
        await self.websocket_msg_handler.send_streaming_response(
            chatId, assistant_message_id, chunk
        )
