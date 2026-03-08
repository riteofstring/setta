from contextlib import ExitStack, asynccontextmanager
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from setta.code_gen.dependency_graph import DependencyGraph
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import LSPServers, LSPWriters
from setta.lsp.registrations import RegisteredLanguageServer
from setta.project_state.artifacts import Artifacts
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.lsp_diagnostics_state import ProjectLspDiagnosticsState
from setta.project_state.project_code import (
    ProjectBashCode,
    ProjectGenPythonCode,
    ProjectLSPCode,
    ProjectPythonCode,
    build_python_code_generator,
)
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.id import ID
from setta.types.lsp import (
    SettaLspDiagnostic,
    SettaLspDiagnosticPosition,
    SettaLspDiagnosticRange,
    SettaProjectConfigDiagnostics,
    SettaSectionTypeErrors,
)
from setta.types.project_config import (
    ProjectCodegenTarget,
    ProjectConfig,
    TopLevelSectionLayout,
    get_python_codegen_target_with_type_guard,
)
from setta.types.project_state import (
    CODE_LANGUAGE_EXTENSIONS,
    ProjectStateBackend,
    ProjectStateSingleConfig,
)
from setta.types.section_impls import (
    CodeFileAccessMode,
    CodeFileBinding,
    CodeLanguage,
    CodeSectionDiagnosticsIgnoreState,
    CodeSectionImpl,
)
from setta.utils.constants import C
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager
from tests.utils.setta_paths import temporary_setta_paths


class TypeCheckProjectManager(BaseProjectManager):
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

    def save(self):  # pragma: no cover - not used in these tests
        return None

    async def save_as_new_project_config(self, _x):  # pragma: no cover
        return None


def build_code_section(
    project_name: str,
    *,
    section_id: ID,
    section_impl_id: ID,
    section_variant_id: ID,
    name: str,
    code: str,
    language: CodeLanguage,
) -> tuple[Core, Variant, CodeSectionImpl, CodeFileBinding]:
    extension = CODE_LANGUAGE_EXTENSIONS[language]
    binding = CodeFileBinding(
        canonical_path=C.CODE_FOLDER / project_name / f"{name}.{extension}",
        access_mode=CodeFileAccessMode.read_write,
    )
    section_impl = CodeSectionImpl(
        id=section_impl_id,
        code=code,
        codeLanguage=language,
        codeFileBinding=binding,
        diagnosticsIgnoreState=CodeSectionDiagnosticsIgnoreState(),
    )
    section_variant = Variant(
        id=section_variant_id,
        impl=section_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
    )
    section_core = Core(
        id=section_id,
        name=name,
        variants=[section_variant.id],
        defaultVariant=section_variant.id,
    )
    return section_core, section_variant, section_impl, binding


def build_project_state(
    *,
    project_config_id: ID,
    project_name: str,
    codegen_targets: list[ProjectCodegenTarget],
    include_bash: bool,
    include_typescript: bool = False,
) -> tuple[ProjectStateSingleConfig, dict[str, CodeFileBinding], dict[str, ID]]:
    python_section_id = ID("section-python")
    python_impl_id = ID("section-python-impl")
    python_variant_id = ID("section-python-variant")

    python_core, python_variant, python_impl, python_binding = build_code_section(
        project_name,
        section_id=python_section_id,
        section_impl_id=python_impl_id,
        section_variant_id=python_variant_id,
        name="PythonSection",
        code="print('hi')",
        language=CodeLanguage.python,
    )

    sections = {python_section_id: python_core}
    section_impls = {python_impl_id: python_impl}
    section_variants = {python_variant_id: python_variant}
    section_variant_map = {python_section_id: python_variant_id}
    top_level_sections = {python_section_id: TopLevelSectionLayout()}
    bindings: dict[str, CodeFileBinding] = {"python": python_binding}
    section_ids: dict[str, ID] = {"python": python_section_id}

    if include_bash:
        bash_section_id = ID("section-bash")
        bash_impl_id = ID("section-bash-impl")
        bash_variant_id = ID("section-bash-variant")
        bash_core, bash_variant, bash_impl, bash_binding = build_code_section(
            project_name,
            section_id=bash_section_id,
            section_impl_id=bash_impl_id,
            section_variant_id=bash_variant_id,
            name="BashSection",
            code="echo hi",
            language=CodeLanguage.bash,
        )
        sections[bash_section_id] = bash_core
        section_impls[bash_impl_id] = bash_impl
        section_variants[bash_variant_id] = bash_variant
        section_variant_map[bash_section_id] = bash_variant_id
        top_level_sections[bash_section_id] = TopLevelSectionLayout()
        bindings["bash"] = bash_binding
        section_ids["bash"] = bash_section_id

    if include_typescript:
        typescript_section_id = ID("section-typescript")
        typescript_impl_id = ID("section-typescript-impl")
        typescript_variant_id = ID("section-typescript-variant")
        (
            typescript_core,
            typescript_variant,
            typescript_impl,
            typescript_binding,
        ) = build_code_section(
            project_name,
            section_id=typescript_section_id,
            section_impl_id=typescript_impl_id,
            section_variant_id=typescript_variant_id,
            name="TypeScriptSection",
            code="const value: string = 'hi';",
            language=CodeLanguage.typescript,
        )
        sections[typescript_section_id] = typescript_core
        section_impls[typescript_impl_id] = typescript_impl
        section_variants[typescript_variant_id] = typescript_variant
        section_variant_map[typescript_section_id] = typescript_variant_id
        top_level_sections[typescript_section_id] = TopLevelSectionLayout()
        bindings["typescript"] = typescript_binding
        section_ids["typescript"] = typescript_section_id

    project_config = ProjectConfig(
        id=project_config_id,
        name=project_name,
        codegenTargets=codegen_targets,
        sectionVariantMap=section_variant_map,
        topLevelSections=top_level_sections,
    )
    project_state = ProjectStateSingleConfig(
        projectConfig=project_config,
        sections=sections,
        sectionImpls=section_impls,
        sectionVariants=section_variants,
    )
    return project_state, bindings, section_ids


