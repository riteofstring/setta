import re
from bisect import bisect_right
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
from setta.types.id import ID
from setta.types.lsp import (
    SettaLspDiagnostic,
    SettaLspDiagnosticPosition,
    SettaLspDiagnosticRange,
    SettaLSPPosition,
    SettaSectionTypeErrors,
)
from setta.types.section_impls import (
    CodeSectionDiagnosticsIgnoreState,
    TypeErrorIgnoreState,
)

RangeIndex = tuple[list[int], list[tuple[int, int, BaseDependencyKeyUnion]]]


def is_call_mismatch_diagnostic(d: LSPTypes.Diagnostic) -> bool:
    code = d.code if isinstance(d.code, str) else ""
    if code != "reportCallIssue":
        return False
    message = d.message.lower()
    return "positional argument" in message or "parameter" in message


def get_section_id_for_dep_key(dep_key: BaseDependencyKeyUnion | None) -> ID | None:
    if dep_key is None:
        return None
    if isinstance(dep_key, SectionParamDependencyKey):
        return dep_key.sectionId
    if isinstance(dep_key, SectionDependencyKey):
        return dep_key.sectionId
    return None


def process_gen_code_diagnostics(
    diagnostics: list[LSPTypes.Diagnostic],
    code_generator: PythonCodeGenerator,
    dep_graph: DependencyGraph,
    ignored_type_errors_by_section: dict[ID, TypeErrorIgnoreState] | None = None,
):
    output, _, _, _ = process_gen_code_diagnostics_with_undefined_symbols(
        diagnostics,
        code_generator,
        dep_graph,
        ignored_type_errors_by_section,
    )
    return output


def process_gen_code_diagnostics_with_undefined_symbols(
    diagnostics: list[LSPTypes.Diagnostic],
    code_generator: PythonCodeGenerator,
    dep_graph: DependencyGraph,
    ignored_type_errors_by_section: dict[ID, TypeErrorIgnoreState] | None = None,
    *,
    uri: str | None = None,
):
    positions = convert_diagnostic_line_cols_to_positions(
        code_generator.code, diagnostics
    )
    range_index = build_dep_key_range_index(code_generator)
    output: dict[ID, SettaSectionTypeErrors] = {}
    undefined_callable_sections: set[ID] = set()
    callable_mismatch_sections: set[ID] = set()
    unmapped_diagnostics: list[SettaLspDiagnostic] = []
    for i, d in enumerate(diagnostics):
        position = positions[i]
        is_undefined_symbol = is_undefined_symbol_diagnostic(d)
        if is_call_mismatch_diagnostic(d):
            dep_key = find_dep_key_for_range(position, code_generator, range_index)
            section_id = get_section_id_for_dep_key(dep_key)
            if section_id is not None:
                callable_mismatch_sections.add(section_id)
        results = process_gen_code_diagnostic(
            d,
            position,
            code_generator,
            dep_graph,
            range_index,
            is_undefined_symbol,
        )
        mapped = bool(results)
        for section_id, param_id, message in results:
            if is_undefined_symbol and param_id is None:
                undefined_callable_sections.add(section_id)
            if should_ignore_type_error(
                section_id,
                param_id,
                ignored_type_errors_by_section,
            ):
                continue
            add_error_message(output, section_id, param_id, message)
        if not mapped:
            unmapped_diagnostics.append(build_setta_lsp_diagnostic(d, uri=uri))
    return (
        output,
        undefined_callable_sections,
        callable_mismatch_sections,
        unmapped_diagnostics,
    )


def should_ignore_type_error(
    section_id: ID,
    param_id: ID | None,
    ignored_type_errors_by_section: dict[ID, TypeErrorIgnoreState] | None,
) -> bool:
    if ignored_type_errors_by_section is None:
        return False
    if section_id not in ignored_type_errors_by_section:
        return False
    ignore_state = ignored_type_errors_by_section[section_id]
    if param_id is None:
        return ignore_state.callable
    if param_id in ignore_state.params:
        return ignore_state.params[param_id]
    return False


def apply_code_section_diagnostics_ignore(
    diagnostics: list[SettaLspDiagnostic],
    ignore_state: CodeSectionDiagnosticsIgnoreState | None,
) -> list[SettaLspDiagnostic]:
    if ignore_state is None:
        return diagnostics
    if ignore_state.muted:
        return []
    suppressed_codes = ignore_state.suppressedCodes
    if not suppressed_codes:
        return diagnostics
    suppressed_set = set(suppressed_codes)
    return [
        diagnostic
        for diagnostic in diagnostics
        if diagnostic.code not in suppressed_set
    ]


