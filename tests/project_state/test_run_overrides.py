from contextlib import ExitStack
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from fastapi import HTTPException

import pytest
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import NoopLSPWriters
from setta.project_state.artifacts import Artifacts
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.project_manager_types import RunDetachedRequest
from setta.project_state.project_manager_types import RunCodeRequest
from setta.routers.runs import route_run_detached
from setta.run_manager import DetachedRunManager
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
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.runtime_context import runtime_context
from tests.utils.setta_paths import temporary_setta_paths

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


@pytest.mark.asyncio
class TestRunOverride:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self._tmpdir = TemporaryDirectory()
        root = Path(self._tmpdir.name)
        self._run_root = root / "runtime"
        self._stack = ExitStack()
        self._stack.enter_context(temporary_setta_paths(runtime_root=self._run_root))
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

        yield

        self._stack.close()
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
            projectChatWindowingByProjectConfigId={project_config.id: {}},
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
                        runSnapshotMode=RunSnapshotMode.ephemeral,
                        sectionVariantOverrides={code_section.id: bash_variant.id},
                        paramOverrides={f"{dict_section.id}:{param_core.id}": "2"},
                    )
                )
            )
            base_state = convert_backend_to_single_config(
                manager.project_state_backend, project_config.id
            )

            assert command.startswith("bash ")
            assert str(snapshot_path).endswith(".sh")
            assert entry_section_id == code_section.id
            assert (
                base_state.projectConfig.sectionVariantMap[code_section.id]
                == python_variant.id
            )
            param_value = get_curr_effective_code_obj_impl_with_type_guard(
                base_state,
                dict_section.id,
                param_core.id,
                CodeParamCodeObjImpl,
            )
            assert param_value.value == "1"
            effective_impl = get_curr_effective_section_impl(
                base_state, code_section.id
            )
            assert isinstance(effective_impl, CodeSectionImpl)
            assert effective_impl.codeLanguage == CodeLanguage.python
        finally:
            manager.shutdown()

    async def test_create_run_command_applies_overrides_without_mutating_state(
        self,
    ) -> None:
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
            command = await manager.create_run_command(
                RunCodeRequest(
                    projectConfigId=project_config.id,
                    sectionId=code_section.id,
                    runSnapshotMode=RunSnapshotMode.ephemeral,
                    sectionVariantOverrides={code_section.id: bash_variant.id},
                    paramOverrides={f"{dict_section.id}:{param_core.id}": "2"},
                )
            )
            base_state = convert_backend_to_single_config(
                manager.project_state_backend, project_config.id
            )

            assert command.startswith("bash ")
            assert (
                base_state.projectConfig.sectionVariantMap[code_section.id]
                == python_variant.id
            )
            param_value = get_curr_effective_code_obj_impl_with_type_guard(
                base_state,
                dict_section.id,
                param_core.id,
                CodeParamCodeObjImpl,
            )
            assert param_value.value == "1"
            effective_impl = get_curr_effective_section_impl(
                base_state, code_section.id
            )
            assert isinstance(effective_impl, CodeSectionImpl)
            assert effective_impl.codeLanguage == CodeLanguage.python
        finally:
            manager.shutdown()

    async def test_create_run_command_with_overrides_rejects_bad_param_key(self) -> None:
        manager, project_config, code_section, _, _, _, _ = (
            self._build_manager_and_state()
        )
        try:
            with pytest.raises(ValueError):
                await manager.create_run_command_with_overrides(
                    RunDetachedRequest(
                        projectConfigId=project_config.id,
                        entrySectionId=code_section.id,
                        runSnapshotMode=RunSnapshotMode.ephemeral,
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
            with pytest.raises(KeyError):
                await manager.create_run_command_with_overrides(
                    RunDetachedRequest(
                        projectConfigId=project_config.id,
                        entrySectionId=code_section.id,
                        runSnapshotMode=RunSnapshotMode.ephemeral,
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
            with pytest.raises(KeyError):
                await manager.create_run_command_with_overrides(
                    RunDetachedRequest(
                        projectConfigId=project_config.id,
                        entrySectionId=code_section.id,
                        runSnapshotMode=RunSnapshotMode.ephemeral,
                        sectionVariantOverrides={
                            code_section.id: dict_variant_id,
                        },
                    )
                )
        finally:
            manager.shutdown()

    async def test_create_run_command_with_overrides_rejects_never(self) -> None:
        manager, project_config, code_section, _, _, _, _ = (
            self._build_manager_and_state()
        )
        try:
            with pytest.raises(HTTPException) as ctx:
                await manager.create_run_command_with_overrides(
                    RunDetachedRequest(
                        projectConfigId=project_config.id,
                        entrySectionId=code_section.id,
                        runSnapshotMode=RunSnapshotMode.never,
                    )
                )
            assert ctx.value.status_code == 400
        finally:
            manager.shutdown()

    async def test_create_run_command_with_overrides_snapshots_file_on_ephemeral(self) -> None:
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
                        runSnapshotMode=RunSnapshotMode.ephemeral,
                        sectionVariantOverrides={code_section.id: bash_variant.id},
                    )
                )
            )
            assert command.startswith("bash ")
            assert entry_section_id == code_section.id
            assert snapshot_path.exists()
            assert snapshot_path.is_file()
            assert self._run_root.resolve() in snapshot_path.resolve().parents
            assert snapshot_path.read_text().strip() == "echo hi"
        finally:
            manager.shutdown()

    async def test_route_run_detached_rejects_bad_param_key(self) -> None:
        manager, project_config, code_section, _, _, _, _ = (
            self._build_manager_and_state()
        )
        try:
            switcher = ProjectManagerSwitcher(
                main_manager=manager,
                settings_manager=manager,
            )
            state = SimpleNamespace(
                project_manager_switcher=switcher,
                wmh_frontend_sender=self.frontend_sender,
                share_mode=False,
                deployment_mode=False,
                detached_run_manager=DetachedRunManager(self.dbe),
                terminals=None,
            )
            request = RunDetachedRequest(
                projectConfigId=project_config.id,
                entrySectionId=code_section.id,
                runSnapshotMode=RunSnapshotMode.ephemeral,
                paramOverrides={"bad": "2"},
            )
            with pytest.raises(HTTPException) as ctx:
                with runtime_context(state) as runtime_ctx:
                    await route_run_detached(request, runtime_ctx)
            assert ctx.value.status_code == 400
            assert "Invalid param override key" in str(ctx.value.detail)
        finally:
            manager.shutdown()
