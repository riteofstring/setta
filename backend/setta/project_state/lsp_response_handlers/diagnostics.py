import re

from setta.code_gen.dependency_graph import DependencyGraph, ParamNode
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.code_gen.python.position_line_col import line_col_to_position_batch
from setta.utils.constants import ParameterPassingStyle


def process_gen_code_diagnostics(
    diagnostics, code_generator: PythonCodeGenerator, dep_graph: DependencyGraph
):
    convert_diagnostic_line_cols_to_positions(code_generator.code, diagnostics)
    output = []
    for d in diagnostics:
        # print(f"{d}\n", flush=True)
        output.extend(process_gen_code_diagnostic(d, code_generator, dep_graph))
    # print(output)
    return output


def process_gen_code_diagnostic(
    d, code_generator: PythonCodeGenerator, dep_graph: DependencyGraph
):
    start = d["range"]["start"]
    end = d["range"]["end"]
    message = d["message"]
    if d.get("code") == "reportArgumentType":
        return process_report_argument_type(
            start, end, message, code_generator, dep_graph
        )
    elif d.get("code") == "reportCallIssue":
        return process_report_call_issue(start, end, message, code_generator, dep_graph)
    return []


def process_report_argument_type(start, end, message, code_generator, dep_graph):
    problem_var = code_generator.code[start["position"] : end["position"]]
    graph_key = code_generator.reverse_var_name_mapping.get(problem_var)
    if graph_key:
        return [get_message_with_ids(message, graph_key, dep_graph)]
    return []


def process_report_call_issue(start, end, message, code_generator, dep_graph):
    if "positional argument" in message:
        return process_positional_argument_issue(
            start, message, code_generator, dep_graph
        )
    elif "parameter" in message:
        return process_named_argument_issue(start, message, code_generator, dep_graph)
    return []


def _process_argument_issue(start, message, code_generator, dep_graph, param_filter):
    """
    Helper function to process argument issues.

    Args:
        start: Start position information
        message: Error message
        code_generator: PythonCodeGenerator instance
        dep_graph: DependencyGraph instance
        param_filter: Function that takes a param and returns True if it should be included
    """
    graph_key = code_generator.value_pos_start_to_graph_key.get(start["position"])
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


def process_positional_argument_issue(start, message, code_generator, dep_graph):
    return _process_argument_issue(
        start,
        message,
        code_generator,
        dep_graph,
        lambda param: param.passing_style == ParameterPassingStyle.POSITIONAL_ONLY,
    )


def process_named_argument_issue(start, message, code_generator, dep_graph):
    missing_param_names = extract_parameters(message)
    return _process_argument_issue(
        start,
        message,
        code_generator,
        dep_graph,
        lambda param: param.name in missing_param_names,
    )


def get_message_with_ids(message, graph_key, dep_graph):
    return {**dep_graph.extract_ids_from_graph_key(graph_key), "message": message}


def extract_parameters(error_string):
    pattern = r'"([^"]+)"'
    parameters = re.findall(pattern, error_string)
    return set(parameters)


def convert_diagnostic_line_cols_to_positions(code, diagnostics):
    line_cols = []
    for d in diagnostics:
        x = d["range"]["start"]
        line_cols.append((x["line"], x["character"]))
        x = d["range"]["end"]
        line_cols.append((x["line"], x["character"]))

    positions = line_col_to_position_batch(code, line_cols)

    for i, d in enumerate(diagnostics):
        d["range"]["start"]["position"] = positions[i * 2]
        d["range"]["end"]["position"] = positions[(i * 2) + 1]
