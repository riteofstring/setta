import asyncio
import logging
import sys
from contextlib import suppress

from setta.logging.tasks import spawn_background_task
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.section_impls import (
    CodeLanguage,
    CodeLanguageKey,
    code_language_to_string,
)
from setta.utils.paths import get_setta_paths
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

from ..file_watchers.lsp import LSPFileWatcher
from .reader import LanguageServerReader
from .registrations import RegisteredLanguageServer
from .server import LanguageServer
from .writer import LanguageServerWriter

LSP_SHUTDOWN_TIMEOUT_SECONDS = 3
logger = logging.getLogger(__name__)
BASEDPYRIGHT_LANGSERVER_ENTRYPOINT = "from basedpyright.langserver import main; main()"


def _dedupe_by_identity(values):
    deduped = []
    seen_ids: set[int] = set()
    for value in values:
        value_id = id(value)
        if value_id in seen_ids:
            continue
        seen_ids.add(value_id)
        deduped.append(value)
    return deduped


def _resolve_language_server_settings(
    settings: dict,
    settings_key: str | None,
) -> dict:
    if not isinstance(settings, dict):
        return {}
    if settings_key is None:
        return settings
    segments = [segment for segment in settings_key.split(".") if segment]
    if len(segments) == 0:
        return {}
    current: object = settings
    for segment in segments:
        if not isinstance(current, dict):
            return {}
        if segment not in current:
            return {}
        current = current[segment]
    if not isinstance(current, dict):
        return {}
    wrapped: dict = current
    for segment in reversed(segments):
        wrapped = {segment: wrapped}
    return wrapped


class LSPServers:
    def __init__(
        self,
        settings,
        *,
        workspace_root=None,
        plugin_language_servers: list[RegisteredLanguageServer] | None = None,
    ):
        resolved_workspace_root = workspace_root or get_setta_paths().workspace_root
        self.full = LanguageServer(
            workspace_folder=resolved_workspace_root,
            settings=_resolve_language_server_settings(settings, "basedpyright"),
            name="full",
            language=CodeLanguage.python,
            command=sys.executable,
            args=("-c", BASEDPYRIGHT_LANGSERVER_ENTRYPOINT, "--stdio"),
        )
        self.by_language: dict[CodeLanguageKey, LanguageServer] = {
            CodeLanguage.python: self.full
        }
        registrations = sorted(
            plugin_language_servers or [],
            key=lambda registration: (
                code_language_to_string(registration.language),
                registration.plugin_id or "",
                registration.name,
            ),
        )
        for registration in registrations:
            if registration.language in self.by_language:
                raise ValueError(
                    "Duplicate language server registration for "
                    f"{code_language_to_string(registration.language)}."
                )
            self.by_language[registration.language] = LanguageServer(
                workspace_folder=resolved_workspace_root,
                settings=_resolve_language_server_settings(
                    settings,
                    registration.settings_key,
                ),
                name=registration.name,
                language=registration.language,
                command=registration.command,
                args=registration.args,
            )

    async def start(self):
        started_servers: list[LanguageServer] = []
        try:
            for server in self.by_language.values():
                await server.start()
                started_servers.append(server)
        except Exception:
            await _stop_started_servers(started_servers)
            raise

    def stop(self):
        for server in self.by_language.values():
            server.stop()


class LSPWriters:
    def __init__(self, servers: LSPServers):
        self.full = LanguageServerWriter(servers.full)
        self.by_language: dict[CodeLanguageKey, LanguageServerWriter] = {
            CodeLanguage.python: self.full
        }
        for language, server in servers.by_language.items():
            if language == CodeLanguage.python:
                continue
            self.by_language[language] = LanguageServerWriter(server)
        self._workspace_folder = servers.full.workspace_folder
        self.file_watcher: LSPFileWatcher | _NoopFileWatcher = _NoopFileWatcher()

    def get_for_language(
        self, language: CodeLanguageKey
    ) -> LanguageServerWriter | None:
        return self.by_language.get(language)

    async def _send_did_change_watched_files(self, changes):
        for writer in _dedupe_by_identity(self.by_language.values()):
            await writer.send_did_change_watched_files(changes)

    async def start(self):
        for writer in _dedupe_by_identity(self.by_language.values()):
            await writer.start()
        if isinstance(self.file_watcher, _NoopFileWatcher):
            file_watcher = LSPFileWatcher(
                self._send_did_change_watched_files,
                loop=asyncio.get_running_loop(),
            )
            file_watcher.add_workspace_folder(self._workspace_folder)
            self.file_watcher = file_watcher
        self.file_watcher.start()


