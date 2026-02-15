from dataclasses import dataclass

from setta.agentic.completion_report import REPORT_COMPLETION_STATUS_TOOL_NAME
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, split_namespaced_tool_name

_REQUIRED_EXTERNAL_TOOLS: tuple[str, ...] = (
    "set_agentic_context",
    REPORT_COMPLETION_STATUS_TOOL_NAME,
)


@dataclass(frozen=True)
class ExternalToolAllowlist:
    allow_all: bool
    tool_names: tuple[str, ...]


def build_external_tool_allowlist(
    tool_allowlist: list[str] | None,
    *,
    server_id: str = SETTA_MCP_SERVER_ID,
) -> tuple[ExternalToolAllowlist | None, str | None]:
    if not tool_allowlist:
        return None, None

    allow_all = False
    tool_names: set[str] = set()
    for entry in tool_allowlist:
        normalized = entry.strip()
        if not normalized:
            return None, "toolAllowlist entries must be non-empty strings"
        if normalized.startswith("mcp__"):
            normalized = normalized[len("mcp__") :]
        if "__" in normalized:
            parsed_server_id, tool_name = split_namespaced_tool_name(normalized)
            if not parsed_server_id or not tool_name:
                return None, f"Invalid tool allowlist entry: {entry}"
            if parsed_server_id != server_id:
                return (
                    None,
                    f"External tool allowlist only supports MCP server '{server_id}': {entry}",
                )
            tool_names.add(tool_name)
            continue
        if normalized == server_id:
            allow_all = True
            continue
        tool_names.add(normalized)

    if allow_all:
        return ExternalToolAllowlist(allow_all=True, tool_names=()), None
    if not tool_names:
        return None, None
    for tool_name in _REQUIRED_EXTERNAL_TOOLS:
        tool_names.add(tool_name)
    return (
        ExternalToolAllowlist(
            allow_all=False,
            tool_names=tuple(sorted(tool_names)),
        ),
        None,
    )
