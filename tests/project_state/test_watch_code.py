import asyncio
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.artifacts import Artifacts
from setta.project_state.code_files import CodeFileReloadPlan, RegisteredCodeFileBinding
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.project_manager_types import (
    SetCodeRequest,
    SetWatchCodeEnabledRequest,
    SetWatchCodeInputsRequest,
)
from setta.project_state.session_project_manager import (
    SessionPersistenceMode,
    SessionProjectManager,
)
from setta.project_state.utils import convert_path_to_module_path
from setta.project_state.watch_code import build_callable_identity
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.id import ID
from setta.types.project_config import (
    ProjectConfig,
    TopLevelSectionLayout,
    WatchCodeCallableKind,
)
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import (
    CallableSectionImpl,
    CodeFileAccessMode,
    CodeFileBinding,
    CodeSectionImpl,
)
from setta.types.specific_file_watcher import FileEventType, FileWatcherCoreUpdate
from setta.utils.constants import C
from setta.utils.utils import compute_md5_hex, normalize_path
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.manager_fixture import _shutdown_manager


class WatchCodeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._tmp_dir = TemporaryDirectory()
        self.addCleanup(self._tmp_dir.cleanup)
        root = Path(self._tmp_dir.name)
        self.setta_root = root / "setta_files"
        self.code_folder = self.setta_root / "code"
        self.artifacts_folder = self.setta_root / "artifacts"
        self.backup_folder = self.setta_root / "backups"
        for path in (self.setta_root, self.code_folder, self.artifacts_folder, self.backup_folder):
            path.mkdir(parents=True, exist_ok=True)

        self._patchers = [
            patch.object(C, "SETTA_FILES_FOLDER", self.setta_root),
            patch.object(C, "CODE_FOLDER", self.code_folder),
            patch.object(C, "ARTIFACTS_FOLDER", self.artifacts_folder),
            patch.object(C, "DB_BACKUP_FOLDER", self.backup_folder),
        ]
        for patcher in self._patchers:
            patcher.start()

        self.dbe = DBE(self.setta_root)
        self.websocket_manager = WebsocketManager()
        self.frontend_sender = WMHFrontendSender(self.websocket_manager)
        self.listener_registry = ListenerRegistry()
        self.python_script_sender = WMHPythonScriptSender(
            self.websocket_manager, self.listener_registry
        )
        self.settings_file = SettingsFile(self.dbe, self.frontend_sender)
        loop = asyncio.get_running_loop()
        self.specific_file_watcher = SpecificFileWatcher(loop=loop)
        self.artifacts = Artifacts(
            self.frontend_sender, self.specific_file_watcher, self.dbe
        )
        self.code_files = CodeFiles(
            self.frontend_sender, self.specific_file_watcher, self.dbe
        )
        self.json_source = JSONSource(
            self.frontend_sender,
            self.settings_file,
            self.specific_file_watcher,
            self.dbe,
        )

        self.watch_file_path = root / "watched.py"
        self.watch_file_path.write_text("def existing(a):\n    return a\n")
        self.code_section_path = root / "section.py"
        self.code_section_path.write_text("def existing(a):\n    return a\n")

        project_state, self.project_config_id, self.code_section_id = (
            self._build_project_state()
        )
        backend = ProjectStateBackend(
            projectConfigs={project_state.projectConfig.id: project_state.projectConfig},
            defaultProjectConfigId=project_state.projectConfig.id,
            sections=project_state.sections,
            sectionImpls=project_state.sectionImpls,
            sectionVariants=project_state.sectionVariants,
            codeObjs=project_state.codeObjs,
            codeObjImpls=project_state.codeObjImpls,
            codeObjVariants=project_state.codeObjVariants,
        )
        self.dbe.write_project(backend)

        self.manager = SessionProjectManager(
            persistence_mode=SessionPersistenceMode.ide_main,
            frontend_sender=self.frontend_sender,
            python_script_sender=self.python_script_sender,
            settings_file=self.settings_file,
            specific_file_watcher=self.specific_file_watcher,
            dbe=self.dbe,
            artifacts=self.artifacts,
            json_source=self.json_source,
            code_files=self.code_files,
            lsp_writers=None,
        )
        await self.manager._process_queue_task_started.wait()

    async def asyncTearDown(self) -> None:
        self.manager.shutdown()
        await _shutdown_manager(self.manager)
        for patcher in reversed(self._patchers):
            patcher.stop()

    def _build_project_state(self) -> tuple[ProjectStateSingleConfig, ID, ID]:
        code_impl = CodeSectionImpl(id=ID("code-impl"))
        code_impl.code = "def existing(a):\n    return a\n"
        code_impl.codeFileBinding = CodeFileBinding(
            canonical_path=self.code_section_path,
            access_mode=CodeFileAccessMode.read_write,
        )
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
            id=ID("config"),
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
        return project_state, project_config.id, section.id

    async def test_baseline_on_enable_skips_existing_defs(self) -> None:
        await self.manager.set_watch_code_inputs(
            SetWatchCodeInputsRequest(
                projectConfigId=self.project_config_id,
                watchCodeFolders=[],
                watchCodeFiles=[str(self.watch_file_path)],
            )
        )
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        state = self.manager.get_single_config_state(self.project_config_id)
        module_path = convert_path_to_module_path(normalize_path(self.watch_file_path))
        callable_name = f"{module_path}.existing"
        identity = build_callable_identity(callable_name, WatchCodeCallableKind.function)
        baseline = state.projectConfig.watchCodeBaselineByPath
        self.assertIn(str(normalize_path(self.watch_file_path)), baseline)
        self.assertIn(identity, baseline[str(normalize_path(self.watch_file_path))])
        self.assertEqual(state.projectConfig.watchCodeRegistry, {})
        callable_sections = [
            section_id
            for section_id in state.sections
            if isinstance(
                get_curr_effective_section_impl(state, section_id),
                CallableSectionImpl,
            )
        ]
        self.assertEqual(callable_sections, [])

    async def test_baseline_new_watch_inputs_when_enabled(self) -> None:
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        new_file = self.setta_root.parent / "new_watch.py"
        new_file.write_text("def added(x):\n    return x\n")
        await self.manager.set_watch_code_inputs(
            SetWatchCodeInputsRequest(
                projectConfigId=self.project_config_id,
                watchCodeFolders=[],
                watchCodeFiles=[str(new_file)],
            )
        )
        state = self.manager.get_single_config_state(self.project_config_id)
        baseline = state.projectConfig.watchCodeBaselineByPath
        self.assertIn(str(normalize_path(new_file)), baseline)
        self.assertEqual(state.projectConfig.watchCodeRegistry, {})

    async def test_auto_creates_callable_section_for_new_def(self) -> None:
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        new_code = (
            "def existing(a):\n    return a\n\n"
            "def new_func(x, y):\n    return x + y\n"
        )
        await self.manager.set_code(
            SetCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.code_section_id,
                code=new_code,
            )
        )
        state = self.manager.get_single_config_state(self.project_config_id)
        module_path = convert_path_to_module_path(normalize_path(self.code_section_path))
        callable_name = f"{module_path}.new_func"
        identity = f"{callable_name}:function"
        self.assertIn(identity, state.projectConfig.watchCodeRegistry)
        entry = state.projectConfig.watchCodeRegistry[identity]
        self.assertEqual(entry.callableName, "new_func")
        self.assertEqual(len(entry.sectionIds), 1)
        section_impl = get_curr_effective_section_impl(state, entry.sectionIds[0])
        self.assertIsInstance(section_impl, CallableSectionImpl)

    async def test_external_file_reload_creates_section(self) -> None:
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        updated_code = (
            "def existing(a):\n    return a\n\n"
            "def external_added(value):\n    return value\n"
        )
        self.code_section_path.write_text(updated_code)
        plan = CodeFileReloadPlan(
            path=normalize_path(self.code_section_path),
            raw_content=updated_code,
            content_hash=compute_md5_hex(updated_code),
            bindings_by_config={
                self.project_config_id: [
                    RegisteredCodeFileBinding(
                        section_id=self.code_section_id,
                        variant_id=ID("variant-main"),
                        project_config_id=self.project_config_id,
                        access_mode=CodeFileAccessMode.read_write,
                    )
                ]
            },
            core_update=FileWatcherCoreUpdate(
                absPath=normalize_path(self.code_section_path),
                relPath=Path(self.code_section_path.name),
                eventType=FileEventType.modified,
                matchingGlobPatterns=[],
                fileToRead=normalize_path(self.code_section_path),
            ),
        )
        await self.manager.reload_code_sections(plan)
        state = self.manager.get_single_config_state(self.project_config_id)
        module_path = convert_path_to_module_path(
            normalize_path(self.code_section_path)
        )
        callable_name = f"{module_path}.external_added"
        identity = build_callable_identity(callable_name, WatchCodeCallableKind.function)
        self.assertIn(identity, state.projectConfig.watchCodeRegistry)

    async def test_signature_change_updates_registry(self) -> None:
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        first_code = (
            "def existing(a):\n    return a\n\n"
            "def watched(value):\n    return value\n"
        )
        await self.manager.set_code(
            SetCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.code_section_id,
                code=first_code,
            )
        )
        state = self.manager.get_single_config_state(self.project_config_id)
        module_path = convert_path_to_module_path(normalize_path(self.code_section_path))
        callable_name = f"{module_path}.watched"
        identity = build_callable_identity(callable_name, WatchCodeCallableKind.function)
        entry = state.projectConfig.watchCodeRegistry[identity]
        previous_hash = entry.signatureHash
        second_code = (
            "def existing(a):\n    return a\n\n"
            "def watched(value, extra):\n    return value + extra\n"
        )
        await self.manager.set_code(
            SetCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.code_section_id,
                code=second_code,
            )
        )
        updated_state = self.manager.get_single_config_state(self.project_config_id)
        updated_entry = updated_state.projectConfig.watchCodeRegistry[identity]
        self.assertNotEqual(updated_entry.signatureHash, previous_hash)

    async def test_rename_reuses_section_ids(self) -> None:
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        first_code = (
            "def existing(a):\n    return a\n\n"
            "def original(value):\n    return value + 1\n"
        )
        await self.manager.set_code(
            SetCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.code_section_id,
                code=first_code,
            )
        )
        state = self.manager.get_single_config_state(self.project_config_id)
        module_path = convert_path_to_module_path(normalize_path(self.code_section_path))
        original_name = f"{module_path}.original"
        original_identity = build_callable_identity(
            original_name, WatchCodeCallableKind.function
        )
        entry = state.projectConfig.watchCodeRegistry[original_identity]
        original_section_ids = list(entry.sectionIds)

        second_code = (
            "def existing(a):\n    return a\n\n"
            "def renamed(value):\n    return value + 1\n"
        )
        await self.manager.set_code(
            SetCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.code_section_id,
                code=second_code,
            )
        )
        updated_state = self.manager.get_single_config_state(self.project_config_id)
        renamed_name = f"{module_path}.renamed"
        renamed_identity = build_callable_identity(
            renamed_name, WatchCodeCallableKind.function
        )
        self.assertNotIn(original_identity, updated_state.projectConfig.watchCodeRegistry)
        self.assertIn(renamed_identity, updated_state.projectConfig.watchCodeRegistry)
        updated_entry = updated_state.projectConfig.watchCodeRegistry[renamed_identity]
        self.assertEqual(updated_entry.sectionIds, original_section_ids)

    async def test_class_callable_is_registered(self) -> None:
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        class_code = (
            "def existing(a):\n    return a\n\n"
            "class Widget:\n"
            "    def __init__(self, size):\n"
            "        self.size = size\n"
        )
        await self.manager.set_code(
            SetCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.code_section_id,
                code=class_code,
            )
        )
        state = self.manager.get_single_config_state(self.project_config_id)
        module_path = convert_path_to_module_path(normalize_path(self.code_section_path))
        callable_name = f"{module_path}.Widget"
        identity = build_callable_identity(
            callable_name, WatchCodeCallableKind.class_init
        )
        self.assertIn(identity, state.projectConfig.watchCodeRegistry)
        entry = state.projectConfig.watchCodeRegistry[identity]
        self.assertEqual(entry.kind, WatchCodeCallableKind.class_init)
