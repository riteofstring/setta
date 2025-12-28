import asyncio
import hashlib
import unittest
from contextlib import suppress
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from setta.code_gen.utils import sanitize_name
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
from setta.utils.utils import normalize_path
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager


class TestProjectManager(BaseProjectManager):
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

    def save(self):
        return None

    async def save_as_new_project_config(self, x):
        return None


class CodeFileBindingRegistrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._tmpdir = TemporaryDirectory()
        root = Path(self._tmpdir.name)
        self.setta_root = root / "setta_files"
        self.code_folder = self.setta_root / "code"
        self.artifacts_folder = self.setta_root / "artifacts"
        self.backup_folder = self.setta_root / "backups"
        for path in (self.code_folder, self.artifacts_folder, self.backup_folder):
            path.mkdir(parents=True, exist_ok=True)

        self._patchers = [
            patch.object(C, "WORKSPACE_ROOT", root),
            patch.object(C, "STORAGE_ROOT", root),
        ]
        for patcher in self._patchers:
            patcher.start()

        self.websocket_manager = WebsocketManager()
        self.listener_registry = ListenerRegistry()
        self.frontend_sender = WMHFrontendSender(self.websocket_manager)
        self.python_script_sender = WMHPythonScriptSender(
            self.websocket_manager, self.listener_registry
        )
        self.dbe = DBE(self.setta_root)
        self.settings_file = SettingsFile(self.dbe, self.frontend_sender)
        self.lsps = LSPServers(self.settings_file.settings.languageServer, root)
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

        self.manager = TestProjectManager(
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

    async def asyncTearDown(self):
        self.manager.autosave_debouncer.cancel()
        self.manager.autosave_debouncer.cancel_pending()
        self.manager.queue_task.cancel()
        with suppress(asyncio.CancelledError):
            await self.manager.queue_task
        with suppress(RuntimeError):
            self.specific_file_watcher.stop()
        for patcher in self._patchers:
            patcher.stop()
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

        project_slug = sanitize_name(project_config.name)
        section_slug = sanitize_name(section.name)
        self.section_id = section.id
        self.variant_id = variant.id
        self.project_config_id = project_config.id
        self.expected_code_path = normalize_path(
            C.CODE_FOLDER / "sections" / project_slug / f"{section_slug}.py"
        )
        return project_state

    async def test_update_registers_code_file_bindings(self):
        project_state = self.project_state.model_copy(deep=True)
        await self.manager.update(project_state)

        section_bindings = self.manager.code_files.get_bindings(self.expected_code_path)
        self.assertEqual(len(section_bindings), 1)
        (binding,) = tuple(section_bindings)
        self.assertEqual(binding.section_id, self.section_id)
        self.assertEqual(binding.variant_id, self.variant_id)
        self.assertEqual(binding.project_config_id, self.project_config_id)
        self.assertEqual(binding.access_mode, CodeFileAccessMode.read_write)

        gen_binding = project_state.genCodeBinding
        self.assertIsNotNone(gen_binding)

    async def test_reload_code_sections_updates_state(self):
        project_state = self.project_state.model_copy(deep=True)
        await self.manager.update(project_state)

        new_code = "print('updated from disk')"
        self.dbe.write(self.expected_code_path, new_code)

        bindings = self.manager.code_files.get_bindings(self.expected_code_path)
        self.assertTrue(bindings)

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
        self.assertIsNotNone(metadata)
        assert metadata is not None
        self.assertFalse(metadata.has_conflict)
        expected_hash = hashlib.md5(new_code.encode()).hexdigest()
        self.assertEqual(metadata.last_read_hash, expected_hash)

        single_state = convert_backend_to_single_config(
            self.manager.project_state_backend, self.project_config_id
        )
        section_impl = get_curr_effective_section_impl(single_state, self.section_id)
        self.assertIsInstance(section_impl, CodeSectionImpl)
        assert isinstance(section_impl, CodeSectionImpl)
        self.assertEqual(section_impl.code, new_code)

        self.assertIn(self.project_config_id, self.manager.code_dict)
        code_entries = self.manager.code_dict[self.project_config_id]
        self.assertIn(self.section_id, code_entries)
        self.assertEqual(code_entries[self.section_id].code, new_code)


if __name__ == "__main__":  # pragma: no cover - manual execution
    unittest.main()
