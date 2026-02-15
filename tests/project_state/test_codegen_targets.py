from contextlib import ExitStack
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import shutil

from fastapi import FastAPI, HTTPException

import pytest
from setta.binary import BinaryStore
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import NoopLSPWriters
from setta.project_state.artifacts import Artifacts
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.code_files import CodeFiles
from setta.project_state.draw_snapshots import build_draw_snapshot_path
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.project_manager_types import (
    FormatCodeRequest,
    RunCodeRequest,
    SetProjectConfigCodegenTargetsRequest,
)
from setta.project_state.settings_project import create_settings_project_state
from setta.project_state.share_runtime_state import ShareRuntimeState
from setta.plugins.manager import PluginManager
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.project_config import (
    Position,
    ProjectCodegenPluginTarget,
    ProjectConfig,
    TopLevelSectionLayout,
)
from setta.types.lsp import (
    SettaLspDiagnostic,
    SettaProjectConfigDiagnostics,
    SettaSectionTypeErrors,
)
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import (
    CodeFileAccessMode,
    CodeFileBinding,
    CodeLanguage,
    CodeSectionImpl,
    DrawSectionImpl,
    GenPythonCodeSectionImpl,
    SectionType,
)
from setta.types.settings_state import RunSnapshotMode
from setta.types.share_deployment import DeploymentManifest, DeploymentType, SharePolicy
from setta.utils.constants import C
from setta.utils.utils import build_project_sections_dir
from setta.utils.paths import normalize_state_path
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager
from tests.utils.setta_paths import temporary_setta_paths


FIXTURE_PLUGIN_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "plugins"


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
        plugin_manager: PluginManager | None = None,
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
            plugin_manager=plugin_manager,
        )

    def load_initial_state(self) -> ProjectStateBackend:
        return self._initial_backend.model_copy(deep=True)

    def save(self):
        return None

    async def save_as_new_project_config(self, _x):
        return None


class TestCodegenTargetsSettings:
    def test_settings_project_has_no_gen_code_binding(self) -> None:
        project_state = create_settings_project_state(Path("settings.json"))
        assert project_state.genCodeBinding is None


class TestCodegenTargetsBindings:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self._tmpdir = TemporaryDirectory()
        root = Path(self._tmpdir.name)
        self._workspace_root = root
        self._setta_home = root / "setta_home"
        self._setta_home.mkdir(parents=True, exist_ok=True)
        self._stack = ExitStack()
        self._stack.enter_context(
            temporary_setta_paths(
                workspace_root=root,
                setta_files_location="local",
            )
        )
        for path in (
            C.SETTA_FILES_FOLDER,
            C.CODE_FOLDER,
            C.DB_BACKUP_FOLDER,
            C.ARTIFACTS_FOLDER,
            C.RUNTIME_FOLDER,
            C.RUNTIME_SESSIONS_FOLDER,
            C.RUNTIME_LOGS_FOLDER,
            C.RUNTIME_MCP_FOLDER,
            C.RUNTIME_SECRETS_FOLDER,
            C.DETACHED_RUNS_FOLDER,
            C.SHARE_DEPLOYMENTS_FOLDER,
        ):
            path.mkdir(parents=True, exist_ok=True)

        yield

        self._stack.close()
        self._tmpdir.cleanup()

    def test_validate_code_file_bindings_skips_gen_python(self) -> None:
        gen_impl = GenPythonCodeSectionImpl()
        gen_impl.codeFileBinding = CodeFileBinding(
            canonical_path=normalize_state_path(C.CODE_FOLDER / "generated.py"),
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

        assert project_state.genCodeBinding is None
        updated_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section.id,
            GenPythonCodeSectionImpl,
        )
        assert updated_impl.codeFileBinding is None


