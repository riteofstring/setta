# some parts borrowed from https://github.com/tadata-org/fastapi_mcp/blob/main/fastapi_mcp/server.py

import asyncio
import inspect
import logging
from dataclasses import dataclass
from functools import wraps
from typing import TYPE_CHECKING, Any, Callable, cast, get_origin

import bm25s
import docstring_parser
from fastapi import FastAPI, Request
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from mcp.server.fastmcp.server import Context
from mcp.server.fastmcp.tools import Tool, ToolManager
from mcp.server.fastmcp.tools.base import _is_async_callable
from mcp.server.fastmcp.utilities.func_metadata import func_metadata
from mcp.server.session import ServerSessionT
from mcp.server.sse import SseServerTransport
from mcp.shared.context import LifespanContextT
from mcp.types import ToolAnnotations

from setta.database.db_objs import DBE
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
from setta.mcp.tool_setup import SETTA_INIT_MCP_TOOLS, SETTA_MCP_TOOLS
from setta.mcp.utils import (
    IDDoesNotExist,
    convert_canonical_ids_to_temporary,
    convert_temporary_ids_to_canonical,
)
from setta.types.id import (
    ID,
    CanonicalToTemporaryIDMap,
    TemporaryToCanonicalIDMap,
)
from setta.types.notifications import SettaNotification
from setta.utils.constants import C
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

if TYPE_CHECKING:
    from setta.server_state import SettaFastAPIState

logger = logging.getLogger(__name__)


@dataclass
class ToolSearchIndex:
    retriever: bm25s.BM25
    tools: list["Tool"]


class SettaFastMCP(FastMCP):
    def __init__(
        self,
        app: FastAPI,
        state: "SettaFastAPIState",
        mount_path: str,
        name: str,
        websocket_msg_handler: WMHFrontendSender,
        dbe: DBE,
        instructions=None,
        **settings,
    ):
        super().__init__(name=name, instructions=instructions, **settings)
        self._tool_manager = SettaToolManager()
        self.state = state
        (
            self.temporary_to_canonical,
            self.canonical_to_temporary,
        ) = dbe.read_temporary_id_map()
        self.fn_param_docstrings = {}
        self.tool_search_index: ToolSearchIndex | None = None
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
        self.tool_search_index = self._build_tool_search_index()
        content = SettaNotification(message="MCP Server Ready")
        asyncio.create_task(websocket_msg_handler.broadcast_notification(content))

    def add_setta_tools(self):
        for fn in SETTA_INIT_MCP_TOOLS:
            self._register_setta_tool(fn, SettaToolType.init)
        for fn in SETTA_MCP_TOOLS:
            self._register_setta_tool(fn, SettaToolType.discoverable)

    def _register_setta_tool(
        self, fn: Callable[..., Any], tool_type: SettaToolType
    ) -> None:
        # Re-validate against the base class so Pydantic preserves custom fields
        annotations = ToolAnnotations.model_validate(
            SettaToolAnnotations(settaToolType=tool_type).model_dump()
        )
        self.add_tool(
            self.setta_id_transformer(fn),
            annotations=annotations,
        )

    def list_registered_tools(self):
        return list(self._tool_manager._tools.values())

    def setta_id_transformer(self, func):
        setta_params: set[str] = set()
        for param_name in inspect.signature(func).parameters.keys():
            if param_name in C.SETTA_MCP_PARAM_NAMES:
                setta_params.add(param_name)
        is_async = inspect.iscoroutinefunction(func)

        @wraps(func)
        async def wrapper(**kwargs):
            before_size = len(self.canonical_to_temporary)
            self._convert_setta_context_ids(
                kwargs,
                self.canonical_to_temporary,
                self.temporary_to_canonical,
            )
            if len(self.canonical_to_temporary) != before_size:
                # Persist immediately so failures/cancellations still capture new mappings.
                self.state.dbe.write_temporary_id_map(self.canonical_to_temporary)
            # Filter out unwanted params
            kwargs = {
                k: v
                for k, v in kwargs.items()
                if k not in C.SETTA_MCP_PARAM_NAMES or k in setta_params
            }
            if C.MCP_SETTA_STATE_ARG_NAME in setta_params:
                kwargs[C.MCP_SETTA_STATE_ARG_NAME] = self.state
            try:
                kwargs = convert_temporary_ids_to_canonical(
                    kwargs, self.temporary_to_canonical
                )
            except IDDoesNotExist as e:
                raise ToolError(str(e)) from e
            result = func(**kwargs)
            if is_async:
                result = await result
            result = convert_canonical_ids_to_temporary(
                result,
                self.canonical_to_temporary,
                self.temporary_to_canonical,
            )
            self.state.dbe.write_temporary_id_map(self.canonical_to_temporary)
            return result

        return wrapper

    @staticmethod
    def _convert_setta_context_ids(
        payload: dict[str, Any],
        canonical_to_temporary: CanonicalToTemporaryIDMap,
        temporary_to_canonical: TemporaryToCanonicalIDMap,
    ) -> None:
        scoped_payload = {}
        for param in (
            C.MCP_CHAT_ID_ARG_NAME,
            C.MCP_PROJECT_CONFIG_ID_ARG_NAME,
        ):
            if param not in payload:
                continue
            value = payload[param]
            if isinstance(value, str):
                value = ID(value)
            scoped_payload[param] = value
        if not scoped_payload:
            return
        converted = convert_canonical_ids_to_temporary(
            scoped_payload,
            canonical_to_temporary,
            temporary_to_canonical,
        )
        payload.update(converted)

    def _build_tool_search_index(self) -> ToolSearchIndex | None:
        tools = [
            tool
            for tool in self.list_registered_tools()
            if tool.annotations.settaToolType == SettaToolType.discoverable
        ]
        if not tools:
            return None
        documents = [_build_tool_document_text(tool) for tool in tools]
        retriever = bm25s.BM25()
        corpus_tokens = bm25s.tokenize(documents, stopwords="en")
        retriever.index(corpus_tokens)
        return ToolSearchIndex(retriever=retriever, tools=tools)


