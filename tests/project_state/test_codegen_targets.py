import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import NoopLSPWriters
from setta.project_state.artifacts import Artifacts
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.project_manager_types import (
    RunCodeRequest,
    SetProjectConfigCodegenTargetsRequest,
)
from setta.project_state.settings_project import create_settings_project_state
from setta.project_state.share_runtime_state import ShareRuntimeState
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.project_config import (
    Position,
    ProjectConfig,
    TopLevelSectionLayout,
)
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import (
    CodeFileAccessMode,
    CodeFileBinding,
    CodeLanguage,
    CodeSectionImpl,
    GenPythonCodeSectionImpl,
    SectionType,
)
from setta.types.settings_state import RunSnapshotMode
from setta.types.share_deployment import ShareDeploymentManifest
from setta.utils.constants import C
from setta.utils.utils import normalize_path
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager


def _set_temp_constants(root: Path) -> dict[str, Path]:
    previous = {
        "SETTA_FILES_FOLDER": C.SETTA_FILES_FOLDER,
        "CODE_FOLDER": C.CODE_FOLDER,
        "DB_BACKUP_FOLDER": C.DB_BACKUP_FOLDER,
        "ARTIFACTS_FOLDER": C.ARTIFACTS_FOLDER,
        "RUN_FOLDER": C.RUN_FOLDER,
        "RUN_SESSIONS_FOLDER": C.RUN_SESSIONS_FOLDER,
        "RUN_LOGS_FOLDER": C.RUN_LOGS_FOLDER,
        "SHARE_DEPLOYMENTS_FOLDER": C.SHARE_DEPLOYMENTS_FOLDER,
    }
    C.SETTA_FILES_FOLDER = root / "setta_files"
    C.CODE_FOLDER = C.SETTA_FILES_FOLDER / "code"
    C.DB_BACKUP_FOLDER = C.SETTA_FILES_FOLDER / "backups"
    C.ARTIFACTS_FOLDER = C.SETTA_FILES_FOLDER / "artifacts"
    C.RUN_FOLDER = C.SETTA_FILES_FOLDER / "run"
    C.RUN_SESSIONS_FOLDER = C.RUN_FOLDER / "sessions"
    C.RUN_LOGS_FOLDER = C.RUN_FOLDER / "logs"
    C.SHARE_DEPLOYMENTS_FOLDER = C.SETTA_FILES_FOLDER / "share_deployments"
    for path in (
        C.SETTA_FILES_FOLDER,
        C.CODE_FOLDER,
        C.DB_BACKUP_FOLDER,
        C.ARTIFACTS_FOLDER,
        C.RUN_FOLDER,
        C.RUN_SESSIONS_FOLDER,
        C.RUN_LOGS_FOLDER,
        C.SHARE_DEPLOYMENTS_FOLDER,
    ):
        path.mkdir(parents=True, exist_ok=True)
    return previous


def _restore_constants(previous: dict[str, Path]) -> None:
    C.SETTA_FILES_FOLDER = previous["SETTA_FILES_FOLDER"]
    C.CODE_FOLDER = previous["CODE_FOLDER"]
    C.DB_BACKUP_FOLDER = previous["DB_BACKUP_FOLDER"]
    C.ARTIFACTS_FOLDER = previous["ARTIFACTS_FOLDER"]
    C.RUN_FOLDER = previous["RUN_FOLDER"]
    C.RUN_SESSIONS_FOLDER = previous["RUN_SESSIONS_FOLDER"]
    C.RUN_LOGS_FOLDER = previous["RUN_LOGS_FOLDER"]
    C.SHARE_DEPLOYMENTS_FOLDER = previous["SHARE_DEPLOYMENTS_FOLDER"]


class CodegenTargetsProjectManager(BaseProjectManager):
    def __init__(
        self,
        lsp_writers,
        websocket_msg_handler,
        python_script_sender,
        settings_file,
        specific_file_watcher,
        dbe,
        artifacts,
        json_source,
        code_files,
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

    async def save_as_new_project_config(self, _x):
        return None


class CodegenTargetsSettingsTests(unittest.TestCase):
    def test_settings_project_has_no_gen_code_binding(self) -> None:
        project_state = create_settings_project_state(Path("settings.json"))
        self.assertIsNone(project_state.genCodeBinding)


class CodegenTargetsBindingsTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = TemporaryDirectory()
        self._previous = _set_temp_constants(Path(self._tmpdir.name))

    def tearDown(self) -> None:
        _restore_constants(self._previous)
        self._tmpdir.cleanup()

    def test_validate_code_file_bindings_skips_gen_python(self) -> None:
        gen_impl = GenPythonCodeSectionImpl()
        gen_impl.codeFileBinding = CodeFileBinding(
            canonical_path=normalize_path(C.CODE_FOLDER / "generated.py"),
            access_mode=CodeFileAccessMode.write_only,
        )
        variant = Variant(
            impl=gen_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(gen_impl),
        )
        section = Core(
            name="Generated",
            variants=[variant.id],
            defaultVariant=variant.id,
        )
        project_config = ProjectConfig(
            name="NoPython",
            codegenTargets=[],
            sectionVariantMap={section.id: variant.id},
            topLevelSections={section.id: TopLevelSectionLayout()},
        )
        project_state = ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={section.id: section},
            sectionImpls={gen_impl.id: gen_impl},
            sectionVariants={variant.id: variant},
        )
        project_state.validate_code_file_bindings()

        self.assertIsNone(project_state.genCodeBinding)
        updated_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section.id,
            GenPythonCodeSectionImpl,
        )
        self.assertIsNone(updated_impl.codeFileBinding)


class CodegenTargetsRunCommandTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._tmpdir = TemporaryDirectory()
        self._previous = _set_temp_constants(Path(self._tmpdir.name))

        self.websocket_manager = WebsocketManager()
        self.listener_registry = ListenerRegistry()
        self.frontend_sender = WMHFrontendSender(self.websocket_manager)
        self.python_script_sender = WMHPythonScriptSender(
            self.websocket_manager, self.listener_registry
        )
        self.dbe = DBE(C.SETTA_FILES_FOLDER)
        self.settings_file = SettingsFile(self.dbe, self.frontend_sender)
        self.lsp_writers = NoopLSPWriters()
        self.specific_file_watcher = SpecificFileWatcher()
        self.artifacts = Artifacts(
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
        self.code_files = CodeFiles(
            self.frontend_sender,
            self.specific_file_watcher,
            self.dbe,
        )

    def tearDown(self) -> None:
        _restore_constants(self._previous)
        self._tmpdir.cleanup()

    async def test_create_run_command_runs_manual_code_when_python_disabled(self) -> None:
        code_impl = CodeSectionImpl(codeLanguage=CodeLanguage.bash)
        code_impl.code = "echo test"
        variant = Variant(
            impl=code_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(code_impl),
        )
        section = Core(
            name="Script",
            variants=[variant.id],
            defaultVariant=variant.id,
        )
        project_config = ProjectConfig(
            name="NoCodegen",
            codegenTargets=[],
            sectionVariantMap={section.id: variant.id},
            topLevelSections={section.id: TopLevelSectionLayout()},
        )
        project_state = ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={section.id: section},
            sectionImpls={code_impl.id: code_impl},
            sectionVariants={variant.id: variant},
        )
        project_state.validate_for_update(validate_code_file_bindings=True)
        backend = merge_single_config_into_backend(ProjectStateBackend(), project_state)
        manager = CodegenTargetsProjectManager(
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
        await manager._refresh_codegen_state(project_state)

        command = await manager.create_run_command(
            RunCodeRequest(
                projectConfigId=project_config.id,
                sectionId=section.id,
                runSnapshotMode=RunSnapshotMode.never,
            )
        )
        manager.shutdown()

        self.assertTrue(command.startswith("bash "))

    async def test_create_run_command_requires_entry_section_when_python_disabled(
        self,
    ) -> None:
        project_config = ProjectConfig(
            name="NoCodegen",
            codegenTargets=[],
        )
        project_state = ProjectStateSingleConfig(projectConfig=project_config)
        backend = merge_single_config_into_backend(ProjectStateBackend(), project_state)
        manager = CodegenTargetsProjectManager(
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

        with self.assertRaises(KeyError):
            await manager.create_run_command(
                RunCodeRequest(
                    projectConfigId=project_config.id,
                    sectionId=None,
                    runSnapshotMode=RunSnapshotMode.never,
                )
            )
        manager.shutdown()

    async def test_disabling_python_codegen_removes_gen_section_and_entry(self) -> None:
        project_config = ProjectConfig(name="WithCodegen")
        project_state = ProjectStateSingleConfig(projectConfig=project_config)
        gen_section_id = create_top_level_section(
            self.settings_file.settings,
            project_state,
            SectionType.GenPythonCode,
            Position(),
        )
        project_state.projectConfig.entryCodeBlockId = gen_section_id
        project_state.validate_for_update(validate_code_file_bindings=True)
        backend = merge_single_config_into_backend(ProjectStateBackend(), project_state)
        manager = CodegenTargetsProjectManager(
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

        await manager.set_project_config_codegen_targets(
            SetProjectConfigCodegenTargetsRequest(
                projectConfigId=project_config.id,
                codegenTargets=[],
            )
        )

        updated_state = manager.get_single_config_state(project_config.id)
        self.assertIsNone(updated_state.singletonSections.GenPythonCode)
        self.assertIsNone(updated_state.projectConfig.entryCodeBlockId)
        self.assertNotIn(gen_section_id, updated_state.sections)
        manager.shutdown()


class ShareRuntimeStateCodegenTargetsTests(unittest.TestCase):
    def test_share_runtime_state_skips_gen_code_binding_without_python(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = (
                Path(tmpdir)
                / "share_deployments"
                / "no_python"
                / "v1"
            )
            root.mkdir(parents=True, exist_ok=True)
            project_config = ProjectConfig(name="no_python", codegenTargets=[])
            project_state = ProjectStateSingleConfig(projectConfig=project_config)
            backend = merge_single_config_into_backend(
                ProjectStateBackend(),
                project_state,
            )
            backend.defaultProjectConfigId = project_config.id
            dbe = DBE(root)
            dbe.write_project(backend)
            manifest = ShareDeploymentManifest(
                version=1,
                deploymentName=root.parent.name,
                defaultProjectConfigId=project_config.id,
                deploymentVersion=root.name,
            )
            dbe.write_json(root / "manifest.json", manifest.model_dump())

            frontend_sender = WMHFrontendSender(WebsocketManager())
            manager = ShareRuntimeState(dbe, root, frontend_sender)
            manager.create_session_backend("session-a")
            session_state = manager.get_session_state("session-a", project_config.id)

            self.assertIsNone(session_state.genCodeBinding)
