import argparse
import asyncio
import logging
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Sequence

from anyio.streams.memory import (
    MemoryObjectReceiveStream,
    MemoryObjectSendStream,
)
from mcp.client.sse import sse_client
from mcp.server.stdio import stdio_server
from mcp.shared.message import SessionMessage
import mcp.types as types

from setta.utils.constants import C


logger = logging.getLogger(__name__)


@dataclass
class BridgeConfig:
    backend_url: str
    verbose: bool


@dataclass
class BridgeState:
    project_config_id: str | None = None


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="setta.mcp.stdio_bridge",
        description="Bridge Setta's SSE-based MCP server to stdio transports.",
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


async def run_bridge(config: BridgeConfig) -> None:
    logger.debug("Starting stdio bridge with config: %s", config)
    async with AsyncExitStack() as stack:
        stdio_read, stdio_write = await stack.enter_async_context(stdio_server())
        backend_read, backend_write = await stack.enter_async_context(
            sse_client(url=config.backend_url)
        )
        logger.info("Connected to Setta backend at %s", config.backend_url)
        state = BridgeState()
        async with asyncio.TaskGroup() as tg:
            tg.create_task(
                _forward_stdio_to_backend(
                    stdio_read,
                    backend_write,
                    state,
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
    state: BridgeState,
) -> None:
    async with source:
        async for payload in source:
            if isinstance(payload, Exception):
                logger.error("[stdio->backend] transport exception: %s", payload)
                continue
            _maybe_apply_project_config(payload, state)
            await destination.send(payload)
    await destination.aclose()
    logger.info("[stdio->backend] stream closed")


def _maybe_apply_project_config(message: SessionMessage, state: BridgeState) -> None:
    root = message.message.root
    if not isinstance(root, types.JSONRPCRequest):
        return
    if root.method != "tools/call":
        return
    params = root.params or {}
    arguments = params.get("arguments") or {}
    existing = arguments.get(C.MCP_PROJECT_CONFIG_ID_ARG_NAME)
    if existing:
        if state.project_config_id != existing:
            logger.info("Updating projectConfigId to %s", existing)
            state.project_config_id = existing
        params["arguments"] = arguments
        root.params = params
        return
    if not state.project_config_id:
        return
    arguments[C.MCP_PROJECT_CONFIG_ID_ARG_NAME] = state.project_config_id
    params["arguments"] = arguments
    root.params = params
    logger.debug(
        "Injected projectConfigId=%s into tools/call %s",
        state.project_config_id,
        params.get("name"),
    )


def main(argv: Sequence[str] | None = None) -> int:
    config = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if config.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    try:
        asyncio.run(run_bridge(config))
    except KeyboardInterrupt:
        logger.info("Bridge interrupted, shutting down")
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