@pytest.mark.asyncio
class TestCodegenTargetsRunCommand:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self._tmpdir = TemporaryDirectory()
        root = Path(self._tmpdir.name)
        self._workspace_root = root
        self._setta_home = root / "setta_home"
        self._setta_home.mkdir(parents=True, exist_ok=True)
        self._stack = ExitStack()
        self._stack.enter_context(
            temporary_setta_paths(
                workspace_root=root,
                setta_files_location="local",
            )
        )
        for path in (
            C.SETTA_FILES_FOLDER,
            C.CODE_FOLDER,
            C.DB_BACKUP_FOLDER,
            C.ARTIFACTS_FOLDER,
            C.RUNTIME_FOLDER,
            C.RUNTIME_SESSIONS_FOLDER,
            C.RUNTIME_LOGS_FOLDER,
            C.RUNTIME_MCP_FOLDER,
            C.RUNTIME_SECRETS_FOLDER,
            C.DETACHED_RUNS_FOLDER,
            C.SHARE_DEPLOYMENTS_FOLDER,
        ):
            path.mkdir(parents=True, exist_ok=True)

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

        yield

        self._stack.close()
        self._tmpdir.cleanup()

    def _create_loaded_codegen_plugin_manager(self) -> PluginManager:
        plugin_manager = PluginManager(
            workspace_root=self._workspace_root,
            setta_files_root=C.SETTA_FILES_FOLDER,
            setta_home=self._setta_home,
            server_mode="ide",
            setta_version="0.1.0",
        )
        plugin_id = "setta-fixture-backend-codegen"
        plugin_destination = self._workspace_root / ".setta_plugins" / plugin_id
        plugin_destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(FIXTURE_PLUGIN_ROOT / "backend-codegen", plugin_destination)
        plugin_manager.rescan()
        plugin_manager.load_backend_plugins(app=FastAPI())
        return plugin_manager

    async def test_create_run_command_runs_manual_code_when_python_disabled(
        self,
    ) -> None:
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

        assert command.startswith("bash ")

    async def test_create_run_command_triggers_autosave_for_draw_snapshots(
        self,
    ) -> None:
        self.settings_file.settings.backend.autosave = True
        code_impl = CodeSectionImpl(codeLanguage=CodeLanguage.bash)
        code_impl.code = "echo test"
        code_variant = Variant(
            impl=code_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(code_impl),
        )
        code_section = Core(
            name="Script",
            variants=[code_variant.id],
            defaultVariant=code_variant.id,
        )
        draw_impl = DrawSectionImpl(name="Draw")
        draw_variant = Variant(
            impl=draw_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(draw_impl),
        )
        draw_section = Core(
            name="Draw",
            variants=[draw_variant.id],
            defaultVariant=draw_variant.id,
        )
        project_config = ProjectConfig(
            name="SnapshotAutosave",
            codegenTargets=[],
            sectionVariantMap={
                code_section.id: code_variant.id,
                draw_section.id: draw_variant.id,
            },
            topLevelSections={
                code_section.id: TopLevelSectionLayout(),
                draw_section.id: TopLevelSectionLayout(),
            },
        )
        project_state = ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={
                code_section.id: code_section,
                draw_section.id: draw_section,
            },
            sectionImpls={
                code_impl.id: code_impl,
                draw_impl.id: draw_impl,
            },
            sectionVariants={
                code_variant.id: code_variant,
                draw_variant.id: draw_variant,
            },
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

        payload_bytes = b"snapshot-bytes"
        binary_store = BinaryStore.from_dbe(self.dbe)
        payload_ref = binary_store.store_bytes(payload_bytes, mime_type="image/png")
        await manager.create_run_command(
            RunCodeRequest(
                projectConfigId=project_config.id,
                sectionId=code_section.id,
                runSnapshotMode=RunSnapshotMode.never,
                drawSnapshotsBySectionId={draw_section.id: payload_ref},
            )
        )
        updated_state = manager.get_single_config_state(project_config.id)
        updated_draw = get_curr_effective_section_impl_with_type_guard(
            updated_state,
            draw_section.id,
            DrawSectionImpl,
        )
        expected_path = build_draw_snapshot_path(draw_section.id, C.ARTIFACTS_FOLDER)
        assert expected_path.as_posix() == updated_draw.renderedImagePath
        assert expected_path.exists()
        assert manager.autosave_debouncer.is_pending
        manager.shutdown()

    async def test_create_run_command_rejects_non_runnable_language(self) -> None:
        code_impl = CodeSectionImpl(codeLanguage=CodeLanguage.json)
        code_impl.code = '{"ok": true}'
        variant = Variant(
            impl=code_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(code_impl),
        )
        section = Core(
            name="Json Block",
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

        with pytest.raises(HTTPException) as ctx:
            await manager.create_run_command(
                RunCodeRequest(
                    projectConfigId=project_config.id,
                    sectionId=section.id,
                    runSnapshotMode=RunSnapshotMode.never,
                )
            )
        assert 400 == ctx.value.status_code
        manager.shutdown()

    async def test_refresh_codegen_state_writes_non_runnable_code(self) -> None:
        code_impl = CodeSectionImpl(codeLanguage=CodeLanguage.json)
        code_impl.code = '{"ok": true}'
        variant = Variant(
            impl=code_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(code_impl),
        )
        section = Core(
            name="Json Block",
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
        binding_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section.id,
            CodeSectionImpl,
        )
        assert binding_impl.codeFileBinding is not None
        binding_path = binding_impl.codeFileBinding.canonical_path

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
        await manager._process_queue_task_started.wait()
        await manager._refresh_codegen_state(project_state)
        manager.shutdown()

        assert binding_path.exists()
        assert binding_path.read_text(encoding="utf-8") == code_impl.code

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

        with pytest.raises(KeyError):
            await manager.create_run_command(
                RunCodeRequest(
                    projectConfigId=project_config.id,
                    sectionId=None,
                    runSnapshotMode=RunSnapshotMode.never,
                )
            )
        manager.shutdown()

    async def test_refresh_codegen_state_generates_plugin_codegen_outputs(self) -> None:
        plugin_manager = self._create_loaded_codegen_plugin_manager()
        project_config = ProjectConfig(
            name="PluginCodegen",
            codegenTargets=[
                ProjectCodegenPluginTarget(
                    language="setta-fixture-backend-codegen:typescript",
                    options={"className": "PluginState"},
                )
            ],
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
            plugin_manager=plugin_manager,
        )
        try:
            await manager._refresh_codegen_state(project_state)
            target_dir = manager._plugin_codegen_target_dir_name(
                "setta-fixture-backend-codegen:typescript"
            )
            output_root = (
                build_project_sections_dir(C.CODE_FOLDER, project_config.name)
                / "plugin_codegen"
                / target_dir
            )
            output_path = output_root / "setta_gen.ts"
            assert output_path.exists()
            assert output_path.read_text(encoding="utf-8") == (
                "export class PluginState {\n"
                "  readonly projectName = 'PluginCodegen';\n"
                "}\n"
            )
        finally:
            manager.shutdown()
            plugin_manager.shutdown_backend_plugins()

    async def test_refresh_codegen_state_skips_unchanged_plugin_codegen_outputs(
        self,
    ) -> None:
        plugin_manager = self._create_loaded_codegen_plugin_manager()
        project_config = ProjectConfig(
            name="PluginCodegenSkipUnchanged",
            codegenTargets=[
                ProjectCodegenPluginTarget(
                    language="setta-fixture-backend-codegen:typescript",
                    options={"className": "PluginState"},
                )
            ],
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
            plugin_manager=plugin_manager,
        )
        generation_calls = 0
        original_generate = plugin_manager.generate_backend_codegen_target

        def _counting_generate_backend_codegen_target(
            *,
            target_id: str,
            project_state: dict,
            target_options: dict[str, Any],
        ) -> list[tuple[str, str]]:
            nonlocal generation_calls
            generation_calls += 1
            return original_generate(
                target_id=target_id,
                project_state=project_state,
                target_options=target_options,
            )

        plugin_manager.generate_backend_codegen_target = (  # type: ignore[method-assign]
            _counting_generate_backend_codegen_target
        )
        try:
            await manager._refresh_codegen_state(project_state)
            await manager._refresh_codegen_state(project_state)
            assert generation_calls == 1
        finally:
            manager.shutdown()
            plugin_manager.shutdown_backend_plugins()

    async def test_refresh_codegen_state_regenerates_missing_cached_plugin_outputs(
        self,
    ) -> None:
        plugin_manager = self._create_loaded_codegen_plugin_manager()
        project_config = ProjectConfig(
            name="PluginCodegenMissingOutput",
            codegenTargets=[
                ProjectCodegenPluginTarget(
                    language="setta-fixture-backend-codegen:typescript",
                    options={"className": "PluginState"},
                )
            ],
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
            plugin_manager=plugin_manager,
        )
        generation_calls = 0
        original_generate = plugin_manager.generate_backend_codegen_target

        def _counting_generate_backend_codegen_target(
            *,
            target_id: str,
            project_state: dict,
            target_options: dict[str, Any],
        ) -> list[tuple[str, str]]:
            nonlocal generation_calls
            generation_calls += 1
            return original_generate(
                target_id=target_id,
                project_state=project_state,
                target_options=target_options,
            )

        plugin_manager.generate_backend_codegen_target = (  # type: ignore[method-assign]
            _counting_generate_backend_codegen_target
        )
        try:
            await manager._refresh_codegen_state(project_state)
            assert generation_calls == 1

            target_dir = manager._plugin_codegen_target_dir_name(
                "setta-fixture-backend-codegen:typescript"
            )
            output_path = (
                build_project_sections_dir(C.CODE_FOLDER, project_config.name)
                / "plugin_codegen"
                / target_dir
                / "setta_gen.ts"
            )
            assert output_path.exists()
            output_path.unlink()
            assert not output_path.exists()

            await manager._refresh_codegen_state(project_state)
            assert generation_calls == 2
            assert output_path.exists()
        finally:
            manager.shutdown()
            plugin_manager.shutdown_backend_plugins()

    async def test_set_project_config_name_removes_stale_plugin_codegen_output_root(
        self,
    ) -> None:
        class _StubPluginManager:
            def has_backend_codegen_target(self, _target_id: str) -> bool:
                return True

            def get_backend_codegen_target_implementation_key(
                self, target_id: str
            ) -> str:
                return f"{target_id}:impl"

            def generate_backend_codegen_target(
                self,
                *,
                target_id: str,
                project_state: dict[str, Any],
                _target_options: dict[str, Any],
            ) -> list[tuple[str, str]]:
                return [
                    (
                        "setta_gen.txt",
                        f"{target_id}:{project_state['projectConfig']['name']}",
                    )
                ]

        plugin_manager = _StubPluginManager()
        project_config = ProjectConfig(
            name="PluginCodegenRenameOld",
            codegenTargets=[
                ProjectCodegenPluginTarget(language="stub-plugin:target-a")
            ],
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
            plugin_manager=plugin_manager,  # type: ignore[arg-type]
        )
        try:
            await manager._refresh_codegen_state(project_state)
            old_output_root = manager._plugin_codegen_output_root(
                "PluginCodegenRenameOld"
            )
            assert old_output_root.exists()

            await manager.set_project_config_name(
                projectConfigId=project_config.id,
                newName="PluginCodegenRenameNew",
            )
            assert not old_output_root.exists()

            renamed_state = manager.get_single_config_state(project_config.id)
            await manager._refresh_codegen_state(renamed_state)
            new_output_root = manager._plugin_codegen_output_root(
                "PluginCodegenRenameNew"
            )
            assert new_output_root.exists()
        finally:
            manager.shutdown()

    async def test_delete_project_configs_removes_plugin_codegen_output_root(
        self,
    ) -> None:
        class _StubPluginManager:
            def has_backend_codegen_target(self, _target_id: str) -> bool:
                return True

            def get_backend_codegen_target_implementation_key(
                self, target_id: str
            ) -> str:
                return f"{target_id}:impl"

            def generate_backend_codegen_target(
                self,
                *,
                target_id: str,
                project_state: dict[str, Any],
                _target_options: dict[str, Any],
            ) -> list[tuple[str, str]]:
                return [
                    (
                        "setta_gen.txt",
                        f"{target_id}:{project_state['projectConfig']['name']}",
                    )
                ]

        plugin_manager = _StubPluginManager()
        primary_config = ProjectConfig(name="PluginCodegenPrimary")
        removable_config = ProjectConfig(
            name="PluginCodegenDeleteMe",
            codegenTargets=[
                ProjectCodegenPluginTarget(language="stub-plugin:target-a")
            ],
        )
        primary_state = ProjectStateSingleConfig(projectConfig=primary_config)
        removable_state = ProjectStateSingleConfig(projectConfig=removable_config)
        backend = merge_single_config_into_backend(ProjectStateBackend(), primary_state)
        backend = merge_single_config_into_backend(backend, removable_state)
        backend.defaultProjectConfigId = primary_config.id
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
            plugin_manager=plugin_manager,  # type: ignore[arg-type]
        )
        try:
            await manager._refresh_codegen_state(removable_state)
            removable_output_root = manager._plugin_codegen_output_root(
                "PluginCodegenDeleteMe"
            )
            assert removable_output_root.exists()

            await manager.delete_project_configs([removable_config.id])
            assert not removable_output_root.exists()
        finally:
            manager.shutdown()

    async def test_refresh_codegen_state_prunes_removed_target_dirs_after_manager_restart(
        self,
    ) -> None:
        class _StubPluginManager:
            def has_backend_codegen_target(self, _target_id: str) -> bool:
                return True

            def get_backend_codegen_target_implementation_key(
                self, target_id: str
            ) -> str:
                return f"{target_id}:impl"

            def generate_backend_codegen_target(
                self,
                *,
                target_id: str,
                project_state: dict[str, Any],
                target_options: dict[str, Any],
            ) -> list[tuple[str, str]]:
                option_count = len(target_options)
                return [
                    (
                        "setta_gen.txt",
                        (
                            f"{target_id}:{project_state['projectConfig']['name']}:"
                            f"{option_count}"
                        ),
                    )
                ]

        plugin_manager = _StubPluginManager()
        project_config_name = "PluginCodegenRestartPrune"

        first_project_config = ProjectConfig(
            name=project_config_name,
            codegenTargets=[
                ProjectCodegenPluginTarget(language="stub-plugin:target-a")
            ],
        )
        first_state = ProjectStateSingleConfig(projectConfig=first_project_config)
        first_backend = merge_single_config_into_backend(
            ProjectStateBackend(), first_state
        )
        first_manager = CodegenTargetsProjectManager(
            self.lsp_writers,
            self.frontend_sender,
            self.python_script_sender,
            self.settings_file,
            self.specific_file_watcher,
            self.dbe,
            self.artifacts,
            self.json_source,
            self.code_files,
            first_backend,
            plugin_manager=plugin_manager,  # type: ignore[arg-type]
        )
        try:
            await first_manager._refresh_codegen_state(first_state)
            stale_target_dir = first_manager._plugin_codegen_output_root(
                project_config_name
            ) / first_manager._plugin_codegen_target_dir_name("stub-plugin:target-a")
            assert stale_target_dir.exists()
        finally:
            first_manager.shutdown()

        second_project_config = ProjectConfig(
            name=project_config_name,
            codegenTargets=[
                ProjectCodegenPluginTarget(language="stub-plugin:target-b")
            ],
        )
        second_state = ProjectStateSingleConfig(projectConfig=second_project_config)
        second_backend = merge_single_config_into_backend(
            ProjectStateBackend(), second_state
        )
        second_manager = CodegenTargetsProjectManager(
            self.lsp_writers,
            self.frontend_sender,
            self.python_script_sender,
            self.settings_file,
            self.specific_file_watcher,
            self.dbe,
            self.artifacts,
            self.json_source,
            self.code_files,
            second_backend,
            plugin_manager=plugin_manager,  # type: ignore[arg-type]
        )
        try:
            await second_manager._refresh_codegen_state(second_state)
            output_root = second_manager._plugin_codegen_output_root(
                project_config_name
            )
            stale_target_dir = (
                output_root
                / second_manager._plugin_codegen_target_dir_name("stub-plugin:target-a")
            )
            active_target_dir = (
                output_root
                / second_manager._plugin_codegen_target_dir_name("stub-plugin:target-b")
            )
            assert not stale_target_dir.exists()
            assert active_target_dir.exists()
        finally:
            second_manager.shutdown()

    async def test_refresh_codegen_state_regenerates_when_plugin_implementation_changes(
        self,
    ) -> None:
        class _StubPluginManager:
            def __init__(self) -> None:
                self.implementation_token = "impl-a"
                self.generate_call_count = 0

            def has_backend_codegen_target(self, _target_id: str) -> bool:
                return True

            def get_backend_codegen_target_implementation_key(
                self, target_id: str
            ) -> str:
                return f"{target_id}:{self.implementation_token}"

            def generate_backend_codegen_target(
                self,
                *,
                target_id: str,
                project_state: dict[str, Any],
                target_options: dict[str, Any],
            ) -> list[tuple[str, str]]:
                self.generate_call_count += 1
                return [
                    (
                        "setta_gen.txt",
                        (
                            f"{target_id}:{self.implementation_token}:"
                            f"{len(project_state)}:{len(target_options)}"
                        ),
                    )
                ]

        plugin_manager = _StubPluginManager()
        project_config = ProjectConfig(
            name="PluginCodegenImplKey",
            codegenTargets=[
                ProjectCodegenPluginTarget(language="stub-plugin:target-a")
            ],
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
            plugin_manager=plugin_manager,  # type: ignore[arg-type]
        )
        try:
            await manager._refresh_codegen_state(project_state)
            assert plugin_manager.generate_call_count == 1

            await manager._refresh_codegen_state(project_state)
            assert plugin_manager.generate_call_count == 1

            plugin_manager.implementation_token = "impl-b"
            await manager._refresh_codegen_state(project_state)
            assert plugin_manager.generate_call_count == 2

            target_dir = manager._plugin_codegen_target_dir_name("stub-plugin:target-a")
            output_path = (
                build_project_sections_dir(C.CODE_FOLDER, project_config.name)
                / "plugin_codegen"
                / target_dir
                / "setta_gen.txt"
            )
            output_text = output_path.read_text(encoding="utf-8")
            assert output_text.startswith("stub-plugin:target-a:impl-b:")
            assert output_text.endswith(":0")
        finally:
            manager.shutdown()

    async def test_plugin_codegen_target_dir_name_avoids_cross_target_collisions(
        self,
    ) -> None:
        class _StubManager:
            def has_backend_codegen_target(self, _target_id: str) -> bool:
                return True

            def get_backend_codegen_target_implementation_key(
                self, target_id: str
            ) -> str:
                return target_id

            def generate_backend_codegen_target(
                self,
                *,
                target_id: str,
                project_state: dict[str, Any],
                target_options: dict[str, Any],
            ) -> list[tuple[str, str]]:
                option_count = len(target_options)
                return [
                    (
                        "setta_gen.txt",
                        (
                            f"{target_id}:{project_state['projectConfig']['name']}:"
                            f"{option_count}"
                        ),
                    )
                ]

        project_config = ProjectConfig(
            name="PluginCodegenCollision",
            codegenTargets=[
                ProjectCodegenPluginTarget(language="foo:bar_baz"),
                ProjectCodegenPluginTarget(language="foo_bar:baz"),
            ],
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
            plugin_manager=_StubManager(),  # type: ignore[arg-type]
        )
        try:
            dir_a = manager._plugin_codegen_target_dir_name("foo:bar_baz")
            dir_b = manager._plugin_codegen_target_dir_name("foo_bar:baz")
            assert dir_a != dir_b
        finally:
            manager.shutdown()

    async def test_refresh_codegen_state_hashes_project_state_once_per_refresh(
        self,
    ) -> None:
        class _StubPluginManager:
            def has_backend_codegen_target(self, target_id: str) -> bool:
                return target_id in {
                    "stub-plugin:target-a",
                    "stub-plugin:target-b",
                }

            def get_backend_codegen_target_implementation_key(
                self, target_id: str
            ) -> str:
                return target_id

            def generate_backend_codegen_target(
                self,
                *,
                target_id: str,
                project_state: dict[str, Any],
                target_options: dict[str, Any],
            ) -> list[tuple[str, str]]:
                return [
                    (
                        f"{target_id.replace(':', '_')}.txt",
                        f"{project_state['projectConfig']['name']}:{target_options.get('label', '')}",
                    )
                ]

        plugin_manager = _StubPluginManager()
        project_config = ProjectConfig(
            name="PluginCodegenStateHash",
            codegenTargets=[
                ProjectCodegenPluginTarget(
                    language="stub-plugin:target-a",
                    options={"label": "A"},
                ),
                ProjectCodegenPluginTarget(
                    language="stub-plugin:target-b",
                    options={"label": "B"},
                ),
            ],
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
            plugin_manager=plugin_manager,  # type: ignore[arg-type]
        )
        hash_calls = 0
        original_hash = manager._hash_plugin_codegen_project_state

        def _counting_hash(project_state_payload: dict[str, Any]) -> str:
            nonlocal hash_calls
            hash_calls += 1
            return original_hash(project_state_payload)

        manager._hash_plugin_codegen_project_state = _counting_hash  # type: ignore[method-assign]
        try:
            await manager._refresh_codegen_state(project_state)
            assert hash_calls == 1
        finally:
            manager.shutdown()

    async def test_set_codegen_targets_rejects_unknown_plugin_target(self) -> None:
        plugin_manager = self._create_loaded_codegen_plugin_manager()
        project_config = ProjectConfig(name="PluginCodegenValidation")
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
            plugin_manager=plugin_manager,
        )
        try:
            with pytest.raises(KeyError) as exc_info:
                await manager.set_project_config_codegen_targets(
                    SetProjectConfigCodegenTargetsRequest(
                        projectConfigId=project_config.id,
                        codegenTargets=[
                            ProjectCodegenPluginTarget(
                                language="setta-fixture-backend-codegen:missing"
                            )
                        ],
                    )
                )
            assert "Plugin codegen target is not registered" in str(exc_info.value)
        finally:
            manager.shutdown()
            plugin_manager.shutdown_backend_plugins()

    async def test_format_code_updates_watch_code_registry(self) -> None:
        code_impl = CodeSectionImpl(codeLanguage=CodeLanguage.python)
        code_impl.code = "def greet( ):\n    return 1\n"
        variant = Variant(
            impl=code_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(code_impl),
        )
        section = Core(
            name="Entry",
            variants=[variant.id],
            defaultVariant=variant.id,
        )
        project_config = ProjectConfig(
            name="WatchCodeFormat",
            sectionVariantMap={section.id: variant.id},
            topLevelSections={section.id: TopLevelSectionLayout()},
        )
        project_config.watchCodeEnabled = True
        project_config.watchCodeBaselineByPath = {"placeholder": []}
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

        await manager.format_code(
            FormatCodeRequest(
                projectConfigId=project_config.id,
                sectionId=section.id,
            )
        )

        updated_state = manager.get_single_config_state(project_config.id)
        assert updated_state.projectConfig.watchCodeRegistry
        manager.shutdown()

    async def test_refresh_codegen_state_clears_diagnostics_without_lsp(self) -> None:
        project_config = ProjectConfig(name="NoLspDiagnostics")
        project_state = ProjectStateSingleConfig(projectConfig=project_config)
        gen_section_id = create_top_level_section(
            self.settings_file.settings,
            project_state,
            SectionType.GenPythonCode,
            Position(),
        )
        callable_section_id = create_top_level_section(
            self.settings_file.settings,
            project_state,
            SectionType.Callable,
            Position(),
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
        diagnostics_state = manager._get_lsp_diagnostics_state(project_config.id)
        diagnostics_state.gen_code = SettaProjectConfigDiagnostics(
            projectConfigId=project_config.id,
            errors={
                callable_section_id: SettaSectionTypeErrors(
                    callable=["Type error"], params={}
                )
            },
            isGenCode=True,
        )
        diagnostics_state.unmapped_gen_code = [
            SettaLspDiagnostic(
                message="stub",
                severity=1,
                code=None,
                source="pyright",
                range={
                    "start": {"line": 0, "character": 0},
                    "end": {"line": 0, "character": 1},
                },
                uri="file:///tmp/gen.py",
            )
        ]

        previous_code = manager.gen_code[project_config.id].code
        create_top_level_section(
            self.settings_file.settings,
            project_state,
            SectionType.Callable,
            Position(),
        )
        project_state.validate_for_update(validate_code_file_bindings=True)
        await manager._refresh_codegen_state(project_state)

        updated_code = manager.gen_code[project_config.id].code
        assert updated_code != previous_code
        assert diagnostics_state.gen_code.errors == {}
        assert diagnostics_state.unmapped_gen_code == []
        assert gen_section_id in project_state.sections
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
        assert updated_state.singletonSections.GenPythonCode is None
        assert updated_state.projectConfig.entryCodeBlockId is None
        assert gen_section_id not in updated_state.sections
        manager.shutdown()


class TestShareRuntimeStateCodegenTargets:
    def test_share_runtime_state_skips_gen_code_binding_without_python(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "deployments" / "no_python" / "v1"
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
            manifest = DeploymentManifest(
                version=1,
                deploymentName=root.parent.name,
                deploymentType=DeploymentType.share,
                defaultProjectConfigId=project_config.id,
                deploymentVersion=root.name,
            )
            dbe.write_json(root / "manifest.json", manifest.model_dump())
            dbe.write_json(root / "policy.json", SharePolicy().model_dump())

            frontend_sender = WMHFrontendSender(WebsocketManager())
            manager = ShareRuntimeState(dbe, root, frontend_sender)
            manager.create_session_backend("session-a")
            session_state = manager.get_session_state("session-a", project_config.id)

            assert session_state.genCodeBinding is None


@pytest.mark.asyncio
class TestShareRuntimeStateRunCommand:
    async def test_share_runtime_state_rejects_non_runnable_language(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "deployments" / "no_run" / "v1"
            root.mkdir(parents=True, exist_ok=True)
            code_impl = CodeSectionImpl(codeLanguage=CodeLanguage.json)
            code_impl.code = '{"ok": true}'
            code_impl.codeFileBinding = CodeFileBinding(
                canonical_path=Path("code/sample.json"),
                access_mode=CodeFileAccessMode.read_write,
            )
            variant = Variant(
                impl=code_impl.id,
                nonPresetImpls=compute_initial_nonPresetImpls(code_impl),
            )
            section = Core(
                name="Json Block",
                variants=[variant.id],
                defaultVariant=variant.id,
            )
            project_config = ProjectConfig(
                name="no_run",
                codegenTargets=[],
                entryCodeBlockId=section.id,
                sectionVariantMap={section.id: variant.id},
                topLevelSections={section.id: TopLevelSectionLayout()},
            )
            project_state = ProjectStateSingleConfig(
                projectConfig=project_config,
                sections={section.id: section},
                sectionImpls={code_impl.id: code_impl},
                sectionVariants={variant.id: variant},
            )
            project_state.validate_for_update(validate_code_file_bindings=False)
            backend = merge_single_config_into_backend(
                ProjectStateBackend(),
                project_state,
            )
            backend.defaultProjectConfigId = project_config.id
            dbe = DBE(root)
            dbe.write_project(backend)
            manifest = DeploymentManifest(
                version=1,
                deploymentName=root.parent.name,
                deploymentType=DeploymentType.share,
                defaultProjectConfigId=project_config.id,
                deploymentVersion=root.name,
            )
            dbe.write_json(root / "manifest.json", manifest.model_dump())
            dbe.write_json(root / "policy.json", SharePolicy().model_dump())

            frontend_sender = WMHFrontendSender(WebsocketManager())
            manager = ShareRuntimeState(dbe, root, frontend_sender)
            manager.create_session_backend("session-a")

            with pytest.raises(HTTPException) as ctx:
                await manager.create_run_command(
                    "session-a",
                    RunCodeRequest(
                        projectConfigId=project_config.id,
                        sectionId=None,
                        runSnapshotMode=RunSnapshotMode.ephemeral,
                    ),
                )
            assert 400 == ctx.value.status_code

    async def test_share_runtime_state_snapshots_non_runnable_sections(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "deployments" / "with_assets" / "v1"
            root.mkdir(parents=True, exist_ok=True)
            entry_impl = CodeSectionImpl(codeLanguage=CodeLanguage.python)
            entry_impl.code = "print('hi')"
            entry_impl.codeFileBinding = CodeFileBinding(
                canonical_path=Path("code/entry.py"),
                access_mode=CodeFileAccessMode.read_write,
            )
            json_impl = CodeSectionImpl(codeLanguage=CodeLanguage.json)
            json_impl.code = '{"ok": true}'
            json_impl.codeFileBinding = CodeFileBinding(
                canonical_path=Path("code/sample.json"),
                access_mode=CodeFileAccessMode.read_write,
            )
            entry_variant = Variant(
                impl=entry_impl.id,
                nonPresetImpls=compute_initial_nonPresetImpls(entry_impl),
            )
            json_variant = Variant(
                impl=json_impl.id,
                nonPresetImpls=compute_initial_nonPresetImpls(json_impl),
            )
            entry_section = Core(
                name="Entry Block",
                variants=[entry_variant.id],
                defaultVariant=entry_variant.id,
            )
            json_section = Core(
                name="Json Block",
                variants=[json_variant.id],
                defaultVariant=json_variant.id,
            )
            project_config = ProjectConfig(
                name="with_assets",
                codegenTargets=[],
                entryCodeBlockId=entry_section.id,
                sectionVariantMap={
                    entry_section.id: entry_variant.id,
                    json_section.id: json_variant.id,
                },
                topLevelSections={
                    entry_section.id: TopLevelSectionLayout(),
                    json_section.id: TopLevelSectionLayout(),
                },
            )
            project_state = ProjectStateSingleConfig(
                projectConfig=project_config,
                sections={
                    entry_section.id: entry_section,
                    json_section.id: json_section,
                },
                sectionImpls={
                    entry_impl.id: entry_impl,
                    json_impl.id: json_impl,
                },
                sectionVariants={
                    entry_variant.id: entry_variant,
                    json_variant.id: json_variant,
                },
            )
            project_state.validate_for_update(validate_code_file_bindings=False)
            backend = merge_single_config_into_backend(
                ProjectStateBackend(),
                project_state,
            )
            backend.defaultProjectConfigId = project_config.id
            dbe = DBE(root)
            dbe.write_project(backend)
            manifest = DeploymentManifest(
                version=1,
                deploymentName=root.parent.name,
                deploymentType=DeploymentType.share,
                defaultProjectConfigId=project_config.id,
                deploymentVersion=root.name,
            )
            dbe.write_json(root / "manifest.json", manifest.model_dump())
            dbe.write_json(root / "policy.json", SharePolicy().model_dump())

            frontend_sender = WMHFrontendSender(WebsocketManager())
            manager = ShareRuntimeState(dbe, root, frontend_sender)
            manager.create_session_backend("session-a")

            await manager.create_run_command(
                "session-a",
                RunCodeRequest(
                    projectConfigId=project_config.id,
                    sectionId=None,
                    runSnapshotMode=RunSnapshotMode.ephemeral,
                ),
            )

            runs_root = manager.share_runs_root / "session-a"
            snapshots = [path for path in runs_root.iterdir() if path.is_dir()]
            assert 1 == len(snapshots)
            snapshot_dir = snapshots[0]
            assert (snapshot_dir / "entry.py").exists()
            assert (snapshot_dir / "sample.json").exists()
