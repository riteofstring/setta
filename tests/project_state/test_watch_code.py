import asyncio
import logging
import shutil
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
import pytest_asyncio
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import LSPReaders, LSPServers, LSPWriters, start_lsps, stop_file_watcher, stop_lsps
from setta.project_state.artifacts import Artifacts
from setta.project_state.code_files import CodeFileReloadPlan, RegisteredCodeFileBinding
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.project_manager_types import (
    AddKwargRequest,
    CreateNewSectionVariantRequest,
    SetCodeRequest,
    SetCallableRequest,
    SetSectionVariantRequest,
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
from setta.types.helpers_lvl2 import get_curr_top_level_param_ids
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.id import ID
from setta.types.project_config import (
    ProjectConfig,
    TopLevelSectionLayout,
    WatchCodeCallableKind,
    WatchCodeFolder,
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

logger = logging.getLogger(__name__)


@contextmanager
def _capture_logger(
    caplog: pytest.LogCaptureFixture, logger: logging.Logger, level: int
):
    handler = caplog.handler
    added = False
    previous_level = logger.level
    if handler not in logger.handlers:
        logger.addHandler(handler)
        added = True
    caplog.set_level(level, logger=logger.name)
    try:
        yield
    finally:
        if added:
            logger.removeHandler(handler)
        logger.setLevel(previous_level)


@pytest.mark.asyncio
class TestWatchCode:
    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self) -> None:
        self._tmp_dir = TemporaryDirectory(dir=Path.cwd())
        root = Path(self._tmp_dir.name)
        self.setta_root = root / "setta_files"
        self.code_folder = self.setta_root / "code"
        self.artifacts_folder = self.setta_root / "artifacts"
        self.backup_folder = self.setta_root / "backups"
        for path in (self.setta_root, self.code_folder, self.artifacts_folder, self.backup_folder):
            path.mkdir(parents=True, exist_ok=True)

        self._original_constants = {
            "SETTA_FILES_FOLDER": C.SETTA_FILES_FOLDER,
            "CODE_FOLDER": C.CODE_FOLDER,
            "ARTIFACTS_FOLDER": C.ARTIFACTS_FOLDER,
            "DB_BACKUP_FOLDER": C.DB_BACKUP_FOLDER,
        }
        C.SETTA_FILES_FOLDER = self.setta_root
        C.CODE_FOLDER = self.code_folder
        C.ARTIFACTS_FOLDER = self.artifacts_folder
        C.DB_BACKUP_FOLDER = self.backup_folder

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

        yield

        self.manager.shutdown()
        await _shutdown_manager(self.manager)
        for name, value in self._original_constants.items():
            setattr(C, name, value)
        self._tmp_dir.cleanup()

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
                watchCodeFiles=[str(normalize_path(self.watch_file_path))],
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
        assert str(normalize_path(self.watch_file_path)) in baseline
        assert identity in baseline[str(normalize_path(self.watch_file_path))]
        assert state.projectConfig.watchCodeRegistry == {}
        callable_sections = [
            section_id
            for section_id in state.sections
            if isinstance(
                get_curr_effective_section_impl(state, section_id),
                CallableSectionImpl,
            )
        ]
        assert callable_sections == []

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
                watchCodeFiles=[str(normalize_path(new_file))],
            )
        )
        state = self.manager.get_single_config_state(self.project_config_id)
        baseline = state.projectConfig.watchCodeBaselineByPath
        assert str(normalize_path(new_file)) in baseline
        assert state.projectConfig.watchCodeRegistry == {}

    async def test_rejects_watch_inputs_outside_repo(self) -> None:
        outside_file = Path.cwd().parent / "outside_watch.py"
        with pytest.raises(ValueError):
            await self.manager.set_watch_code_inputs(
                SetWatchCodeInputsRequest(
                    projectConfigId=self.project_config_id,
                    watchCodeFolders=[],
                    watchCodeFiles=[str(outside_file)],
                )
            )
        inside_file = self.watch_file_path.resolve()
        with pytest.raises(ValueError):
            await self.manager.set_watch_code_inputs(
                SetWatchCodeInputsRequest(
                    projectConfigId=self.project_config_id,
                    watchCodeFolders=[],
                    watchCodeFiles=[str(inside_file)],
                )
            )
        outside_folder = Path.cwd().parent / "outside_watch_dir"
        with pytest.raises(ValueError):
            await self.manager.set_watch_code_inputs(
                SetWatchCodeInputsRequest(
                    projectConfigId=self.project_config_id,
                    watchCodeFolders=[
                        WatchCodeFolder(path=str(outside_folder), recursive=False)
                    ],
                    watchCodeFiles=[],
                )
            )
        inside_folder = self.watch_file_path.parent.resolve()
        with pytest.raises(ValueError):
            await self.manager.set_watch_code_inputs(
                SetWatchCodeInputsRequest(
                    projectConfigId=self.project_config_id,
                    watchCodeFolders=[
                        WatchCodeFolder(path=str(inside_folder), recursive=False)
                    ],
                    watchCodeFiles=[],
                )
            )

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
        assert identity in state.projectConfig.watchCodeRegistry
        entry = state.projectConfig.watchCodeRegistry[identity]
        assert entry.callableName == "new_func"
        assert len(entry.sectionIds) == 1
        section_impl = get_curr_effective_section_impl(state, entry.sectionIds[0])
        assert isinstance(section_impl, CallableSectionImpl)

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
        assert identity in state.projectConfig.watchCodeRegistry

    async def test_scan_skips_when_watch_code_disabled(self) -> None:
        await self.manager.set_watch_code_inputs(
            SetWatchCodeInputsRequest(
                projectConfigId=self.project_config_id,
                watchCodeFolders=[],
                watchCodeFiles=[str(normalize_path(self.watch_file_path))],
            )
        )
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        updated_code = (
            "def existing(a):\n    return a\n\n"
            "def added(value):\n    return value\n"
        )
        self.watch_file_path.write_text(updated_code)
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=False,
            )
        )
        await self.manager.watch_code_manager._scan_file(
            self.project_config_id,
            self.watch_file_path,
            baseline_only=False,
        )
        state = self.manager.get_single_config_state(self.project_config_id)
        assert state.projectConfig.watchCodeRegistry == {}

    async def test_disable_cancels_pending_watch_code_scans(self) -> None:
        await self.manager.set_watch_code_inputs(
            SetWatchCodeInputsRequest(
                projectConfigId=self.project_config_id,
                watchCodeFolders=[],
                watchCodeFiles=[str(normalize_path(self.watch_file_path))],
            )
        )
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        self.manager.watch_code_manager._debounce_scan(
            self.project_config_id,
            self.watch_file_path,
            baseline_only=False,
        )
        debouncer_key = (self.project_config_id, normalize_path(self.watch_file_path))
        assert debouncer_key in self.manager.watch_code_manager._debouncers
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=False,
            )
        )
        assert debouncer_key not in self.manager.watch_code_manager._debouncers

    async def test_recursive_toggle_reschedules_watch_dirs(self) -> None:
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        watch_root = self.setta_root.parent
        await self.manager.set_watch_code_inputs(
            SetWatchCodeInputsRequest(
                projectConfigId=self.project_config_id,
                watchCodeFolders=[
                    WatchCodeFolder(
                        path=str(normalize_path(watch_root)), recursive=False
                    )
                ],
                watchCodeFiles=[],
            )
        )
        normalized_root = normalize_path(watch_root)
        entry = self.manager.watch_code_manager._watched_dirs.get(normalized_root)
        assert entry is not None
        assert not entry[1]

        await self.manager.set_watch_code_inputs(
            SetWatchCodeInputsRequest(
                projectConfigId=self.project_config_id,
                watchCodeFolders=[
                    WatchCodeFolder(
                        path=str(normalize_path(watch_root)), recursive=True
                    )
                ],
                watchCodeFiles=[],
            )
        )
        updated_entry = self.manager.watch_code_manager._watched_dirs.get(
            normalized_root
        )
        assert updated_entry is not None
        assert updated_entry[1]

    async def test_missing_watch_dir_watches_parent_until_created(self) -> None:
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        missing_dir = self.setta_root.parent / "future_watch_dir"
        if missing_dir.exists():
            shutil.rmtree(missing_dir)
        await self.manager.set_watch_code_inputs(
            SetWatchCodeInputsRequest(
                projectConfigId=self.project_config_id,
                watchCodeFolders=[
                    WatchCodeFolder(
                        path=str(normalize_path(missing_dir)), recursive=False
                    )
                ],
                watchCodeFiles=[],
            )
        )
        normalized_missing = normalize_path(missing_dir)
        watch_manager = self.manager.watch_code_manager
        assert normalized_missing in watch_manager._pending_dirs
        ancestor = normalize_path(missing_dir.parent)
        assert ancestor in watch_manager._watched_dirs

        missing_dir.mkdir(parents=True, exist_ok=True)
        watch_manager._handle_directory_created(missing_dir.resolve())
        assert normalized_missing not in watch_manager._pending_dirs
        assert normalized_missing in watch_manager._watched_dirs

    async def test_delete_project_configs_syncs_watch_code_state(self) -> None:
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        self.manager.watch_code_manager._debounce_scan(
            self.project_config_id,
            self.watch_file_path,
            baseline_only=False,
        )
        debouncer_key = (self.project_config_id, normalize_path(self.watch_file_path))
        assert debouncer_key in self.manager.watch_code_manager._debouncers
        await self.manager.delete_project_configs([self.project_config_id])
        assert self.manager.watch_code_manager._config_snapshots == {}
        assert self.manager.watch_code_manager._debouncers == {}

    async def test_moved_file_does_not_create_sections_for_existing_callables(
        self,
    ) -> None:
        bulk_path = self.setta_root.parent / "bulk_watch.py"
        bulk_path.write_text(
            "def alpha():\n    return 1\n\n"
            "def beta(value):\n    return value\n\n"
            "def gamma(value):\n    return value + 1\n"
        )
        await self.manager.set_watch_code_inputs(
            SetWatchCodeInputsRequest(
                projectConfigId=self.project_config_id,
                watchCodeFolders=[
                    WatchCodeFolder(
                        path=str(normalize_path(self.setta_root.parent)),
                        recursive=True,
                    )
                ],
                watchCodeFiles=[],
            )
        )
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        updated_code = (
            bulk_path.read_text()
            + "\n\ndef watched(flag):\n    return not flag\n"
        )
        bulk_path.write_text(updated_code)
        await self.manager.watch_code_manager._scan_file(
            self.project_config_id,
            bulk_path,
            baseline_only=False,
        )
        state = self.manager.get_single_config_state(self.project_config_id)
        module_path = convert_path_to_module_path(normalize_path(bulk_path))
        watched_identity = build_callable_identity(
            f"{module_path}.watched", WatchCodeCallableKind.function
        )
        assert watched_identity in state.projectConfig.watchCodeRegistry
        assert len(state.projectConfig.watchCodeRegistry) == 1

        moved_path = bulk_path.with_name("bulk_watch_moved.py")
        bulk_path.replace(moved_path)
        self.manager.watch_code_manager._handle_event(
            bulk_path, "moved", moved_path
        )
        debouncer_key = (self.project_config_id, normalize_path(moved_path))
        debouncer = self.manager.watch_code_manager._debouncers[debouncer_key]
        await debouncer.flush(
            self.project_config_id, normalize_path(moved_path), False
        )

        updated_state = self.manager.get_single_config_state(self.project_config_id)
        moved_module_path = convert_path_to_module_path(
            normalize_path(moved_path)
        )
        moved_identity = build_callable_identity(
            f"{moved_module_path}.watched", WatchCodeCallableKind.function
        )
        assert moved_identity in updated_state.projectConfig.watchCodeRegistry
        assert len(updated_state.projectConfig.watchCodeRegistry) == 1
        entry = updated_state.projectConfig.watchCodeRegistry[moved_identity]
        assert entry.sourcePath == str(normalize_path(moved_path))
        baseline = updated_state.projectConfig.watchCodeBaselineByPath
        assert str(normalize_path(moved_path)) in baseline
        assert str(normalize_path(bulk_path)) not in baseline

    async def test_move_in_from_untracked_creates_sections(self) -> None:
        watch_root = self.setta_root.parent / "watch_root"
        watch_root.mkdir(parents=True, exist_ok=True)
        source_root = self.setta_root.parent / "unwatched_root"
        source_root.mkdir(parents=True, exist_ok=True)
        source_path = source_root / "incoming.py"
        source_path.write_text("def incoming():\n    return 1\n")
        dest_path = watch_root / "incoming.py"

        await self.manager.set_watch_code_inputs(
            SetWatchCodeInputsRequest(
                projectConfigId=self.project_config_id,
                watchCodeFolders=[
                    WatchCodeFolder(
                        path=str(normalize_path(watch_root)), recursive=False
                    )
                ],
                watchCodeFiles=[],
            )
        )
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )

        source_path.replace(dest_path)
        self.manager.watch_code_manager._handle_event(
            source_path, "moved", dest_path
        )
        debouncer_key = (self.project_config_id, normalize_path(dest_path))
        debouncer = self.manager.watch_code_manager._debouncers[debouncer_key]
        await debouncer.flush(
            self.project_config_id, normalize_path(dest_path), False
        )

        state = self.manager.get_single_config_state(self.project_config_id)
        module_path = convert_path_to_module_path(normalize_path(dest_path))
        identity = build_callable_identity(
            f"{module_path}.incoming", WatchCodeCallableKind.function
        )
        assert identity in state.projectConfig.watchCodeRegistry

    async def test_move_over_existing_dest_cleans_source_entries(self) -> None:
        watch_root = self.setta_root.parent / "watch_root_existing"
        watch_root.mkdir(parents=True, exist_ok=True)
        dest_path = watch_root / "dest.py"
        src_path = watch_root / "src.py"
        dest_path.write_text("def dest_only():\n    return 1\n")
        src_path.write_text("def existing():\n    return 1\n")

        await self.manager.set_watch_code_inputs(
            SetWatchCodeInputsRequest(
                projectConfigId=self.project_config_id,
                watchCodeFolders=[
                    WatchCodeFolder(
                        path=str(normalize_path(watch_root)), recursive=False
                    )
                ],
                watchCodeFiles=[],
            )
        )
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )

        src_path.write_text(
            src_path.read_text() + "\n\ndef watched():\n    return 2\n"
        )
        await self.manager.watch_code_manager._scan_file(
            self.project_config_id,
            src_path,
            baseline_only=False,
        )

        src_path.replace(dest_path)
        self.manager.watch_code_manager._handle_event(src_path, "moved", dest_path)
        debouncer_key = (self.project_config_id, normalize_path(dest_path))
        debouncer = self.manager.watch_code_manager._debouncers[debouncer_key]
        await debouncer.flush(
            self.project_config_id, normalize_path(dest_path), False
        )

        state = self.manager.get_single_config_state(self.project_config_id)
        src_key = str(normalize_path(src_path))
        assert src_key not in state.projectConfig.watchCodeBaselineByPath
        for entry in state.projectConfig.watchCodeRegistry.values():
            assert entry.sourcePath != src_key
        moved_module_path = convert_path_to_module_path(normalize_path(dest_path))
        moved_identity = build_callable_identity(
            f"{moved_module_path}.watched", WatchCodeCallableKind.function
        )
        assert moved_identity in state.projectConfig.watchCodeRegistry

    async def test_move_between_configs_cleans_source_entries(self) -> None:
        existing_config_ids = set(
            self.manager.project_state_backend.projectConfigs.keys()
        )
        await self.manager.create_project_config("bg-blue-500/60 dark:bg-blue-600/30")
        new_config_ids = (
            set(self.manager.project_state_backend.projectConfigs.keys())
            - existing_config_ids
        )
        assert len(new_config_ids) == 1
        secondary_config_id = next(iter(new_config_ids))

        source_root = self.setta_root.parent / "watch_root_source"
        dest_root = self.setta_root.parent / "watch_root_dest"
        source_root.mkdir(parents=True, exist_ok=True)
        dest_root.mkdir(parents=True, exist_ok=True)

        await self.manager.set_watch_code_inputs(
            SetWatchCodeInputsRequest(
                projectConfigId=self.project_config_id,
                watchCodeFolders=[
                    WatchCodeFolder(
                        path=str(normalize_path(source_root)), recursive=False
                    )
                ],
                watchCodeFiles=[],
            )
        )
        await self.manager.set_watch_code_inputs(
            SetWatchCodeInputsRequest(
                projectConfigId=secondary_config_id,
                watchCodeFolders=[
                    WatchCodeFolder(
                        path=str(normalize_path(dest_root)), recursive=False
                    )
                ],
                watchCodeFiles=[],
            )
        )
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=secondary_config_id,
                enabled=True,
            )
        )

        src_path = source_root / "moved.py"
        src_path.write_text("def moved():\n    return 1\n")
        await self.manager.watch_code_manager._scan_file(
            self.project_config_id,
            src_path,
            baseline_only=False,
        )
        state = self.manager.get_single_config_state(self.project_config_id)
        src_module_path = convert_path_to_module_path(normalize_path(src_path))
        src_identity = build_callable_identity(
            f"{src_module_path}.moved", WatchCodeCallableKind.function
        )
        assert src_identity in state.projectConfig.watchCodeRegistry

        dest_path = dest_root / "moved.py"
        src_path.replace(dest_path)
        self.manager.watch_code_manager._handle_event(src_path, "moved", dest_path)

        delete_key = (self.project_config_id, normalize_path(src_path))
        delete_debouncer = self.manager.watch_code_manager._delete_debouncers[
            delete_key
        ]
        await delete_debouncer.flush(
            self.project_config_id, normalize_path(src_path)
        )

        scan_key = (secondary_config_id, normalize_path(dest_path))
        scan_debouncer = self.manager.watch_code_manager._debouncers[scan_key]
        await scan_debouncer.flush(
            secondary_config_id, normalize_path(dest_path), False
        )

        updated_state = self.manager.get_single_config_state(self.project_config_id)
        src_key = str(normalize_path(src_path))
        assert src_key not in updated_state.projectConfig.watchCodeBaselineByPath
        for entry in updated_state.projectConfig.watchCodeRegistry.values():
            assert entry.sourcePath != src_key

        dest_state = self.manager.get_single_config_state(secondary_config_id)
        dest_module_path = convert_path_to_module_path(normalize_path(dest_path))
        dest_identity = build_callable_identity(
            f"{dest_module_path}.moved", WatchCodeCallableKind.function
        )
        assert dest_identity in dest_state.projectConfig.watchCodeRegistry

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
        assert updated_entry.signatureHash != previous_hash

    async def test_syntax_error_keeps_watch_registry(self) -> None:
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
        identity = build_callable_identity(
            f"{module_path}.watched", WatchCodeCallableKind.function
        )
        assert identity in state.projectConfig.watchCodeRegistry

        invalid_code = "def existing(a):\n    return a\n\n" "def watched("
        await self.manager.set_code(
            SetCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.code_section_id,
                code=invalid_code,
            )
        )
        updated_state = self.manager.get_single_config_state(self.project_config_id)
        assert identity in updated_state.projectConfig.watchCodeRegistry

    async def test_signature_change_without_lsp_keeps_params(self) -> None:
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        first_code = (
            "def existing(a):\n    return a\n\n"
            "def watched(a, b, c):\n    return a + b + c\n"
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
        section_id = entry.sectionIds[0]
        param_ids_before = get_curr_top_level_param_ids(state, section_id)
        assert len(param_ids_before) == 0

        second_code = (
            "def existing(a):\n    return a\n\n"
            "def watched(a):\n    return a\n"
        )
        await self.manager.set_code(
            SetCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.code_section_id,
                code=second_code,
            )
        )
        updated_state = self.manager.get_single_config_state(self.project_config_id)
        param_ids_after = get_curr_top_level_param_ids(updated_state, section_id)
        assert len(param_ids_after) == 0

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
        assert original_identity not in updated_state.projectConfig.watchCodeRegistry
        assert renamed_identity in updated_state.projectConfig.watchCodeRegistry
        updated_entry = updated_state.projectConfig.watchCodeRegistry[renamed_identity]
        assert updated_entry.sectionIds == original_section_ids

    async def test_rename_preserves_existing_params(self) -> None:
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
        section_id = entry.sectionIds[0]

        await self.manager.add_kwarg(
            AddKwargRequest(
                projectConfigId=self.project_config_id,
                sectionId=section_id,
            )
        )
        state_with_param = self.manager.get_single_config_state(self.project_config_id)
        param_ids_before = get_curr_top_level_param_ids(state_with_param, section_id)
        assert len(param_ids_before) == 1

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
        assert renamed_identity in updated_state.projectConfig.watchCodeRegistry
        param_ids_after = get_curr_top_level_param_ids(updated_state, section_id)
        assert param_ids_after == param_ids_before

    async def test_removed_callable_removes_section(self) -> None:
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
        watched_name = f"{module_path}.watched"
        watched_identity = build_callable_identity(
            watched_name, WatchCodeCallableKind.function
        )
        entry = state.projectConfig.watchCodeRegistry[watched_identity]
        watched_section_id = entry.sectionIds[0]

        second_code = "def existing(a):\n    return a\n"
        await self.manager.set_code(
            SetCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.code_section_id,
                code=second_code,
            )
        )
        updated_state = self.manager.get_single_config_state(self.project_config_id)
        assert (
            watched_identity
            not in updated_state.projectConfig.watchCodeRegistry
        )
        assert watched_section_id not in updated_state.sections

    async def test_removed_callable_keeps_section_with_other_variants(self) -> None:
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        first_code = (
            "def existing(a):\n    return a\n\n"
            "def alpha(value):\n    return value\n\n"
            "def beta(value):\n    return value + 1\n"
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
        alpha_identity = build_callable_identity(
            f"{module_path}.alpha", WatchCodeCallableKind.function
        )
        beta_identity = build_callable_identity(
            f"{module_path}.beta", WatchCodeCallableKind.function
        )
        alpha_entry = state.projectConfig.watchCodeRegistry[alpha_identity]
        beta_entry = state.projectConfig.watchCodeRegistry[beta_identity]
        alpha_section_id = alpha_entry.sectionIds[0]

        await self.manager.create_new_section_variant(
            CreateNewSectionVariantRequest(
                projectConfigId=self.project_config_id,
                sectionId=alpha_section_id,
            )
        )
        variant_state = self.manager.get_single_config_state(self.project_config_id)
        core = variant_state.sections[alpha_section_id]
        original_variant_id = core.variants[0]
        new_variant_id = core.variants[-1]

        await self.manager.set_callable(
            SetCallableRequest(
                projectConfigId=self.project_config_id,
                sectionId=alpha_section_id,
                callableName=beta_entry.callableName,
                refetchParams=True,
            )
        )
        await self.manager.set_section_variant(
            SetSectionVariantRequest(
                projectConfigId=self.project_config_id,
                sectionId=alpha_section_id,
                variantId=original_variant_id,
            )
        )

        second_code = (
            "def existing(a):\n    return a\n\n"
            "def beta(value):\n    return value + 1\n"
        )
        await self.manager.set_code(
            SetCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.code_section_id,
                code=second_code,
            )
        )
        updated_state = self.manager.get_single_config_state(self.project_config_id)
        assert (
            alpha_identity
            not in updated_state.projectConfig.watchCodeRegistry
        )
        assert alpha_section_id in updated_state.sections
        updated_core = updated_state.sections[alpha_section_id]
        assert updated_core.variants == [new_variant_id]
        active_variant = updated_state.projectConfig.sectionVariantMap[alpha_section_id]
        assert active_variant == new_variant_id
        section_impl = get_curr_effective_section_impl(
            updated_state, alpha_section_id
        )
        assert isinstance(section_impl, CallableSectionImpl)
        callable_id = section_impl.callable
        assert callable_id is not None
        if callable_id is None:
            raise AssertionError("Expected callable to be set.")
        callable_obj = updated_state.codeObjs[callable_id]
        assert callable_obj.name == beta_entry.callableName

    async def test_deleted_file_clears_registry_and_baseline(self) -> None:
        await self.manager.set_watch_code_inputs(
            SetWatchCodeInputsRequest(
                projectConfigId=self.project_config_id,
                watchCodeFolders=[],
                watchCodeFiles=[str(normalize_path(self.watch_file_path))],
            )
        )
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        updated_code = (
            "def existing(a):\n    return a\n\n"
            "def added(value):\n    return value\n"
        )
        self.watch_file_path.write_text(updated_code)
        await self.manager.watch_code_manager._scan_file(
            self.project_config_id,
            self.watch_file_path,
            baseline_only=False,
        )
        state = self.manager.get_single_config_state(self.project_config_id)
        module_path = convert_path_to_module_path(normalize_path(self.watch_file_path))
        added_identity = build_callable_identity(
            f"{module_path}.added", WatchCodeCallableKind.function
        )
        assert added_identity in state.projectConfig.watchCodeRegistry
        assert (
            str(normalize_path(self.watch_file_path))
            in state.projectConfig.watchCodeBaselineByPath
        )

        await self.manager.apply_watch_code_file_delete(
            self.project_config_id, self.watch_file_path
        )
        updated_state = self.manager.get_single_config_state(self.project_config_id)
        assert updated_state.projectConfig.watchCodeRegistry == {}
        assert (
            str(normalize_path(self.watch_file_path))
            not in updated_state.projectConfig.watchCodeBaselineByPath
        )

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
        assert identity in state.projectConfig.watchCodeRegistry
        entry = state.projectConfig.watchCodeRegistry[identity]
        assert entry.kind == WatchCodeCallableKind.class_init


