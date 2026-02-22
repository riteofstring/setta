import argparse
import asyncio
import logging
import os
import re
from contextlib import AsyncExitStack
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Literal, Sequence

import anyio
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
from mcp.shared._httpx_utils import create_mcp_http_client
from mcp.shared.message import SessionMessage
from mcp.types import Tool

from setta.auth.bootstrap import (
    extract_token_from_bootstrap_url,
    origin_from_backend_url,
    select_auth_cookie_name,
)
from setta.auth.cookies import auth_cookie_name
from setta.auth.manager import AUTH_COOKIE_MANAGER
from setta.auth.session import load_current_session_secret
from setta.logging.config import configure_logging
from setta.logging.errors import log_failure
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
from setta.types.llm_config import MCPServerConfig
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.routes import Route
from setta.utils.constants import C

if TYPE_CHECKING:  # pragma: no cover
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)

_ENV_PLACEHOLDER = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")
_MCP_RECONNECT_WAIT_SECONDS = 2.0
_MCP_RECONNECT_POLL_SECONDS = 0.05


class MissingMCPEnvVarError(ValueError):
    def __init__(self, var_name: str) -> None:
        super().__init__(
            f"MCP config references missing environment variable '{var_name}'"
        )
        self.var_name = var_name


def _resolve_env_placeholders(value: str) -> str:
    def replace(match: re.Match[str]) -> str:
        var_name = match.group(1)
        if var_name not in os.environ:
            raise MissingMCPEnvVarError(var_name)
        return os.environ[var_name]

    if "${" not in value:
        return value
    return _ENV_PLACEHOLDER.sub(replace, value)


def _resolve_env_args(args: list[str]) -> list[str]:
    return [_resolve_env_placeholders(arg) for arg in args]


def _resolve_env_mapping(env: dict[str, str] | None) -> dict[str, str] | None:
    if env is None:
        return None
    return {key: _resolve_env_placeholders(value) for key, value in env.items()}


def _format_exception_message(exc: BaseException) -> str:
    message = str(exc).strip()
    if message:
        return message
    return f"{type(exc).__name__}."


@dataclass
class BridgeConfig:
    backend_url: str
    verbose: bool
    bootstrap_token: str | None = field(default=None, repr=False)
    bootstrap_url: str | None = field(default=None, repr=False)


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
    parser.add_argument(
        "--token",
        dest="bootstrap_token",
        help="Bootstrap token for MCP authentication.",
    )
    parser.add_argument(
        "--bootstrap-url",
        help="Bootstrap URL containing a token fragment or query parameter.",
    )
    return parser


def parse_args(argv: Sequence[str] | None = None) -> BridgeConfig:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    return BridgeConfig(
        backend_url=args.backend,
        verbose=args.verbose,
        bootstrap_token=args.bootstrap_token,
        bootstrap_url=args.bootstrap_url,
    )


def _resolve_bridge_token(config: BridgeConfig) -> str | None:
    if config.bootstrap_token:
        token = config.bootstrap_token.strip()
        return token if token else None
    if config.bootstrap_url:
        return extract_token_from_bootstrap_url(config.bootstrap_url)
    return None


async def _consume_bootstrap_token(backend_url: str, token: str) -> str:
    origin = origin_from_backend_url(backend_url)
    consume_url = f"{origin}{Route.BOOTSTRAP_CONSUME.value}"
    async with create_mcp_http_client() as client:
        response = await client.post(consume_url, json={"token": token})
        response.raise_for_status()
    cookie_map = {cookie.name: cookie.value for cookie in response.cookies.jar}
    cookie_names = list(cookie_map.keys())
    if not cookie_names:
        raise ValueError("Bootstrap response did not include auth cookie.")
    cookie_name = select_auth_cookie_name(cookie_names)
    if not cookie_name:
        raise ValueError("Bootstrap response did not include auth cookie.")
    cookie_value = cookie_map.get(cookie_name)
    if not cookie_value:
        raise ValueError("Bootstrap response did not include auth cookie.")
    return f"{cookie_name}={cookie_value}"


async def _resolve_stdio_bridge_headers(config: BridgeConfig) -> dict[str, str]:
    token = _resolve_bridge_token(config)
    if token:
        cookie_header = await _consume_bootstrap_token(config.backend_url, token)
        return {"Cookie": cookie_header}
    session_info = load_current_session_secret()
    if session_info is None:
        raise ValueError(
            "Missing MCP auth. Provide --token/--bootstrap-url or set SETTA_SESSION_ID "
            "(and SETTA_SESSIONS_ROOT if running outside the session workspace)."
        )
    session_metadata, secret = session_info
    cookie_value = AUTH_COOKIE_MANAGER.mint(session_metadata.id, secret)
    return {"Cookie": f"{auth_cookie_name(session_metadata.id)}={cookie_value}"}


