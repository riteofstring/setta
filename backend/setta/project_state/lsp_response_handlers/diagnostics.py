import re
from typing import Callable

from lsprotocol import types as LSPTypes

from setta.code_gen.dependency_graph import DependencyGraph, ParamNode
from setta.code_gen.python.code_generator import PythonCodeGenerator
from setta.code_gen.python.position_line_col import line_col_to_position_batch
from setta.types.code_obj_impls import ParameterPassingStyle
from setta.types.dependency_key import (
    SectionDependencyKey,
    SectionParamDependencyKey,
)
from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.types.lsp import SettaGenCodeDiagnostic, SettaLSPPosition


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
    position: SettaLSPPosition,
    code_generator: PythonCodeGenerator,
    dep_graph: DependencyGraph,
):
    message = d.message
    if d.code == "reportArgumentType":
        return process_report_argument_type(
            position.start, position.end, message, code_generator
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
):
    problem_var = code_generator.code[start:end]
    dep_key = code_generator.reverse_var_name_mapping.get(problem_var)
    if dep_key:
        return [get_message_with_ids(message, dep_key)]
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
    dep_key = code_generator.value_pos_start_to_dep_key.get(start)
    if not dep_key:
        return []
    node = dep_graph.graph.get(dep_key)
    if not node:
        return []

    missing_deps = []
    for dep_dep_key, is_used in node.deps.items():
        if is_used:
            continue
        param = dep_graph.graph.get(dep_dep_key)
        if not param or not isinstance(param, ParamNode):
            continue
        if param_filter(param):
            missing_deps.append(get_message_with_ids(message, dep_dep_key))
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


def get_message_with_ids(message: str, dep_key: BaseDependencyKeyUnion):
    if isinstance(dep_key, SectionParamDependencyKey):
        section_id = dep_key.sectionId
        param_id = dep_key.codeObjId
    elif isinstance(dep_key, SectionDependencyKey):
        section_id = dep_key.sectionId
        param_id = None
    else:
        raise TypeError(
            f"Unsupported dependency key type {type(dep_key)} in diagnostics message"
        )
    return SettaGenCodeDiagnostic(
        sectionId=section_id,
        paramInfoId=param_id,
        message=message,
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

    output: list[SettaLSPPosition] = []
    for i in range(0, len(positions), 2):
        output.append(SettaLSPPosition(start=positions[i], end=positions[i + 1]))
    return output
