from time import perf_counter
from unittest import TestCase

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.code_generator import PythonCodeGenerator
from setta.types.dependency_key import create_dep_key
from setta.types.id import ID
from tests.setta.code_gen.test_code_generator_formatting import (
    build_callable_project_state,
)


class CodeGeneratorBenchmarkTests(TestCase):
    def test_code_generator_benchmark(self) -> None:
        param_count = 200
        generate_iterations = 5
        change_iterations = 50

        project_state = build_callable_project_state(param_count)
        dep_graph = DependencyGraph(project_state)
        generator = PythonCodeGenerator(
            dep_graph,
            project_state.projectConfig.genCodePrefix,
            project_state.projectConfig.genCodeSuffix,
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

        generate_ms = (generate_elapsed / generate_iterations) * 1000
        change_ms = (change_elapsed / change_iterations) * 1000

        print(
            "codegen.generate_code:",
            f"{generate_ms:.2f} ms/iter",
            f"(iters={generate_iterations}, params={param_count})",
        )
        print(
            "codegen.change_value:",
            f"{change_ms:.2f} ms/iter",
            f"(iters={change_iterations}, params={param_count})",
        )

        self.assertGreaterEqual(generate_elapsed, 0)
        self.assertGreaterEqual(change_elapsed, 0)
