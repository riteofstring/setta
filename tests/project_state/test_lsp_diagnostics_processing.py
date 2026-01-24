import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from lsprotocol import types as LSPTypes

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.code_generator import (
    GEN_CODE_BODY_INDENT,
    GEN_CODE_MULTILINE_CONTINUATION_INDENT,
    PythonCodeGenerator,
)
from setta.code_gen.python.position_line_col import position_to_line_col
from setta.code_gen.value_mode import PythonValueMode
from setta.project_state.lsp_response_handlers.diagnostics import (
    process_gen_code_diagnostics,
    process_gen_code_diagnostics_with_undefined_symbols,
)
from setta.project_state.project_code import ProjectGenPythonCode
from setta.project_state.code_files import CodeFiles
from setta.database.db_objs import DBE
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import LSPServers, LSPWriters
from setta.types.code_obj_impls import CodeCallableCodeObjImpl, CodeParamCodeObjImpl
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.dependency_key import create_dep_key
from setta.types.id import ID
from setta.types.project_config import (
    ProjectConfig,
    TopLevelSectionLayout,
    get_python_codegen_target_with_type_guard,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    CallableSectionImpl,
    CodeFileAccessMode,
    CodeFileBinding,
    TypeErrorIgnoreState,
)
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def build_project_state(param_value: str):
    section_id = ID("section-1")
    section_impl_id = ID("section-impl-1")
    section_variant_id = ID("section-variant-1")

    callable_id = ID("callable-1")
    callable_impl_id = ID("callable-impl-1")
    callable_variant_id = ID("callable-variant-1")

    param_id = ID("param-1")
    param_impl_id = ID("param-impl-1")
    param_variant_id = ID("param-variant-1")

    callable_impl = CodeCallableCodeObjImpl(
        id=callable_impl_id,
        children=[param_id],
    )
    callable_variant = Variant(
        id=callable_variant_id,
        impl=callable_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(callable_impl),
    )
    callable_core = Core(
        id=callable_id,
        name="MissingFunc",
        variants=[callable_variant.id],
        defaultVariant=callable_variant.id,
    )

    param_impl = CodeParamCodeObjImpl(
        id=param_impl_id,
        value=param_value,
    )
    param_variant = Variant(
        id=param_variant_id,
        impl=param_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(param_impl),
    )
    param_core = Core(
        id=param_id,
        name="param",
        variants=[param_variant.id],
        defaultVariant=param_variant.id,
    )

    section_impl = CallableSectionImpl(
        id=section_impl_id,
        callable=callable_id,
        codeObjVariantMap={
            callable_id: callable_variant.id,
            param_id: param_variant.id,
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
        name="DiagnosticsProject",
        sectionVariantMap={section_id: section_variant.id},
        topLevelSections={section_id: TopLevelSectionLayout()},
    )
    project_state = ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={section_id: section_core},
        sectionImpls={section_impl.id: section_impl},
        sectionVariants={section_variant.id: section_variant},
        codeObjs={callable_id: callable_core, param_id: param_core},
        codeObjImpls={callable_impl.id: callable_impl, param_impl.id: param_impl},
        codeObjVariants={
            callable_variant.id: callable_variant,
            param_variant.id: param_variant,
        },
    )
    return project_state, section_id, param_id


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


def build_diagnostic(
    code: str,
    start: int,
    end: int,
    message: str,
    code_value: str,
):
    start_line, start_col = position_to_line_col(code, start)
    end_line, end_col = position_to_line_col(code, end)
    return LSPTypes.Diagnostic(
        range=LSPTypes.Range(
            start=LSPTypes.Position(line=start_line, character=start_col),
            end=LSPTypes.Position(line=end_line, character=end_col),
        ),
        message=message,
        code=code_value,
    )