class SettaTool(Tool):
    @classmethod
    def from_function(
        cls,
        fn: Callable[..., Any],
        name: str | None = None,
        description: str | None = None,
        context_kwarg: str | None = None,
        annotations: ToolAnnotations | None = None,
    ) -> "SettaTool":
        """Create a Tool from a function."""
        from mcp.server.fastmcp.server import Context

        func_name = name or fn.__name__

        if func_name == "<lambda>":
            raise ValueError("You must provide a name for lambda functions")

        is_async = _is_async_callable(fn)

        if context_kwarg is None:
            sig = inspect.signature(fn)
            for param_name, param in sig.parameters.items():
                if get_origin(param.annotation) is not None:
                    continue
                if issubclass(param.annotation, Context):
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
            param_description = param_descriptions.get(arg_name)
            if param_description:
                arg_metadata["description"] = param_description

        return cls(
            fn=fn,
            name=func_name,
            description=description or "",
            parameters=parameters,
            fn_metadata=func_arg_metadata,
            is_async=is_async,
            context_kwarg=context_kwarg,
            annotations=annotations,
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
        except ToolError:
            raise
        except Exception as e:
            raise ToolError(f"Error executing tool {self.name}: {e}") from e


class SettaToolManager(ToolManager):
    def add_tool(
        self,
        fn: Callable[..., Any],
        name: str | None = None,
        description: str | None = None,
        annotations: ToolAnnotations | None = None,
    ) -> SettaTool:
        """Add a tool to the server."""
        tool = SettaTool.from_function(
            fn, name=name, description=description, annotations=annotations
        )
        existing = self._tools.get(tool.name)
        if existing:
            if self.warn_on_duplicate_tools:
                logger.warning(f"Tool already exists: {tool.name}")
            return cast("SettaTool", existing)
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


def _build_tool_document_text(tool: "Tool") -> str:
    parameter_text = _build_parameter_text(tool.parameters)
    parts = [tool.name]
    if "_" in tool.name:
        parts.append(tool.name.replace("_", " "))
    parts.extend([tool.description, parameter_text])
    return " ".join(part for part in parts if part)


def _build_parameter_text(parameters: dict[str, Any]) -> str:
    if not parameters:
        return ""
    properties = parameters.get("properties")
    if not isinstance(properties, dict):
        return ""

    segments: list[str] = []
    for prop_name, prop_schema in properties.items():
        segments.append(str(prop_name))
        if not isinstance(prop_schema, dict):
            continue
        segments.extend(_collect_schema_text(prop_schema, parameters, set()))
    return " ".join(segment for segment in segments if isinstance(segment, str))


def _collect_schema_text(
    schema: Any,
    root_schema: dict[str, Any],
    seen_refs: set[str],
) -> list[str]:
    segments: list[str] = []
    if not isinstance(schema, dict):
        return segments

    description = schema.get("description")
    if isinstance(description, str):
        segments.append(description)

    ref = schema.get("$ref")
    if isinstance(ref, str):
        target = _resolve_json_pointer(root_schema, ref)
        if isinstance(target, dict) and ref not in seen_refs:
            seen_refs.add(ref)
            try:
                segments.extend(_collect_schema_text(target, root_schema, seen_refs))
            finally:
                seen_refs.remove(ref)

    for keyword in ("anyOf", "allOf", "oneOf"):
        options = schema.get(keyword)
        if isinstance(options, list):
            for option in options:
                segments.extend(_collect_schema_text(option, root_schema, seen_refs))

    items = schema.get("items")
    if isinstance(items, dict):
        segments.extend(_collect_schema_text(items, root_schema, seen_refs))
    elif isinstance(items, list):
        for entry in items:
            segments.extend(_collect_schema_text(entry, root_schema, seen_refs))

    properties = schema.get("properties")
    if isinstance(properties, dict):
        for sub_name, sub_schema in properties.items():
            segments.append(str(sub_name))
            segments.extend(_collect_schema_text(sub_schema, root_schema, seen_refs))

    additional_properties = schema.get("additionalProperties")
    if isinstance(additional_properties, dict):
        segments.extend(
            _collect_schema_text(additional_properties, root_schema, seen_refs)
        )

    return segments


def _resolve_json_pointer(schema: dict[str, Any], pointer: str) -> Any:
    if not isinstance(pointer, str) or not pointer.startswith("#/"):
        return None
    current: Any = schema
    parts = pointer[2:].split("/")
    for raw_part in parts:
        part = raw_part.replace("~1", "/").replace("~0", "~")
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list):
            try:
                index = int(part)
            except ValueError:
                return None
            if index < 0 or index >= len(current):
                return None
            current = current[index]
        else:
            return None
        if current is None:
            return None
    return current
