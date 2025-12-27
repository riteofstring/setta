import argparse
import asyncio
import logging
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Sequence

import mcp.types as types
from anyio.streams.memory import (
    MemoryObjectReceiveStream,
    MemoryObjectSendStream,
)
from litellm.types.llms.openai import (
    ChatCompletionToolParam,
    ChatCompletionToolParamFunctionChunk,
)
from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.streamable_http import streamable_http_client
from mcp.server.stdio import stdio_server
from mcp.shared.message import SessionMessage
from mcp.types import Tool

from setta.logging.config import configure_logging
from setta.mcp.namespacing import LOCAL_SEARCH_TOOL_NAME, build_namespaced_tool_name
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
from setta.types.llm_config import MCPServerConfig
from setta.utils.constants import C

logger = logging.getLogger(__name__)


@dataclass
class BridgeConfig:
    backend_url: str
    verbose: bool


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="setta.mcp.client",
        description="Connect to Setta's MCP endpoint or run the stdio bridge.",
    )
    parser.add_argument(
        "--backend",
        default=f"{C.BACKEND}/mcp",
        help="Full URL to the Setta MCP endpoint (default: %(default)s).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug logging for the bridge.",
    )
    return parser


def parse_args(argv: Sequence[str] | None = None) -> BridgeConfig:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    return BridgeConfig(
        backend_url=args.backend,
        verbose=args.verbose,
    )


@dataclass
class _ServerToolCache:
    init_tools: dict[str, ChatCompletionToolParam]
    discoverable_tools: dict[str, ChatCompletionToolParam]
    annotations: dict[str, SettaToolAnnotations | None]
    routing: dict[str, tuple[str, str]]


