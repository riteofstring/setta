from typing import TYPE_CHECKING

from setta.code_gen.python.code_generator import PythonCodeGenerator
from setta.code_gen.value_mode import PythonValueMode

if TYPE_CHECKING:
    from setta.code_gen.dependency_graph import DependencyGraph
    from setta.types.project_state import ProjectStateSingleConfig


def build_python_code_generator(
    project_state: "ProjectStateSingleConfig",
    dep_graph: "DependencyGraph",
) -> PythonCodeGenerator:
    project_config = project_state.projectConfig
    return PythonCodeGenerator(
        dep_graph,
        project_config.genCodePrefix,
        project_config.genCodeSuffix,
        value_mode=PythonValueMode.PACKAGED_RUNTIME,
    )