@pytest.mark.asyncio
class TestWatchCodeLspOrdering:
    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self) -> None:
        self._tmp_dir = TemporaryDirectory()
        root = Path(self._tmp_dir.name)
        self.setta_root = root / "setta_files"
        self.code_folder = self.setta_root / "code"
        self.artifacts_folder = self.setta_root / "artifacts"
        self.backup_folder = self.setta_root / "backups"
        for path in (
            self.setta_root,
            self.code_folder,
            self.artifacts_folder,
            self.backup_folder,
        ):
            path.mkdir(parents=True, exist_ok=True)

        self._original_constants = {
            "SETTA_FILES_FOLDER": C.SETTA_FILES_FOLDER,
            "CODE_FOLDER": C.CODE_FOLDER,
            "ARTIFACTS_FOLDER": C.ARTIFACTS_FOLDER,
            "DB_BACKUP_FOLDER": C.DB_BACKUP_FOLDER,
        }
        C.SETTA_FILES_FOLDER = self.setta_root
        C.CODE_FOLDER = self.code_folder
        C.ARTIFACTS_FOLDER = self.artifacts_folder
        C.DB_BACKUP_FOLDER = self.backup_folder

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

        self.lsp_servers = LSPServers(self.settings_file.settings.languageServer)
        self.lsp_writers = LSPWriters(self.lsp_servers)
        self.lsp_readers = LSPReaders(self.lsp_servers, self.frontend_sender)
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
            lsp_writers=self.lsp_writers,
        )
        self._lsps_started = False
        await self.manager._process_queue_task_started.wait()
        try:
            if shutil.which("basedpyright-langserver") is None:
                pytest.skip(
                    "basedpyright-langserver is required for LSP ordering tests"
                )
            await start_lsps(self.lsp_servers, self.lsp_readers, self.lsp_writers)
            self._lsps_started = True
            yield
        finally:
            self.manager.shutdown()
            await _shutdown_manager(self.manager)
            if self._lsps_started:
                await stop_lsps(self.lsp_servers, self.lsp_readers)
                stop_file_watcher(self.lsp_writers)
            for name, value in self._original_constants.items():
                setattr(C, name, value)
            self._tmp_dir.cleanup()

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

    async def test_syncs_lsp_before_watch_code_update(self, caplog) -> None:
        await self.manager.set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=self.project_config_id,
                enabled=True,
            )
        )
        updated_code = "def hello(a, b, c):\n    return a + b + c\n"
        logger.debug("test_syncs_lsp_before_watch_code_update start")
        caplog.clear()
        project_logger = logging.getLogger("setta.project_state")
        with _capture_logger(caplog, project_logger, logging.DEBUG):
            logging.getLogger("setta.project_state").debug(
                "test_syncs_lsp_before_watch_code_update set_code_begin"
            )
            await asyncio.wait_for(
                self.manager.set_code(
                    SetCodeRequest(
                        projectConfigId=self.project_config_id,
                        sectionId=self.code_section_id,
                        code=updated_code,
                    )
                ),
                timeout=10,
            )
            logging.getLogger("setta.project_state").debug(
                "test_syncs_lsp_before_watch_code_update set_code_end"
            )
        messages = [
            record.getMessage()
            for record in caplog.records
            if record.name
            in {
                "setta.project_state.base_project_manager",
                "setta.project_state.watch_code",
                "setta.project_state",
            }
        ]
        sync_idx = next(
            idx
            for idx, msg in enumerate(messages)
            if "sync_code_section_lsp_for_watch_code" in msg
        )
        watch_idx = next(
            idx
            for idx, msg in enumerate(messages)
            if "watch_code.handle_code_section_update" in msg
        )
        assert sync_idx < watch_idx
        logger.debug("test_syncs_lsp_before_watch_code_update done")
