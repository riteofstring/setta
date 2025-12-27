# some parts borrowed from https://github.com/tadata-org/fastapi_mcp/blob/main/fastapi_mcp/server.py

import inspect
import logging
import re
from dataclasses import dataclass
from functools import wraps
from typing import TYPE_CHECKING, Any, Callable

import bm25s
import docstring_parser
from fastapi import FastAPI, Request
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.server import Context
from mcp.server.fastmcp.tools import Tool
from mcp.server.sse import SseServerTransport
from mcp.types import ToolAnnotations

from setta.database.db_objs import DBE
from setta.logging.tasks import spawn_background_task
from setta.mcp.tool_metadata import (
    SettaToolAnnotations,
    SettaToolType,
    get_ai_follow_tool_arguments,
    get_ai_follow_tool_result,
    get_tool_argument_preview,
    get_tool_search_category,
    get_tool_search_tags,
)
from setta.mcp.tool_setup import SETTA_INIT_MCP_TOOLS, SETTA_MCP_TOOLS
from setta.mcp.utils import (
    convert_canonical_ids_to_temporary,
    convert_temporary_ids_to_canonical,
)
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
        self.state = state
        self.dbe = dbe
        self._temporary_id_map_mtime_ns: int | None = None
        self.temporary_to_canonical = {}
        self.canonical_to_temporary = {}
        self._refresh_temporary_id_map_if_needed()
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
        spawn_background_task(
            websocket_msg_handler.log_and_broadcast_backend_log_event(
                "MCP Server Ready"
            ),
            label="mcp-server-ready",
            extra_values={"mount_path": mount_path},
        )

    def add_setta_tools(self):
        for fn in SETTA_INIT_MCP_TOOLS:
            self._register_setta_tool(fn, SettaToolType.init)
        for fn in SETTA_MCP_TOOLS:
            self._register_setta_tool(fn, SettaToolType.discoverable)

    def _register_setta_tool(
        self, fn: Callable[..., Any], tool_type: SettaToolType
    ) -> None:
        ai_follow_tool_arguments = get_ai_follow_tool_arguments(fn)
        ai_follow_tool_result = get_ai_follow_tool_result(fn)
        tool_argument_preview = get_tool_argument_preview(fn)
        search_tags, search_category = _build_tool_search_metadata(
            fn.__name__,
            get_tool_search_tags(fn),
            get_tool_search_category(fn),
        )
        annotations = ToolAnnotations.model_validate(
            SettaToolAnnotations(
                settaToolType=tool_type,
                aiFollowToolResult=ai_follow_tool_result,
                aiFollowToolArguments=ai_follow_tool_arguments,
                toolArgumentPreview=tool_argument_preview,
                searchTags=search_tags,
                searchCategory=search_category,
            ).model_dump()
        )
        doc_description, param_descriptions = extract_tool_docstrings(fn)
        tool = self._tool_manager.add_tool(
            self.setta_id_transformer(fn),
            annotations=annotations,
            description=doc_description or "",
        )
        _apply_param_descriptions(tool.parameters, param_descriptions)

    def list_registered_tools(self):
        return self._tool_manager.list_tools()

    def setta_id_transformer(self, func):
        is_async = inspect.iscoroutinefunction(func)

        @wraps(func)
        async def wrapper(**kwargs):
            self._refresh_temporary_id_map_if_needed()
            context_kwargs = {
                k: v for k, v in kwargs.items() if isinstance(v, Context)
            }
            for key in context_kwargs:
                kwargs.pop(key)
            kwargs = convert_temporary_ids_to_canonical(
                kwargs, self.temporary_to_canonical
            )
            result = func(**kwargs, **context_kwargs)
            if is_async:
                result = await result
            result = convert_canonical_ids_to_temporary(
                result,
                self.canonical_to_temporary,
                self.temporary_to_canonical,
            )
            self.dbe.write_temporary_id_map(self.canonical_to_temporary)
            return result

        return wrapper

    def _refresh_temporary_id_map_if_needed(self) -> None:
        path = self.dbe.temporary_id_map
        mtime_ns = path.stat().st_mtime_ns if path.exists() else None
        if mtime_ns == self._temporary_id_map_mtime_ns:
            return
        (
            self.temporary_to_canonical,
            self.canonical_to_temporary,
        ) = self.dbe.read_temporary_id_map()
        self._temporary_id_map_mtime_ns = mtime_ns

    def _build_tool_search_index(self) -> ToolSearchIndex | None:
        tools = [
            tool
            for tool in self.list_registered_tools()
            if tool.annotations is not None
            and getattr(tool.annotations, "settaToolType", None)
            == SettaToolType.discoverable
        ]
        if not tools:
            return None
        documents = [_build_tool_document_text(tool) for tool in tools]
        retriever = bm25s.BM25()
        corpus_tokens = bm25s.tokenize(documents, stopwords="en")
        retriever.index(corpus_tokens)
        return ToolSearchIndex(retriever=retriever, tools=tools)


def extract_tool_docstrings(func):
    # Get the function's docstring
    docstring = inspect.getdoc(func)
    if not docstring:
        return None, {}

    # Parse the docstring using docstring_parser
    try:
        parsed = docstring_parser.parse(docstring)
    except Exception as e:
        logger.warning("Failed to parse docstring: %s", e, exc_info=True)
        return None, {}

    # Extract parameter descriptions
    param_docs = {}
    for param in parsed.params:
        if param.description:
            param_docs[param.arg_name] = param.description

    return parsed.description, param_docs


