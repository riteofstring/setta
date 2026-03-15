import asyncio
import logging
import os
import shutil
import time
from pathlib import Path
from typing import TYPE_CHECKING, TypeVar, cast

from setta import __version__
from setta.agentic.engine_config_watcher import EngineConfigWatcher
from setta.agentic.example_config import seed_agentic_config_files
from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.agentic.external_agent_watcher import ExternalAgentConfigWatcher
from setta.agentic.profile_watcher import AgentProfileWatcher
from setta.agentic.prompt_watcher import PromptTemplateWatcher
from setta.agentic.state_machine_runner import StateMachineRunner
from setta.agentic.transcription_profile_watcher import TranscriptionProfileWatcher
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import (
    SpecificFileWatcher,
)
from setta.llm.agent_runner import AgentRunner
from setta.llm.api_keys import (
    read_managed_api_keys_with_status,
    resolve_runtime_llm_api_keys,
)
from setta.llm.config import load_llm_config
from setta.llm.config_watcher import LLMConfigWatcher
from setta.llm.dotenv_watcher import LLMApiKeyWatcher
from setta.llm.example_config import seed_llm_config_example_file
from setta.llm.transcription_sessions import TranscriptionSessionManager
from setta.logging.tasks import spawn_background_task
from setta.lsp.managers import (
    LSPReaders,
    LSPServers,
    LSPWriters,
    start_lsps,
    stop_lsps,
)
from setta.mcp.client import MultiMCPClient
from setta.mcp.fastmcp_patch import apply_fastmcp_preparse_patch
from setta.mcp.server import SettaFastMCP
from setta.plugins.manager import PluginManager
from setta.project_state.artifacts import Artifacts
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.session_project_manager import (
    SessionPersistenceMode,
    SessionProjectManager,
)
from setta.project_state.share_runtime_state import ShareRuntimeState
from setta.run_manager import DetachedRunManager
from setta.share.listener_runtime import ShareListenerRuntime
from setta.share.session_store import MemorySessionStore, ShareSessionStore
from setta.terminals.terminals import Terminals
from setta.types.settings_state import RunSnapshotMode
from setta.ui_settings.reveal_result_hub import UISettingRevealResultHub
from setta.utils.constants import C
from setta.utils.env_vars import RUNTIME_ROOT_ENV
from setta.utils.init_status import BackendInitializationStatus
from setta.utils.paths import (
    clear_setta_paths_cache,
    get_setta_paths,
)
from setta.utils.setta_home import resolve_setta_home
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.cli_receiver import WMHCLIReceiver
from setta.websockets.msg_handlers.cli_sender import WMHCLISender
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.realtime_event_hub import RealtimeEventHub
from setta.websockets.websocket_manager import WebsocketManager

_T = TypeVar("_T")
logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
    from setta.websockets.msg_handlers.frontend_receiver import WMHFrontendReceiver
    from setta.websockets.msg_handlers.python_script_receiver import (
        WMHPythonScriptReceiver,
    )

DEFAULT_SHARE_RUN_TTL_SECONDS = 60 * 30
DEFAULT_SHARE_RUN_CLEANUP_INTERVAL_SECONDS = 60 * 5
DEFAULT_SHARE_SESSION_TTL_SECONDS = 60 * 30
DEFAULT_SHARE_SESSION_CLEANUP_INTERVAL_SECONDS = 60 * 5
DEFAULT_TRANSCRIPTION_SESSION_CLEANUP_INTERVAL_SECONDS = 60


def cleanup_share_run_output(
    runs_root: Path,
    *,
    ttl_seconds: int = DEFAULT_SHARE_RUN_TTL_SECONDS,
) -> int:
    if not runs_root.exists():
        return 0
    cutoff = time.time() - ttl_seconds
    removed = 0
    for session_dir in runs_root.iterdir():
        if not session_dir.is_dir():
            continue
        for run_dir in session_dir.iterdir():
            if not run_dir.is_dir():
                continue
            if run_dir.stat().st_mtime <= cutoff:
                shutil.rmtree(run_dir)
                removed += 1
        if not any(session_dir.iterdir()):
            session_dir.rmdir()
    return removed