class MultiMCPClient:
    """Unified interface for multi-server MCP access."""

    def __init__(self, server_configs: dict[str, MCPServerConfig]):
        self.server_configs = dict(server_configs)
        self._sessions: dict[str, ClientSession] = {}
        self._exit_stacks: dict[str, AsyncExitStack] = {}
        self._connection_tasks: dict[str, asyncio.Task[None]] = {}
        self._server_tool_cache: dict[str, _ServerToolCache] = {}
        self.init_tool_definitions: dict[str, ChatCompletionToolParam] = {}
        self.discoverable_tool_definitions: dict[str, ChatCompletionToolParam] = {}
        self.tool_annotations_by_name: dict[str, SettaToolAnnotations | None] = {}
        self.routing: dict[str, tuple[str, str]] = {}

    async def connect_to_servers(self, retry_delay: int = 1) -> None:
        if self._connection_tasks:
            logger.warning("MCP client already running; skipping duplicate start")
            return
        if not self.server_configs:
            logger.warning("No MCP servers configured; skipping connections")
            return
        tasks: list[asyncio.Task[None]] = []
        for server_id, config in self.server_configs.items():
            task = asyncio.create_task(
                self._connect_server_loop(server_id, config, retry_delay)
            )
            self._connection_tasks[server_id] = task
            tasks.append(task)
        await asyncio.gather(*tasks)

    async def call_tool(self, tool_name: str, tool_args: dict) -> types.CallToolResult:
        route = self.routing.get(tool_name)
        if not route:
            raise KeyError(f"MCP tool '{tool_name}' is not registered")
        server_id, tool_id = route
        session = self._sessions.get(server_id)
        if not session:
            raise ValueError(f"MCP session for server '{server_id}' is not initialized")
        return await session.call_tool(tool_id, tool_args)

    async def stop(self) -> None:
        for task in self._connection_tasks.values():
            task.cancel()
        self._connection_tasks.clear()
        for exit_stack in self._exit_stacks.values():
            await exit_stack.aclose()
        self._exit_stacks.clear()
        self._sessions.clear()
        self._server_tool_cache.clear()
        self._rebuild_tool_cache()
        logger.info("MCP client resources cleaned up successfully")

    def init_tool_definitions_for_servers(
        self, server_ids: set[str]
    ) -> dict[str, ChatCompletionToolParam]:
        return self._filter_tool_definitions(self.init_tool_definitions, server_ids)

    def discoverable_tool_definitions_for_servers(
        self, server_ids: set[str]
    ) -> dict[str, ChatCompletionToolParam]:
        return self._filter_tool_definitions(
            self.discoverable_tool_definitions, server_ids
        )

    def tool_annotations_for_servers(
        self, server_ids: set[str]
    ) -> dict[str, SettaToolAnnotations | None]:
        return self._filter_tool_annotations(self.tool_annotations_by_name, server_ids)

    def _filter_tool_definitions(
        self,
        definitions: dict[str, ChatCompletionToolParam],
        server_ids: set[str],
    ) -> dict[str, ChatCompletionToolParam]:
        return {
            name: payload
            for name, payload in definitions.items()
            if self._tool_belongs_to_server(name, server_ids)
        }

    def _filter_tool_annotations(
        self,
        annotations: dict[str, SettaToolAnnotations | None],
        server_ids: set[str],
    ) -> dict[str, SettaToolAnnotations | None]:
        return {
            name: payload
            for name, payload in annotations.items()
            if self._tool_belongs_to_server(name, server_ids)
        }

    def _tool_belongs_to_server(self, name: str, server_ids: set[str]) -> bool:
        route = self.routing.get(name)
        if not route:
            return False
        return route[0] in server_ids

    async def _connect_server_loop(
        self,
        server_id: str,
        config: MCPServerConfig,
        retry_delay: int,
    ) -> None:
        logger.info("Starting MCP client connection to %s (%s)", server_id, config)

        while True:
            try:
                logger.info("Attempting to connect to %s", server_id)
                await self._connect_server_once(server_id, config)
            except asyncio.TimeoutError:
                logger.warning(
                    "Connection to %s timed out; retrying in %s seconds",
                    server_id,
                    retry_delay,
                )
            except Exception:
                logger.exception(
                    "Connection to %s failed; retrying in %s seconds",
                    server_id,
                    retry_delay,
                )

            await self._cleanup_server(server_id)
            await asyncio.sleep(retry_delay)

    async def _connect_server_once(
        self, server_id: str, config: MCPServerConfig
    ) -> None:
        exit_stack = AsyncExitStack()
        self._exit_stacks[server_id] = exit_stack
        read_stream, write_stream = await self._open_transport(exit_stack, config)
        session = await exit_stack.enter_async_context(
            ClientSession(read_stream, write_stream)
        )
        self._sessions[server_id] = session
        await session.initialize()
        logger.info("Connected to %s", server_id)
        response = await session.list_tools()
        self._update_tool_cache_for_server(server_id, list(response.tools))
        await self._keep_alive(server_id)

    async def _open_transport(
        self,
        exit_stack: AsyncExitStack,
        config: MCPServerConfig,
    ):
        if config.transport == "sse":
            read_stream, write_stream = await exit_stack.enter_async_context(
                sse_client(url=config.url or "")
            )
            return read_stream, write_stream
        if config.transport == "streamable_http":
            read_stream, write_stream, _ = await exit_stack.enter_async_context(
                streamable_http_client(url=config.url or "")
            )
            return read_stream, write_stream
        params = StdioServerParameters(
            command=config.command or "",
            args=list(config.args),
            env=config.env,
            cwd=config.cwd,
            encoding=config.encoding,
            encoding_error_handler=config.encoding_error_handler,
        )
        read_stream, write_stream = await exit_stack.enter_async_context(
            stdio_client(params)
        )
        return read_stream, write_stream

    async def _keep_alive(self, server_id: str) -> None:
        session = self._sessions.get(server_id)
        if not session:
            raise ValueError("MCP session must be initialized before keep-alive")

        while True:
            await asyncio.sleep(10)
            await session.send_ping()

    async def _cleanup_server(self, server_id: str) -> None:
        exit_stack = self._exit_stacks.pop(server_id, None)
        if exit_stack is None:
            return
        await exit_stack.aclose()
        self._sessions.pop(server_id, None)
        self._server_tool_cache.pop(server_id, None)
        self._rebuild_tool_cache()

    def _update_tool_cache_for_server(self, server_id: str, tools: list[Tool]) -> None:
        init_tools: dict[str, ChatCompletionToolParam] = {}
        discoverable_tools: dict[str, ChatCompletionToolParam] = {}
        annotations_by_name: dict[str, SettaToolAnnotations | None] = {}
        routing: dict[str, tuple[str, str]] = {}
        for tool in tools:
            if tool.name == LOCAL_SEARCH_TOOL_NAME:
                continue
            annotations: SettaToolAnnotations | None = None
            tool_type = SettaToolType.discoverable
            if tool.annotations is not None:
                raw_annotations = tool.annotations.model_dump()
                if "settaToolType" in raw_annotations:
                    annotations = SettaToolAnnotations.model_validate(raw_annotations)
                    tool_type = SettaToolType(annotations.settaToolType)
            namespaced_name = build_namespaced_tool_name(server_id, tool.name)
            definition = self._convert_tool_to_llm_definition(
                tool, namespaced_name=namespaced_name
            )
            if tool_type == SettaToolType.init:
                init_tools[namespaced_name] = definition
            else:
                discoverable_tools[namespaced_name] = definition
            annotations_by_name[namespaced_name] = annotations
            routing[namespaced_name] = (server_id, tool.name)

        self._server_tool_cache[server_id] = _ServerToolCache(
            init_tools=init_tools,
            discoverable_tools=discoverable_tools,
            annotations=annotations_by_name,
            routing=routing,
        )
        self._rebuild_tool_cache()

    def _rebuild_tool_cache(self) -> None:
        init_tools: dict[str, ChatCompletionToolParam] = {}
        discoverable_tools: dict[str, ChatCompletionToolParam] = {}
        annotations_by_name: dict[str, SettaToolAnnotations | None] = {}
        routing: dict[str, tuple[str, str]] = {}
        for cache in self._server_tool_cache.values():
            init_tools.update(cache.init_tools)
            discoverable_tools.update(cache.discoverable_tools)
            annotations_by_name.update(cache.annotations)
            routing.update(cache.routing)

        self.init_tool_definitions = init_tools
        self.discoverable_tool_definitions = discoverable_tools
        self.tool_annotations_by_name = annotations_by_name
        self.routing = routing

    @staticmethod
    def _convert_tool_to_llm_definition(
        tool: Tool, *, namespaced_name: str
    ) -> ChatCompletionToolParam:
        function_payload: ChatCompletionToolParamFunctionChunk = {
            "name": namespaced_name,
            "description": tool.description or "",
            "parameters": tool.inputSchema or {},
        }
        return {"type": "function", "function": function_payload}


