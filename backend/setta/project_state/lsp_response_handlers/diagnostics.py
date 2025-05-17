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
    print(output)
    return output


def process_gen_code_diagnostic(
    d, code_generator: PythonCodeGenerator, dep_graph: DependencyGraph
):
    start = d["range"]["start"]
    end = d["range"]["end"]
    message = d["message"]
    if d["code"] == "reportArgumentType":
        return process_report_argument_type(
            start, end, message, code_generator, dep_graph
        )
    elif d["code"] == "reportCallIssue":
        return process_report_call_issue(start, end, message, code_generator, dep_graph)

        # missing_params = extract_parameters(d["message"])
        # # get variable to the left of the equal sign
        # assigned_to = code_split[start["line"]].split("=")[0].strip()
        # unusedParams = codeJson[assigned_to]["value"]["unusedParams"]
        # output = []
        # for potential_problem_var in unusedParams:
        #     if codeJson[potential_problem_var]["name"] in missing_params:
        #         output.append(
        #             get_message_with_ids(codeJson, potential_problem_var, d["message"])
        #         )
        # return output
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


def process_positional_argument_issue(start, message, code_generator, dep_graph):
    graph_key = code_generator.value_pos_start_to_graph_key.get(start["position"])
    if not graph_key:
        return []
    node = dep_graph.graph.get(graph_key)
    if not node:
        return []
    positional_only_deps = []
    for dep_graph_key in node.deps.keys():
        param = dep_graph.graph.get(dep_graph_key)
        if not param:
            continue
        if (
            isinstance(param, ParamNode)
            and param.passing_style == ParameterPassingStyle.POSITIONAL_ONLY
        ):
            positional_only_deps.append(
                get_message_with_ids(message, dep_graph_key, dep_graph)
            )
    return positional_only_deps


def get_message_with_ids(message, graph_key, dep_graph):
    return {**dep_graph.extract_ids_from_graph_key(graph_key), "message": message}


def extract_parameters(error_string):
    pattern = r'"([^"]+)"'
    parameters = re.findall(pattern, error_string)
    return parameters


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
