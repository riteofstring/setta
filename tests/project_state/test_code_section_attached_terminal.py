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
from setta.project_state.project_manager_types import (
    CreateChildSectionsRequest,
    MoveSectionsRequest,
    SetCodeSectionAttachedTerminalRequest,
)
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl_with_type_guard,
    set_curr_effective_section_impl_value,
)
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.id import ID
from setta.types.project_config import Position, ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import (
    BaseCodeSectionImpl,
    CodeSectionImpl,
    GenPythonCodeSectionImpl,
    SectionSize,
    SectionSizeMode,
    TerminalSectionImpl,
    TextBlockSectionImpl,
)
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.setta_paths import temporary_setta_paths

class AttachedTerminalTestManager(BaseProjectManager):
    def __init__(
        self,
        lsp_writers: LSPWriters,
        websocket_msg_handler: WMHFrontendSender,
        python_script_sender: WMHPythonScriptSender,
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
            python_script_sender,
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
class TestCodeSectionAttachedTerminal:
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
                setta_files_root=self.setta_root,
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

        self.manager = AttachedTerminalTestManager(
            self.lsp_writers,
            self.frontend_sender,
            self.python_script_sender,
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

        yield

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

        terminal_impl = TerminalSectionImpl(id=ID("terminal-impl"))
        terminal_variant = Variant(
            id=ID("variant-terminal"),
            impl=terminal_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(terminal_impl),
        )
        terminal_section = Core(
            id=ID("section-terminal"),
            name="Terminal Section",
            variants=[terminal_variant.id],
            defaultVariant=terminal_variant.id,
        )

        text_impl = TextBlockSectionImpl(id=ID("text-impl"))
        text_variant = Variant(
            id=ID("variant-text"),
            impl=text_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(text_impl),
        )
        text_section = Core(
            id=ID("section-text"),
            name="Text Section",
            variants=[text_variant.id],
            defaultVariant=text_variant.id,
        )

        gen_impl = GenPythonCodeSectionImpl(id=ID("gen-code-impl"))
        gen_variant = Variant(
            id=ID("variant-gen-code"),
            impl=gen_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(gen_impl),
        )
        gen_section = Core(
            id=ID("section-gen-code"),
            name="Generated Code Section",
            variants=[gen_variant.id],
            defaultVariant=gen_variant.id,
        )

        project_config = ProjectConfig(
            id=ID("project-config"),
            name="Terminal Attachment Project",
            sectionVariantMap={
                code_section.id: code_variant.id,
                terminal_section.id: terminal_variant.id,
                text_section.id: text_variant.id,
                gen_section.id: gen_variant.id,
            },
            topLevelSections={
                code_section.id: TopLevelSectionLayout(),
                terminal_section.id: TopLevelSectionLayout(),
                text_section.id: TopLevelSectionLayout(),
                gen_section.id: TopLevelSectionLayout(),
            },
        )

        self.project_config_id = project_config.id
        self.code_section_id = code_section.id
        self.terminal_section_id = terminal_section.id
        self.text_section_id = text_section.id
        self.gen_section_id = gen_section.id

        return ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={
                code_section.id: code_section,
                terminal_section.id: terminal_section,
                text_section.id: text_section,
                gen_section.id: gen_section,
            },
            sectionImpls={
                code_impl.id: code_impl,
                terminal_impl.id: terminal_impl,
                text_impl.id: text_impl,
                gen_impl.id: gen_impl,
            },
            sectionVariants={
                code_variant.id: code_variant,
                terminal_variant.id: terminal_variant,
                text_variant.id: text_variant,
                gen_variant.id: gen_variant,
            },
        )

    async def test_attach_and_detach_terminal(self):
        await self.manager.set_code_section_attached_terminal(
            SetCodeSectionAttachedTerminalRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.code_section_id,
                terminalSectionId=self.terminal_section_id,
            )
        )

        state = self.manager.get_single_config_state(self.project_config_id)
        impl = get_curr_effective_section_impl_with_type_guard(
            state, self.code_section_id, BaseCodeSectionImpl
        )
        assert impl.attachedTerminalSectionId == self.terminal_section_id
        assert impl.children == [self.terminal_section_id]
        assert (
            self.terminal_section_id not in state.projectConfig.topLevelSections
        )

        await self.manager.set_code_section_attached_terminal(
            SetCodeSectionAttachedTerminalRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.code_section_id,
                terminalSectionId=None,
            )
        )

        state = self.manager.get_single_config_state(self.project_config_id)
        impl = get_curr_effective_section_impl_with_type_guard(
            state, self.code_section_id, BaseCodeSectionImpl
        )
        assert impl.attachedTerminalSectionId is None
        assert impl.children == []
        assert self.terminal_section_id in state.projectConfig.topLevelSections

    async def test_attach_bumps_code_section_height(self):
        project_state = self.manager.get_single_config_state(self.project_config_id)
        set_curr_effective_section_impl_value(
            project_state,
            self.code_section_id,
            {"size": SectionSize(width=400.0, height=100.0)},
        )
        await self.manager.update(project_state)

        await self.manager.set_code_section_attached_terminal(
            SetCodeSectionAttachedTerminalRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.code_section_id,
                terminalSectionId=self.terminal_section_id,
            )
        )

        state = self.manager.get_single_config_state(self.project_config_id)
        impl = get_curr_effective_section_impl_with_type_guard(
            state, self.code_section_id, BaseCodeSectionImpl
        )
        sizing_policy = self.settings_file.settings.sectionSizingPolicy
        expected_min_height = (
            float(sizing_policy.byType.Code.minHeight)
            + float(sizing_policy.byType.Terminal.minHeight)
            + 80.0
        )
        expected_max_height = float(sizing_policy.byType.Code.maxHeight)
        if expected_min_height > expected_max_height:
            expected_min_height = expected_max_height
        assert isinstance(impl.size.height, float)
        assert impl.size.height >= expected_min_height

    async def test_attach_bumps_auto_code_section_height(self):
        project_state = self.manager.get_single_config_state(self.project_config_id)
        set_curr_effective_section_impl_value(
            project_state,
            self.code_section_id,
            {"size": SectionSize(width=420.0, height=SectionSizeMode.auto)},
        )
        await self.manager.update(project_state)

        await self.manager.set_code_section_attached_terminal(
            SetCodeSectionAttachedTerminalRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.code_section_id,
                terminalSectionId=self.terminal_section_id,
            )
        )

        state = self.manager.get_single_config_state(self.project_config_id)
        impl = get_curr_effective_section_impl_with_type_guard(
            state, self.code_section_id, BaseCodeSectionImpl
        )
        sizing_policy = self.settings_file.settings.sectionSizingPolicy
        expected_min_height = (
            float(sizing_policy.byType.Code.minHeight)
            + float(sizing_policy.byType.Terminal.minHeight)
            + 80.0
        )
        expected_max_height = float(sizing_policy.byType.Code.maxHeight)
        if expected_min_height > expected_max_height:
            expected_min_height = expected_max_height
        assert isinstance(impl.size.height, float)
        assert impl.size.height >= expected_min_height

    async def test_create_child_terminal_sets_concrete_height(self):
        # Regresses attached-first terminals that previously stored
        # `size.height="auto"` and failed to reflow correctly on resize.
        await self.manager.create_child_sections(
            CreateChildSectionsRequest(
                projectConfigId=self.project_config_id,
                parentId=self.code_section_id,
                implType="Terminal",
                numChildren=1,
                startIdx=0,
            )
        )

        state = self.manager.get_single_config_state(self.project_config_id)
        code_impl = get_curr_effective_section_impl_with_type_guard(
            state, self.code_section_id, BaseCodeSectionImpl
        )
        assert code_impl.attachedTerminalSectionId is not None

        terminal_impl = get_curr_effective_section_impl_with_type_guard(
            state,
            code_impl.attachedTerminalSectionId,
            TerminalSectionImpl,
        )
        assert terminal_impl.size.width == code_impl.size.width
        assert terminal_impl.size.height != SectionSizeMode.auto
        assert isinstance(terminal_impl.size.height, float)

    async def test_ensure_attached_terminal_for_run_sets_concrete_height(self):
        # Regresses run-created attached terminals that were initialized with
        # `size.height="auto"` and then stayed broken after detaching.
        attached_terminal_id = await self.manager.ensure_code_section_attached_terminal_for_run(
            self.project_config_id,
            self.code_section_id,
        )

        state = self.manager.get_single_config_state(self.project_config_id)
        code_impl = get_curr_effective_section_impl_with_type_guard(
            state, self.code_section_id, BaseCodeSectionImpl
        )
        terminal_impl = get_curr_effective_section_impl_with_type_guard(
            state,
            attached_terminal_id,
            TerminalSectionImpl,
        )

        assert code_impl.attachedTerminalSectionId == attached_terminal_id
        assert terminal_impl.size.width == code_impl.size.width
        assert terminal_impl.size.height != SectionSizeMode.auto
        assert isinstance(terminal_impl.size.height, float)

    async def test_attach_invalid_terminal_raises(self):
        with pytest.raises(KeyError):
            await self.manager.set_code_section_attached_terminal(
                SetCodeSectionAttachedTerminalRequest(
                    projectConfigId=self.project_config_id,
                    sectionId=self.code_section_id,
                    terminalSectionId=ID("missing-terminal"),
                )
            )

    async def test_attach_requires_code_section(self):
        with pytest.raises(ValueError):
            await self.manager.set_code_section_attached_terminal(
                SetCodeSectionAttachedTerminalRequest(
                    projectConfigId=self.project_config_id,
                    sectionId=self.terminal_section_id,
                    terminalSectionId=self.terminal_section_id,
                )
            )

    async def test_attach_terminal_to_genpython_section(self):
        await self.manager.set_code_section_attached_terminal(
            SetCodeSectionAttachedTerminalRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.gen_section_id,
                terminalSectionId=self.terminal_section_id,
            )
        )

        state = self.manager.get_single_config_state(self.project_config_id)
        impl = get_curr_effective_section_impl_with_type_guard(
            state, self.gen_section_id, BaseCodeSectionImpl
        )
        assert impl.attachedTerminalSectionId == self.terminal_section_id
        assert impl.children == [self.terminal_section_id]
        assert (
            self.terminal_section_id not in state.projectConfig.topLevelSections
        )

    async def test_move_sections_attach_and_detach_round_trip(self):
        await self.manager.move_sections(
            MoveSectionsRequest(
                projectConfigId=self.project_config_id,
                sectionIds=[self.terminal_section_id],
                newParentId=self.code_section_id,
                newIndex=0,
                positionsById=None,
            )
        )

        state = self.manager.get_single_config_state(self.project_config_id)
        impl = get_curr_effective_section_impl_with_type_guard(
            state, self.code_section_id, BaseCodeSectionImpl
        )
        assert impl.attachedTerminalSectionId == self.terminal_section_id
        assert impl.children == [self.terminal_section_id]
        assert (
            self.terminal_section_id not in state.projectConfig.topLevelSections
        )

        await self.manager.move_sections(
            MoveSectionsRequest(
                projectConfigId=self.project_config_id,
                sectionIds=[self.terminal_section_id],
                newParentId=None,
                newIndex=None,
                positionsById={
                    self.terminal_section_id: Position(x=120.0, y=80.0)
                },
            )
        )

        state = self.manager.get_single_config_state(self.project_config_id)
        impl = get_curr_effective_section_impl_with_type_guard(
            state, self.code_section_id, BaseCodeSectionImpl
        )
        assert impl.attachedTerminalSectionId is None
        assert impl.children == []
        assert self.terminal_section_id in state.projectConfig.topLevelSections

        await self.manager.move_sections(
            MoveSectionsRequest(
                projectConfigId=self.project_config_id,
                sectionIds=[self.terminal_section_id],
                newParentId=self.code_section_id,
                newIndex=0,
                positionsById=None,
            )
        )

        state = self.manager.get_single_config_state(self.project_config_id)
        impl = get_curr_effective_section_impl_with_type_guard(
            state, self.code_section_id, BaseCodeSectionImpl
        )
        assert impl.attachedTerminalSectionId == self.terminal_section_id
        assert impl.children == [self.terminal_section_id]
        assert (
            self.terminal_section_id not in state.projectConfig.topLevelSections
        )

    async def test_move_sections_rejects_non_terminal_child(self):
        with pytest.raises(ValueError):
            await self.manager.move_sections(
                MoveSectionsRequest(
                    projectConfigId=self.project_config_id,
                    sectionIds=[self.text_section_id],
                    newParentId=self.code_section_id,
                    newIndex=0,
                    positionsById=None,
                )
            )
