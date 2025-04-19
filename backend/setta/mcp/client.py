import asyncio
import json
from contextlib import AsyncExitStack
from typing import Optional

import mcp.types
from anthropic import Anthropic
from dotenv import load_dotenv
from mcp import ClientSession
from mcp.client.sse import sse_client

from setta.database.db.notifications.load import create_notification_dict
from setta.utils.constants import CONSTANTS_FOLDER
from setta.utils.utils import get_absolute_path

load_dotenv()  # load environment variables from .env


# adapted from: https://github.com/modelcontextprotocol/quickstart-resources/blob/main/mcp-client-python/client.py
class MCPClient:
    def __init__(self, server_url, websocket_msg_handler):
        # Initialize session and client objects
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        self.anthropic = Anthropic()
        self.reader_task = None
        self.server_url = server_url
        # for sending notification to frontend
        self.websocket_msg_handler = websocket_msg_handler
        with open(
            get_absolute_path(__file__, CONSTANTS_FOLDER / "system_prompt.md"), "r"
        ) as f:
            self.system_prompt = f.read()

    def start(self):
        """Start the connection process in the background"""
        self.reader_task = asyncio.create_task(self.connect_to_server())

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

                # List available tools to verify connection
                response = await self.session.list_tools()
                tools = response.tools
                print(
                    "\nConnected to server with tools:",
                    [tool.name for tool in tools],
                    flush=True,
                )
                content = create_notification_dict("MCP Client Ready", temporary=True)
                asyncio.create_task(
                    self.websocket_msg_handler.broadcast_notification(content)
                )

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

    async def process_query(self, model, messages):
        response = await self.session.list_tools()
        available_tools = [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.inputSchema,
            }
            for tool in response.tools
        ]

        while True:
            assistant_message_content = []
            has_tool_call = False
            complete_messages = None

            # Initial Claude API call with streaming
            stream = self.anthropic.messages.create(
                model=model,
                max_tokens=1000,
                messages=messages,
                tools=available_tools,
                stream=True,
                system=self.system_prompt,
            )

            # Process streaming events
            # Use a regular for loop since stream_responses returns a regular generator
            stream_gen = self.stream_responses(stream)
            async for event_data in stream_gen:
                # Check for the special complete event
                if (
                    isinstance(event_data, dict)
                    and event_data.get("type") == "content_block_complete"
                ):
                    complete_messages = event_data.get("messages")
                    continue

                # Regular event from the stream
                event = event_data  # The actual event object from the stream

                # For content block start, track the current index and block type
                if event.type == "content_block_start":
                    if event.content_block.type == "tool_use" and hasattr(
                        event.content_block, "name"
                    ):
                        # Yield the original event with tool name
                        yield {
                            "type": event.type,
                            "index": event.index,
                            "block_type": event.content_block.type,
                            "tool_name": event.content_block.name,
                        }
                    else:
                        # Yield the original event
                        yield {
                            "type": event.type,
                            "index": event.index,
                            "block_type": event.content_block.type,
                        }

                # For deltas, stream them to the frontend with type info
                elif event.type == "content_block_delta":
                    if event.delta.type == "text_delta":
                        yield {
                            "type": "text",
                            "content": event.delta.text,
                            "index": event.index,
                            "is_delta": True,
                        }
                    elif event.delta.type == "input_json_delta":
                        yield {
                            "type": "json",
                            "content": event.delta.partial_json,
                            "index": event.index,
                            "is_delta": True,
                        }

                # For content block stop, inform the frontend
                elif event.type == "content_block_stop":
                    yield {"type": event.type, "index": event.index}

            # Process complete messages for tool calls
            if complete_messages:
                for msg in complete_messages:
                    if msg.type == "text":
                        assistant_message_content.append(
                            {"type": "text", "text": msg.text}
                        )
                    elif msg.type == "tool_use":
                        has_tool_call = True
                        tool_name = msg.name
                        tool_args = msg.input

                        # Execute tool call
                        result = await self.session.call_tool(tool_name, tool_args)

                        # Yield tool result
                        yield {
                            "type": "tool_result",
                            "content": self.tool_call_result_formatted_for_frontend(
                                result
                            ),
                            "is_delta": False,
                        }

                        # Format the tool_use content block for history
                        assistant_message_content.append(
                            {
                                "type": "tool_use",
                                "id": msg.id,
                                "name": tool_name,
                                "input": tool_args,
                            }
                        )

                        # Update conversation history
                        messages.append(
                            {"role": "assistant", "content": assistant_message_content}
                        )
                        messages.append(
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "tool_result",
                                        "tool_use_id": msg.id,
                                        "content": result.content,
                                    }
                                ],
                            }
                        )

                        break  # Exit the loop to process a new response

            # If we processed the entire response without finding tool calls, we're done
            if not has_tool_call:
                if assistant_message_content:
                    messages.append(
                        {"role": "assistant", "content": assistant_message_content}
                    )
                break
            # Otherwise continue the loop to get the next response after tool use

    async def cleanup(self):
        """Clean up resources"""
        await self.exit_stack.aclose()
        if self.reader_task and not self.reader_task.done():
            self.reader_task.cancel()
            try:
                await self.reader_task
            except asyncio.CancelledError:
                pass

    async def stream_responses(self, stream):
        """
        Process the stream from Claude API, yield each event as it arrives
        and finally yield a dictionary with the complete messages
        """
        llm_msgs = []

        # Assuming stream is an iterable, not an async iterable
        for event in stream:
            if event.type == "content_block_start":
                while len(llm_msgs) <= event.index:
                    llm_msgs.append(None)
                llm_msgs[event.index] = event.content_block
                if not hasattr(event.content_block, "text"):
                    event.content_block.text = ""

                # Yield the original event
                yield event

            elif event.type == "content_block_delta":
                if event.delta.type == "text_delta":
                    # Add to the message being built
                    llm_msgs[event.index].text += event.delta.text
                elif event.delta.type == "input_json_delta":
                    llm_msgs[event.index].text += event.delta.partial_json

                # Yield the original event
                yield event

            elif event.type == "content_block_stop":
                if llm_msgs[event.index].type == "tool_use":
                    text = llm_msgs[event.index].text
                    if text:
                        llm_msgs[event.index].input = json.loads(text)

                # Yield the original event
                yield event

        # Yield a dictionary with the complete message data
        yield {"type": "content_block_complete", "messages": llm_msgs}

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
