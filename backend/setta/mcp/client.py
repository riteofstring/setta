import asyncio
import json
from contextlib import AsyncExitStack
from typing import Optional

from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.types import CallToolResult, TextContent

from setta.mcp.str_replace_editor_tool_fns import (
    handle_str_replace_editor_tool_str_replace,
    handle_str_replace_editor_tool_view,
)
from setta.utils.constants import C


# adapted from: https://github.com/modelcontextprotocol/quickstart-resources/blob/main/mcp-client-python/client.py
class MCPClient:
    def __init__(self, server_url):
        # Initialize session and client objects
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        self.reader_task = None
        self.server_url = server_url
        self.available_tools = []

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

    async def call_tool(self, tool_name, tool_args):
        if tool_name == C.LLM_STR_REPLACE_EDITOR_TOOL:
            return handle_str_replace_editor_tool(tool_args)
        return await self.session.call_tool(tool_name, tool_args)

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


def handle_str_replace_editor_tool(tool_args):
    content = ""
    isError = False
    try:
        command = tool_args["command"]
        file_path = tool_args["path"]
        if command == "view":
            content = handle_str_replace_editor_tool_view(
                file_path, tool_args.get("view_range")
            )
        elif command == "str_replace":
            content = handle_str_replace_editor_tool_str_replace(
                file_path, tool_args["old_str"], tool_args["new_str"]
            )
        elif command == "create":
            # Create new file
            pass
        elif command == "insert":
            # Insert text at location
            pass
        elif command == "undo_edit":
            # Restore from backup
            pass
    except Exception as e:
        content = str(e)
        isError = True

    if not isinstance(content, str):
        content = json.dumps(content)

    return CallToolResult(
        content=[TextContent(type="text", text=content)], isError=isError
    )
