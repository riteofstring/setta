from litellm.types.llms.openai import ChatCompletionToolParam
from mcp.types import CallToolResult

from setta.mcp.tool_metadata import SettaToolAnnotations


class NoopMCPClient:
    def __init__(self) -> None:
        self.tool_annotations_by_name: dict[str, SettaToolAnnotations | None] = {}

    def init_tool_definitions_for_servers(
        self, _server_ids: set[str]
    ) -> dict[str, ChatCompletionToolParam]:
        return {}

    def discoverable_tool_definitions_for_servers(
        self, _server_ids: set[str]
    ) -> dict[str, ChatCompletionToolParam]:
        return {}

    def tool_annotations_for_servers(
        self, _server_ids: set[str]
    ) -> dict[str, SettaToolAnnotations | None]:
        return {}

    async def call_tool(
        self,
        tool_name: str,
        _tool_args: dict,
        *,
        meta: dict | None = None,
    ) -> CallToolResult:
        raise ValueError(
            f"MCP tool calls are disabled (attempted {tool_name}, meta={meta})."
        )

    async def connect_to_servers(self, _retry_delay: int = 1) -> None:
        return None

    async def stop(self) -> None:
        return None

    def __bool__(self) -> bool:
        return False
