from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, split_namespaced_tool_name
from setta.types.chat_messages import ToolCall, ToolChatMessage
from setta.utils.timestamps import get_now_timestamp


class ToolRunner:
    def __init__(
        self,
        mcp_client: MultiMCPClient,
        *,
        allowed_server_ids: set[str] | None = None,
        share_session_id: str | None = None,
    ) -> None:
        self._mcp_client = mcp_client
        self._allowed_server_ids = allowed_server_ids
        self._share_session_id = share_session_id

    async def run(self, tool_calls: list[ToolCall]) -> list[ToolChatMessage]:
        results: list[ToolChatMessage] = []
        for tool_call in tool_calls:
            results.append(await self._run_single(tool_call))
        return results

    async def _run_single(self, tool_call: ToolCall) -> ToolChatMessage:
        tool_name = tool_call.function.name.strip()
        if not tool_name:
            raise ValueError("Tool call missing function name")
        self._validate_tool(tool_name)
        arguments = dict(tool_call.function.arguments or {})
        started_at = get_now_timestamp()
        meta = self._build_meta(tool_name)
        call_result = await self._mcp_client.call_tool(
            tool_name,
            arguments,
            meta=meta,
        )
        completed_at = get_now_timestamp()
        return ToolChatMessage(
            tool_call_id=tool_call.id,
            tool_name=tool_name,
            arguments=arguments,
            content=call_result.content,
            is_error=call_result.isError,
            result=call_result.model_dump(),
            started_at=started_at,
            completed_at=completed_at,
        )

    def _validate_tool(self, tool_name: str) -> None:
        route = self._mcp_client.routing.get(tool_name)
        if not route:
            raise KeyError(f"MCP tool '{tool_name}' is not registered")
        if self._allowed_server_ids is None:
            return
        server_id, _ = route
        if server_id not in self._allowed_server_ids:
            raise KeyError(f"MCP tool '{tool_name}' is not allowed for this chat")

    def _build_meta(self, tool_name: str) -> dict[str, str] | None:
        if not self._share_session_id:
            return None
        server_id, _ = split_namespaced_tool_name(tool_name)
        if server_id != SETTA_MCP_SERVER_ID:
            return None
        return {"shareSessionId": self._share_session_id}
