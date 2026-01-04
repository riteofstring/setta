# some parts borrowed from https://github.com/tadata-org/fastapi_mcp/blob/main/fastapi_mcp/server.py

import inspect
import logging
import re
from functools import wraps
from typing import TYPE_CHECKING, Any, Callable

import docstring_parser
from fastapi import FastAPI, Request
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.server import Context
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

_CATCH_ALL_PATH = "/{full_path:path}"


def _move_catch_all_route_to_end(app: FastAPI) -> None:
    routes = list(app.router.routes)
    catch_all = [
        route for route in routes if getattr(route, "path", None) == _CATCH_ALL_PATH
    ]
    if not catch_all:
        return
    app.router.routes = [
        route for route in routes if route not in catch_all
    ] + catch_all


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
        _move_catch_all_route_to_end(app)

        self.add_setta_tools()
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
            context_kwargs = {k: v for k, v in kwargs.items() if isinstance(v, Context)}
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