def process_gen_code_diagnostic(
    d: LSPTypes.Diagnostic,
    position: SettaLSPPosition,
    code_generator: PythonCodeGenerator,
    dep_graph: DependencyGraph,
    range_index: RangeIndex,
    is_undefined_symbol: bool,
):
    message = d.message
    if d.code == "reportArgumentType":
        return process_report_argument_type(
            position.start, position.end, message, code_generator
        )
    elif d.code == "reportCallIssue":
        return process_report_call_issue(
            position.start, message, code_generator, dep_graph, range_index
        )
    elif is_undefined_symbol:
        return process_undefined_symbol(position, message, code_generator, range_index)
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
    range_index: RangeIndex,
):
    if "positional argument" in message:
        return process_positional_argument_issue(
            start, message, code_generator, dep_graph, range_index
        )
    elif "parameter" in message:
        return process_named_argument_issue(
            start, message, code_generator, dep_graph, range_index
        )
    return []


def is_undefined_symbol_diagnostic(d: LSPTypes.Diagnostic) -> bool:
    code = d.code if isinstance(d.code, str) else ""
    if code in {
        "reportUndefinedVariable",
        "reportUnboundVariable",
        "reportUndefinedFunction",
        "reportUndefinedClass",
    }:
        return True

    message = d.message.lower()
    undefined_message_patterns = (
        "is not defined",
        "has no attribute",
        "cannot access member",
    )
    return any(pattern in message for pattern in undefined_message_patterns)


def process_undefined_symbol(
    position: SettaLSPPosition,
    message: str,
    code_generator: PythonCodeGenerator,
    range_index: RangeIndex,
):
    dep_key = find_dep_key_for_range(position, code_generator, range_index)
    if not dep_key:
        return []
    return [get_message_with_ids(message, dep_key)]


def _process_argument_issue(
    start: int,
    message: str,
    code_generator: PythonCodeGenerator,
    dep_graph: DependencyGraph,
    param_filter: Callable[[ParamNode], bool],
    range_index: RangeIndex,
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
        dep_key = find_dep_key_for_range(
            SettaLSPPosition(start=start, end=start + 1),
            code_generator,
            range_index,
        )
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
    range_index: RangeIndex,
):
    return _process_argument_issue(
        start,
        message,
        code_generator,
        dep_graph,
        lambda param: param.passing_style == ParameterPassingStyle.POSITIONAL_ONLY,
        range_index,
    )


def process_named_argument_issue(
    start: int,
    message: str,
    code_generator: PythonCodeGenerator,
    dep_graph: DependencyGraph,
    range_index: RangeIndex,
):
    missing_param_names = extract_parameters(message)
    return _process_argument_issue(
        start,
        message,
        code_generator,
        dep_graph,
        lambda param: param.name in missing_param_names,
        range_index,
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
    return section_id, param_id, message


def extract_parameters(error_string: str):
    pattern = r'"([^"]+)"'
    parameters = re.findall(pattern, error_string)
    return set(parameters)


def add_error_message(
    errors: dict[ID, SettaSectionTypeErrors],
    section_id: ID,
    param_id: ID | None,
    message: str,
):
    section_errors = errors.get(section_id)
    if not section_errors:
        section_errors = SettaSectionTypeErrors(callable=[], params={})
        errors[section_id] = section_errors
    if param_id is None:
        section_errors.callable.append(message)
        return
    if param_id not in section_errors.params:
        section_errors.params[param_id] = []
    section_errors.params[param_id].append(message)


def build_dep_key_range_index(
    code_generator: PythonCodeGenerator,
) -> RangeIndex:
    ranges: list[tuple[int, int, BaseDependencyKeyUnion]] = []
    for key, line in code_generator.lines.items():
        if line.pos is None:
            continue
        line_start = line.pos
        line_end = line.pos + line.prefix_len + line.value_len
        ranges.append((line_start, line_end, key))
    ranges.sort(key=lambda entry: entry[0])
    starts = [entry[0] for entry in ranges]
    return starts, ranges


def find_dep_key_for_range(
    position: SettaLSPPosition,
    code_generator: PythonCodeGenerator,
    range_index: RangeIndex,
):
    dep_key = code_generator.value_pos_start_to_dep_key.get(position.start)
    if dep_key:
        return dep_key
    starts, ranges = range_index
    if not ranges:
        return None
    idx = bisect_right(starts, position.start) - 1
    for candidate_idx in (idx, idx + 1):
        if 0 <= candidate_idx < len(ranges):
            value_start, value_end, key = ranges[candidate_idx]
            if position.start < value_end and position.end > value_start:
                return key
    return None


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


def build_setta_lsp_diagnostic(
    diagnostic: LSPTypes.Diagnostic,
    *,
    uri: str | None = None,
) -> SettaLspDiagnostic:
    code_value = diagnostic.code
    if not isinstance(code_value, (str, int)):
        code_value = None
    severity = int(diagnostic.severity) if diagnostic.severity is not None else None
    return SettaLspDiagnostic(
        message=diagnostic.message,
        severity=severity,
        code=code_value,
        source=diagnostic.source,
        range=SettaLspDiagnosticRange(
            start=SettaLspDiagnosticPosition(
                line=diagnostic.range.start.line,
                character=diagnostic.range.start.character,
            ),
            end=SettaLspDiagnosticPosition(
                line=diagnostic.range.end.line,
                character=diagnostic.range.end.character,
            ),
        ),
        uri=uri,
    )
