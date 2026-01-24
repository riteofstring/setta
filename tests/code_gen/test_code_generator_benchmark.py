from time import perf_counter
from unittest import TestCase

from lsprotocol import types as LSPTypes

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.code_generator import PythonCodeGenerator
from setta.code_gen.python.position_line_col import position_to_line_col
from setta.project_state.lsp_response_handlers.diagnostics import (
    process_gen_code_diagnostics,
)
from setta.types.dependency_key import create_dep_key
from setta.types.id import ID
from setta.types.project_config import get_python_codegen_target_with_type_guard
from tests.code_gen.test_code_generator_formatting import (
    build_callable_project_state,
)


class CodeGeneratorBenchmarkTests(TestCase):
    def test_code_generator_benchmark(self) -> None:
        param_count = 500
        generate_iterations = 5
        change_iterations = 50
        diagnostics_iterations = 30
        diagnostics_count = 100

        project_state = build_callable_project_state(param_count)
        dep_graph = DependencyGraph(project_state)
        python_target = get_python_codegen_target_with_type_guard(
            project_state.projectConfig
        )
        generator = PythonCodeGenerator(
            dep_graph,
            python_target.genCodePrefix,
            python_target.genCodeSuffix,
        )
        generator.generate_code()

        start = perf_counter()
        for _ in range(generate_iterations):
            generator.generate_code()
        generate_elapsed = perf_counter() - start

        dep_key = create_dep_key(sectionId=ID("section-1"), codeObjId=ID("param-0"))
        start = perf_counter()
        for idx in range(change_iterations):
            generator.change_value(dep_key, str(idx))
        change_elapsed = perf_counter() - start

        diagnostics = self._build_diagnostics(
            generator.code,
            generator,
            diagnostics_count,
        )
        start = perf_counter()
        for _ in range(diagnostics_iterations):
            process_gen_code_diagnostics(diagnostics, generator, dep_graph)
        diagnostics_elapsed = perf_counter() - start

        generate_ms = (generate_elapsed / generate_iterations) * 1000
        change_ms = (change_elapsed / change_iterations) * 1000
        diagnostics_ms = (diagnostics_elapsed / diagnostics_iterations) * 1000

        self.assertGreaterEqual(generate_elapsed, 0)
        self.assertGreaterEqual(change_elapsed, 0)
        self.assertGreaterEqual(diagnostics_elapsed, 0)

    def _build_diagnostics(
        self,
        code: str,
        generator: PythonCodeGenerator,
        limit: int,
    ) -> list[LSPTypes.Diagnostic]:
        diagnostics: list[LSPTypes.Diagnostic] = []
        for line in generator.lines.values():
            if line.pos is None:
                continue
            value_start = line.pos + line.prefix_len
            value_end = value_start + line.value_len
            if value_end <= value_start:
                continue
            start = value_start
            end = min(value_start + 1, value_end)
            start_line, start_col = position_to_line_col(code, start)
            end_line, end_col = position_to_line_col(code, end)
            diagnostics.append(
                LSPTypes.Diagnostic(
                    range=LSPTypes.Range(
                        start=LSPTypes.Position(line=start_line, character=start_col),
                        end=LSPTypes.Position(line=end_line, character=end_col),
                    ),
                    message="benchmark_symbol is not defined",
                    code="reportUndefinedVariable",
                )
            )
            if len(diagnostics) >= limit:
                break

        if not diagnostics:
            diagnostics.append(
                LSPTypes.Diagnostic(
                    range=LSPTypes.Range(
                        start=LSPTypes.Position(line=0, character=0),
                        end=LSPTypes.Position(line=0, character=1),
                    ),
                    message="benchmark_symbol is not defined",
                    code="reportUndefinedVariable",
                )
            )

        return diagnostics
