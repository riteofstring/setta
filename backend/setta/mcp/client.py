import asyncio
import json
import logging
from contextlib import AsyncExitStack
from typing import Any

from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.types import CallToolResult, TextContent

from setta.llm.portkey_client import ToolDefinition
from setta.mcp.str_replace_editor_tool_fns import (
    handle_str_replace_editor_tool_create,
    handle_str_replace_editor_tool_insert,
    handle_str_replace_editor_tool_str_replace,
    handle_str_replace_editor_tool_view,
)
from setta.utils.constants import C

logger = logging.getLogger(__name__)


# adapted from: https://github.com/modelcontextprotocol/quickstart-resources/blob/main/mcp-client-python/client.py
class MCPClient:
    def __init__(self, server_url: str):
        # Initialize session and client objects
        self.session: ClientSession | None = None
        self.exit_stack = AsyncExitStack()
        self.server_url = server_url
        self.available_tools: list[ToolDefinition] = []
        self._shutdown = False
        self._connected = False

    async def connect_to_server(self, retry_delay=1):
        """Connect to an MCP server over HTTP with retry logic

        Args:
            url: URL to the MCP server
            retry_delay: Delay between retry attempts in seconds
        """
        logger.info("Starting MCP client connection")
        url = self.server_url

        while not self._shutdown:
            try:
                logger.info("Attempting to connect to %s", url)

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
                self._connected = True
                logger.info("Connected to %s", url)
                # List available tools to verify connection
                response = await self.session.list_tools()
                self.available_tools = [
                    tool_definition_from_mcp(tool) for tool in response.tools
                ]

                # Keep the connection alive (this will block until an exception occurs)
                await self._keep_alive()

                if self._shutdown:
                    break

            except asyncio.TimeoutError:
                self._connected = False
                if self._shutdown:
                    break
                logger.warning(
                    "MCP connection timed out; retrying in %s seconds", retry_delay
                )
            except Exception as e:
                self._connected = False
                if self._shutdown:
                    logger.info("MCP client shutdown requested: %s", e)
                    break
                logger.error("MCP connection error: %s", e)
                logger.info("Retrying in %s seconds", retry_delay)

            # Close any open contexts before retrying
            await self.exit_stack.aclose()
            self.session = None
            self.exit_stack = (
                AsyncExitStack()
            )  # Create a new stack for the next attempt

            # Wait before retrying
            if self._shutdown:
                break
            await asyncio.sleep(retry_delay)

    async def _keep_alive(self):
        """Keep the connection alive"""
        if not self.session:
            raise ValueError

        while not self._shutdown:
            try:
                await asyncio.sleep(10)
                await self.session.send_ping()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                if self._shutdown:
                    break
                logger.warning("MCP keep-alive failed: %s", exc)
                raise

    async def call_tool(self, tool_name: str, tool_args: dict):
        if tool_name == C.LLM_STR_REPLACE_EDITOR_TOOL:
            return handle_str_replace_editor_tool(tool_args)

        if not self.session:
            raise ValueError

        return await self.session.call_tool(tool_name, tool_args)

    async def stop(self):
        self._shutdown = True

        # Then close the exit stack to release resources
        await self.exit_stack.aclose()

        self.session = None
        self._connected = False
        self.available_tools = []
        logger.info("MCPClient resources cleaned up successfully")


def tool_definition_from_mcp(tool: Any) -> ToolDefinition:
    """Convert an MCP tool listing into the OpenAI function-call schema."""

    parameters = getattr(tool, "inputSchema", None)
    if parameters is None:
        parameters = {"type": "object", "properties": {}}

    description = getattr(tool, "description", "") or ""

    return {
        "type": "function",
        "function": {
            "name": getattr(tool, "name"),
            "description": description,
            "parameters": parameters,
        },
    }


def handle_str_replace_editor_tool(tool_args: dict):
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
            content = handle_str_replace_editor_tool_create(
                file_path, tool_args["file_text"]
            )
        elif command == "insert":
            content = handle_str_replace_editor_tool_insert(
                file_path, tool_args["insert_line"], tool_args["new_str"]
            )
        elif command == "undo_edit":
            # TODO
            content = "undo_edit is not yet implemented"
            isError = True
    except Exception as e:
        content = str(e)
        isError = True

    if not isinstance(content, str):
        content = json.dumps(content)

    return CallToolResult(
        content=[TextContent(type="text", text=content)], isError=isError
    )
