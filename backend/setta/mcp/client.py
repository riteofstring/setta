import asyncio
import json
from contextlib import AsyncExitStack
from typing import Optional

import mcp.types
import websockets
from anthropic import Anthropic
from dotenv import load_dotenv
from mcp import ClientSession
from mcp.client.sse import sse_client

from setta.utils.constants import CONSTANTS_FOLDER, C
from setta.utils.utils import get_absolute_path

load_dotenv()  # load environment variables from .env


# adapted from: https://github.com/modelcontextprotocol/quickstart-resources/blob/main/mcp-client-python/client.py
class MCPClient:
    def __init__(self, server_url):
        # Initialize session and client objects
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        self.anthropic = Anthropic()
        self.reader_task = None
        self.server_url = server_url
        self.websocket = None
        self.ready = asyncio.Event()
        with open(
            get_absolute_path(__file__, CONSTANTS_FOLDER / "system_prompt.md"), "r"
        ) as f:
            self.system_prompt = f.read()

    async def connect_to_server(self, retry_delay=1):
        """Connect to an MCP server over HTTP with retry logic"""
        print("Starting MCP client connection...", flush=True)
        url = self.server_url

        while True:
            keep_alive_task = None
            try:
                print(f"Attempting to connect to {url}...", flush=True)

                # Create a new exit stack for each connection attempt
                self.exit_stack = AsyncExitStack()

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
                self.ready.set()

                # Create a separate task for keep_alive instead of awaiting it directly
                keep_alive_task = asyncio.create_task(self._keep_alive())

                # Wait for the keep_alive task to complete or be cancelled
                await keep_alive_task

            except asyncio.CancelledError:
                print("Connection task cancelled", flush=True)
                raise  # Re-raise to propagate cancellation
            except asyncio.TimeoutError:
                print(
                    f"Connection timed out, retrying in {retry_delay} seconds...",
                    flush=True,
                )
            except Exception as e:
                print(f"Connection error: {e}", flush=True)
                print(f"Retrying in {retry_delay} seconds...", flush=True)
            finally:
                # Clean up the keep_alive task if it's still running
                if keep_alive_task and not keep_alive_task.done():
                    keep_alive_task.cancel()
                    try:
                        await keep_alive_task
                    except asyncio.CancelledError:
                        pass

                # Clear resources before closing exit stack
                self.read = None
                self.write = None
                self.session = None

                # Clear the ready event
                self.ready.clear()

                # Close the exit stack
                try:
                    await self.exit_stack.aclose()
                except Exception as e:
                    print(f"Error closing exit stack: {e}", flush=True)

                # Wait before retrying (unless cancelled)
                try:
                    await asyncio.sleep(retry_delay)
                except asyncio.CancelledError:
                    raise

    async def _keep_alive(self):
        """Keep the connection alive"""
        while True:
            await asyncio.sleep(10)
            await self.session.send_ping()

    async def process_query(self, model, messages, deepThink):
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
            thinking = (
                {"type": "enabled", "budget_tokens": 10000}
                if deepThink
                else {"type": "disabled"}
            )

            stream = self.anthropic.messages.create(
                model=model,
                max_tokens=20000,
                messages=messages,
                tools=available_tools,
                stream=True,
                system=self.system_prompt,
                thinking=thinking,
            )

            complete_messages = await self.stream_responses(stream)

            # Process complete messages for tool calls
            if complete_messages:
                for msg in complete_messages:
                    if msg.type == "text":
                        assistant_message_content.append(
                            {"type": "text", "text": msg.text}
                        )
                    elif msg.type == "thinking":
                        assistant_message_content.append(
                            {
                                "type": "thinking",
                                "thinking": msg.text,
                                "signature": msg.signature,
                            }
                        )
                    elif msg.type == "tool_use":
                        has_tool_call = True
                        tool_name = msg.name
                        tool_args = msg.input

                        # Execute tool call
                        result = await self.session.call_tool(tool_name, tool_args)

                        chunk = {
                            "type": "tool_result",
                            "content": self.tool_call_result_formatted_for_frontend(
                                result
                            ),
                            "is_delta": False,
                        }

                        await self.send_streaming_response(chunk)

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

        chunk = {"type": "message_stop"}
        await self.send_streaming_response(chunk)

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
        # sends streaming response to frontend
        # and also constructs the full message for use in process_query
        llm_msgs = []

        for event in stream:
            chunk = None
            if event.type == "content_block_start":
                while len(llm_msgs) <= event.index:
                    llm_msgs.append(None)
                llm_msgs[event.index] = event.content_block
                if not hasattr(event.content_block, "text"):
                    event.content_block.text = ""
                if event.content_block.type == "text":
                    chunk = {
                        "type": event.type,
                        "index": event.index,
                        "block_type": event.content_block.type,
                    }
                elif event.content_block.type == "thinking":
                    chunk = {
                        "type": event.type,
                        "index": event.index,
                        "block_type": event.content_block.type,
                    }
                elif event.content_block.type == "tool_use":
                    chunk = {
                        "type": event.type,
                        "index": event.index,
                        "block_type": event.content_block.type,
                        "tool_name": event.content_block.name,
                    }

            elif event.type == "content_block_delta":
                if event.delta.type == "text_delta":
                    llm_msgs[event.index].text += event.delta.text
                    chunk = {
                        "type": "text",
                        "content": event.delta.text,
                        "index": event.index,
                        "is_delta": True,
                    }
                elif event.delta.type == "thinking_delta":
                    llm_msgs[event.index].text += event.delta.thinking
                    chunk = {
                        "type": "thinking",
                        "content": event.delta.thinking,
                        "index": event.index,
                        "is_delta": True,
                    }
                elif event.delta.type == "signature_delta":
                    llm_msgs[event.index].signature = event.delta.signature
                elif event.delta.type == "input_json_delta":
                    llm_msgs[event.index].text += event.delta.partial_json
                    chunk = {
                        "type": "json",
                        "content": event.delta.partial_json,
                        "index": event.index,
                        "is_delta": True,
                    }

            elif event.type == "content_block_stop":
                if llm_msgs[event.index].type == "tool_use":
                    text = llm_msgs[event.index].text
                    if text:
                        llm_msgs[event.index].input = json.loads(text)
                chunk = {"type": event.type, "index": event.index}

            if chunk is not None:
                await self.send_streaming_response(chunk)

        return llm_msgs

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

    async def send_streaming_response(self, chunk):
        try:
            await self.websocket.send(
                json.dumps(
                    {"messageType": C.WS_LLM_STREAMING_RESPONSE, "content": chunk}
                )
            )
        except websockets.exceptions.ConnectionClosedError as e:
            print(f"WebSocket connection closed: {e}", flush=True)
            raise  # Re-raise to ensure proper handling in the calling method
        except Exception as e:
            print(f"Error sending streaming response: {e}", flush=True)
            raise