async def run_share_run_cleanup_loop(
    runs_root: Path,
    *,
    ttl_seconds: int = DEFAULT_SHARE_RUN_TTL_SECONDS,
    interval_seconds: int = DEFAULT_SHARE_RUN_CLEANUP_INTERVAL_SECONDS,
) -> None:
    while True:
        cleanup_share_run_output(
            runs_root,
            ttl_seconds=ttl_seconds,
        )
        await asyncio.sleep(interval_seconds)


async def cleanup_expired_share_sessions(
    share_session_store: ShareSessionStore,
    share_runtime_state: ShareRuntimeState,
    session_manager_switcher: "ProjectManagerSwitcher | None" = None,
    share_listener_runtime: "ShareListenerRuntime | None" = None,
    terminals: "Terminals | None" = None,
    realtime_event_hub: RealtimeEventHub | None = None,
) -> list[str]:
    expired_ids = share_session_store.cleanup_expired()
    for session_id in expired_ids:
        if terminals is not None:
            await terminals.delete_terminals_for_share_session(session_id)
        if share_listener_runtime is not None:
            share_listener_runtime.drop_session_listener(session_id)
        if realtime_event_hub is not None:
            realtime_event_hub.drop_share_session_sequences(session_id)
        if share_runtime_state.has_session_state(session_id):
            share_runtime_state.delete_session_state(session_id)
        if session_manager_switcher is not None:
            session_manager_switcher.drop_session_manager(session_id)
    return expired_ids


async def run_share_session_cleanup_loop(
    share_session_store: ShareSessionStore,
    share_runtime_state: ShareRuntimeState,
    session_manager_switcher: "ProjectManagerSwitcher | None" = None,
    share_listener_runtime: "ShareListenerRuntime | None" = None,
    terminals: "Terminals | None" = None,
    realtime_event_hub: RealtimeEventHub | None = None,
    *,
    interval_seconds: int = DEFAULT_SHARE_SESSION_CLEANUP_INTERVAL_SECONDS,
) -> None:
    while True:
        await cleanup_expired_share_sessions(
            share_session_store,
            share_runtime_state,
            session_manager_switcher,
            share_listener_runtime,
            terminals,
            realtime_event_hub,
        )
        await asyncio.sleep(interval_seconds)


async def run_transcription_session_cleanup_loop(
    transcription_session_manager: TranscriptionSessionManager,
    *,
    interval_seconds: int = DEFAULT_TRANSCRIPTION_SESSION_CLEANUP_INTERVAL_SECONDS,
) -> None:
    while True:
        await transcription_session_manager.prune_expired_sessions()
        await asyncio.sleep(interval_seconds)


class _UninitializedAttribute:
    __slots__ = ("name",)

    def __init__(self, name: str) -> None:
        self.name = name

    def __getattr__(self, _item: str):
        raise RuntimeError(
            f"{self.name} accessed before backend initialization completes"
        )

    def __bool__(self) -> bool:
        return False

    @property
    def disabled(self) -> bool:
        return True


