from contextlib import ExitStack
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from fastapi import HTTPException

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
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.project_config import (
    Position,
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
from setta.utils.paths import normalize_state_path
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager
from tests.utils.setta_paths import temporary_setta_paths


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
        plugin_manager: object | None = None,
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