def _build_gen_code_diagnostics(
    project_config_id: ID,
    section_id: ID,
) -> tuple[SettaProjectConfigDiagnostics, list[SettaLspDiagnostic]]:
    diagnostic = SettaLspDiagnostic(
        message="Bad code",
        severity=1,
        code="reportFoo",
        source="pyright",
        range=SettaLspDiagnosticRange(
            start=SettaLspDiagnosticPosition(line=0, character=0),
            end=SettaLspDiagnosticPosition(line=0, character=5),
        ),
        uri="file:///tmp/example.py",
    )
    gen_code = SettaProjectConfigDiagnostics(
        projectConfigId=project_config_id,
        errors={
            section_id: SettaSectionTypeErrors(callable=["Bad code"]),
        },
        isGenCode=True,
    )
    return gen_code, [diagnostic]


async def _seed_gen_code_diagnostics(
    diagnostics_state: ProjectLspDiagnosticsState,
    project_config_id: ID,
    section_id: ID,
) -> None:
    gen_code, diagnostics = _build_gen_code_diagnostics(project_config_id, section_id)
    await diagnostics_state.update_gen_code(gen_code, diagnostics)
    assert diagnostics_state.gen_code.errors
    assert diagnostics_state.unmapped_gen_code


@asynccontextmanager
async def _type_check_manager(
    *,
    codegen_targets: list[ProjectCodegenTarget],
    plugin_language_servers: list[RegisteredLanguageServer] | None = None,
):
    temp_dir = TemporaryDirectory()
    root = Path(temp_dir.name)
    stack = ExitStack()
    stack.enter_context(
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
        C.SHARE_DEPLOYMENTS_FOLDER,
    ):
        path.mkdir(parents=True, exist_ok=True)
    manager = None
    try:
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        python_script_sender = WMHPythonScriptSender(
            websocket_manager, listener_registry
        )
        dbe = DBE(C.SETTA_FILES_FOLDER)
        settings_file = SettingsFile(dbe, frontend_sender)
        specific_file_watcher = SpecificFileWatcher()
        artifacts = Artifacts(frontend_sender, specific_file_watcher, dbe)
        code_files = CodeFiles(frontend_sender, specific_file_watcher, dbe)
        json_source = JSONSource(
            frontend_sender, settings_file, specific_file_watcher, dbe
        )
        lsps = LSPServers(
            {},
            plugin_language_servers=plugin_language_servers,
        )
        lsp_writers = LSPWriters(lsps)

        project_config = ProjectConfig(
            id=ID("project-1"),
            name="TypeCheckProject",
            codegenTargets=codegen_targets,
        )
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config}
        )

        manager = TypeCheckProjectManager(
            lsp_writers,
            frontend_sender,
            python_script_sender,
            settings_file,
            specific_file_watcher,
            dbe,
            artifacts,
            json_source,
            code_files,
            backend,
        )
        await manager._process_queue_task_started.wait()
        yield manager
    finally:
        if manager is not None:
            manager.shutdown()
        stack.close()
        temp_dir.cleanup()