class SettaFastAPIState:
    def __init__(
        self,
        app,
        *,
        share_mode: bool = False,
        app_mode: bool = False,
        launcher_mode: bool = False,
        share_deployment_root: Path | None = None,
        enable_mcp_connections: bool = True,
        enable_language_server: bool = True,
    ):
        if share_mode and app_mode:
            raise ValueError("Server cannot enable both share_mode and app_mode.")
        if launcher_mode and (share_mode or app_mode):
            raise ValueError("Launcher mode cannot be combined with deployment modes.")
        self.app_mode = app_mode
        self.share_mode = share_mode
        self.launcher_mode = launcher_mode
        self.deployment_mode = share_mode or app_mode
        # Register runtime state on the app before startup work begins so backend
        # plugin register-time host calls can resolve app.state.setta.
        app.state.setta = self
        self._enable_mcp_connections = enable_mcp_connections
        self._enable_language_server = enable_language_server
        self.paths = get_setta_paths()
        self.share_deployment_root = self._resolve_deployment_root(
            self.deployment_mode, share_deployment_root
        )
        self.share_runtime_root = self._resolve_share_runtime_root(
            self.share_deployment_root
        )
        self.websocket_manager = WebsocketManager()
        self.listener_registry = ListenerRegistry()
        self.ui_setting_reveal_result_hub = UISettingRevealResultHub()
        self.dbe = DBE(
            self.share_deployment_root
            if self.share_deployment_root is not None
            else self.paths.setta_files_root,
            runtime_root=self.share_runtime_root
            if self.share_runtime_root is not None
            else self.paths.runtime_root,
            lock_root=self.share_runtime_root
            if self.share_runtime_root is not None
            else self.paths.runtime_root,
        )
        if self.share_runtime_root is not None:
            # Ensure runtime-root consumers (password store, binary lookups, etc) point at
            # the active share deployment runtime root even when multiple share states
            # are constructed in-process (tests).
            os.environ[RUNTIME_ROOT_ENV] = str(self.dbe.runtime_root)
            clear_setta_paths_cache()
            self.paths = get_setta_paths()
        else:
            os.environ.setdefault(RUNTIME_ROOT_ENV, str(self.dbe.runtime_root))
        plugin_workspace_root = (
            self.share_deployment_root
            if self.share_deployment_root is not None
            else self.paths.workspace_root
        )
        plugin_setta_files_root = (
            self.share_deployment_root
            if self.share_deployment_root is not None
            else self.paths.setta_files_root
        )
        plugin_setta_home = (
            self.share_runtime_root
            if self.share_runtime_root is not None
            else resolve_setta_home()
        )
        self.plugin_manager = PluginManager(
            workspace_root=plugin_workspace_root,
            setta_files_root=plugin_setta_files_root,
            setta_home=plugin_setta_home,
            server_mode=self._resolve_server_mode(),
            setta_version=__version__,
            auto_rescan=False,
        )
        if not self.deployment_mode and not self.launcher_mode:
            seed_llm_config_example_file(self.dbe)
            seed_agentic_config_files(self.dbe)
        self.wmh_frontend_sender = WMHFrontendSender(
            self.websocket_manager,
            # share_mode enables per-viewer session scoping in deployment mode (share or app).
            share_mode=self.deployment_mode,
        )
        self.detached_run_manager = DetachedRunManager(self.dbe)
        self.wmh_python_script_sender = WMHPythonScriptSender(
            self.websocket_manager,
            self.listener_registry,
            None if self.deployment_mode else self.dbe,
        )
        self.realtime_event_hub = RealtimeEventHub(self.wmh_python_script_sender)
        if self.deployment_mode or self.launcher_mode:
            self.settings_file = self._defer_attr("settings_file")
            self.terminals = self._defer_attr("terminals")
        else:
            self.settings_file = SettingsFile(self.dbe, self.wmh_frontend_sender)
            self.terminals = Terminals(self.wmh_frontend_sender, self.settings_file)
        self.wmh_cli_sender = WMHCLISender(self.websocket_manager)
        self.transcription_session_manager = TranscriptionSessionManager()
        self.transcription_session_cleanup_task: asyncio.Task[None] | None = None

        self.lsps: LSPServers | None = self._defer_attr("lsps")
        self.lsp_writers: LSPWriters | None = self._defer_attr("lsp_writers")
        self.lsp_readers: LSPReaders | None = self._defer_attr("lsp_readers")
        self.specific_file_watcher: SpecificFileWatcher = self._defer_attr(
            "specific_file_watcher"
        )
        self.artifacts: Artifacts = self._defer_attr("artifacts")
        self.code_files: CodeFiles = self._defer_attr("code_files")
        self.settings_code_files: CodeFiles = self._defer_attr("settings_code_files")
        self.json_source: JSONSource = self._defer_attr("json_source")
        self.project_manager_switcher: ProjectManagerSwitcher = self._defer_attr(
            "project_manager_switcher"
        )
        self.share_session_store: ShareSessionStore = self._defer_attr(
            "share_session_store"
        )
        self.share_runtime_state: ShareRuntimeState = self._defer_attr(
            "share_runtime_state"
        )
        self.share_listener_runtime: ShareListenerRuntime = self._defer_attr(
            "share_listener_runtime"
        )
        self.wmh_frontend_receiver: WMHFrontendReceiver = self._defer_attr(
            "wmh_frontend_receiver"
        )
        self.wmh_cli_receiver = WMHCLIReceiver(self.websocket_manager)
        self.wmh_python_script_receiver: WMHPythonScriptReceiver = self._defer_attr(
            "wmh_python_script_receiver"
        )
        self.mcp_server: SettaFastMCP = self._defer_attr("mcp_server")
        self.mcp_client: MultiMCPClient = self._defer_attr("mcp_client")
        self.agent_runner: AgentRunner = self._defer_attr("agent_runner")
        self.state_machine_runner: StateMachineRunner = self._defer_attr(
            "state_machine_runner"
        )
        self.llm_api_key_watcher: LLMApiKeyWatcher = self._defer_attr(
            "llm_api_key_watcher"
        )
        self.llm_config_watcher: LLMConfigWatcher = self._defer_attr(
            "llm_config_watcher"
        )
        self.agent_profile_watcher: AgentProfileWatcher = self._defer_attr(
            "agent_profile_watcher"
        )
        self.prompt_template_watcher: PromptTemplateWatcher = self._defer_attr(
            "prompt_template_watcher"
        )
        self.external_agent_config_watcher: ExternalAgentConfigWatcher = (
            self._defer_attr("external_agent_config_watcher")
        )
        self.engine_config_watcher: EngineConfigWatcher = self._defer_attr(
            "engine_config_watcher"
        )
        self.transcription_profile_watcher: TranscriptionProfileWatcher = (
            self._defer_attr("transcription_profile_watcher")
        )
        self.external_agent_runner: ExternalAgentRunner = self._defer_attr(
            "external_agent_runner"
        )

        self.init_status = BackendInitializationStatus()
        if self.app_mode:
            mode_label = "app"
        else:
            if self.share_mode:
                mode_label = "share"
            elif self.launcher_mode:
                mode_label = "launcher"
            else:
                mode_label = "backend"
        self.init_status.record(f"Booting {mode_label} services")
        if C.BACKEND_INIT_DELAY_SECONDS > 0:
            self.init_status.record(
                f"Simulating slow init (+{C.BACKEND_INIT_DELAY_SECONDS:.1f}s per step)"
            )
        self._ready_event: asyncio.Event = asyncio.Event()

        loop = asyncio.get_running_loop()
        self._initialization_task = spawn_background_task(
            self._initialize_async(app),
            label="backend-initialization",
            request_id="boot",
            extra_values={"phase": "app-startup"},
            re_raise=True,
            loop=loop,
        )

    async def _initialize_async(self, app):
        try:
            if self.deployment_mode:
                await self._initialize_deployment_async(app)
                return
            if self.launcher_mode:
                await self._initialize_launcher_async()
                return
            from setta.project_state.project_manager_switcher import (
                ProjectManagerSwitcher,
            )
            from setta.websockets.msg_handlers.frontend_receiver import (
                WMHFrontendReceiver,
            )
            from setta.websockets.msg_handlers.python_script_receiver import (
                WMHPythonScriptReceiver,
            )

            self.init_status.record("Creating file watchers")
            await self._maybe_delay()
            self.specific_file_watcher = SpecificFileWatcher()
            self.artifacts = Artifacts(
                self.wmh_frontend_sender,
                self.specific_file_watcher,
                self.dbe,
                realtime_event_hub=self.realtime_event_hub,
            )
            self.code_files = CodeFiles(
                self.wmh_frontend_sender, self.specific_file_watcher, self.dbe
            )
            self.settings_code_files = CodeFiles(
                self.wmh_frontend_sender, self.specific_file_watcher, self.dbe
            )
            self.json_source = JSONSource(
                self.wmh_frontend_sender,
                self.settings_file,
                self.specific_file_watcher,
                self.dbe,
            )

            self.init_status.record("Loading project state")
            await self._maybe_delay()
            self.lsps = None
            self.lsp_writers = None
            project_manager = SessionProjectManager(
                persistence_mode=SessionPersistenceMode.ide_main,
                frontend_sender=self.wmh_frontend_sender,
                python_script_sender=self.wmh_python_script_sender,
                settings_file=self.settings_file,
                specific_file_watcher=self.specific_file_watcher,
                dbe=self.dbe,
                artifacts=self.artifacts,
                json_source=self.json_source,
                code_files=self.code_files,
                lsp_writers=None,
                plugin_manager=self.plugin_manager,
            )
            settings_project_manager = SessionProjectManager(
                persistence_mode=SessionPersistenceMode.ide_settings,
                frontend_sender=self.wmh_frontend_sender,
                python_script_sender=self.wmh_python_script_sender,
                settings_file=self.settings_file,
                specific_file_watcher=self.specific_file_watcher,
                dbe=self.dbe,
                artifacts=self.artifacts,
                json_source=self.json_source,
                code_files=self.settings_code_files,
                lsp_writers=None,
                plugin_manager=self.plugin_manager,
            )
            self.project_manager_switcher = ProjectManagerSwitcher(
                main_manager=project_manager,
                settings_manager=settings_project_manager,
            )

            self.init_status.record("Loading backend plugins")
            await self._maybe_delay()
            self.plugin_manager.load_backend_plugins(app=app)
            if self._enable_language_server:
                self.lsps = LSPServers(
                    self.settings_file.settings.languageServer,
                    workspace_root=self.paths.workspace_root,
                    plugin_language_servers=(
                        self.plugin_manager.get_backend_language_servers()
                    ),
                )
                self.lsp_writers = LSPWriters(self.lsps)
                project_manager.lsp_writers = self.lsp_writers
                settings_project_manager.lsp_writers = self.lsp_writers

            self.init_status.record("Preparing websocket handlers")
            await self._maybe_delay()
            self.wmh_frontend_receiver = WMHFrontendReceiver(
                self.websocket_manager,
                project_manager,
                self.realtime_event_hub,
                ui_setting_reveal_result_hub=self.ui_setting_reveal_result_hub,
            )
            self.wmh_python_script_receiver = WMHPythonScriptReceiver(
                self.websocket_manager,
                self.listener_registry,
                self.wmh_frontend_sender,
                self.wmh_python_script_sender,
                self.project_manager_switcher,
                self.dbe,
            )
            if self._enable_language_server and self.lsps is not None:
                self.lsp_readers = LSPReaders(self.lsps, self.wmh_frontend_sender)
            else:
                self.lsp_readers = None

            self.init_status.record("Booting MCP and chat managers")
            await self._maybe_delay()
            apply_fastmcp_preparse_patch()
            self.mcp_server = SettaFastMCP(
                app,
                self,
                "/mcp",
                "Setta MCP Server",
                self.wmh_frontend_sender,
                self.dbe,
            )
            llm_config = load_llm_config(self.dbe)
            self.mcp_client = MultiMCPClient(
                llm_config.mcpServers,
                frontend_sender=self.wmh_frontend_sender,
            )
            self.agent_runner = AgentRunner(
                self.dbe,
                self.mcp_client,
                self.wmh_frontend_sender,
                share_mode=self.deployment_mode,
            )
            self.agent_runner.update_config(llm_config)
            self.dbe.reload_dot_env()
            managed_api_keys = read_managed_api_keys_with_status(self.dbe)
            if managed_api_keys.corrupt:
                logger.error(
                    ".env API key store is corrupt during startup: %s",
                    managed_api_keys.error or "unknown parse error",
                )
            runtime_api_keys = resolve_runtime_llm_api_keys(
                config=llm_config,
                managed_api_keys=managed_api_keys.api_keys,
            )
            self.agent_runner.update_api_keys(runtime_api_keys)
            self.llm_api_key_watcher = LLMApiKeyWatcher(
                self.specific_file_watcher,
                self.agent_runner,
                self.wmh_frontend_sender,
                self.dbe,
            )
            self.llm_api_key_watcher.start()
            self.llm_config_watcher = LLMConfigWatcher(
                self.specific_file_watcher,
                self.agent_runner,
                self.wmh_frontend_sender,
                self.dbe,
            )
            self.llm_config_watcher.start()
            self.agent_profile_watcher = AgentProfileWatcher(
                self.specific_file_watcher,
                self.wmh_frontend_sender,
                self.dbe,
            )
            self.agent_profile_watcher.start()
            self.prompt_template_watcher = PromptTemplateWatcher(
                self.specific_file_watcher,
                self.wmh_frontend_sender,
                self.dbe,
            )
            self.prompt_template_watcher.start()
            self.external_agent_config_watcher = ExternalAgentConfigWatcher(
                self.specific_file_watcher,
                self.wmh_frontend_sender,
                self.dbe,
            )
            self.external_agent_config_watcher.start()
            self.engine_config_watcher = EngineConfigWatcher(
                self.specific_file_watcher,
                self.wmh_frontend_sender,
                self.dbe,
            )
            self.engine_config_watcher.start()
            self.transcription_profile_watcher = TranscriptionProfileWatcher(
                self.specific_file_watcher,
                self.wmh_frontend_sender,
                self.dbe,
            )
            self.transcription_profile_watcher.start()
            self.external_agent_runner = ExternalAgentRunner(
                self.dbe,
                self.wmh_frontend_sender,
                share_mode=self.deployment_mode,
                plugin_external_agent_adapters=(
                    self.plugin_manager.get_backend_external_agent_adapters()
                ),
                mcp_client=self.mcp_client,
            )
            self.state_machine_runner = StateMachineRunner(
                self.dbe,
                self.project_manager_switcher,
                self.agent_runner,
                self.external_agent_runner,
                self.wmh_frontend_sender,
            )
            self.agent_runner.set_terminal_run_listener(
                self.state_machine_runner.handle_terminal_child_run_update
            )
            self.external_agent_runner.set_terminal_run_listener(
                self.state_machine_runner.handle_terminal_child_run_update
            )

            self.init_status.record("Starting background services")
            await self._maybe_delay()
            await self.mcp_server.start_streamable_manager()
            if self._enable_mcp_connections and not self.mcp_client.disabled:
                spawn_background_task(
                    self.mcp_client.connect_to_servers(),
                    label="mcp-client-connect",
                    request_id="boot",
                    extra_values={"service": "mcp-client"},
                )
            if self.lsps and self.lsp_readers and self.lsp_writers:
                self.init_status.record("Starting language servers")
                await start_lsps(self.lsps, self.lsp_readers, self.lsp_writers)
            if self.specific_file_watcher:
                self.specific_file_watcher.start()
            self._start_transcription_session_cleanup_loop()

            self._ready_event.set()
            self.init_status.record("Backend ready")
            self.init_status.mark_ready()
        except Exception as exc:
            await self.stop_transcription_session_cleanup_loop()
            try:
                self.plugin_manager.shutdown_backend_plugins()
            except Exception:
                logger.exception(
                    "Failed to clean up backend plugins after initialization error."
                )
            if self.lsps is not None:
                try:
                    if self.lsp_writers is not None:
                        self.lsp_writers.file_watcher.stop()
                    if self.lsp_readers is not None:
                        await stop_lsps(self.lsps, self.lsp_readers)
                    else:
                        self.lsps.stop()
                except Exception:
                    logger.exception(
                        "Failed to clean up language servers after initialization error."
                    )
            self.init_status.record("Backend initialization failed")
            self.init_status.mark_error(str(exc))
            raise

    async def _initialize_launcher_async(self) -> None:
        self.init_status.record("Preparing launcher runtime")
        await self._maybe_delay()
        self._ready_event.set()
        self.init_status.record("Launcher backend ready")
        self.init_status.mark_ready()

    async def _initialize_deployment_async(self, app) -> None:
        from setta.websockets.msg_handlers.frontend_receiver import (
            WMHFrontendReceiver,
        )
        from setta.websockets.msg_handlers.python_script_receiver import (
            WMHPythonScriptReceiver,
        )

        self.init_status.record("Loading deployment")
        await self._maybe_delay()
        if self.share_deployment_root is None:
            raise ValueError("Deployment root must be set in deployment mode")
        self.share_session_store = MemorySessionStore(
            ttl_seconds=DEFAULT_SHARE_SESSION_TTL_SECONDS
        )
        self.specific_file_watcher = SpecificFileWatcher()
        self.share_runtime_state = ShareRuntimeState(
            self.dbe,
            self.share_deployment_root,
            self.wmh_frontend_sender,
            specific_file_watcher=self.specific_file_watcher,
            realtime_event_hub=self.realtime_event_hub,
        )
        self.settings_file = SettingsFile(
            self.dbe,
            self.wmh_frontend_sender,
            allow_write=False,
        )
        self.share_runtime_state.initialize_share_state(self.settings_file)
        lsp_writers = None
        from setta.project_state.project_manager_switcher import (
            ProjectManagerSwitcher,
        )

        self.project_manager_switcher = ProjectManagerSwitcher(
            share_runtime_state=self.share_runtime_state,
            settings_file=self.settings_file,
            python_script_sender=self.wmh_python_script_sender,
            lsp_writers=lsp_writers,
            frontend_sender=self.wmh_frontend_sender,
            specific_file_watcher=self.specific_file_watcher,
            plugin_manager=self.plugin_manager,
        )
        if self.share_runtime_state.share_policy.allowRun:
            self.terminals = Terminals(self.wmh_frontend_sender, self.settings_file)
        else:
            self.terminals = None
        if (
            self.share_runtime_state.share_policy.allowRun
            and self.share_runtime_state.share_policy.runSnapshotMode
            == RunSnapshotMode.ephemeral
        ):
            spawn_background_task(
                run_share_run_cleanup_loop(
                    self.share_runtime_state.share_runs_root,
                    ttl_seconds=DEFAULT_SHARE_RUN_TTL_SECONDS,
                    interval_seconds=DEFAULT_SHARE_RUN_CLEANUP_INTERVAL_SECONDS,
                ),
                label="share-run-cleanup",
                extra_values={
                    "deployment_name": self.share_runtime_state.deployment_name,
                    "deployment_version": self.share_runtime_state.deployment_version,
                },
            )
        self.share_listener_runtime = ShareListenerRuntime(
            deployment_root=self.share_deployment_root,
            manifest=self.share_runtime_state.manifest,
            runtime_root=self.share_runtime_root,
        )
        self.wmh_frontend_receiver = WMHFrontendReceiver(
            self.websocket_manager,
            project_manager=None,
            realtime_event_hub=self.realtime_event_hub,
            ui_setting_reveal_result_hub=self.ui_setting_reveal_result_hub,
            share_mode=True,
            share_runtime_state=self.share_runtime_state,
        )
        self.wmh_python_script_receiver = WMHPythonScriptReceiver(
            self.websocket_manager,
            self.listener_registry,
            self.wmh_frontend_sender,
            self.wmh_python_script_sender,
            self.project_manager_switcher,
            dbe=self.dbe,
        )
        share_terminals = self.terminals
        spawn_background_task(
            run_share_session_cleanup_loop(
                self.share_session_store,
                self.share_runtime_state,
                self.project_manager_switcher,
                share_listener_runtime=self.share_listener_runtime,
                terminals=share_terminals,
                realtime_event_hub=self.realtime_event_hub,
                interval_seconds=DEFAULT_SHARE_SESSION_CLEANUP_INTERVAL_SECONDS,
            ),
            label="share-session-cleanup",
            extra_values={
                "deployment_name": self.share_runtime_state.deployment_name,
                "deployment_version": self.share_runtime_state.deployment_version,
            },
        )
        self.init_status.record("Loading backend plugins")
        await self._maybe_delay()
        self.plugin_manager.load_backend_plugins(app=app)
        if self.specific_file_watcher:
            self.specific_file_watcher.start()
        self._start_transcription_session_cleanup_loop()
        self._ready_event.set()
        self.init_status.record(
            "App backend ready" if self.app_mode else "Share backend ready"
        )
        self.init_status.mark_ready()

    async def wait_until_ready(self) -> None:
        await self._initialization_task
        await self._ready_event.wait()

    def _start_transcription_session_cleanup_loop(self) -> None:
        if self.transcription_session_cleanup_task is not None:
            return
        self.transcription_session_cleanup_task = spawn_background_task(
            run_transcription_session_cleanup_loop(
                self.transcription_session_manager,
                interval_seconds=DEFAULT_TRANSCRIPTION_SESSION_CLEANUP_INTERVAL_SECONDS,
            ),
            label="transcription-session-cleanup",
            extra_values={"mode": self._resolve_server_mode()},
        )

    async def stop_transcription_session_cleanup_loop(self) -> None:
        task = self.transcription_session_cleanup_task
        if task is None:
            return
        self.transcription_session_cleanup_task = None
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            return

    def _resolve_deployment_root(
        self, deployment_mode: bool, deployment_root: Path | None
    ) -> Path | None:
        if not deployment_mode:
            return None
        if deployment_root is None:
            raise ValueError("Deployment mode requires a deployment root")
        resolved = deployment_root.expanduser().resolve()
        if not resolved.exists():
            raise FileNotFoundError(f"Deployment root does not exist: {resolved}")
        DBE(resolved).read_project_required()
        return resolved

    def _resolve_share_runtime_root(
        self, share_deployment_root: Path | None
    ) -> Path | None:
        if not self.deployment_mode or share_deployment_root is None:
            return None
        manifest = DBE(share_deployment_root).read_deployment_manifest_optional()
        if manifest is None:
            raise FileNotFoundError(
                f"Deployment manifest not found: {share_deployment_root / 'manifest.json'}"
            )
        deployment_name = manifest.deploymentName
        deployment_version = manifest.deploymentVersion
        deployments_root = share_deployment_root.parent.parent
        if deployments_root.name == "deployments":
            # For roots like <parent>/deployments/<name>/<version>, store runtime
            # under <parent>/deployment_runtime/<name>/<version>.
            base_root = deployments_root.parent
        else:
            # For arbitrary roots, store runtime under <deployment_root_parent>/deployment_runtime/...
            base_root = share_deployment_root.parent
        runtime_root = (
            base_root / "deployment_runtime" / deployment_name / deployment_version
        ).resolve()
        runtime_root.mkdir(parents=True, exist_ok=True)
        return runtime_root

    async def _maybe_delay(self) -> None:
        delay = C.BACKEND_INIT_DELAY_SECONDS
        if delay and delay > 0:
            await asyncio.sleep(delay)

    def _resolve_server_mode(self) -> str:
        if self.app_mode:
            return "app"
        if self.share_mode:
            return "share"
        if self.launcher_mode:
            return "launcher"
        return "ide"

    def _defer_attr(self, name: str) -> _T:
        return cast("_T", _UninitializedAttribute(name))
