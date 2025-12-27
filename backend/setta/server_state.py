import asyncio
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
from setta.terminals.terminals import Terminals
from setta.utils.constants import C
from setta.utils.init_status import BackendInitializationStatus
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.cli_receiver import WMHCLIReceiver
from setta.websockets.msg_handlers.cli_sender import WMHCLISender
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.realtime_event_hub import RealtimeEventHub
from setta.websockets.websocket_manager import WebsocketManager

if TYPE_CHECKING:
    from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
    from setta.websockets.msg_handlers.frontend_receiver import WMHFrontendReceiver
    from setta.websockets.msg_handlers.python_script_receiver import (
        WMHPythonScriptReceiver,
    )


_T = TypeVar("_T")


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
    def __init__(self, app):
        self.websocket_manager = WebsocketManager()
        self.listener_registry = ListenerRegistry()
        self.wmh_frontend_sender = WMHFrontendSender(self.websocket_manager)
        self.wmh_python_script_sender = WMHPythonScriptSender(
            self.websocket_manager,
            self.listener_registry,
        )
        self.realtime_event_hub = RealtimeEventHub(self.wmh_python_script_sender)
        self.dbe = DBE(C.SETTA_FILES_FOLDER)
        seed_llm_config_example_file(self.dbe)
        self.settings_file = SettingsFile(self.dbe, self.wmh_frontend_sender)
        self.wmh_cli_sender = WMHCLISender(self.websocket_manager)
        self.terminals = Terminals(self.wmh_frontend_sender, self.settings_file)

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
        self.wmh_frontend_receiver: WMHFrontendReceiver = self._defer_attr(
            "wmh_frontend_receiver"
        )
        self.wmh_cli_receiver = WMHCLIReceiver(self.websocket_manager)
        self.wmh_python_script_receiver: WMHPythonScriptReceiver = self._defer_attr(
            "wmh_python_script_receiver"
        )
        self.mcp_server: SettaFastMCP = self._defer_attr("mcp_server")
        self.mcp_client: MultiMCPClient = self._defer_attr("mcp_client")
        self.chat_manager: LLMChatManager = self._defer_attr("chat_manager")
        self.dotenv_watcher: DotEnvWatcher = self._defer_attr("dotenv_watcher")
        self.llm_config_watcher: LLMConfigWatcher = self._defer_attr(
            "llm_config_watcher"
        )

        self.init_status = BackendInitializationStatus()
        self.init_status.record("Booting backend services")
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
        from setta.project_state.project_manager import ProjectManager
        from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
        from setta.project_state.settings_project_manager import SettingsProjectManager
        from setta.websockets.msg_handlers.frontend_receiver import WMHFrontendReceiver
        from setta.websockets.msg_handlers.python_script_receiver import (
            WMHPythonScriptReceiver,
        )

        try:
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
            self.mcp_client = MultiMCPClient(llm_config.mcpServers)
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

    async def wait_until_ready(self) -> None:
        await self._initialization_task
        await self._ready_event.wait()

    async def _maybe_delay(self) -> None:
        delay = C.BACKEND_INIT_DELAY_SECONDS
        if delay and delay > 0:
            await asyncio.sleep(delay)

    def _defer_attr(self, name: str) -> _T:
        return cast("_T", _UninitializedAttribute(name))
