# some parts borrowed from https://github.com/tadata-org/fastapi_mcp/blob/main/fastapi_mcp/server.py

import asyncio
import inspect
import logging
from functools import wraps
from typing import Any, Callable, cast

from fastapi import FastAPI, Request
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.tools import Tool, ToolManager
from mcp.server.fastmcp.utilities.func_metadata import func_metadata
from mcp.server.sse import SseServerTransport
from mcp.types import Tool as MCPTool
from pydantic import TypeAdapter

from setta.database.db.chats.load import load_uuid_mapping_for_llm
from setta.database.db.chats.save import save_uuid_mapping_for_llm
from setta.database.db_objs import DBE
from setta.mcp.tool_setup import SETTA_MCP_TOOLS
from setta.mcp.utils import (
    IDDoesNotExist,
    replace_ids_with_uuids,
    replace_uuids_with_ids,
)
from setta.project_state.project_manager import ProjectManager
from setta.terminals.terminals import Terminals
from setta.types.notifications import SettaNotification
from setta.utils.constants import C
from setta.websockets.msg_handlers.mcp import WMHMCP
from setta.websockets.websocket_manager import WebsocketManager

logger = logging.getLogger(__name__)


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
        self._tool_manager = SettaToolManager()
        self.websocket_msg_handler = WMHMCP(websocket_manager)
        self.dbe = dbe
        self.terminals = terminals
        self.project_manager = project_manager
        with self.dbe.session as db:
            self.id_to_uuid, self.uuid_to_id = load_uuid_mapping_for_llm(db)
        self.fn_param_docstrings = {}
        self.excluded_setta_params = set(
            [C.MCP_CHAT_ID_ARG_NAME, C.MCP_SERVER_ARG_NAME]
        )
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
            self.add_tool(self.setta_uuid_transformer(t.fn), description=t.description)
            self.fn_param_docstrings[t.fn] = t.param_descriptions

    def setta_uuid_transformer(self, func):
        @wraps(func)
        async def wrapper(**kwargs):
            try:
                kwargs = replace_ids_with_uuids(kwargs, self.id_to_uuid)
            except IDDoesNotExist as e:
                return {"error": str(e)}
            result = await func(**kwargs)
            result = TypeAdapter(func.__annotations__["return"]).validate_python(result)
            result = replace_uuids_with_ids(result, self.uuid_to_id, self.id_to_uuid)
            with self.dbe.session as db:
                save_uuid_mapping_for_llm(db, self.uuid_to_id)
                await self.websocket_msg_handler.send_uuid_mapping(self.id_to_uuid)
            return result

        return wrapper


class SettaTool(Tool):
    @classmethod
    def from_function(
        cls,
        fn: Callable[..., Any],
        name: str | None = None,
        description: str | None = None,
        context_kwarg: str | None = None,
    ) -> "SettaTool":
        """Create a Tool from a function."""
        from mcp.server.fastmcp import Context

        func_name = name or fn.__name__

        if func_name == "<lambda>":
            raise ValueError("You must provide a name for lambda functions")

        func_doc = description or fn.__doc__ or ""
        is_async = inspect.iscoroutinefunction(fn)

        if context_kwarg is None:
            sig = inspect.signature(fn)
            for param_name, param in sig.parameters.items():
                if param.annotation is Context:
                    context_kwarg = param_name
                    break

        skip_names = [C.MCP_CHAT_ID_ARG_NAME, C.MCP_SERVER_ARG_NAME]
        if context_kwarg is not None:
            skip_names.append(context_kwarg)
        func_arg_metadata = func_metadata(
            fn,
            skip_names=skip_names,
        )
        parameters = func_arg_metadata.arg_model.model_json_schema()

        return cls(
            fn=fn,
            name=func_name,
            description=func_doc,
            parameters=parameters,
            fn_metadata=func_arg_metadata,
            is_async=is_async,
            context_kwarg=context_kwarg,
        )


class SettaToolManager(ToolManager):
    def add_tool(
        self,
        fn: Callable[..., Any],
        name: str | None = None,
        description: str | None = None,
    ) -> SettaTool:
        """Add a tool to the server."""
        tool = SettaTool.from_function(fn, name=name, description=description)
        existing = self._tools.get(tool.name)
        if existing:
            if self.warn_on_duplicate_tools:
                logger.warning(f"Tool already exists: {tool.name}")
            return cast(SettaTool, existing)
        self._tools[tool.name] = tool
        return tool
