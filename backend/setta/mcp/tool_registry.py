import inspect
import logging
import re
from collections.abc import Callable
from typing import Any

import docstring_parser
from mcp.server.fastmcp.tools import Tool, ToolManager
from mcp.types import Tool as MCPTool
from mcp.types import ToolAnnotations

from setta.mcp.tool_metadata import (
    SettaToolAnnotations,
    SettaToolType,
    get_ai_follow_tool_arguments,
    get_ai_follow_tool_result,
    get_tool_access,
    get_tool_argument_preview,
    get_tool_result_filter,
    get_tool_runtime_policy,
    get_tool_search_category,
    get_tool_search_tags,
)
from setta.mcp.tool_setup import SETTA_INIT_MCP_TOOLS, SETTA_MCP_TOOLS
from setta.utils.constants import C

logger = logging.getLogger(__name__)

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


def ensure_setta_mcp_tools_loaded() -> None:
    import setta.mcp.tools  # noqa: F401
    import setta.project_state.base_project_manager  # noqa: F401


def build_setta_tool_manager() -> ToolManager:
    ensure_setta_mcp_tools_loaded()
    tool_manager = ToolManager()
    for fn in SETTA_INIT_MCP_TOOLS:
        register_setta_tool(tool_manager, fn, SettaToolType.init)
    for fn in SETTA_MCP_TOOLS:
        register_setta_tool(tool_manager, fn, SettaToolType.discoverable)
    return tool_manager


def build_setta_tool_payloads() -> list[dict[str, Any]]:
    tool_manager = build_setta_tool_manager()
    tools = sorted(tool_manager.list_tools(), key=lambda tool: tool.name)
    return [_convert_tool_to_payload(tool) for tool in tools]


def register_setta_tool(
    tool_manager: ToolManager,
    fn: Callable[..., Any],
    tool_type: SettaToolType,
) -> Tool:
    annotations = _build_tool_annotations(fn, tool_type)
    doc_description, param_descriptions = extract_tool_docstrings(fn)
    tool = tool_manager.add_tool(
        fn,
        annotations=annotations,
        description=doc_description or "",
    )
    _apply_param_descriptions(tool.parameters, param_descriptions)
    _strip_hidden_fields(tool.parameters)
    return tool


def extract_tool_docstrings(
    func: Callable[..., Any],
) -> tuple[str | None, dict[str, str]]:
    docstring = inspect.getdoc(func)
    if not docstring:
        return None, {}

    try:
        parsed = docstring_parser.parse(docstring)
    except Exception as exc:
        logger.warning("Failed to parse docstring: %s", exc, exc_info=True)
        return None, {}

    param_docs: dict[str, str] = {}
    for param in parsed.params:
        if param.description:
            param_docs[param.arg_name] = param.description

    return parsed.description, param_docs


def _convert_tool_to_payload(tool: Tool) -> dict[str, Any]:
    payload = MCPTool(
        name=tool.name,
        title=tool.title,
        description=tool.description,
        inputSchema=tool.parameters,
        outputSchema=tool.output_schema,
        annotations=tool.annotations,
        icons=tool.icons,
        _meta=tool.meta,
    )
    return payload.model_dump(by_alias=True)


def _build_tool_annotations(
    fn: Callable[..., Any],
    tool_type: SettaToolType,
) -> ToolAnnotations:
    ai_follow_tool_arguments = get_ai_follow_tool_arguments(fn)
    ai_follow_tool_result = get_ai_follow_tool_result(fn)
    tool_argument_preview = get_tool_argument_preview(fn)
    tool_access = get_tool_access(fn)
    result_filter = get_tool_result_filter(fn)
    search_tags, search_category = _build_tool_search_metadata(
        fn.__name__,
        get_tool_search_tags(fn),
        get_tool_search_category(fn),
    )
    tool_runtime_policy = get_tool_runtime_policy(fn)
    access_type = "structural"
    requires_llm = False
    starts_run = False
    retry_on_disconnect = True
    id_paths_by_type: dict[str, list[str]] = {}
    default_target_singleton_section: str | None = None
    if tool_access is not None:
        access_type = tool_access.accessType
        retry_on_disconnect = tool_access.retryOnDisconnect
        id_paths_by_type = dict(tool_access.idPathsByType)
        default_target_singleton_section = tool_access.defaultTargetSingletonSection
    if tool_runtime_policy is not None:
        requires_llm = tool_runtime_policy.requiresLLM
        starts_run = tool_runtime_policy.startsRun
    if not id_paths_by_type and ai_follow_tool_arguments is not None:
        id_paths_by_type = dict(ai_follow_tool_arguments.pathsByIdType)
    return ToolAnnotations.model_validate(
        SettaToolAnnotations(
            settaToolType=tool_type,
            accessType=access_type,
            requiresLLM=requires_llm,
            startsRun=starts_run,
            retryOnDisconnect=retry_on_disconnect,
            idPathsByType=id_paths_by_type,
            defaultTargetSingletonSection=default_target_singleton_section,
            resultFilter=result_filter,
            aiFollowToolResult=ai_follow_tool_result,
            aiFollowToolArguments=ai_follow_tool_arguments,
            toolArgumentPreview=tool_argument_preview,
            searchTags=search_tags,
            searchCategory=search_category,
        ).model_dump()
    )


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


def _strip_hidden_fields(schema: dict[str, Any]) -> None:
    properties = schema.get("properties")
    if not isinstance(properties, dict):
        return
    hidden: list[str] = []
    for prop_name, prop_schema in properties.items():
        if not isinstance(prop_schema, dict):
            continue
        if prop_schema.get(C.MCP_HIDDEN_FIELD_SCHEMA_KEY):
            hidden.append(prop_name)
    for prop_name in hidden:
        properties.pop(prop_name, None)
    required = schema.get("required")
    if not isinstance(required, list):
        return
    schema["required"] = [name for name in required if name not in hidden]


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