class LspDiagnosticsProcessingTests(unittest.TestCase):
    def test_param_ignore_filters_errors(self):
        project_state, section_id, param_id = build_project_state("bad_value")
        dep_graph, code_generator = build_code_generator(project_state)

        dep_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
        var_name = code_generator.var_name_mapping[dep_key]
        code = code_generator.code
        start = code.index(var_name)
        end = start + len(var_name)
        diagnostic = build_diagnostic(
            code,
            start,
            end,
            "Argument type mismatch",
            "reportArgumentType",
        )

        errors = process_gen_code_diagnostics(
            [diagnostic],
            code_generator,
            dep_graph,
        )
        self.assertIn(section_id, errors)
        self.assertIn(param_id, errors[section_id].params)
        self.assertEqual(errors[section_id].params[param_id], ["Argument type mismatch"])
        self.assertEqual(errors[section_id].callable, [])

        ignored = {
            section_id: TypeErrorIgnoreState(callable=False, params={param_id: True})
        }
        filtered = process_gen_code_diagnostics(
            [diagnostic],
            code_generator,
            dep_graph,
            ignored,
        )
        self.assertEqual(filtered, {})

    def test_undefined_symbol_uses_range_index(self):
        project_state, section_id, param_id = build_project_state("unknown_symbol")
        dep_graph, code_generator = build_code_generator(project_state)

        dep_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
        line = code_generator.lines[dep_key]
        value_start = line.pos + line.prefix_len
        value_end = value_start + line.value_len
        self.assertGreater(value_end - value_start, 2)

        start = value_start + 1
        end = min(value_start + 4, value_end)
        code = code_generator.code
        diagnostic = build_diagnostic(
            code,
            start,
            end,
            "unknown_symbol is not defined",
            "reportUndefinedVariable",
        )

        errors = process_gen_code_diagnostics(
            [diagnostic],
            code_generator,
            dep_graph,
        )
        self.assertIn(section_id, errors)
        self.assertIn(param_id, errors[section_id].params)
        self.assertEqual(
            errors[section_id].params[param_id],
            ["unknown_symbol is not defined"],
        )

    def test_undefined_callable_symbol_tracked(self):
        project_state, section_id, _ = build_project_state("value")
        dep_graph, code_generator = build_code_generator(project_state)

        dep_key = create_dep_key(sectionId=section_id)
        line = code_generator.lines[dep_key]
        value_start = line.pos + line.prefix_len
        value_end = value_start + line.value_len
        start = value_start
        end = min(value_start + 4, value_end)
        code = code_generator.code
        diagnostic = build_diagnostic(
            code,
            start,
            end,
            "MissingFunc is not defined",
            "reportUndefinedFunction",
        )

        errors, undefined_sections = process_gen_code_diagnostics_with_undefined_symbols(
            [diagnostic],
            code_generator,
            dep_graph,
        )
        self.assertIn(section_id, errors)
        self.assertEqual(errors[section_id].callable, ["MissingFunc is not defined"])
        self.assertIn(section_id, undefined_sections)

    def test_undefined_symbol_on_param_does_not_mark_callable(self):
        project_state, section_id, param_id = build_project_state("unknown_symbol")
        dep_graph, code_generator = build_code_generator(project_state)

        dep_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
        line = code_generator.lines[dep_key]
        value_start = line.pos + line.prefix_len
        value_end = value_start + line.value_len
        start = value_start
        end = min(value_start + 4, value_end)
        code = code_generator.code
        diagnostic = build_diagnostic(
            code,
            start,
            end,
            "unknown_symbol is not defined",
            "reportUndefinedVariable",
        )

        errors, undefined_sections = process_gen_code_diagnostics_with_undefined_symbols(
            [diagnostic],
            code_generator,
            dep_graph,
        )
        self.assertIn(section_id, errors)
        self.assertIn(param_id, errors[section_id].params)
        self.assertNotIn(section_id, undefined_sections)

    def test_multiline_code_param_wraps_expression(self):
        param_value = "[\n1,\n2,\n]"
        project_state, section_id, param_id = build_project_state(param_value)
        _, code_generator = build_code_generator(project_state)

        dep_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
        line = code_generator.lines[dep_key]
        value = line.var_str[line.prefix_len :]
        lines = value.splitlines()

        self.assertEqual(lines[0], "(")
        self.assertEqual(lines[1], f"{GEN_CODE_MULTILINE_CONTINUATION_INDENT}[")
        self.assertEqual(lines[2], f"{GEN_CODE_MULTILINE_CONTINUATION_INDENT}1,")
        self.assertEqual(lines[3], f"{GEN_CODE_MULTILINE_CONTINUATION_INDENT}2,")
        self.assertEqual(lines[4], f"{GEN_CODE_MULTILINE_CONTINUATION_INDENT}]")
        self.assertEqual(lines[5], f"{GEN_CODE_BODY_INDENT})")


class LspDiagnosticsIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_removed_section_does_not_trigger_auto_refetch(self):
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            dbe = DBE(root)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            specific_file_watcher = SpecificFileWatcher()
            code_files = CodeFiles(frontend_sender, specific_file_watcher, dbe)
            lsps = LSPServers({})
            lsp_writers = LSPWriters(lsps)

            project_config = ProjectConfig(
                id=ID("project-1"),
                name="DiagnosticsProject",
            )
            project_state = ProjectStateSingleConfig(projectConfig=project_config)
            dep_graph, code_generator = build_code_generator(project_state)

            binding = CodeFileBinding(
                canonical_path=root / "code" / "DiagnosticsProject" / "setta_gen.py",
                access_mode=CodeFileAccessMode.write_only,
            )

            callback_calls: list[set[ID]] = []

            async def on_callable_symbols_resolved(
                _project_config_id: ID, section_ids: set[ID]
            ) -> None:
                callback_calls.append(set(section_ids))

            gen_code = ProjectGenPythonCode(
                dbe,
                code_files,
                binding,
                lsp_writers,
                frontend_sender,
                project_config.id,
                dep_graph,
                code_generator,
                {},
                initial_undefined_callable_sections={ID("removed-section")},
                on_callable_symbols_resolved=on_callable_symbols_resolved,
            )

            uri = lsp_writers.full.get_uri(binding.canonical_path)
            gen_code.uri = uri
            lsp_writers.full.latest_version_numbers[uri] = 0

            notification = LSPTypes.TextDocumentPublishDiagnosticsNotification(
                params=LSPTypes.PublishDiagnosticsParams(
                    uri=uri,
                    diagnostics=[],
                    version=0,
                )
            )

            await gen_code.diagnostics_callback(notification)

            self.assertEqual(callback_calls, [])

    async def test_resolved_callable_triggers_auto_refetch(self):
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            dbe = DBE(root)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            specific_file_watcher = SpecificFileWatcher()
            code_files = CodeFiles(frontend_sender, specific_file_watcher, dbe)
            lsps = LSPServers({})
            lsp_writers = LSPWriters(lsps)

            project_state, section_id, _ = build_project_state("value")
            dep_graph, code_generator = build_code_generator(project_state)

            binding = CodeFileBinding(
                canonical_path=root / "code" / "DiagnosticsProject" / "setta_gen.py",
                access_mode=CodeFileAccessMode.write_only,
            )

            callback_calls: list[set[ID]] = []

            async def on_callable_symbols_resolved(
                _project_config_id: ID, section_ids: set[ID]
            ) -> None:
                callback_calls.append(set(section_ids))

            gen_code = ProjectGenPythonCode(
                dbe,
                code_files,
                binding,
                lsp_writers,
                frontend_sender,
                project_state.projectConfig.id,
                dep_graph,
                code_generator,
                {},
                initial_undefined_callable_sections={section_id},
                on_callable_symbols_resolved=on_callable_symbols_resolved,
            )

            uri = lsp_writers.full.get_uri(binding.canonical_path)
            gen_code.uri = uri
            lsp_writers.full.latest_version_numbers[uri] = 0

            notification = LSPTypes.TextDocumentPublishDiagnosticsNotification(
                params=LSPTypes.PublishDiagnosticsParams(
                    uri=uri,
                    diagnostics=[],
                    version=0,
                )
            )

            await gen_code.diagnostics_callback(notification)

            self.assertEqual(callback_calls, [{section_id}])


if __name__ == "__main__":
    unittest.main()
