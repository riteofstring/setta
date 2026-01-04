import asyncio
from pathlib import Path
from typing import TYPE_CHECKING, TypeVar, cast

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import (
    SpecificFileWatcher,
)
from setta.llm.config import load_llm_config
from setta.llm.config_watcher import LLMConfigWatcher
from setta.llm.dotenv_watcher import DotEnvWatcher
from setta.llm.example_config import seed_llm_config_example_file
from setta.llm.llm_chat_manager import LLMChatManager
from setta.logging.tasks import spawn_background_task
from setta.lsp.managers import LSPReaders, LSPServers, LSPWriters, start_lsps
from setta.mcp.client import MultiMCPClient
from setta.mcp.fastmcp_patch import apply_fastmcp_preparse_patch
from setta.mcp.server import SettaFastMCP
from setta.project_state.artifacts import Artifacts
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.share_project_manager import ShareProjectManager
from setta.project_state.share_session_project_manager_switcher import (
    ShareSessionProjectManagerSwitcher,
)
from setta.share.chat_manager import ShareChatManager
from setta.share.deployment_utils import read_share_deployment_manifest
from setta.share.listener_runtime import ShareListenerRuntime
from setta.share.run_cleanup import (
    DEFAULT_SHARE_RUN_CLEANUP_INTERVAL_SECONDS,
    DEFAULT_SHARE_RUN_TTL_SECONDS,
    run_share_run_cleanup_loop,
)
from setta.share.session_cleanup import (
    DEFAULT_SHARE_SESSION_CLEANUP_INTERVAL_SECONDS,
    DEFAULT_SHARE_SESSION_TTL_SECONDS,
    run_share_session_cleanup_loop,
)
from setta.share.session_store import MemorySessionStore, ShareSessionStore
from setta.terminals.terminals import Terminals
from setta.types.settings_state import RunSnapshotMode
from setta.utils.constants import C
from setta.utils.init_status import BackendInitializationStatus
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.cli_receiver import WMHCLIReceiver
from setta.websockets.msg_handlers.cli_sender import WMHCLISender
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.realtime_event_hub import RealtimeEventHub
from setta.websockets.websocket_manager import WebsocketManager

_T = TypeVar("_T")

if TYPE_CHECKING:
    from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
    from setta.websockets.msg_handlers.frontend_receiver import WMHFrontendReceiver
    from setta.websockets.msg_handlers.python_script_receiver import (
        WMHPythonScriptReceiver,
    )


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


