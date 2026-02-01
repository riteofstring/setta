from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.code_generator import PythonCodeGenerator
from setta.code_gen.value_mode import PythonValueMode
from setta.database.db_objs import DBE
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import NoopLSPWriters
from setta.project_state.code_files import CodeFiles
from setta.project_state.lsp_diagnostics_state import ProjectLspDiagnosticsState
from setta.project_state.project_code import ProjectGenPythonCode
from setta.project_state.utils import convert_path_to_module_path
from setta.project_state.watch_code import build_callable_identity
from setta.types.code_obj_impls import CodeCallableCodeObjImpl, CodeParamCodeObjImpl
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.generated.settings_state import SettingsState
from setta.types.id import ID
from setta.types.project_config import (
    ProjectConfig,
    TopLevelSectionLayout,
    WatchCodeCallableKind,
    WatchCodeRegistryEntry,
    get_python_codegen_target_with_type_guard,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    CallableSectionImpl,
    CodeFileAccessMode,
    CodeFileBinding,
)
from setta.utils.utils import normalize_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def build_code_generator(project_state: ProjectStateSingleConfig):
    dep_graph = DependencyGraph(project_state)
    python_target = get_python_codegen_target_with_type_guard(
        project_state.projectConfig
    )
    code_generator = PythonCodeGenerator(
        dep_graph,
        python_target.genCodePrefix,
        python_target.genCodeSuffix,
        value_mode=PythonValueMode.PACKAGED_RUNTIME,
    )
    code_generator.generate_code()
    return dep_graph, code_generator


def build_gen_code(
    root: Path,
    project_state: ProjectStateSingleConfig,
    dep_graph: DependencyGraph,
    code_generator: PythonCodeGenerator,
):
    dbe = DBE(root)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager)
    specific_file_watcher = SpecificFileWatcher()
    code_files = CodeFiles(frontend_sender, specific_file_watcher, dbe)
    lsp_writers = NoopLSPWriters()
    binding = CodeFileBinding(
        canonical_path=root / "code" / project_state.projectConfig.name / "setta_gen.py",
        access_mode=CodeFileAccessMode.write_only,
    )
    return ProjectGenPythonCode(
        dbe,
        code_files,
        binding,
        lsp_writers,
        frontend_sender,
        project_state.projectConfig.id,
        dep_graph,
        code_generator,
        {},
        ProjectLspDiagnosticsState(
            project_state.projectConfig.id,
            frontend_sender,
        ),
    )


def write_watch_code_file(
    root: Path,
    filename: str,
    callable_name: str,
    code: str,
):
    source_path = root / filename
    source_path.write_text(code)
    module_path = convert_path_to_module_path(normalize_path(source_path))
    canonical_name = (
        f"{module_path}.{callable_name}" if module_path else callable_name
    )
    identity = build_callable_identity(
        canonical_name, WatchCodeCallableKind.function
    )
    entry = WatchCodeRegistryEntry(
        callableName=callable_name,
        kind=WatchCodeCallableKind.function,
        signatureHash="sig",
        bodyHash="body",
        sourcePath=str(normalize_path(source_path)),
        sectionIds=[],
        sectionsCount=0,
    )
    return identity, entry


@pytest.mark.asyncio
async def test_set_callable_populates_params_from_watch_code_without_lsp():
    with TemporaryDirectory(dir=Path.cwd()) as tmpdir:
        root = Path(tmpdir)
        identity, entry = write_watch_code_file(
            root,
            "watch_code_fixture.py",
            "alpha",
            "def alpha(a, b=1, *, c=2, **kwargs):\n    return a\n",
        )

        section_id = ID("section-1")
        section_impl_id = ID("section-impl-1")
        section_variant_id = ID("section-variant-1")

        section_impl = CallableSectionImpl(id=section_impl_id)
        section_variant = Variant(
            id=section_variant_id,
            impl=section_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
        )
        section_core = Core(
            id=section_id,
            name="Section",
            variants=[section_variant.id],
            defaultVariant=section_variant.id,
        )

        project_config = ProjectConfig(
            id=ID("project-1"),
            name="WatchCodeParams",
            sectionVariantMap={section_id: section_variant.id},
            topLevelSections={section_id: TopLevelSectionLayout()},
            watchCodeRegistry={identity: entry},
        )
        project_state = ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={section_id: section_core},
            sectionImpls={section_impl.id: section_impl},
            sectionVariants={section_variant.id: section_variant},
        )

        dep_graph, code_generator = build_code_generator(project_state)
        gen_code = build_gen_code(root, project_state, dep_graph, code_generator)

        await gen_code.set_callable(
            SettingsState(),
            project_state,
            section_id,
            "alpha",
            False,
        )

        project_state.validate_shown_param_ids()
        shown = project_state.shownParamIds[section_variant.id].unpinned
        names = {project_state.codeObjs[param_id].name for param_id in shown.topLevelParamIds}

        assert names == {"a", "b", "c", "kwargs"}


