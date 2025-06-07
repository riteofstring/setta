# some parts borrowed from https://github.com/tadata-org/fastapi_mcp/blob/main/fastapi_mcp/server.py

import asyncio
import inspect
import logging
from functools import wraps
from typing import Any, Callable, cast

import docstring_parser
from fastapi import FastAPI, Request
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from mcp.server.fastmcp.server import Context
from mcp.server.fastmcp.tools import Tool, ToolManager
from mcp.server.fastmcp.utilities.func_metadata import func_metadata
from mcp.server.session import ServerSessionT
from mcp.server.sse import SseServerTransport
from mcp.shared.context import LifespanContextT
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

    def add_setta_tools(self):
        for fn in SETTA_MCP_TOOLS:
            self.add_tool(self.setta_uuid_transformer(fn))

    def setta_uuid_transformer(self, func):
        setta_params: set[str] = set()
        for param_name in inspect.signature(func).parameters.keys():
            if param_name in C.SETTA_MCP_PARAM_NAMES:
                setta_params.add(param_name)
        is_async = inspect.iscoroutinefunction(func)

        @wraps(func)
        async def wrapper(**kwargs):
            print(f"wrapper: {kwargs}\n\n\n", flush=True)
            # Filter out unwanted params
            kwargs = {
                k: v
                for k, v in kwargs.items()
                if k not in C.SETTA_MCP_PARAM_NAMES or k in setta_params
            }
            if C.MCP_SERVER_ARG_NAME in setta_params:
                kwargs[C.MCP_SERVER_ARG_NAME] = self
            try:
                kwargs = replace_ids_with_uuids(kwargs, self.id_to_uuid)
            except IDDoesNotExist as e:
                return {"error": str(e)}
            result = func(**kwargs)
            if is_async:
                result = await result
            return_type = func.__annotations__.get("return")
            if return_type:
                result = TypeAdapter(return_type).validate_python(result)
                result = replace_uuids_with_ids(
                    result, self.uuid_to_id, self.id_to_uuid
                )
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

        is_async = inspect.iscoroutinefunction(fn)

        if context_kwarg is None:
            sig = inspect.signature(fn)
            for param_name, param in sig.parameters.items():
                if param.annotation is Context:
                    context_kwarg = param_name
                    break

        skip_names = [*C.SETTA_MCP_PARAM_NAMES]
        if context_kwarg is not None:
            skip_names.append(context_kwarg)

        func_arg_metadata = func_metadata(
            fn,
            skip_names=skip_names,
        )
        parameters = func_arg_metadata.arg_model.model_json_schema()

        description, param_descriptions = extract_tool_docstrings(fn)
        for arg_name, arg_metadata in parameters["properties"].items():
            if "description" in arg_metadata:
                continue
            description = param_descriptions.get(arg_name, None)
            if description:
                arg_metadata["description"] = description

        return cls(
            fn=fn,
            name=func_name,
            description=description if description else "",
            parameters=parameters,
            fn_metadata=func_arg_metadata,
            is_async=is_async,
            context_kwarg=context_kwarg,
        )

    async def run(
        self,
        arguments: dict[str, Any],
        context: Context[ServerSessionT, LifespanContextT] | None = None,
    ) -> Any:
        """Run the tool with arguments."""
        try:
            pass_directly = {}
            if self.context_kwarg is not None:
                pass_directly[self.context_kwarg] = context
            for k, v in arguments.items():
                if k in C.SETTA_MCP_PARAM_NAMES:
                    pass_directly[k] = v
            return await self.fn_metadata.call_fn_with_arg_validation(
                self.fn,
                self.is_async,
                arguments,
                pass_directly,
            )
        except Exception as e:
            raise ToolError(f"Error executing tool {self.name}: {e}") from e


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


def extract_tool_docstrings(func):
    # Get the function's docstring
    docstring = inspect.getdoc(func)
    if not docstring:
        return None, {}

    # Parse the docstring using docstring_parser
    try:
        parsed = docstring_parser.parse(docstring)
    except Exception as e:
        print(f"Failed to parse docstring: {e}")
        return None, {}

    # Extract parameter descriptions
    param_docs = {}
    for param in parsed.params:
        if param.description:
            param_docs[param.arg_name] = param.description

    return parsed.description, param_docs