class SettaFastAPIState:
    def __init__(
        self,
        app,
        *,
        share_mode: bool = False,
        share_deployment_root: Path | None = None,
    ):
        self.share_mode = share_mode
        self.share_deployment_root = self._resolve_share_deployment_root(
            share_mode, share_deployment_root
        )
        self.share_runtime_root = self._resolve_share_runtime_root(
            self.share_deployment_root
        )

        self.websocket_manager = WebsocketManager()
        self.listener_registry = ListenerRegistry()
        self.dbe = DBE(
            self.share_deployment_root
            if self.share_deployment_root is not None
            else C.SETTA_FILES_FOLDER,
            runtime_root=self.share_runtime_root,
            lock_root=self.share_runtime_root,
        )
        if not self.share_mode:
            seed_llm_config_example_file(self.dbe)
        self.wmh_frontend_sender = WMHFrontendSender(
            self.websocket_manager,
            share_mode=self.share_mode,
        )
        self.wmh_python_script_sender = WMHPythonScriptSender(
            self.websocket_manager,
            self.listener_registry,
            None if self.share_mode else self.dbe,
        )
        self.realtime_event_hub = RealtimeEventHub(self.wmh_python_script_sender)
        if self.share_mode:
            self.settings_file = self._defer_attr("settings_file")
            self.terminals = self._defer_attr("terminals")
        else:
            self.settings_file = SettingsFile(self.dbe, self.wmh_frontend_sender)
            self.terminals = Terminals(self.wmh_frontend_sender, self.settings_file)
        self.wmh_cli_sender = WMHCLISender(self.websocket_manager)

        self.lsps: LSPServers = self._defer_attr("lsps")
        self.lsp_writers: LSPWriters = self._defer_attr("lsp_writers")
        self.lsp_readers: LSPReaders = self._defer_attr("lsp_readers")
        self.specific_file_watcher: SpecificFileWatcher = self._defer_attr(
            "specific_file_watcher"
        )
        self.artifacts: Artifacts = self._defer_attr("artifacts")
        self.code_files: CodeFiles = self._defer_attr("code_files")
        self.json_source: JSONSource = self._defer_attr("json_source")
        self.project_manager_switcher: ProjectManagerSwitcher = self._defer_attr(
            "project_manager_switcher"
        )
        self.share_session_store: ShareSessionStore = self._defer_attr(
            "share_session_store"
        )
        self.share_project_manager: ShareProjectManager = self._defer_attr(
            "share_project_manager"
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
        self.chat_manager: LLMChatManager | ShareChatManager = self._defer_attr(
            "chat_manager"
        )
        self.dotenv_watcher: DotEnvWatcher = self._defer_attr("dotenv_watcher")
        self.llm_config_watcher: LLMConfigWatcher = self._defer_attr(
            "llm_config_watcher"
        )

        self.init_status = BackendInitializationStatus()
        mode_label = "share" if self.share_mode else "backend"
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
            if self.share_mode:
                await self._initialize_share_async(app)
                return
            from setta.project_state.project_manager import ProjectManager
            from setta.project_state.project_manager_switcher import (
                ProjectManagerSwitcher,
            )
            from setta.project_state.settings_project_manager import (
                SettingsProjectManager,
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
                self.wmh_frontend_sender, self.specific_file_watcher, self.dbe
            )
            self.code_files = CodeFiles(
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
            self.lsps = LSPServers(self.settings_file.settings.languageServer)
            self.lsp_writers = LSPWriters(self.lsps)
            project_manager = ProjectManager(
                self.lsp_writers,
                self.wmh_frontend_sender,
                self.wmh_python_script_sender,
                self.settings_file,
                self.specific_file_watcher,
                self.dbe,
                self.artifacts,
                self.json_source,
                self.code_files,
            )
            settings_project_manager = SettingsProjectManager(
                self.lsp_writers,
                self.wmh_frontend_sender,
                self.wmh_python_script_sender,
                self.settings_file,
                self.specific_file_watcher,
                self.dbe,
                self.artifacts,
                self.json_source,
                self.code_files,
            )
            self.project_manager_switcher = ProjectManagerSwitcher(
                project_manager, settings_project_manager
            )

            self.init_status.record("Preparing websocket handlers")
            await self._maybe_delay()
            self.wmh_frontend_receiver = WMHFrontendReceiver(
                self.websocket_manager,
                project_manager,
                self.realtime_event_hub,
            )
            self.wmh_python_script_receiver = WMHPythonScriptReceiver(
                self.websocket_manager,
                self.listener_registry,
                self.wmh_frontend_sender,
                self.wmh_python_script_sender,
                self.project_manager_switcher,
                self.dbe,
            )
            self.lsp_readers = LSPReaders(self.lsps, self.wmh_frontend_sender)

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
            self.chat_manager = LLMChatManager(
                self.dbe,
                self.mcp_client,
                self.wmh_frontend_sender,
                self.project_manager_switcher,
            )
            self.chat_manager.update_config(llm_config)
            self.dotenv_watcher = DotEnvWatcher(
                self.specific_file_watcher,
                self.chat_manager,
                self.wmh_frontend_sender,
                self.dbe,
            )
            self.dotenv_watcher.start()
            self.llm_config_watcher = LLMConfigWatcher(
                self.specific_file_watcher,
                self.chat_manager,
                self.wmh_frontend_sender,
                self.dbe,
            )
            self.llm_config_watcher.start()

            self.init_status.record("Starting background services")
            await self._maybe_delay()
            if self.mcp_client:
                spawn_background_task(
                    self.mcp_client.connect_to_servers(),
                    label="mcp-client-connect",
                    request_id="boot",
                    extra_values={"service": "mcp-client"},
                )
            if self.lsps and self.lsp_readers and self.lsp_writers:
                spawn_background_task(
                    start_lsps(self.lsps, self.lsp_readers, self.lsp_writers),
                    label="lsp-startup",
                    request_id="boot",
                    extra_values={"service": "language-servers"},
                )
            if self.specific_file_watcher:
                self.specific_file_watcher.start()

            self._ready_event.set()
            self.init_status.record("Backend ready")
            self.init_status.mark_ready()
        except Exception as exc:
            self.init_status.record("Backend initialization failed")
            self.init_status.mark_error(str(exc))
            raise

    async def _initialize_share_async(self, app) -> None:
        from setta.websockets.msg_handlers.frontend_receiver import (
            WMHFrontendReceiver,
        )
        from setta.websockets.msg_handlers.python_script_receiver import (
            WMHPythonScriptReceiver,
        )

        self.init_status.record("Loading share deployment")
        await self._maybe_delay()
        if self.share_deployment_root is None:
            raise ValueError("Share deployment root must be set in share mode")
        self.share_session_store = MemorySessionStore(
            ttl_seconds=DEFAULT_SHARE_SESSION_TTL_SECONDS
        )
        self.share_project_manager = ShareProjectManager(
            self.dbe,
            self.share_deployment_root,
            self.wmh_frontend_sender,
        )
        self.settings_file = SettingsFile(
            self.dbe,
            self.wmh_frontend_sender,
            allow_write=False,
        )
        self.share_project_manager.initialize_share_state(self.settings_file)
        lsp_writers = None
        if self.share_project_manager.share_policy.allowLSP:
            self.lsps = LSPServers(self.settings_file.settings.languageServer)
            self.lsp_writers = LSPWriters(self.lsps)
            self.lsp_readers = LSPReaders(self.lsps, self.wmh_frontend_sender)
            lsp_writers = self.lsp_writers
        self.project_manager_switcher = ShareSessionProjectManagerSwitcher(
            self.share_project_manager,
            self.settings_file,
            self.wmh_python_script_sender,
            lsp_writers=lsp_writers,
        )
        if self.share_project_manager.share_policy.allowRun:
            self.terminals = Terminals(self.wmh_frontend_sender, self.settings_file)
        if (
            self.share_project_manager.share_policy.runSnapshotMode
            == RunSnapshotMode.ephemeral
        ):
            spawn_background_task(
                run_share_run_cleanup_loop(
                    self.share_project_manager.share_runs_root,
                    ttl_seconds=DEFAULT_SHARE_RUN_TTL_SECONDS,
                    interval_seconds=DEFAULT_SHARE_RUN_CLEANUP_INTERVAL_SECONDS,
                ),
                label="share-run-cleanup",
                extra_values={
                    "project_config_name": self.share_project_manager.project_config_name,
                    "deployment_version": self.share_project_manager.deployment_version,
                },
            )
        self.share_listener_runtime = ShareListenerRuntime(
            deployment_root=self.share_deployment_root,
            manifest=self.share_project_manager.manifest,
            project_config_id=self.share_project_manager.project_config_id,
        )
        self.wmh_frontend_receiver = WMHFrontendReceiver(
            self.websocket_manager,
            project_manager=None,
            realtime_event_hub=self.realtime_event_hub,
            share_mode=True,
        )
        self.wmh_python_script_receiver = WMHPythonScriptReceiver(
            self.websocket_manager,
            self.listener_registry,
            self.wmh_frontend_sender,
            self.wmh_python_script_sender,
            project_manager_switcher=None,
            dbe=self.dbe,
            share_session_manager_switcher=self.project_manager_switcher,
            share_mode=True,
        )
        share_policy = self.share_project_manager.share_policy
        llm_dbe = self._resolve_share_llm_dbe()
        llm_config = None
        if share_policy.allowLLM or share_policy.allowMCP:
            llm_config = load_llm_config(llm_dbe, allow_write=False)
        if share_policy.allowMCP:
            apply_fastmcp_preparse_patch()
            self.mcp_server = SettaFastMCP(
                app,
                self,
                "/mcp",
                "Setta MCP Server",
                self.wmh_frontend_sender,
                self.dbe,
            )
            if llm_config is None:
                llm_config = load_llm_config(llm_dbe, allow_write=False)
            self.mcp_client = MultiMCPClient(
                llm_config.mcpServers,
                frontend_sender=self.wmh_frontend_sender,
            )
            if self.mcp_client:
                spawn_background_task(
                    self.mcp_client.connect_to_servers(),
                    label="mcp-client-connect",
                    request_id="boot",
                    extra_values={"service": "mcp-client"},
                )
        if share_policy.allowLLM:
            self.chat_manager = ShareChatManager(
                llm_dbe,
                self.wmh_frontend_sender,
                self.share_project_manager,
                self.share_session_store,
                mcp_client=self.mcp_client if share_policy.allowMCP else None,
                llm_config=llm_config,
            )
        share_chat_manager = self.chat_manager if share_policy.allowLLM else None
        share_terminals = self.terminals if share_policy.allowRun else None
        spawn_background_task(
            run_share_session_cleanup_loop(
                self.share_session_store,
                self.share_project_manager,
                self.project_manager_switcher,
                share_listener_runtime=self.share_listener_runtime,
                share_chat_manager=share_chat_manager,
                terminals=share_terminals,
                interval_seconds=DEFAULT_SHARE_SESSION_CLEANUP_INTERVAL_SECONDS,
            ),
            label="share-session-cleanup",
            extra_values={
                "project_config_name": self.share_project_manager.project_config_name,
                "deployment_version": self.share_project_manager.deployment_version,
            },
        )
        if self.lsps and self.lsp_readers and self.lsp_writers:
            spawn_background_task(
                start_lsps(self.lsps, self.lsp_readers, self.lsp_writers),
                label="lsp-startup",
                request_id="boot",
                extra_values={"service": "language-servers"},
            )
        self._ready_event.set()
        self.init_status.record("Share backend ready")
        self.init_status.mark_ready()

    async def wait_until_ready(self) -> None:
        await self._initialization_task
        await self._ready_event.wait()

    def _resolve_share_deployment_root(
        self, share_mode: bool, share_deployment_root: Path | None
    ) -> Path | None:
        if not share_mode:
            return None
        if share_deployment_root is None:
            raise ValueError("Share mode requires a share deployment root")
        resolved = share_deployment_root.expanduser().resolve()
        if not resolved.exists():
            raise FileNotFoundError(f"Share deployment root does not exist: {resolved}")
        project_path = resolved / "project.json"
        if not project_path.exists():
            raise FileNotFoundError(
                f"Share deployment missing project.json: {project_path}"
            )
        return resolved

    def _resolve_share_runtime_root(
        self, share_deployment_root: Path | None
    ) -> Path | None:
        if not self.share_mode or share_deployment_root is None:
            return None
        manifest = read_share_deployment_manifest(share_deployment_root)
        if manifest is None:
            raise FileNotFoundError(
                f"Share deployment manifest not found: {share_deployment_root / 'manifest.json'}"
            )
        project_config_name = manifest.projectConfigName
        deployment_version = manifest.deploymentVersion
        share_deployments_root = share_deployment_root.parent.parent
        if share_deployments_root.name == "share_deployments":
            default_share_root = C.SHARE_DEPLOYMENTS_FOLDER.resolve()
            if share_deployments_root.resolve() == default_share_root:
                base_root = default_share_root.parent
            else:
                base_root = share_deployments_root
        else:
            base_root = share_deployment_root.parent
        runtime_root = (
            base_root / "share_runtime" / project_config_name / deployment_version
        ).resolve()
        runtime_root.mkdir(parents=True, exist_ok=True)
        return runtime_root

    def _resolve_share_llm_dbe(self) -> DBE:
        if not self.share_mode or self.share_runtime_root is None:
            return self.dbe
        return DBE(
            self.share_runtime_root,
            runtime_root=self.share_runtime_root,
            lock_root=self.share_runtime_root,
        )

    async def _maybe_delay(self) -> None:
        delay = C.BACKEND_INIT_DELAY_SECONDS
        if delay and delay > 0:
            await asyncio.sleep(delay)

    def _defer_attr(self, name: str) -> _T:
        return cast("_T", _UninitializedAttribute(name))