@pytest.mark.asyncio
async def test_set_callable_refetch_uses_watch_code_params_without_lsp():
    with TemporaryDirectory(dir=Path.cwd()) as tmpdir:
        root = Path(tmpdir)
        identity, entry = write_watch_code_file(
            root,
            "watch_code_fixture.py",
            "alpha",
            "def alpha(x, y=1):\n    return x + y\n",
        )

        section_id = ID("section-1")
        section_impl_id = ID("section-impl-1")
        section_variant_id = ID("section-variant-1")
        callable_id = ID("callable-1")
        callable_impl_id = ID("callable-impl-1")
        callable_variant_id = ID("callable-variant-1")
        legacy_param_id = ID("param-legacy")
        legacy_param_impl_id = ID("param-impl-legacy")
        legacy_param_variant_id = ID("param-variant-legacy")

        callable_impl = CodeCallableCodeObjImpl(
            id=callable_impl_id,
            children=[legacy_param_id],
        )
        callable_variant = Variant(
            id=callable_variant_id,
            impl=callable_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(callable_impl),
        )
        callable_core = Core(
            id=callable_id,
            name="alpha",
            variants=[callable_variant.id],
            defaultVariant=callable_variant.id,
        )

        legacy_param_impl = CodeParamCodeObjImpl(
            id=legacy_param_impl_id,
            value="",
        )
        legacy_param_variant = Variant(
            id=legacy_param_variant_id,
            impl=legacy_param_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(legacy_param_impl),
        )
        legacy_param_core = Core(
            id=legacy_param_id,
            name="legacy",
            variants=[legacy_param_variant.id],
            defaultVariant=legacy_param_variant.id,
        )

        section_impl = CallableSectionImpl(
            id=section_impl_id,
            callable=callable_id,
            codeObjVariantMap={
                callable_id: callable_variant.id,
                legacy_param_id: legacy_param_variant.id,
            },
        )
        section_variant = Variant(
            id=section_variant_id,
            impl=section_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
        )
        section_core = Core(
            id=section_id,
            name="Section",
            variants=[section_variant.id],
            defaultVariant=section_variant.id,
        )

        project_config = ProjectConfig(
            id=ID("project-1"),
            name="WatchCodeParams",
            sectionVariantMap={section_id: section_variant.id},
            topLevelSections={section_id: TopLevelSectionLayout()},
            watchCodeRegistry={identity: entry},
        )
        project_state = ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={section_id: section_core},
            sectionImpls={section_impl.id: section_impl},
            sectionVariants={section_variant.id: section_variant},
            codeObjs={
                callable_id: callable_core,
                legacy_param_id: legacy_param_core,
            },
            codeObjImpls={
                callable_impl.id: callable_impl,
                legacy_param_impl.id: legacy_param_impl,
            },
            codeObjVariants={
                callable_variant.id: callable_variant,
                legacy_param_variant.id: legacy_param_variant,
            },
        )

        dep_graph, code_generator = build_code_generator(project_state)
        gen_code = build_gen_code(root, project_state, dep_graph, code_generator)

        await gen_code.set_callable(
            SettingsState(),
            project_state,
            section_id,
            "alpha",
            True,
        )

        project_state.validate_shown_param_ids()
        shown = project_state.shownParamIds[section_variant.id].unpinned
        names = {project_state.codeObjs[param_id].name for param_id in shown.topLevelParamIds}

        assert names == {"x", "y"}