@dataclass
class _ServerToolCache:
    init_tools: dict[str, ChatCompletionToolParam]
    discoverable_tools: dict[str, ChatCompletionToolParam]
    annotations: dict[str, SettaToolAnnotations | None]
    routing: dict[str, tuple[str, str]]


@dataclass(frozen=True)
class MCPServerRuntimeStatusSnapshot:
    state: Literal[
        "available",
        "connecting",
        "retrying",
        "unavailable",
        "disabled",
        "unknown",
    ]
    quick_info: str
    registered_tool_count: int
    issue: str | None


class MultiMCPClient:
    """Unified interface for multi-server MCP access."""

    def __init__(
        self,
        server_configs: dict[str, MCPServerConfig],
        frontend_sender: "WMHFrontendSender | None" = None,
        *,
        disabled: bool = False,
    ):
        self.server_configs = dict(server_configs)
        self.frontend_sender = frontend_sender
        self.disabled = disabled
        self._is_shutting_down = False
        self._sessions: dict[str, ClientSession] = {}
        self._exit_stacks: dict[str, AsyncExitStack] = {}
        self._connection_tasks: dict[str, asyncio.Task[None]] = {}
        self._server_tool_cache: dict[str, _ServerToolCache] = {}
        self._last_connection_error_by_server_id: dict[str, str] = {}
        self.init_tool_definitions: dict[str, ChatCompletionToolParam] = {}
        self.discoverable_tool_definitions: dict[str, ChatCompletionToolParam] = {}
        self.tool_annotations_by_name: dict[str, SettaToolAnnotations | None] = {}
        self.routing: dict[str, tuple[str, str]] = {}

    async def connect_to_servers(self, retry_delay: int = 1) -> None:
        if self.disabled:
            return
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

    async def call_tool(
        self,
        tool_name: str,
        tool_args: dict,
        *,
        meta: dict[str, Any] | None = None,
    ) -> types.CallToolResult:
        if self.disabled:
            raise ValueError(
                f"MCP tool calls are disabled (attempted {tool_name}, meta={meta})."
            )
        route = self.routing.get(tool_name)
        if not route:
            raise KeyError(f"MCP tool '{tool_name}' is not registered")
        server_id, tool_id = route
        session = self._sessions.get(server_id)
        if not session:
            raise ValueError(f"MCP session for server '{server_id}' is not initialized")
        try:
            return await session.call_tool(tool_id, tool_args, meta=meta)
        except anyio.ClosedResourceError:
            if not self._is_read_only_tool(tool_name):
                logger.warning(
                    "MCP session for server '%s' closed during tool call '%s'; not retrying because the tool is not read-only",
                    server_id,
                    tool_name,
                )
                raise
            logger.warning(
                "MCP session for server '%s' closed during tool call '%s'; waiting for reconnect",
                server_id,
                tool_name,
            )
            reconnected_session = await self._wait_for_session_reconnect(
                server_id, previous_session=session
            )
            if reconnected_session is None:
                logger.error(
                    "MCP reconnect timed out for server '%s' while calling '%s'",
                    server_id,
                    tool_name,
                )
                raise
            logger.info(
                "Retrying MCP tool call '%s' after reconnect to server '%s'",
                tool_name,
                server_id,
            )
            return await reconnected_session.call_tool(tool_id, tool_args, meta=meta)

    def _is_read_only_tool(self, tool_name: str) -> bool:
        annotations = self.tool_annotations_by_name.get(tool_name)
        if annotations is None:
            return False
        return annotations.accessType == "read"

    async def _wait_for_session_reconnect(
        self,
        server_id: str,
        *,
        previous_session: ClientSession,
    ) -> ClientSession | None:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + _MCP_RECONNECT_WAIT_SECONDS
        while True:
            if self._is_shutting_down:
                return None
            session = self._sessions.get(server_id)
            if session is not None and session is not previous_session:
                return session
            if loop.time() >= deadline:
                return None
            await asyncio.sleep(_MCP_RECONNECT_POLL_SECONDS)

    async def stop(self) -> None:
        if self.disabled:
            return
        self._is_shutting_down = True
        tasks = list(self._connection_tasks.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._connection_tasks.clear()
        server_ids = list(self._exit_stacks.keys())
        for server_id in server_ids:
            await self._cleanup_server(server_id, rebuild_tool_cache=False)
        self._exit_stacks.clear()
        self._sessions.clear()
        self._server_tool_cache.clear()
        self._last_connection_error_by_server_id.clear()
        self._rebuild_tool_cache()
        logger.info("MCP client resources cleaned up successfully")

    def get_server_runtime_status_snapshot(
        self,
    ) -> dict[str, MCPServerRuntimeStatusSnapshot]:
        status_by_server_id: dict[str, MCPServerRuntimeStatusSnapshot] = {}
        for server_id in sorted(self.server_configs.keys()):
            status_by_server_id[server_id] = self._build_server_runtime_status(
                server_id
            )
        return status_by_server_id

    def init_tool_definitions_for_servers(
        self, server_ids: set[str]
    ) -> dict[str, ChatCompletionToolParam]:
        if self.disabled:
            return {}
        return self._filter_tool_definitions(self.init_tool_definitions, server_ids)

    def discoverable_tool_definitions_for_servers(
        self, server_ids: set[str]
    ) -> dict[str, ChatCompletionToolParam]:
        if self.disabled:
            return {}
        return self._filter_tool_definitions(
            self.discoverable_tool_definitions, server_ids
        )

    def tool_annotations_for_servers(
        self, server_ids: set[str]
    ) -> dict[str, SettaToolAnnotations | None]:
        if self.disabled:
            return {}
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

    async def _report_connection_failure(
        self,
        server_id: str,
        config: MCPServerConfig,
        exc: BaseException,
        *,
        label: str,
        message: str,
        handled: bool,
    ) -> None:
        context = {
            "mcp_server_id": server_id,
            "mcp_transport": config.transport,
        }
        if isinstance(exc, MissingMCPEnvVarError):
            context["missing_env_var"] = exc.var_name
        if self.frontend_sender:
            await self.frontend_sender.log_failure_and_broadcast_backend_log_event(
                exc,
                label=label,
                message=message,
                severity=SettaBackendLogEventSeverity.error,
                handled=handled,
                logger=logger,
                context=context,
            )
            return
        log_failure(
            exc,
            label=label,
            logger=logger,
            handled=handled,
            context=context,
        )

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
            except asyncio.CancelledError:
                await asyncio.shield(self._cleanup_server(server_id))
                raise
            except asyncio.TimeoutError:
                self._last_connection_error_by_server_id[server_id] = (
                    "Connection attempt timed out."
                )
                logger.warning(
                    "Connection to %s timed out; retrying in %s seconds",
                    server_id,
                    retry_delay,
                )
            except MissingMCPEnvVarError as exc:
                message = (
                    f"MCP server '{server_id}' is missing required environment variable "
                    f"'{exc.var_name}'. Add it to .env to enable this server."
                )
                self._last_connection_error_by_server_id[server_id] = message
                await self._report_connection_failure(
                    server_id,
                    config,
                    exc,
                    label="mcp-client-missing-env",
                    message=message,
                    handled=True,
                )
            except Exception as exc:
                self._last_connection_error_by_server_id[server_id] = (
                    f"Connection failed: {_format_exception_message(exc)}"
                )
                if self._is_shutting_down:
                    await self._cleanup_server(server_id)
                    return
                logger.exception(
                    "Connection to %s failed; retrying in %s seconds",
                    server_id,
                    retry_delay,
                )

            await self._cleanup_server(server_id)
            if self._is_shutting_down:
                return
            await asyncio.sleep(retry_delay)

    async def _connect_server_once(
        self, server_id: str, config: MCPServerConfig
    ) -> None:
        exit_stack = AsyncExitStack()
        self._exit_stacks[server_id] = exit_stack
        read_stream, write_stream = await self._open_transport(
            exit_stack, server_id, config
        )
        session = await exit_stack.enter_async_context(
            ClientSession(read_stream, write_stream)
        )
        self._sessions[server_id] = session
        await session.initialize()
        logger.info("Connected to %s", server_id)
        response = await session.list_tools()
        self._update_tool_cache_for_server(server_id, list(response.tools))
        self._last_connection_error_by_server_id.pop(server_id, None)
        await self._keep_alive(server_id)

    async def _open_transport(
        self,
        exit_stack: AsyncExitStack,
        server_id: str,
        config: MCPServerConfig,
    ):
        auth_headers = self._build_auth_headers(server_id)
        if config.transport == "sse":
            read_stream, write_stream = await exit_stack.enter_async_context(
                sse_client(url=config.url or "", headers=auth_headers)
            )
            return read_stream, write_stream
        if config.transport == "streamable_http":
            if auth_headers:
                http_client = create_mcp_http_client(headers=auth_headers)
                client = await exit_stack.enter_async_context(http_client)
                read_stream, write_stream, _ = await exit_stack.enter_async_context(
                    streamable_http_client(url=config.url or "", http_client=client)
                )
                return read_stream, write_stream
            read_stream, write_stream, _ = await exit_stack.enter_async_context(
                streamable_http_client(url=config.url or "")
            )
            return read_stream, write_stream
        params = StdioServerParameters(
            command=config.command or "",
            args=_resolve_env_args(list(config.args)),
            env=_resolve_env_mapping(config.env),
            cwd=config.cwd,
            encoding=config.encoding,
            encoding_error_handler=config.encoding_error_handler,
        )
        read_stream, write_stream = await exit_stack.enter_async_context(
            stdio_client(params)
        )
        return read_stream, write_stream

    def _build_auth_headers(self, server_id: str) -> dict[str, str] | None:
        if server_id != SETTA_MCP_SERVER_ID:
            return None
        session_info = load_current_session_secret()
        if session_info is None:
            return None
        session_metadata, secret = session_info
        cookie_value = AUTH_COOKIE_MANAGER.mint(session_metadata.id, secret)
        return {"Cookie": f"{auth_cookie_name(session_metadata.id)}={cookie_value}"}

    async def _keep_alive(self, server_id: str) -> None:
        session = self._sessions.get(server_id)
        if not session:
            raise ValueError("MCP session must be initialized before keep-alive")

        while True:
            await asyncio.sleep(10)
            await session.send_ping()

    async def _cleanup_server(
        self,
        server_id: str,
        *,
        rebuild_tool_cache: bool = True,
    ) -> None:
        exit_stack = self._exit_stacks.pop(server_id, None)
        if exit_stack is None:
            return
        try:
            await exit_stack.aclose()
        except Exception:
            logger.debug("Ignoring MCP cleanup error for %s", server_id, exc_info=True)
        self._sessions.pop(server_id, None)
        self._server_tool_cache.pop(server_id, None)
        if rebuild_tool_cache:
            self._rebuild_tool_cache()

    def _update_tool_cache_for_server(self, server_id: str, tools: list[Tool]) -> None:
        init_tools: dict[str, ChatCompletionToolParam] = {}
        discoverable_tools: dict[str, ChatCompletionToolParam] = {}
        annotations_by_name: dict[str, SettaToolAnnotations | None] = {}
        routing: dict[str, tuple[str, str]] = {}
        for tool in tools:
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

    def _build_server_runtime_status(
        self, server_id: str
    ) -> MCPServerRuntimeStatusSnapshot:
        if self.disabled:
            return MCPServerRuntimeStatusSnapshot(
                state="disabled",
                quick_info="MCP client is disabled in this runtime.",
                registered_tool_count=0,
                issue="MCP client disabled.",
            )

        task = self._connection_tasks.get(server_id)
        has_active_task = task is not None and not task.done()
        has_session = server_id in self._sessions
        tool_cache = self._server_tool_cache.get(server_id)
        registered_tool_count = 0 if tool_cache is None else len(tool_cache.routing)
        issue = self._last_connection_error_by_server_id.get(server_id)

        if has_session:
            return MCPServerRuntimeStatusSnapshot(
                state="available",
                quick_info=(
                    f"Available: connected with {registered_tool_count} registered MCP "
                    f"tool{'s' if registered_tool_count != 1 else ''}."
                ),
                registered_tool_count=registered_tool_count,
                issue=None,
            )
        if has_active_task and issue:
            return MCPServerRuntimeStatusSnapshot(
                state="retrying",
                quick_info=f"Retrying connection: {issue}",
                registered_tool_count=0,
                issue=issue,
            )
        if has_active_task:
            return MCPServerRuntimeStatusSnapshot(
                state="connecting",
                quick_info="Connecting to MCP server...",
                registered_tool_count=0,
                issue=None,
            )
        if issue:
            return MCPServerRuntimeStatusSnapshot(
                state="unavailable",
                quick_info=f"Unavailable: {issue}",
                registered_tool_count=0,
                issue=issue,
            )
        return MCPServerRuntimeStatusSnapshot(
            state="unknown",
            quick_info="Status unknown: MCP connection status is not available yet.",
            registered_tool_count=0,
            issue=None,
        )

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
        auth_headers = await _resolve_stdio_bridge_headers(config)
        stdio_read, stdio_write = await stack.enter_async_context(stdio_server())
        backend_read, backend_write = await stack.enter_async_context(
            sse_client(url=config.backend_url, headers=auth_headers)
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
    configure_stdio_bridge_logging(config.verbose)
    try:
        asyncio.run(run_stdio_bridge(config))
    except KeyboardInterrupt:
        logger.info("Bridge interrupted, shutting down")
        return 130
    return 0


def configure_stdio_bridge_logging(verbose: bool) -> int:
    level_override = "DEBUG" if verbose else None
    return configure_logging(
        level_override=level_override,
        stream="stderr",
        force=True,
    )


if __name__ == "__main__":
    raise SystemExit(main())
