# some parts borrowed from https://github.com/tadata-org/fastapi_mcp/blob/main/fastapi_mcp/server.py

import asyncio
import inspect

import docstring_parser
from fastapi import Request
from mcp.server.fastmcp import FastMCP
from mcp.server.sse import SseServerTransport
from mcp.types import AnyFunction
from mcp.types import Tool as MCPTool

from setta.database.db.notifications.load import create_notification_dict

CHAT_ID_ARG_NAME = "chatId"


# TODO use FastMCP once this is resolved: https://github.com/modelcontextprotocol/python-sdk/issues/226
class CustomFastMCP(FastMCP):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fn_param_docstrings = {}
        self.setta_websocket = None
        self.setta_terminals = None

    def add_tool(
        self, fn: AnyFunction, name: str | None = None, description: str | None = None
    ) -> None:
        super().add_tool(fn, name, description)
        self.fn_param_docstrings[fn] = extract_param_docstrings(fn)

    async def list_tools(self) -> list[MCPTool]:
        """List all available tools."""
        tools = self._tool_manager.list_tools()
        output = []
        for t in tools:
            mcpt = MCPTool(
                name=t.name,
                description=t.description,
                inputSchema=t.parameters,
            )
            schema = mcpt.inputSchema
            schema["properties"] = {
                k: v for k, v in schema["properties"].items() if k != CHAT_ID_ARG_NAME
            }
            if schema.get("required"):
                schema["required"] = [
                    k for k in schema["required"] if k != CHAT_ID_ARG_NAME
                ]
            for arg_name, arg_metadata in schema["properties"].items():
                if "description" in arg_metadata:
                    continue
                description = self.fn_param_docstrings.get(t.fn, {}).get(arg_name, None)
                if description:
                    arg_metadata["description"] = description

            output.append(mcpt)
        return output


mcp_server = CustomFastMCP("Setta MCP Server")


def add_mcp_server_to_fastapi_server(app, mount_path):
    msg_path = f"{mount_path}/messages/"
    sse_transport = SseServerTransport(msg_path)

    async def handle_mcp_connection(request: Request):
        async with sse_transport.connect_sse(
            request.scope, request.receive, request._send
        ) as streams:
            await mcp_server._mcp_server.run(
                streams[0],
                streams[1],
                mcp_server._mcp_server.create_initialization_options(),
            )

    app.get(mount_path)(handle_mcp_connection)
    app.mount(msg_path, app=sse_transport.handle_post_message)

    mcp_server.setta_websocket = app.state.websocket_msg_handlers.mcp
    mcp_server.setta_terminals = app.state.terminals

    content = create_notification_dict("MCP Server Ready", temporary=True)
    asyncio.create_task(
        mcp_server.setta_websocket.broadcast_notification_to_all_projects(content)
    )


def extract_param_docstrings(func):
    """
    Extract docstring descriptions for each parameter of a function.

    Args:
        func: A Python function object.

    Returns:
        dict: A dictionary mapping parameter names to their docstring descriptions.
    """
    # Get the function's docstring
    docstring = inspect.getdoc(func)
    if not docstring:
        return {}

    # Parse the docstring using docstring_parser
    try:
        parsed = docstring_parser.parse(docstring)
    except Exception as e:
        print(f"Failed to parse docstring: {e}")
        return {}

    # Extract parameter descriptions
    param_docs = {}
    for param in parsed.params:
        param_docs[param.arg_name] = param.description or "No description available"

    return param_docs
