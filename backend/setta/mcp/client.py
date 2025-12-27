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
from mcp.server.stdio import stdio_server
from mcp.shared.message import SessionMessage
from mcp.types import Tool

from setta.logging.config import configure_logging
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
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


class MCPClient:
    """Unified interface for Setta MCP access."""

    def __init__(self, server_url: str):
        self.server_url = server_url
        self.session: ClientSession | None = None
        self.exit_stack = AsyncExitStack()
        self.init_tool_definitions: dict[str, ChatCompletionToolParam] = {}
        self.discoverable_tool_definitions: dict[str, ChatCompletionToolParam] = {}
        self.tool_annotations_by_name: dict[str, SettaToolAnnotations] = {}

    async def connect_to_server(self, retry_delay: int = 1) -> None:
        """Connect to the MCP server over SSE and maintain tool caches."""

        url = self.server_url
        logger.info("Starting MCP client connection to %s", url)

        while True:
            try:
                logger.info("Attempting to connect to %s", url)
                stdio_transport = await self.exit_stack.enter_async_context(
                    sse_client(url=url)
                )
                self.read, self.write = stdio_transport
                self.session = await self.exit_stack.enter_async_context(
                    ClientSession(self.read, self.write)
                )
                await self.session.initialize()
                logger.info("Connected to %s", url)
                response = await self.session.list_tools()
                self._update_tool_cache(list(response.tools))
                await self._keep_alive()
            except asyncio.TimeoutError:
                logger.warning(
                    "Connection to %s timed out; retrying in %s seconds",
                    url,
                    retry_delay,
                )
            except Exception:
                logger.exception(
                    "Connection to %s failed; retrying in %s seconds",
                    url,
                    retry_delay,
                )

            await self.exit_stack.aclose()
            self.exit_stack = AsyncExitStack()
            await asyncio.sleep(retry_delay)

    async def _keep_alive(self) -> None:
        if not self.session:
            raise ValueError("MCP session must be initialized before keep-alive")

        while True:
            await asyncio.sleep(10)
            await self.session.send_ping()

    async def call_tool(self, tool_name: str, tool_args: dict) -> types.CallToolResult:
        if not self.session:
            raise ValueError("MCP session must be initialized before calling tools")

        return await self.session.call_tool(tool_name, tool_args)

    async def stop(self) -> None:
        await self.exit_stack.aclose()
        logger.info("MCP client resources cleaned up successfully")

    def _update_tool_cache(self, tools: list[Tool]) -> None:
        init_tools: dict[str, ChatCompletionToolParam] = {}
        discoverable_tools: dict[str, ChatCompletionToolParam] = {}
        tool_annotations_by_name: dict[str, SettaToolAnnotations] = {}
        for tool in tools:
            if tool.annotations is None:
                raise ValueError(f"MCP tool {tool.name} is missing annotations")
            annotations = SettaToolAnnotations.model_validate(
                tool.annotations.model_dump()
            )
            tool_type = SettaToolType(annotations.settaToolType)
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
    def _convert_tool_to_llm_definition(tool: Tool) -> ChatCompletionToolParam:
        function_payload: ChatCompletionToolParamFunctionChunk = {
            "name": tool.name,
            "description": tool.description or "",
            "parameters": tool.inputSchema or {},
        }
        return {"type": "function", "function": function_payload}

    async def run_stdio_bridge(self, verbose: bool = False) -> None:
        config = BridgeConfig(backend_url=self.server_url, verbose=verbose)
        await run_stdio_bridge(config)


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
    client = MCPClient(config.backend_url)
    try:
        asyncio.run(client.run_stdio_bridge(verbose=config.verbose))
    except KeyboardInterrupt:
        logger.info("Bridge interrupted, shutting down")
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