class _NoopFileWatcher:
    def stop(self) -> None:
        return None


class NoopLSPWriters:
    def __init__(self) -> None:
        self.full = None
        self.by_language: dict[CodeLanguageKey, None] = {}
        self.file_watcher = _NoopFileWatcher()

    def get_for_language(self, _language: CodeLanguageKey):
        return None

    async def start(self) -> None:
        return None


def _build_lsp_initialization_callback(
    websocket_msg_handler: WMHFrontendSender,
    *,
    server_name: str,
):
    def initialization_callback():
        async def broadcast_started() -> None:
            event_message = f"Language Server Started ({server_name})"
            await websocket_msg_handler.log_and_broadcast_backend_log_event(
                event_message
            )
            notification = SettaNotification(
                message=event_message,
                type=SettaNotificationType.info,
            )
            await websocket_msg_handler.broadcast_notification(notification)

        spawn_background_task(
            broadcast_started(),
            label="lsp-init-notification",
            extra_values={"lsp_server": server_name},
        )

    return initialization_callback


class LSPReaders:
    def __init__(self, servers: LSPServers, websocket_msg_handler: WMHFrontendSender):
        self.full = LanguageServerReader(
            servers.full,
            _build_lsp_initialization_callback(
                websocket_msg_handler,
                server_name=servers.full.name,
            ),
        )
        self.by_language: dict[CodeLanguageKey, LanguageServerReader] = {
            CodeLanguage.python: self.full
        }
        for language, server in servers.by_language.items():
            if language == CodeLanguage.python:
                continue
            self.by_language[language] = LanguageServerReader(
                server,
                _build_lsp_initialization_callback(
                    websocket_msg_handler,
                    server_name=server.name,
                ),
            )

    async def start(self):
        for reader in _dedupe_by_identity(self.by_language.values()):
            await reader.start()

    async def stop(self):
        for reader in _dedupe_by_identity(self.by_language.values()):
            await reader.stop()


async def _await_process_shutdown(process: asyncio.subprocess.Process) -> None:
    writer = getattr(process, "stdin", None)
    if writer is not None:
        writer.close()
        with suppress(asyncio.TimeoutError, RuntimeError, AttributeError):
            await asyncio.wait_for(
                writer.wait_closed(),
                timeout=LSP_SHUTDOWN_TIMEOUT_SECONDS,
            )
    try:
        await asyncio.wait_for(process.wait(), timeout=LSP_SHUTDOWN_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        with suppress(ProcessLookupError):
            process.kill()
        try:
            await asyncio.wait_for(process.wait(), timeout=LSP_SHUTDOWN_TIMEOUT_SECONDS)
        except (asyncio.TimeoutError, ProcessLookupError):
            logger.warning("Timed out waiting for LSP process to exit after kill.")

    for reader in (
        getattr(process, "stdout", None),
        getattr(process, "stderr", None),
    ):
        if reader is None:
            continue
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(
                reader.read(),
                timeout=LSP_SHUTDOWN_TIMEOUT_SECONDS,
            )


async def _shutdown_processes(
    processes: list[asyncio.subprocess.Process | None],
) -> None:
    for process in processes:
        if process is None:
            continue
        await _await_process_shutdown(process)


async def _stop_started_servers(started_servers: list[LanguageServer]) -> None:
    processes = []
    for server in reversed(started_servers):
        processes.append(getattr(server, "server", None))
        server.stop()
    await _shutdown_processes(processes)


async def start_lsps(lsps, lsp_readers, lsp_writers):
    await lsps.start()
    await lsp_readers.start()
    await lsp_writers.start()


async def stop_lsps(lsps: LSPServers, lsp_readers: LSPReaders):
    processes = [
        getattr(server, "server", None)
        for server in _dedupe_by_identity(lsps.by_language.values())
    ]
    await lsp_readers.stop()
    lsps.stop()
    await _shutdown_processes(processes)


def stop_file_watcher(lsp_writers):
    lsp_writers.file_watcher.stop()


async def restart_lsps(lsps, lsp_readers, lsp_writers):
    await stop_lsps(lsps, lsp_readers)
    await start_lsps(lsps, lsp_readers, lsp_writers)
