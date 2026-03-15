import asyncio
from contextlib import ExitStack, suppress
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
import pytest_asyncio
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import LSPServers, LSPWriters
from setta.project_state.artifacts import Artifacts
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.project_manager_types import RunCodeRequest
from setta.terminals.run_code import run_code
from setta.terminals.terminals import Terminals, build_terminal_id
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import BaseCodeSectionImpl, CodeSectionImpl
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.setta_paths import temporary_setta_paths

class RunCodeTestManager(BaseProjectManager):
    def __init__(
        self,
        lsp_writers: LSPWriters,
        websocket_msg_handler: WMHFrontendSender,
        settings_file: SettingsFile,
        specific_file_watcher: SpecificFileWatcher,
        dbe: DBE,
        artifacts: Artifacts,
        json_source: JSONSource,
        code_files: CodeFiles,
        initial_backend: ProjectStateBackend,
    ):
        self._initial_backend = initial_backend
        super().__init__(
            lsp_writers,
            websocket_msg_handler,
            settings_file,
            specific_file_watcher,
            dbe,
            artifacts,
            json_source,
            code_files,
        )

    def load_initial_state(self) -> ProjectStateBackend:
        return self._initial_backend.model_copy(deep=True)

    def save(self):  # pragma: no cover - not exercised in tests
        return None

    async def save_as_new_project_config(self, _x):  # pragma: no cover
        return None


@pytest.mark.asyncio
class TestRunCodeAttachedTerminal:
    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self):
        self._tmpdir = TemporaryDirectory()
        root = Path(self._tmpdir.name)
        self.workspace_root = root
        self.setta_root = root / "setta_files"
        self.code_folder = self.setta_root / "code"
        self.artifacts_folder = self.setta_root / "artifacts"
        self.backup_folder = self.setta_root / "backups"

        for path in (self.code_folder, self.artifacts_folder, self.backup_folder):
            path.mkdir(parents=True, exist_ok=True)

        self._stack = ExitStack()
        self._stack.enter_context(
            temporary_setta_paths(
                workspace_root=self.workspace_root,
                setta_files_location="local",
            )
        )

        self.websocket_manager = WebsocketManager()
        self.listener_registry = ListenerRegistry()
        self.frontend_sender = WMHFrontendSender(self.websocket_manager)
        self.python_script_sender = WMHPythonScriptSender(
            self.websocket_manager, self.listener_registry
        )
        self.dbe = DBE(self.setta_root)
        self.settings_file = SettingsFile(self.dbe, self.frontend_sender)
        self.lsps = LSPServers(self.settings_file.settings.languageServer)
        self.lsp_writers = LSPWriters(self.lsps)
        self.specific_file_watcher = SpecificFileWatcher()
        self.artifacts = Artifacts(
            self.frontend_sender,
            self.specific_file_watcher,
            self.dbe,
        )
        self.code_files = CodeFiles(
            self.frontend_sender,
            self.specific_file_watcher,
            self.dbe,
        )
        self.json_source = JSONSource(
            self.frontend_sender,
            self.settings_file,
            self.specific_file_watcher,
            self.dbe,
        )

        self.project_state = self._build_project_state()
        backend = merge_single_config_into_backend(
            ProjectStateBackend(),
            self.project_state.model_copy(deep=True),
        )
        backend.validate_default_project_id()

        self.manager = RunCodeTestManager(
            self.lsp_writers,
            self.frontend_sender,
            self.settings_file,
            self.specific_file_watcher,
            self.dbe,
            self.artifacts,
            self.json_source,
            self.code_files,
            backend,
        )
        await self.manager._process_queue_task_started.wait()
        await self.manager.update(self.project_state.model_copy(deep=True))

        self.terminals = Terminals(self.frontend_sender, self.settings_file)
        yield

        await self.terminals.delete_all_terminals()
        self.manager.autosave_debouncer.cancel()
        self.manager.autosave_debouncer.cancel_pending()
        self.manager.queue_task.cancel()
        with suppress(asyncio.CancelledError):
            await self.manager.queue_task
        with suppress(RuntimeError):
            self.specific_file_watcher.stop()
        self._stack.close()
        self._tmpdir.cleanup()

    def _build_project_state(self) -> ProjectStateSingleConfig:
        code_impl = CodeSectionImpl(id=ID("code-impl"))
        code_variant = Variant(
            id=ID("variant-code"),
            impl=code_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(code_impl),
        )
        code_section = Core(
            id=ID("section-code"),
            name="Code Section",
            variants=[code_variant.id],
            defaultVariant=code_variant.id,
        )

        project_config = ProjectConfig(
            id=ID("project-config"),
            name="Run Code Project",
            entryCodeBlockId=code_section.id,
            sectionVariantMap={
                code_section.id: code_variant.id,
            },
            topLevelSections={
                code_section.id: TopLevelSectionLayout(),
            },
        )

        self.project_config_id = project_config.id
        self.code_section_id = code_section.id

        return ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={
                code_section.id: code_section,
            },
            sectionImpls={
                code_impl.id: code_impl,
            },
            sectionVariants={
                code_variant.id: code_variant,
            },
        )

    async def test_invalid_terminal_id_is_ignored(self):
        missing_terminal_id = ID("missing-terminal")
        await run_code(
            RunCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.code_section_id,
                terminalSectionId=missing_terminal_id,
            ),
            self.manager,
            self.terminals,
        )

        state = self.manager.get_single_config_state(self.project_config_id)
        impl = get_curr_effective_section_impl_with_type_guard(
            state, self.code_section_id, BaseCodeSectionImpl
        )
        assert impl.attachedTerminalSectionId is not None
        assert impl.attachedTerminalSectionId != missing_terminal_id
        assert (
            build_terminal_id(missing_terminal_id, None)
            not in self.terminals.PTY_PIDS
        )
        assert (
            build_terminal_id(impl.attachedTerminalSectionId, None)
            in self.terminals.PTY_PIDS
        )

    async def test_valid_terminal_id_is_reused(self):
        attached_terminal_id = await self.manager.ensure_code_section_attached_terminal_for_run(
            self.project_config_id,
            self.code_section_id,
        )

        await run_code(
            RunCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.code_section_id,
                terminalSectionId=attached_terminal_id,
            ),
            self.manager,
            self.terminals,
        )

        state = self.manager.get_single_config_state(self.project_config_id)
        impl = get_curr_effective_section_impl_with_type_guard(
            state, self.code_section_id, BaseCodeSectionImpl
        )
        assert impl.attachedTerminalSectionId == attached_terminal_id
        assert (
            build_terminal_id(attached_terminal_id, None)
            in self.terminals.PTY_PIDS
        )
