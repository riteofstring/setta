import asyncio
import logging
from contextlib import AsyncExitStack
from typing import TYPE_CHECKING, Callable

import mcp.types as types
from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.types import Tool

from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
from setta.types.llm_config import MCPServerConfig
from setta.utils.constants import C

if TYPE_CHECKING:
    from litellm.types.llms.openai import ChatCompletionToolParam

logger = logging.getLogger(__name__)


class MCPServerClient:
    """Client wrapper for a single MCP server."""

    def __init__(
        self,
        server_id: str,
        config: MCPServerConfig,
        *,
        on_tools_updated: Callable[[], None] | None = None,
    ) -> None:
        self.server_id = server_id
        self._transport = config.transport
        self._url: str | None = None
        self._headers: dict[str, str] = {}
        self._command: str | None = None
        self._args: list[str] = []
        self._env: dict[str, str] = {}
        self._cwd: str | None = None
        if config.transport == "sse":
            if not config.url:
                raise ValueError(f"MCP server '{server_id}' requires a url")
            self._url = config.url
            self._headers = dict(config.headers)
        elif config.transport == "stdio":
            if not config.command:
                raise ValueError(f"MCP server '{server_id}' requires a command")
            self._command = config.command
            self._args = list(config.args)
            self._env = dict(config.env)
            self._cwd = config.cwd
        else:
            raise ValueError(
                f"MCP server '{server_id}' uses unsupported transport '{config.transport}'"
            )
        self._on_tools_updated = on_tools_updated
        self.session: ClientSession | None = None
        self.exit_stack = AsyncExitStack()
        self.init_tool_definitions: dict[str, "ChatCompletionToolParam"] = {}
        self.discoverable_tool_definitions: dict[str, "ChatCompletionToolParam"] = {}
        self.tool_annotations_by_name: dict[str, SettaToolAnnotations] = {}

    async def connect_to_server(self, retry_delay: int = 1) -> None:
        """Connect to the MCP server and maintain tool caches."""

        target = self._url if self._transport == "sse" else self._command
        logger.info("Starting MCP client connection to %s (%s)", self.server_id, target)

        while True:
            try:
                logger.info("Attempting to connect to %s (%s)", self.server_id, target)
                if self._transport == "sse":
                    transport = await self.exit_stack.enter_async_context(
                        sse_client(url=self._url, headers=self._headers or None)
                    )
                else:
                    server_params = StdioServerParameters(
                        command=self._command,
                        args=list(self._args),
                        env=self._env or None,
                        cwd=self._cwd,
                    )
                    transport = await self.exit_stack.enter_async_context(
                        stdio_client(server_params)
                    )
                self.read, self.write = transport
                self.session = await self.exit_stack.enter_async_context(
                    ClientSession(self.read, self.write)
                )
                await self.session.initialize()
                logger.info("Connected to %s (%s)", self.server_id, target)
                response = await self.session.list_tools()
                self._update_tool_cache(list(response.tools))
                if self._on_tools_updated:
                    self._on_tools_updated()
                await self._keep_alive()
            except asyncio.TimeoutError:
                logger.warning(
                    "Connection to %s timed out; retrying in %s seconds",
                    self.server_id,
                    retry_delay,
                )
            except Exception:
                logger.exception(
                    "Connection to %s failed; retrying in %s seconds",
                    self.server_id,
                    retry_delay,
                )

            await self.exit_stack.aclose()
            self.session = None
            self.exit_stack = AsyncExitStack()
            await asyncio.sleep(retry_delay)

    async def _keep_alive(self) -> None:
        if not self.session:
            raise ValueError("MCP session must be initialized before keep-alive")

        while True:
            await asyncio.sleep(10)
            await self.session.send_ping()

    async def call_tool(
        self, tool_name: str, tool_args: dict[str, object]
    ) -> types.CallToolResult:
        if not self.session:
            raise ValueError("MCP session must be initialized before calling tools")

        return await self.session.call_tool(tool_name, tool_args)

    async def stop(self) -> None:
        await self.exit_stack.aclose()
        logger.info("MCP client resources cleaned up for %s", self.server_id)

    def _update_tool_cache(self, tools: list[Tool]) -> None:
        init_tools: dict[str, "ChatCompletionToolParam"] = {}
        discoverable_tools: dict[str, "ChatCompletionToolParam"] = {}
        tool_annotations_by_name: dict[str, SettaToolAnnotations] = {}
        for tool in tools:
            annotations = self._normalize_tool_annotations(tool.annotations)
            tool_type = annotations.settaToolType
            definition = self._convert_tool_to_llm_definition(tool)
            if tool_type == SettaToolType.init:
                init_tools[tool.name] = definition
            else:
                discoverable_tools[tool.name] = definition
            tool_annotations_by_name[tool.name] = annotations

        self.init_tool_definitions = init_tools
        self.discoverable_tool_definitions = discoverable_tools
        self.tool_annotations_by_name = tool_annotations_by_name

    @staticmethod
    def _normalize_tool_annotations(
        annotations: types.ToolAnnotations | None,
    ) -> SettaToolAnnotations:
        if annotations is None:
            return SettaToolAnnotations(settaToolType=SettaToolType.discoverable)
        payload = annotations.model_dump()
        if "settaToolType" not in payload:
            return SettaToolAnnotations(settaToolType=SettaToolType.discoverable)
        return SettaToolAnnotations.model_validate(payload)

    @staticmethod
    def _convert_tool_to_llm_definition(
        tool: Tool,
    ) -> "ChatCompletionToolParam":
        function_payload = {
            "name": tool.name,
            "description": tool.description or "",
            "parameters": tool.inputSchema or {},
        }
        return {"type": "function", "function": function_payload}


