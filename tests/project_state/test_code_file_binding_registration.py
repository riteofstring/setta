import asyncio
import hashlib
from contextlib import ExitStack, suppress
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
import pytest_asyncio
from setta.code_gen.utils import sanitize_slug
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import LSPServers, LSPWriters
from setta.project_state.artifacts import Artifacts
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.code_files import (
    CodeFileReloadPlan,
    CodeFiles,
    RegisteredCodeFileBinding,
)
from setta.project_state.project_manager_types import SetShowParamDisplayNamesRequest
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import (
    CodeFileAccessMode,
    CodeSectionImpl,
)
from setta.types.specific_file_watcher import FileEventType, FileWatcherCoreUpdate
from setta.utils.constants import C
from setta.utils.paths import normalize_workspace_path
from setta.utils.utils import build_gen_code_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.setta_paths import temporary_setta_paths

class ProjectManagerForTest(BaseProjectManager):
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

    def save(self):
        return None

    async def save_as_new_project_config(self, x):
        return None


@pytest.mark.asyncio
class TestCodeFileBindingRegistration:
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
        self.frontend_sender = WMHFrontendSender(self.websocket_manager)
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

        self.manager = ProjectManagerForTest(
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
        code_impl.code = "print('hello world')"
        variant = Variant(
            id=ID("variant-main"),
            impl=code_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(code_impl),
        )
        section = Core(
            id=ID("section-main"),
            name="Main Section",
            variants=[variant.id],
            defaultVariant=variant.id,
        )
        project_config = ProjectConfig(
            id=ID("project-config"),
            name="Demo Project",
            sectionVariantMap={section.id: variant.id},
            topLevelSections={section.id: TopLevelSectionLayout()},
        )
        project_state = ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={section.id: section},
            sectionImpls={code_impl.id: code_impl},
            sectionVariants={variant.id: variant},
        )

        project_slug = sanitize_slug(project_config.name)
        section_slug = sanitize_slug(section.name)
        self.section_id = section.id
        self.variant_id = variant.id
        self.project_config_id = project_config.id
        self.expected_code_path = normalize_workspace_path(
            C.CODE_FOLDER / "sections" / project_slug / f"{section_slug}.py"
        )
        return project_state

    async def test_update_registers_code_file_bindings(self):
        project_state = self.project_state.model_copy(deep=True)
        await self.manager.update(project_state)

        section_bindings = self.manager.code_files.get_bindings(self.expected_code_path)
        assert len(section_bindings) == 1
        (binding,) = tuple(section_bindings)
        assert binding.section_id == self.section_id
        assert binding.variant_id == self.variant_id
        assert binding.project_config_id == self.project_config_id
        assert binding.access_mode == CodeFileAccessMode.read_write

        gen_binding = project_state.genCodeBinding
        assert gen_binding is not None

    async def test_reload_code_sections_updates_state(self):
        project_state = self.project_state.model_copy(deep=True)
        await self.manager.update(project_state)

        new_code = "print('updated from disk')"
        self.dbe.write(self.expected_code_path, new_code)

        bindings = self.manager.code_files.get_bindings(self.expected_code_path)
        assert bindings

        update = FileWatcherCoreUpdate(
            absPath=self.expected_code_path,
            relPath=self.expected_code_path,
            eventType=FileEventType.modified,
            matchingGlobPatterns=[],
            fileToRead=self.expected_code_path,
        )

        bindings_by_config: dict[ID, list[RegisteredCodeFileBinding]] = {}
        for binding in bindings:
            bindings_by_config.setdefault(binding.project_config_id, []).append(binding)

        plan = CodeFileReloadPlan(
            path=self.expected_code_path,
            raw_content=new_code,
            content_hash=hashlib.md5(new_code.encode()).hexdigest(),
            bindings_by_config=bindings_by_config,
            core_update=update,
        )

        await self.manager.reload_code_sections(plan)

        metadata = self.manager.code_files.get_metadata(self.expected_code_path)
        assert metadata is not None
        assert metadata is not None
        assert not metadata.has_conflict
        expected_hash = hashlib.md5(new_code.encode()).hexdigest()
        assert metadata.last_read_hash == expected_hash

        single_state = convert_backend_to_single_config(
            self.manager.project_state_backend, self.project_config_id
        )
        section_impl = get_curr_effective_section_impl(single_state, self.section_id)
        assert isinstance(section_impl, CodeSectionImpl)
        assert isinstance(section_impl, CodeSectionImpl)
        assert section_impl.code == new_code

        assert self.project_config_id in self.manager.code_dict
        code_entries = self.manager.code_dict[self.project_config_id]
        assert self.section_id in code_entries
        assert code_entries[self.section_id].code == new_code

    async def test_other_manager_updates_do_not_clear_bindings(self):
        project_state = self.project_state.model_copy(deep=True)
        await self.manager.update(project_state)

        gen_code_path = normalize_workspace_path(
            build_gen_code_path(C.CODE_FOLDER, project_state.projectConfig.name)
        )
        assert self.manager.code_files.get_bindings(gen_code_path)
        assert self.manager.code_files.get_bindings(self.expected_code_path)

        settings_code_files = CodeFiles(
            self.frontend_sender,
            self.specific_file_watcher,
            self.dbe,
        )
        settings_config = ProjectConfig(
            id=ID("settings-config"),
            name="settings_project_test",
        )
        settings_backend = ProjectStateBackend(
            projectConfigs={settings_config.id: settings_config},
            projectChatWindowingByProjectConfigId={settings_config.id: {}},
            defaultProjectConfigId=settings_config.id,
        )
        settings_backend.validate_default_project_id()
        settings_manager = ProjectManagerForTest(
            self.lsp_writers,
            self.frontend_sender,
            self.settings_file,
            self.specific_file_watcher,
            self.dbe,
            self.artifacts,
            self.json_source,
            settings_code_files,
            settings_backend,
        )
        await settings_manager._process_queue_task_started.wait()
        assert self.manager.code_files is not settings_manager.code_files

        try:
            await settings_manager.set_show_param_display_names(
                SetShowParamDisplayNamesRequest(
                    projectConfigId=settings_config.id,
                    showParamDisplayNames=not settings_config.showParamDisplayNames,
                )
            )
            await settings_manager.finish_pending_operations()
        finally:
            await self._shutdown_extra_manager(settings_manager)

        assert self.manager.code_files.get_bindings(gen_code_path)
        assert self.manager.code_files.get_bindings(self.expected_code_path)

    async def _shutdown_extra_manager(self, manager: BaseProjectManager) -> None:
        manager.autosave_debouncer.cancel()
        manager.autosave_debouncer.cancel_pending()
        manager.queue_task.cancel()
        with suppress(asyncio.CancelledError):
            await manager.queue_task