def _apply_param_descriptions(
    parameters: dict[str, Any], param_descriptions: dict[str, str]
) -> None:
    if not parameters or not param_descriptions:
        return
    properties = parameters.get("properties")
    if not isinstance(properties, dict):
        return
    for arg_name, arg_metadata in properties.items():
        if not isinstance(arg_metadata, dict):
            continue
        if "description" in arg_metadata:
            continue
        param_description = param_descriptions.get(arg_name)
        if param_description:
            arg_metadata["description"] = param_description


_TOOL_SEARCH_SYNONYMS: dict[str, list[str]] = {
    "add": ["create", "new", "insert"],
    "bind": ["wire", "connect", "link"],
    "callable": ["function", "call"],
    "chat": ["conversation", "message"],
    "clear": ["reset", "remove"],
    "code": ["python", "script"],
    "config": ["settings"],
    "create": ["add", "new", "insert"],
    "delete": ["remove", "drop"],
    "disable": ["toggle", "switch", "flip"],
    "enable": ["toggle", "switch", "flip"],
    "gen": ["generate", "generated"],
    "get": ["fetch", "read"],
    "layout": ["position", "arrangement"],
    "list": ["show", "enumerate"],
    "listener": ["subscription", "event"],
    "impl": ["implementation"],
    "move": ["reorder", "relocate"],
    "param": ["parameter", "argument", "input"],
    "params": ["parameters", "arguments", "inputs"],
    "project": ["config", "workspace"],
    "remove": ["delete", "drop"],
    "rename": ["retitle", "relabel"],
    "section": ["panel", "node"],
    "sections": ["panels", "nodes"],
    "set": ["update", "change"],
    "size": ["dimension", "scale"],
    "terminal": ["shell", "cli"],
    "toggle": ["switch", "flip", "enable", "disable"],
    "variant": ["version", "mode"],
}

_TOOL_CATEGORY_KEYWORDS: tuple[tuple[str, set[str]], ...] = (
    (
        "sections",
        {
            "section",
            "sections",
            "child",
            "top",
            "layout",
            "position",
            "size",
            "sizes",
            "variant",
        },
    ),
    ("code", {"code", "callable", "gen", "python", "prefix", "suffix", "binding"}),
    ("params", {"param", "params", "parameter", "paraminfo", "impl"}),
    ("artifacts", {"artifact", "artifacts"}),
    ("listeners", {"listener", "listeners"}),
    ("project", {"project", "config", "settings", "state"}),
    ("terminal", {"terminal"}),
    ("chat", {"chat", "llm", "message"}),
    ("lsp", {"lsp", "completion", "signature", "diagnostic", "diagnostics"}),
    ("files", {"file", "files", "path"}),
)


def _build_tool_search_metadata(
    tool_name: str,
    explicit_tags: list[str] | None,
    explicit_category: str | None,
) -> tuple[list[str], str | None]:
    derived_tags, derived_category = _derive_tool_search_metadata(tool_name)
    tags = _normalize_search_tags((explicit_tags or []) + derived_tags)
    category = _normalize_search_category(explicit_category) or derived_category
    return tags, category


def _derive_tool_search_metadata(tool_name: str) -> tuple[list[str], str | None]:
    tokens = _tokenize_tool_name(tool_name)
    tags = _derive_search_tags(tokens)
    category = _derive_search_category(tokens)
    return tags, category


def _normalize_search_tags(tags: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        if not isinstance(tag, str):
            continue
        normalized = tag.strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        cleaned.append(normalized)
    return cleaned


def _normalize_search_category(category: str | None) -> str | None:
    if category is None:
        return None
    normalized = category.strip().lower()
    return normalized or None


def _tokenize_tool_name(tool_name: str) -> list[str]:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", tool_name.replace("_", " "))
    tokens = [token.strip().lower() for token in spaced.split() if token.strip()]
    return tokens


def _derive_search_tags(tokens: list[str]) -> list[str]:
    tags: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        for synonym in _TOOL_SEARCH_SYNONYMS.get(token, []):
            normalized = synonym.strip().lower()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            tags.append(normalized)
    return tags


def _derive_search_category(tokens: list[str]) -> str | None:
    token_set = set(tokens)
    for category, keywords in _TOOL_CATEGORY_KEYWORDS:
        if token_set & keywords:
            return category
    return None


def _build_tool_search_metadata_text(annotations: ToolAnnotations | None) -> str:
    if annotations is None:
        return ""
    payload = annotations.model_dump()
    tags = payload.get("searchTags")
    category = payload.get("searchCategory")
    segments: list[str] = []
    if isinstance(category, str) and category.strip():
        segments.append(category)
    if isinstance(tags, list):
        for tag in tags:
            if isinstance(tag, str) and tag.strip():
                segments.append(tag)
    return " ".join(segments)


def _build_tool_document_text(tool: "Tool") -> str:
    parameter_text = _build_parameter_text(tool.parameters)
    parts = [tool.name]
    if "_" in tool.name:
        parts.append(tool.name.replace("_", " "))
    parts.extend(
        [
            tool.description,
            parameter_text,
            _build_tool_search_metadata_text(tool.annotations),
        ]
    )
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