class MultiMCPClient:
    """Aggregate MCP client with namespaced tool definitions."""

    def __init__(self, server_configs: dict[str, MCPServerConfig]) -> None:
        self._server_clients: dict[str, MCPServerClient] = {}
        self.init_tool_definitions: dict[str, "ChatCompletionToolParam"] = {}
        self.discoverable_tool_definitions: dict[str, "ChatCompletionToolParam"] = {}
        self.tool_annotations_by_name: dict[str, SettaToolAnnotations] = {}
        self._tool_cache_version = 0
        for server_id, config in server_configs.items():
            self._validate_server_id(server_id)
            self._server_clients[server_id] = MCPServerClient(
                server_id,
                config,
                on_tools_updated=self._rebuild_tool_cache,
            )
        self._rebuild_tool_cache()

    @property
    def tool_cache_version(self) -> int:
        return self._tool_cache_version

    async def connect_to_servers(self, retry_delay: int = 1) -> None:
        if not self._server_clients:
            return
        async with asyncio.TaskGroup() as tg:
            for client in self._server_clients.values():
                tg.create_task(client.connect_to_server(retry_delay=retry_delay))

    async def call_tool(
        self, namespaced_tool_name: str, tool_args: dict[str, object]
    ) -> types.CallToolResult:
        server_id, tool_name = self._split_namespaced_tool_name(namespaced_tool_name)
        server_client = self._get_server_client(server_id)
        return await server_client.call_tool(tool_name, tool_args)

    async def stop(self) -> None:
        async with asyncio.TaskGroup() as tg:
            for client in self._server_clients.values():
                tg.create_task(client.stop())

    def _get_server_client(self, server_id: str) -> MCPServerClient:
        if server_id not in self._server_clients:
            raise KeyError(f"MCP server '{server_id}' is not registered")
        return self._server_clients[server_id]

    def _rebuild_tool_cache(self) -> None:
        init_tools: dict[str, "ChatCompletionToolParam"] = {}
        discoverable_tools: dict[str, "ChatCompletionToolParam"] = {}
        tool_annotations_by_name: dict[str, SettaToolAnnotations] = {}
        for server_id, client in self._server_clients.items():
            for tool_name, definition in client.init_tool_definitions.items():
                namespaced_name = self._build_namespaced_tool_name(server_id, tool_name)
                if tool_name not in client.tool_annotations_by_name:
                    raise KeyError(
                        f"MCP server '{server_id}' missing annotations for '{tool_name}'"
                    )
                init_tools[namespaced_name] = self._namespace_tool_definition(
                    server_id, tool_name, definition
                )
                tool_annotations_by_name[namespaced_name] = (
                    client.tool_annotations_by_name[tool_name]
                )
            for tool_name, definition in client.discoverable_tool_definitions.items():
                namespaced_name = self._build_namespaced_tool_name(server_id, tool_name)
                if tool_name not in client.tool_annotations_by_name:
                    raise KeyError(
                        f"MCP server '{server_id}' missing annotations for '{tool_name}'"
                    )
                discoverable_tools[namespaced_name] = self._namespace_tool_definition(
                    server_id, tool_name, definition
                )
                tool_annotations_by_name[namespaced_name] = (
                    client.tool_annotations_by_name[tool_name]
                )

        self.init_tool_definitions = init_tools
        self.discoverable_tool_definitions = discoverable_tools
        self.tool_annotations_by_name = tool_annotations_by_name
        self._tool_cache_version += 1

    @staticmethod
    def _build_namespaced_tool_name(server_id: str, tool_name: str) -> str:
        separator = C.MCP_TOOL_NAMESPACE_SEPARATOR
        return f"{server_id}{separator}{tool_name}"

    @staticmethod
    def _namespace_tool_definition(
        server_id: str,
        tool_name: str,
        definition: "ChatCompletionToolParam",
    ) -> "ChatCompletionToolParam":
        namespaced_name = MultiMCPClient._build_namespaced_tool_name(
            server_id, tool_name
        )
        payload = dict(definition)
        function_payload = payload.get("function")
        if not isinstance(function_payload, dict):
            raise ValueError(
                f"Tool definition for '{namespaced_name}' is missing function payload"
            )
        updated_function_payload = dict(function_payload)
        updated_function_payload["name"] = namespaced_name
        payload["function"] = updated_function_payload
        return payload

    @staticmethod
    def _split_namespaced_tool_name(namespaced_tool_name: str) -> tuple[str, str]:
        separator = C.MCP_TOOL_NAMESPACE_SEPARATOR
        if separator not in namespaced_tool_name:
            raise ValueError(
                f"Tool name must be namespaced as '<server_id>{separator}<tool_name>'"
            )
        server_id, tool_name = namespaced_tool_name.split(separator, 1)
        if not server_id:
            raise ValueError("Tool name is missing server id")
        if not tool_name:
            raise ValueError("Tool name is missing tool name")
        return server_id, tool_name

    @staticmethod
    def _validate_server_id(server_id: str) -> None:
        if not server_id:
            raise ValueError("MCP server id must not be empty")
        separator = C.MCP_TOOL_NAMESPACE_SEPARATOR
        if separator in server_id:
            raise ValueError(
                f"MCP server id '{server_id}' cannot include '{separator}'"
            )
        for char in server_id:
            if char.isalnum() or char in "_-":
                continue
            raise ValueError(
                f"MCP server id '{server_id}' must use letters, numbers, '_' or '-'"
            )
