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
from setta.project_state.project_manager_types import RunDetachedRequest
from setta.types.code_obj_impls import CodeParamCodeObjImpl
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl,
)
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import (
    CodeFileAccessMode,
    CodeFileBinding,
    CodeLanguage,
    CodeSectionImpl,
    DictSectionImpl,
)
from setta.types.settings_state import RunSnapshotMode
from setta.utils.constants import C
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.websocket_manager import WebsocketManager


class RunOverridesProjectManager(BaseProjectManager):
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
        return self._initial_backend

    def save(self) -> None:
        return None

    async def save_as_new_project_config(self, x) -> None:
        raise NotImplementedError(
            f"save_as_new_project_config is not supported here: {x}"
        )


class RunOverrideTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._tmpdir = TemporaryDirectory()
        root = Path(self._tmpdir.name)
        self._run_folder_original = C.RUN_FOLDER
        self._run_sessions_folder_original = C.RUN_SESSIONS_FOLDER
        self._run_logs_folder_original = C.RUN_LOGS_FOLDER
        self._run_root = root / "run"
        C.RUN_FOLDER = self._run_root
        C.RUN_SESSIONS_FOLDER = self._run_root / "sessions"
        C.RUN_LOGS_FOLDER = self._run_root / "logs"
        websocket_manager = WebsocketManager()
        listener_registry = ListenerRegistry()
        self.frontend_sender = WMHFrontendSender(websocket_manager)
        self.python_script_sender = WMHPythonScriptSender(
            websocket_manager, listener_registry
        )
        self.specific_file_watcher = SpecificFileWatcher()
        self.dbe = DBE(root)
        self.settings_file = SettingsFile(self.dbe, self.frontend_sender)
        self.lsp_writers = NoopLSPWriters()
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
        C.RUN_FOLDER = self._run_folder_original
        C.RUN_SESSIONS_FOLDER = self._run_sessions_folder_original
        C.RUN_LOGS_FOLDER = self._run_logs_folder_original
        self._tmpdir.cleanup()

    def _build_manager_and_state(self):
        python_binding = CodeFileBinding(
            canonical_path=Path(self._tmpdir.name) / "run_py.py",
            access_mode=CodeFileAccessMode.read_write,
        )
        bash_binding = CodeFileBinding(
            canonical_path=Path(self._tmpdir.name) / "run_sh.sh",
            access_mode=CodeFileAccessMode.read_write,
        )
        python_impl = CodeSectionImpl(
            codeLanguage=CodeLanguage.python,
            code="print('py')",
            codeFileBinding=python_binding,
        )
        bash_impl = CodeSectionImpl(
            codeLanguage=CodeLanguage.bash,
            code="echo hi",
            codeFileBinding=bash_binding,
        )
        python_variant = Variant(
            impl=python_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(python_impl),
        )
        bash_variant = Variant(
            impl=bash_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(bash_impl),
        )
        code_section = Core(
            name="Runner",
            variants=[python_variant.id, bash_variant.id],
            defaultVariant=python_variant.id,
        )

        param_impl = CodeParamCodeObjImpl(value="1")
        param_variant = Variant(
            impl=param_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(param_impl),
        )
        param_core = Core(
            name="alpha",
            variants=[param_variant.id],
            defaultVariant=param_variant.id,
        )
        dict_impl = DictSectionImpl(
            codeObjVariantMap={param_core.id: param_variant.id},
        )
        dict_variant = Variant(
            impl=dict_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(dict_impl),
        )
        dict_section = Core(
            name="Params",
            variants=[dict_variant.id],
            defaultVariant=dict_variant.id,
        )

        project_config = ProjectConfig(
            name="Overrides",
            codegenTargets=[],
            entryCodeBlockId=code_section.id,
            sectionVariantMap={
                code_section.id: python_variant.id,
                dict_section.id: dict_variant.id,
            },
            topLevelSections={
                code_section.id: TopLevelSectionLayout(),
                dict_section.id: TopLevelSectionLayout(),
            },
        )
        project_state = ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={
                code_section.id: code_section,
                dict_section.id: dict_section,
            },
            sectionImpls={
                python_impl.id: python_impl,
                bash_impl.id: bash_impl,
                dict_impl.id: dict_impl,
            },
            sectionVariants={
                python_variant.id: python_variant,
                bash_variant.id: bash_variant,
                dict_variant.id: dict_variant,
            },
            codeObjs={param_core.id: param_core},
            codeObjImpls={param_impl.id: param_impl},
            codeObjVariants={param_variant.id: param_variant},
        )
        backend = ProjectStateBackend(
            sections=project_state.sections,
            sectionImpls=project_state.sectionImpls,
            sectionVariants=project_state.sectionVariants,
            codeObjs=project_state.codeObjs,
            codeObjImpls=project_state.codeObjImpls,
            codeObjVariants=project_state.codeObjVariants,
            projectConfigs={project_config.id: project_config},
            defaultProjectConfigId=project_config.id,
        )
        manager = RunOverridesProjectManager(
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
        return (
            manager,
            project_config,
            code_section,
            python_variant,
            bash_variant,
            dict_section,
            param_core,
        )

    async def test_create_run_command_with_overrides_does_not_mutate_state(self) -> None:
        (
            manager,
            project_config,
            code_section,
            python_variant,
            bash_variant,
            dict_section,
            param_core,
        ) = self._build_manager_and_state()
        try:
            command, snapshot_path, entry_section_id = (
                await manager.create_run_command_with_overrides(
                    RunDetachedRequest(
                        projectConfigId=project_config.id,
                        entrySectionId=code_section.id,
                        runSnapshotMode=RunSnapshotMode.never,
                        sectionVariantOverrides={code_section.id: bash_variant.id},
                        paramOverrides={f"{dict_section.id}:{param_core.id}": "2"},
                    )
                )
            )
            base_state = convert_backend_to_single_config(
                manager.project_state_backend, project_config.id
            )

            self.assertTrue(command.startswith("bash "))
            self.assertTrue(str(snapshot_path).endswith(".sh"))
            self.assertEqual(entry_section_id, code_section.id)
            self.assertEqual(
                base_state.projectConfig.sectionVariantMap[code_section.id],
                python_variant.id,
            )
            param_value = get_curr_effective_code_obj_impl_with_type_guard(
                base_state,
                dict_section.id,
                param_core.id,
                CodeParamCodeObjImpl,
            )
            self.assertEqual(param_value.value, "1")
            effective_impl = get_curr_effective_section_impl(
                base_state, code_section.id
            )
            self.assertIsInstance(effective_impl, CodeSectionImpl)
            self.assertEqual(effective_impl.codeLanguage, CodeLanguage.python)
        finally:
            manager.shutdown()

    async def test_create_run_command_with_overrides_rejects_bad_param_key(self) -> None:
        manager, project_config, code_section, _, _, _, _ = (
            self._build_manager_and_state()
        )
        try:
            with self.assertRaises(ValueError):
                await manager.create_run_command_with_overrides(
                    RunDetachedRequest(
                        projectConfigId=project_config.id,
                        entrySectionId=code_section.id,
                        runSnapshotMode=RunSnapshotMode.never,
                        paramOverrides={"bad": "2"},
                    )
                )
        finally:
            manager.shutdown()

    async def test_create_run_command_with_overrides_rejects_unknown_variant(self) -> None:
        manager, project_config, code_section, _, _, _, _ = (
            self._build_manager_and_state()
        )
        try:
            with self.assertRaises(KeyError):
                await manager.create_run_command_with_overrides(
                    RunDetachedRequest(
                        projectConfigId=project_config.id,
                        entrySectionId=code_section.id,
                        runSnapshotMode=RunSnapshotMode.never,
                        sectionVariantOverrides={
                            ID("missing-section"): ID("missing-variant")
                        },
                    )
                )
        finally:
            manager.shutdown()

    async def test_create_run_command_with_overrides_rejects_mismatched_variant(
        self,
    ) -> None:
        (
            manager,
            project_config,
            code_section,
            _,
            _,
            dict_section,
            _,
        ) = self._build_manager_and_state()
        dict_variant_id = dict_section.variants[0]
        try:
            with self.assertRaises(KeyError):
                await manager.create_run_command_with_overrides(
                    RunDetachedRequest(
                        projectConfigId=project_config.id,
                        entrySectionId=code_section.id,
                        runSnapshotMode=RunSnapshotMode.never,
                        sectionVariantOverrides={
                            code_section.id: dict_variant_id,
                        },
                    )
                )
        finally:
            manager.shutdown()

    async def test_create_run_command_with_overrides_snapshots_file_on_never(self) -> None:
        (
            manager,
            project_config,
            code_section,
            _,
            bash_variant,
            _,
            _,
        ) = self._build_manager_and_state()
        try:
            command, snapshot_path, entry_section_id = (
                await manager.create_run_command_with_overrides(
                    RunDetachedRequest(
                        projectConfigId=project_config.id,
                        entrySectionId=code_section.id,
                        runSnapshotMode=RunSnapshotMode.never,
                        sectionVariantOverrides={code_section.id: bash_variant.id},
                    )
                )
            )
            self.assertTrue(command.startswith("bash "))
            self.assertEqual(entry_section_id, code_section.id)
            self.assertTrue(snapshot_path.exists())
            self.assertTrue(snapshot_path.is_file())
            self.assertTrue(
                self._run_root.resolve() in snapshot_path.resolve().parents
            )
            self.assertEqual(snapshot_path.read_text().strip(), "echo hi")
        finally:
            manager.shutdown()
