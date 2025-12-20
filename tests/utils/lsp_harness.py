import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from pathlib import Path

from setta.lsp.reader import LanguageServerReader
from setta.lsp.server import LanguageServer
from setta.lsp.writer import LanguageServerWriter


@dataclass(slots=True)
class LSPHarness:
    server: LanguageServer
    reader: LanguageServerReader
    writer: LanguageServerWriter


async def _wait_for_initialized(
    server: LanguageServer,
    *,
    timeout_s: float,
) -> None:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_s
    while loop.time() < deadline:
        if server.is_initialized:
            return
        await asyncio.sleep(0.05)
    raise TimeoutError(f"Language server did not initialize within {timeout_s:.1f}s")


async def _close_lsp_process(process) -> None:
    if process is None:
        return

    writer = getattr(process, "stdin", None)
    if writer is not None:
        writer.close()
        with suppress(RuntimeError, AttributeError):
            await writer.wait_closed()

    try:
        await asyncio.wait_for(process.wait(), timeout=3.0)
    except asyncio.TimeoutError:
        with suppress(ProcessLookupError):
            process.kill()
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(process.wait(), timeout=3.0)

    for reader in (
        getattr(process, "stdout", None),
        getattr(process, "stderr", None),
    ):
        if reader is None:
            continue
        with suppress(Exception):
            await reader.read()


@asynccontextmanager
async def start_lsp(
    workspace: Path,
    *,
    settings: dict | None = None,
    timeout_s: float = 10.0,
) -> AsyncIterator[LSPHarness]:
    server = LanguageServer(
        workspace_folder=workspace,
        settings=settings or {},
        name="test",
    )
    await server.start()

    reader = LanguageServerReader(server)
    writer = LanguageServerWriter(server)

    process = getattr(server, "server", None)
    try:
        await reader.start()
        await writer.start()
        await _wait_for_initialized(server, timeout_s=timeout_s)
        yield LSPHarness(server=server, reader=reader, writer=writer)
    finally:
        await reader.stop()
        server.stop()
        await _close_lsp_process(process)
