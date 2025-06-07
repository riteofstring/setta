# some parts borrowed from https://github.com/tadata-org/fastapi_mcp/blob/main/fastapi_mcp/server.py

import asyncio

from fastapi import FastAPI, Request
from mcp.server.fastmcp import FastMCP
from mcp.server.sse import SseServerTransport
from mcp.types import Tool as MCPTool

from setta.database.db_objs import DBE
from setta.mcp.tool_setup import SETTA_MCP_TOOLS
from setta.project_state.project_manager import ProjectManager
from setta.terminals.terminals import Terminals
from setta.types.notifications import SettaNotification
from setta.utils.constants import C
from setta.websockets.msg_handlers.mcp import WMHMCP
from setta.websockets.websocket_manager import WebsocketManager


# TODO use FastMCP once this is resolved: https://github.com/modelcontextprotocol/python-sdk/issues/226
class SettaFastMCP(FastMCP):
    def __init__(
        self,
        app: FastAPI,
        mount_path: str,
        name: str,
        websocket_manager: WebsocketManager,
        dbe: DBE,
        terminals: Terminals,
        project_manager: ProjectManager,
        instructions=None,
        **settings,
    ):
        super().__init__(name=name, instructions=instructions, **settings)
        self.websocket_msg_handler = WMHMCP(websocket_manager, dbe)
        self.terminals = terminals
        self.project_manager = project_manager
        self.fn_param_docstrings = {}
        self.excluded_setta_params = set([C.CHAT_ID_ARG_NAME])
        msg_path = f"{mount_path}/messages/"
        sse_transport = SseServerTransport(msg_path)

        async def handle_mcp_connection(request: Request):
            async with sse_transport.connect_sse(
                request.scope, request.receive, request._send
            ) as streams:
                await self._mcp_server.run(
                    streams[0],
                    streams[1],
                    self._mcp_server.create_initialization_options(),
                )

        app.get(mount_path)(handle_mcp_connection)
        app.mount(msg_path, app=sse_transport.handle_post_message)

        self.add_setta_tools()
        content = SettaNotification(message="MCP Server Ready", temporary=True)
        asyncio.create_task(self.websocket_msg_handler.broadcast_notification(content))

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
                k: v
                for k, v in schema["properties"].items()
                if k not in self.excluded_setta_params
            }
            if schema.get("required"):
                schema["required"] = [
                    k for k in schema["required"] if k not in self.excluded_setta_params
                ]
            for arg_name, arg_metadata in schema["properties"].items():
                if "description" in arg_metadata:
                    continue
                description = self.fn_param_docstrings.get(t.fn, {}).get(arg_name, None)
                if description:
                    arg_metadata["description"] = description

            output.append(mcpt)
        return output

    def add_setta_tools(self):
        for t in SETTA_MCP_TOOLS:
            self.add_tool(t.fn, description=t.description)
            self.fn_param_docstrings[t.fn] = t.param_descriptions