@pytest.mark.asyncio
async def test_type_check_runs_python_sections_without_codegen() -> None:
    async with _type_check_manager(codegen_targets=[]) as manager:
        project_config_id = next(iter(manager.project_state_backend.projectConfigs))
        project_state, bindings, section_ids = build_project_state(
            project_config_id=project_config_id,
            project_name="TypeCheckProject",
            codegen_targets=[],
            include_bash=True,
        )
        diagnostics_state = ProjectLspDiagnosticsState(
            project_config_id,
            manager.websocket_msg_handler,
        )
        python_code = ProjectPythonCode(
            manager.dbe,
            manager.code_files,
            manager.lsp_writers,
            manager.websocket_msg_handler,
            diagnostics_state,
            project_state,
            section_ids["python"],
        )
        bash_code = ProjectBashCode(
            manager.dbe,
            manager.code_files,
            project_state,
            section_ids["bash"],
        )
        manager.code_dict[project_config_id] = {
            section_ids["python"]: python_code,
            section_ids["bash"]: bash_code,
        }

        await manager.type_check(project_config_id)

        python_uri = manager.lsp_writers.full.get_uri(bindings["python"].canonical_path)
        bash_uri = manager.lsp_writers.full.get_uri(bindings["bash"].canonical_path)
        assert python_uri in manager.lsp_writers.full.latest_version_numbers
        assert bash_uri not in manager.lsp_writers.full.latest_version_numbers


@pytest.mark.asyncio
async def test_type_check_runs_typescript_sections_with_plugin_lsp() -> None:
    async with _type_check_manager(
        codegen_targets=[],
        plugin_language_servers=[
            RegisteredLanguageServer(
                plugin_id="plugin.typescript",
                name="plugin.typescript:typescript",
                language=CodeLanguage.typescript,
                command="typescript-language-server",
                args=("--stdio",),
                settings_key="typescriptLanguageServer",
            )
        ],
    ) as manager:
        project_config_id = next(iter(manager.project_state_backend.projectConfigs))
        project_state, bindings, section_ids = build_project_state(
            project_config_id=project_config_id,
            project_name="TypeCheckProject",
            codegen_targets=[],
            include_bash=False,
            include_typescript=True,
        )
        diagnostics_state = ProjectLspDiagnosticsState(
            project_config_id,
            manager.websocket_msg_handler,
        )
        python_code = ProjectPythonCode(
            manager.dbe,
            manager.code_files,
            manager.lsp_writers,
            manager.websocket_msg_handler,
            diagnostics_state,
            project_state,
            section_ids["python"],
        )
        typescript_code = ProjectLSPCode(
            manager.dbe,
            manager.code_files,
            manager.lsp_writers,
            manager.websocket_msg_handler,
            diagnostics_state,
            project_state,
            section_ids["typescript"],
            code_language=CodeLanguage.typescript,
        )
        manager.code_dict[project_config_id] = {
            section_ids["python"]: python_code,
            section_ids["typescript"]: typescript_code,
        }

        await manager.type_check(project_config_id)

        python_uri = manager.lsp_writers.full.get_uri(bindings["python"].canonical_path)
        typescript_writer = manager.lsp_writers.get_for_language(
            CodeLanguage.typescript
        )
        assert typescript_writer is not None
        typescript_uri = typescript_writer.get_uri(
            bindings["typescript"].canonical_path
        )
        assert python_uri in manager.lsp_writers.full.latest_version_numbers
        assert typescript_uri in typescript_writer.latest_version_numbers


@pytest.mark.asyncio
async def test_update_creates_typescript_lsp_code_entries_when_registered() -> None:
    async with _type_check_manager(
        codegen_targets=[],
        plugin_language_servers=[
            RegisteredLanguageServer(
                plugin_id="plugin.typescript",
                name="plugin.typescript:typescript",
                language=CodeLanguage.typescript,
                command="typescript-language-server",
                args=("--stdio",),
                settings_key="typescriptLanguageServer",
            )
        ],
    ) as manager:
        project_config_id = next(iter(manager.project_state_backend.projectConfigs))
        project_state, bindings, section_ids = build_project_state(
            project_config_id=project_config_id,
            project_name="TypeCheckProject",
            codegen_targets=[],
            include_bash=False,
            include_typescript=True,
        )

        await manager.update(project_state)

        code_entry = manager.code_dict[project_config_id][section_ids["typescript"]]
        assert isinstance(code_entry, ProjectLSPCode)
        typescript_writer = manager.lsp_writers.get_for_language(
            CodeLanguage.typescript
        )
        assert typescript_writer is not None
        typescript_uri = typescript_writer.get_uri(
            bindings["typescript"].canonical_path
        )
        assert typescript_uri in typescript_writer.latest_version_numbers