async def run_stdio_bridge(config: BridgeConfig) -> None:
    logger.debug("Starting stdio bridge with config: %s", config)
    async with AsyncExitStack() as stack:
        stdio_read, stdio_write = await stack.enter_async_context(stdio_server())
        backend_read, backend_write = await stack.enter_async_context(
            sse_client(url=config.backend_url)
        )
        logger.info("Connected to Setta backend at %s", config.backend_url)
        async with asyncio.TaskGroup() as tg:
            tg.create_task(
                _forward_stdio_to_backend(
                    stdio_read,
                    backend_write,
                )
            )
            tg.create_task(
                _forward_messages(
                    "backend->stdio",
                    backend_read,
                    stdio_write,
                )
            )


async def _forward_messages(
    label: str,
    source: MemoryObjectReceiveStream[SessionMessage | Exception],
    destination: MemoryObjectSendStream[SessionMessage],
) -> None:
    async with source:
        async for payload in source:
            if isinstance(payload, Exception):
                logger.error("[%s] transport exception: %s", label, payload)
                continue
            await destination.send(payload)
    await destination.aclose()
    logger.info("[%s] stream closed", label)


async def _forward_stdio_to_backend(
    source: MemoryObjectReceiveStream[SessionMessage | Exception],
    destination: MemoryObjectSendStream[SessionMessage],
) -> None:
    async with source:
        async for payload in source:
            if isinstance(payload, Exception):
                logger.error("[stdio->backend] transport exception: %s", payload)
                continue
            await destination.send(payload)
    await destination.aclose()
    logger.info("[stdio->backend] stream closed")


def main(argv: Sequence[str] | None = None) -> int:
    config = parse_args(argv)
    level_override = "DEBUG" if config.verbose else None
    configure_logging(level_override=level_override)
    try:
        asyncio.run(run_stdio_bridge(config))
    except KeyboardInterrupt:
        logger.info("Bridge interrupted, shutting down")
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
