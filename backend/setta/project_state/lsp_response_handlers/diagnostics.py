import re
from dataclasses import dataclass
from typing import Callable

from lsprotocol import types as LSPTypes
from pydantic import BaseModel

from setta.code_gen.dependency_graph import DependencyGraph, GraphKeyType, ParamNode
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.code_gen.python.position_line_col import line_col_to_position_batch
from setta.types.project_state import ParameterPassingStyle


class SettaGenCodeDiagnostic(BaseModel):
    sectionId: str
    paramInfoId: str | None
    message: str


@dataclass
class LSPPosition:
    start: int
    end: int


def process_gen_code_diagnostics(
    diagnostics: list[LSPTypes.Diagnostic],
    code_generator: PythonCodeGenerator,
    dep_graph: DependencyGraph,
):
    positions = convert_diagnostic_line_cols_to_positions(
        code_generator.code, diagnostics
    )
    output: list[SettaGenCodeDiagnostic] = []
    for i, d in enumerate(diagnostics):
        output.extend(
            process_gen_code_diagnostic(d, positions[i], code_generator, dep_graph)
        )
    return output


def process_gen_code_diagnostic(
    d: LSPTypes.Diagnostic,
    position: LSPPosition,
    code_generator: PythonCodeGenerator,
    dep_graph: DependencyGraph,
):
    message = d.message
    if d.code == "reportArgumentType":
        return process_report_argument_type(
            position.start, position.end, message, code_generator, dep_graph
        )
    elif d.code == "reportCallIssue":
        return process_report_call_issue(
            position.start, message, code_generator, dep_graph
        )
    return []


def process_report_argument_type(
    start: int,
    end: int,
    message: str,
    code_generator: PythonCodeGenerator,
    dep_graph: DependencyGraph,
):
    problem_var = code_generator.code[start:end]
    graph_key = code_generator.reverse_var_name_mapping.get(problem_var)
    if graph_key:
        return [get_message_with_ids(message, graph_key, dep_graph)]
    return []


def process_report_call_issue(
    start: int,
    message: str,
    code_generator: PythonCodeGenerator,
    dep_graph: DependencyGraph,
):
    if "positional argument" in message:
        return process_positional_argument_issue(
            start, message, code_generator, dep_graph
        )
    elif "parameter" in message:
        return process_named_argument_issue(start, message, code_generator, dep_graph)
    return []


def _process_argument_issue(
    start: int,
    message: str,
    code_generator: PythonCodeGenerator,
    dep_graph: DependencyGraph,
    param_filter: Callable[[ParamNode], bool],
):
    """
    Helper function to process argument issues.

    Args:
        start: Start position information
        message: Error message
        code_generator: PythonCodeGenerator instance
        dep_graph: DependencyGraph instance
        param_filter: Function that takes a param and returns True if it should be included
    """
    graph_key = code_generator.value_pos_start_to_graph_key.get(start)
    if not graph_key:
        return []
    node = dep_graph.graph.get(graph_key)
    if not node:
        return []

    missing_deps = []
    for dep_graph_key, is_used in node.deps.items():
        if is_used:
            continue
        param = dep_graph.graph.get(dep_graph_key)
        if not param or not isinstance(param, ParamNode):
            continue
        if param_filter(param):
            missing_deps.append(get_message_with_ids(message, dep_graph_key, dep_graph))
    return missing_deps


def process_positional_argument_issue(
    start: int,
    message: str,
    code_generator: PythonCodeGenerator,
    dep_graph: DependencyGraph,
):
    return _process_argument_issue(
        start,
        message,
        code_generator,
        dep_graph,
        lambda param: param.passing_style == ParameterPassingStyle.POSITIONAL_ONLY,
    )


def process_named_argument_issue(
    start: int,
    message: str,
    code_generator: PythonCodeGenerator,
    dep_graph: DependencyGraph,
):
    missing_param_names = extract_parameters(message)
    return _process_argument_issue(
        start,
        message,
        code_generator,
        dep_graph,
        lambda param: param.name in missing_param_names,
    )


def get_message_with_ids(
    message: str, graph_key: GraphKeyType, dep_graph: DependencyGraph
):
    x = dep_graph.extract_ids_from_graph_key(graph_key)
    return SettaGenCodeDiagnostic(
        sectionId=x.sectionId, paramInfoId=x.paramInfoId, message=message
    )


def extract_parameters(error_string: str):
    pattern = r'"([^"]+)"'
    parameters = re.findall(pattern, error_string)
    return set(parameters)


def convert_diagnostic_line_cols_to_positions(
    code: str, diagnostics: list[LSPTypes.Diagnostic]
):
    line_cols = []
    for d in diagnostics:
        x = d.range.start
        line_cols.append((x.line, x.character))
        x = d.range.end
        line_cols.append((x.line, x.character))

    positions = line_col_to_position_batch(code, line_cols)

    output: list[LSPPosition] = []
    for i in range(0, len(positions), 2):
        output.append(LSPPosition(start=positions[i], end=positions[i + 1]))
    return output
