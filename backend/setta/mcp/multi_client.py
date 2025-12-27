import asyncio
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import mcp.types as types
from mcp import ClientSession
from mcp.client.session_group import ClientSessionGroup, SseServerParameters
from mcp.client.stdio import StdioServerParameters

from setta.logging.errors import log_failure
from setta.logging.tasks import spawn_background_task
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
from setta.types.llm_config import MCPServerConfig
from setta.utils.constants import C

if TYPE_CHECKING:
    from litellm.types.llms.openai import ChatCompletionToolParam

logger = logging.getLogger(__name__)


@dataclass
class _ServerState:
    server_id: str
    config: MCPServerConfig
    session: ClientSession | None = None
    stop_event: asyncio.Event = field(default_factory=asyncio.Event)
    init_tool_definitions: dict[str, "ChatCompletionToolParam"] = field(
        default_factory=dict
    )
    discoverable_tool_definitions: dict[str, "ChatCompletionToolParam"] = field(
        default_factory=dict
    )
    tool_annotations_by_name: dict[str, SettaToolAnnotations] = field(
        default_factory=dict
    )


class MultiMCPClient:
    """Aggregate MCP client with namespaced tool definitions."""

    def __init__(self, server_configs: dict[str, MCPServerConfig]) -> None:
        self._server_states: dict[str, _ServerState] = {}
        self._connect_tasks: dict[str, asyncio.Task[None]] = {}
        self._connect_lock = asyncio.Lock()
        self._group_lock = asyncio.Lock()
        self._group_ready = False
        self._component_name_prefixes: dict[int, str] = {}
        self._component_name_counts: dict[str, int] = {}
        self._group = ClientSessionGroup(
            component_name_hook=self._component_name_hook,
        )
        self.init_tool_definitions: dict[str, "ChatCompletionToolParam"] = {}
        self.discoverable_tool_definitions: dict[str, "ChatCompletionToolParam"] = {}
        self.tool_annotations_by_name: dict[str, SettaToolAnnotations] = {}
        self._tool_cache_version = 0
        for server_id, config in server_configs.items():
            self._validate_server_id(server_id)
            self._server_states[server_id] = _ServerState(
                server_id=server_id,
                config=config,
            )
        self._rebuild_tool_cache()

    @property
    def tool_cache_version(self) -> int:
        return self._tool_cache_version

    async def connect_to_servers(self, retry_delay: int = 1) -> None:
        if not self._server_states:
            return
        await self._ensure_group_ready()
        async with self._connect_lock:
            for server_id, state in self._server_states.items():
                self._ensure_connect_task(server_id, state, retry_delay)

    async def update_server_configs(
        self,
        server_configs: dict[str, MCPServerConfig],
        retry_delay: int = 1,
    ) -> None:
        await self._ensure_group_ready()
        stop_states: list[_ServerState] = []
        cancel_tasks: list[asyncio.Task[None]] = []
        async with self._connect_lock:
            current_ids = set(self._server_states)
            new_ids = set(server_configs)
            removed_ids = current_ids - new_ids
            added_ids = new_ids - current_ids
            updated_ids: set[str] = set()
            for server_id in current_ids & new_ids:
                state = self._server_states[server_id]
                if not self._config_matches(state.config, server_configs[server_id]):
                    updated_ids.add(server_id)

            for server_id in removed_ids | updated_ids:
                state = self._server_states.pop(server_id, None)
                if state:
                    state.stop_event.set()
                    stop_states.append(state)
                task = self._connect_tasks.pop(server_id, None)
                if task:
                    cancel_tasks.append(task)

            for server_id in added_ids | updated_ids:
                self._validate_server_id(server_id)
                state = _ServerState(
                    server_id=server_id,
                    config=server_configs[server_id],
                )
                self._server_states[server_id] = state
                self._ensure_connect_task(server_id, state, retry_delay)

            for server_id, state in self._server_states.items():
                self._ensure_connect_task(server_id, state, retry_delay)

            if removed_ids or added_ids or updated_ids:
                self._rebuild_tool_cache()

        for task in cancel_tasks:
            task.cancel()
        if cancel_tasks:
            await asyncio.gather(*cancel_tasks, return_exceptions=True)
        if stop_states:
            await asyncio.gather(
                *(self._disconnect_session(state) for state in stop_states),
                return_exceptions=True,
            )

    async def call_tool(
        self, namespaced_tool_name: str, tool_args: dict[str, object]
    ) -> types.CallToolResult:
        server_id, tool_name = self._split_namespaced_tool_name(namespaced_tool_name)
        session = self._get_server_session(server_id)
        return await session.call_tool(tool_name, tool_args)

    async def stop(self) -> None:
        async with self._connect_lock:
            tasks = list(self._connect_tasks.values())
            self._connect_tasks = {}
            states = list(self._server_states.values())
            for state in states:
                state.stop_event.set()
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        if states:
            await asyncio.gather(
                *(self._disconnect_session(state) for state in states),
                return_exceptions=True,
            )
        if self._group_ready:
            await self._group.__aexit__(None, None, None)
            self._group_ready = False
        logger.info("MCP client resources cleaned up successfully")

    def _component_name_hook(
        self,
        name: str,
        server_info: types.Implementation,
    ) -> str:
        key = id(server_info)
        prefix = self._component_name_prefixes.get(key)
        if prefix is None:
            base = server_info.name or "mcp"
            count = self._component_name_counts.get(base, 0) + 1
            self._component_name_counts[base] = count
            suffix = f"-{count}" if count > 1 else ""
            prefix = f"{base}{suffix}"
            self._component_name_prefixes[key] = prefix
        return f"{prefix}{C.MCP_TOOL_NAMESPACE_SEPARATOR}{name}"

    async def _ensure_group_ready(self) -> None:
        if self._group_ready:
            return
        async with self._group_lock:
            if self._group_ready:
                return
            await self._group.__aenter__()
            self._group_ready = True

    def _get_server_state(self, server_id: str) -> _ServerState:
        if server_id not in self._server_states:
            raise KeyError(f"MCP server '{server_id}' is not registered")
        return self._server_states[server_id]

    def _get_server_session(self, server_id: str) -> ClientSession:
        state = self._get_server_state(server_id)
        if not state.session:
            raise ValueError(f"MCP server '{server_id}' is not connected")
        return state.session

    def _ensure_connect_task(
        self,
        server_id: str,
        state: _ServerState,
        retry_delay: int,
    ) -> None:
        task = self._connect_tasks.get(server_id)
        if task is not None and not task.done():
            return
        self._connect_tasks[server_id] = spawn_background_task(
            lambda: self._connect_loop(server_id, state, retry_delay),
            label=f"mcp-client-{server_id}",
            logger=logger,
            extra_values={
                "service": "mcp-client",
                "server_id": server_id,
                "transport": state.config.transport,
            },
        )

    async def _connect_loop(
        self,
        server_id: str,
        state: _ServerState,
        retry_delay: int,
    ) -> None:
        await self._ensure_group_ready()
        target = self._describe_target(state.config)
        logger.info("Starting MCP client connection to %s (%s)", server_id, target)

        while not state.stop_event.is_set():
            try:
                logger.info("Attempting to connect to %s (%s)", server_id, target)
                session = await self._connect_session(state.config)
                state.session = session
                logger.info("Connected to %s (%s)", server_id, target)
                await self._refresh_tool_cache(server_id, state, session)
                await self._keep_alive(state)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log_failure(
                    exc,
                    label="mcp-client-connect",
                    logger=logger,
                    handled=True,
                )
            finally:
                await self._disconnect_session(state)

            if state.stop_event.is_set():
                break
            await asyncio.sleep(retry_delay)

    async def _connect_session(self, config: MCPServerConfig) -> ClientSession:
        if config.transport == "sse":
            if not config.url:
                raise ValueError("SSE MCP server requires url")
            params = SseServerParameters(
                url=config.url,
                headers=dict(config.headers) or None,
            )
        elif config.transport == "stdio":
            if not config.command:
                raise ValueError("stdio MCP server requires command")
            params = StdioServerParameters(
                command=config.command,
                args=list(config.args),
                env=dict(config.env) or None,
                cwd=config.cwd,
            )
        else:
            raise ValueError(
                f"MCP server transport '{config.transport}' is not supported"
            )
        return await self._group.connect_to_server(params)

    async def _refresh_tool_cache(
        self,
        server_id: str,
        state: _ServerState,
        session: ClientSession,
    ) -> None:
        response = await session.list_tools()
        init_tools: dict[str, "ChatCompletionToolParam"] = {}
        discoverable_tools: dict[str, "ChatCompletionToolParam"] = {}
        tool_annotations_by_name: dict[str, SettaToolAnnotations] = {}
        for tool in response.tools:
            annotations = self._normalize_tool_annotations(tool.annotations)
            definition = self._convert_tool_to_llm_definition(tool)
            if annotations.settaToolType == SettaToolType.init:
                init_tools[tool.name] = definition
            else:
                discoverable_tools[tool.name] = definition
            tool_annotations_by_name[tool.name] = annotations
        state.init_tool_definitions = init_tools
        state.discoverable_tool_definitions = discoverable_tools
        state.tool_annotations_by_name = tool_annotations_by_name
        self._rebuild_tool_cache()
        logger.info(
            "Updated MCP tool cache for %s (%s init, %s discoverable)",
            server_id,
            len(init_tools),
            len(discoverable_tools),
        )

    async def _keep_alive(self, state: _ServerState) -> None:
        session = state.session
        if not session:
            raise ValueError("MCP session must be initialized before keep-alive")

        while not state.stop_event.is_set():
            await asyncio.sleep(10)
            if state.stop_event.is_set():
                break
            await session.send_ping()

    async def _disconnect_session(self, state: _ServerState) -> None:
        had_tools = bool(
            state.init_tool_definitions
            or state.discoverable_tool_definitions
            or state.tool_annotations_by_name
        )
        if had_tools:
            state.init_tool_definitions = {}
            state.discoverable_tool_definitions = {}
            state.tool_annotations_by_name = {}
            self._rebuild_tool_cache()

        session = state.session
        if not session:
            return
        state.session = None
        try:
            await self._group.disconnect_from_server(session)
        except Exception as exc:
            log_failure(
                exc,
                label="mcp-client-disconnect",
                logger=logger,
                handled=True,
            )

    @staticmethod
    def _describe_target(config: MCPServerConfig) -> str:
        if config.transport == "sse":
            return config.url or "(missing url)"
        if config.transport == "stdio":
            return config.command or "(missing command)"
        return config.transport

    @staticmethod
    def _config_matches(
        left: MCPServerConfig,
        right: MCPServerConfig,
    ) -> bool:
        return left.model_dump() == right.model_dump()

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
        tool: types.Tool,
    ) -> "ChatCompletionToolParam":
        function_payload = {
            "name": tool.name,
            "description": tool.description or "",
            "parameters": tool.inputSchema or {},
        }
        return {"type": "function", "function": function_payload}

    def _rebuild_tool_cache(self) -> None:
        init_tools: dict[str, "ChatCompletionToolParam"] = {}
        discoverable_tools: dict[str, "ChatCompletionToolParam"] = {}
        tool_annotations_by_name: dict[str, SettaToolAnnotations] = {}
        for server_id, state in self._server_states.items():
            for tool_name, definition in state.init_tool_definitions.items():
                namespaced_name = self._build_namespaced_tool_name(server_id, tool_name)
                if tool_name not in state.tool_annotations_by_name:
                    raise KeyError(
                        f"MCP server '{server_id}' missing annotations for '{tool_name}'"
                    )
                init_tools[namespaced_name] = self._namespace_tool_definition(
                    server_id,
                    tool_name,
                    definition,
                )
                tool_annotations_by_name[namespaced_name] = (
                    state.tool_annotations_by_name[tool_name]
                )
            for tool_name, definition in state.discoverable_tool_definitions.items():
                namespaced_name = self._build_namespaced_tool_name(server_id, tool_name)
                if tool_name not in state.tool_annotations_by_name:
                    raise KeyError(
                        f"MCP server '{server_id}' missing annotations for '{tool_name}'"
                    )
                discoverable_tools[namespaced_name] = self._namespace_tool_definition(
                    server_id,
                    tool_name,
                    definition,
                )
                tool_annotations_by_name[namespaced_name] = (
                    state.tool_annotations_by_name[tool_name]
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
            server_id,
            tool_name,
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