@pytest.mark.asyncio
async def test_type_check_runs_gen_code_and_python_sections() -> None:
    codegen_targets = ProjectConfig().codegenTargets
    async with _type_check_manager(codegen_targets=codegen_targets) as manager:
        project_config_id = next(iter(manager.project_state_backend.projectConfigs))
        project_state, bindings, section_ids = build_project_state(
            project_config_id=project_config_id,
            project_name="TypeCheckProject",
            codegen_targets=codegen_targets,
            include_bash=False,
        )
        diagnostics_state = ProjectLspDiagnosticsState(
            project_config_id,
            manager.websocket_msg_handler,
        )
        python_code = ProjectPythonCode(
            manager.dbe,
            manager.code_files,
            manager.lsp_writers,
            manager.websocket_msg_handler,
            diagnostics_state,
            project_state,
            section_ids["python"],
        )
        dep_graph = DependencyGraph(project_state)
        code_generator = build_python_code_generator(project_state, dep_graph)
        code_generator.generate_code()
        gen_binding = CodeFileBinding(
            canonical_path=C.CODE_FOLDER / "TypeCheckProject" / "setta_gen.py",
            access_mode=CodeFileAccessMode.write_only,
        )
        gen_code = ProjectGenPythonCode(
            manager.dbe,
            manager.code_files,
            gen_binding,
            manager.lsp_writers,
            manager.websocket_msg_handler,
            project_config_id,
            dep_graph,
            code_generator,
            {},
            diagnostics_state,
        )

        manager.gen_code[project_config_id] = gen_code
        manager.code_dict[project_config_id] = {section_ids["python"]: python_code}

        await manager.type_check(project_config_id)

        gen_uri = manager.lsp_writers.full.get_uri(gen_binding.canonical_path)
        python_uri = manager.lsp_writers.full.get_uri(bindings["python"].canonical_path)
        assert gen_uri in manager.lsp_writers.full.latest_version_numbers
        assert python_uri in manager.lsp_writers.full.latest_version_numbers


@pytest.mark.asyncio
async def test_gen_code_prefix_change_keeps_diagnostics_until_lsp_update() -> None:
    codegen_targets = ProjectConfig().codegenTargets
    async with _type_check_manager(codegen_targets=codegen_targets) as manager:
        project_config_id = next(iter(manager.project_state_backend.projectConfigs))
        project_state, _, section_ids = build_project_state(
            project_config_id=project_config_id,
            project_name="TypeCheckProject",
            codegen_targets=codegen_targets,
            include_bash=False,
        )

        await manager.update(project_state)

        diagnostics_state = manager._get_lsp_diagnostics_state(project_config_id)
        await _seed_gen_code_diagnostics(
            diagnostics_state,
            project_config_id,
            section_ids["python"],
        )

        python_target = get_python_codegen_target_with_type_guard(
            project_state.projectConfig
        )
        python_target.genCodePrefix = "import math\n"

        await manager.update(project_state)

        assert diagnostics_state.gen_code.errors
        assert diagnostics_state.unmapped_gen_code


@pytest.mark.asyncio
async def test_gen_code_prefix_edits_keep_diagnostics_between_updates() -> None:
    codegen_targets = ProjectConfig().codegenTargets
    async with _type_check_manager(codegen_targets=codegen_targets) as manager:
        project_config_id = next(iter(manager.project_state_backend.projectConfigs))
        project_state, _, section_ids = build_project_state(
            project_config_id=project_config_id,
            project_name="TypeCheckProject",
            codegen_targets=codegen_targets,
            include_bash=False,
        )

        await manager.update(project_state)

        diagnostics_state = manager._get_lsp_diagnostics_state(project_config_id)
        await _seed_gen_code_diagnostics(
            diagnostics_state,
            project_config_id,
            section_ids["python"],
        )

        python_target = get_python_codegen_target_with_type_guard(
            project_state.projectConfig
        )
        for prefix in ("import m\n", "import ma\n", "import math\n"):
            python_target.genCodePrefix = prefix
            await manager.update(project_state)
            assert diagnostics_state.gen_code.errors
            assert diagnostics_state.unmapped_gen_code


@pytest.mark.asyncio
async def test_gen_code_suffix_change_keeps_diagnostics_until_lsp_update() -> None:
    codegen_targets = ProjectConfig().codegenTargets
    async with _type_check_manager(codegen_targets=codegen_targets) as manager:
        project_config_id = next(iter(manager.project_state_backend.projectConfigs))
        project_state, _, section_ids = build_project_state(
            project_config_id=project_config_id,
            project_name="TypeCheckProject",
            codegen_targets=codegen_targets,
            include_bash=False,
        )

        await manager.update(project_state)

        diagnostics_state = manager._get_lsp_diagnostics_state(project_config_id)
        await _seed_gen_code_diagnostics(
            diagnostics_state,
            project_config_id,
            section_ids["python"],
        )

        python_target = get_python_codegen_target_with_type_guard(
            project_state.projectConfig
        )
        python_target.genCodeSuffix = f"{python_target.genCodeSuffix}\n# end"

        await manager.update(project_state)

        assert diagnostics_state.gen_code.errors
        assert diagnostics_state.unmapped_gen_code
