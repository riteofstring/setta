from dataclasses import dataclass
from typing import Optional

from setta.code_gen.dependency_graph import (
    DependencyGraph,
    GraphKeyType,
    Node,
    ParamNode,
    SectionNode,
)
from setta.code_gen.utils import (
    CLASS_DEF,
    CLASS_NAME,
    SELF_IDENTIFIER,
    create_unique_name,
)

from ...utils.constants import C, ParameterPassingStyle


@dataclass
class PythonCodeLine:
    var_str: str
    prefix_len: int
    value_len: int
    pos: Optional[int] = None

    @property
    def value_position(self):
        """Returns a tuple of (value_pos_start, value_pos_end)"""
        if self.pos is None:
            return None
        value_pos_start = self.pos + self.prefix_len
        value_pos_end = value_pos_start + self.value_len
        return (value_pos_start, value_pos_end)


class PythonCodeGenerator:
    def __init__(self, dep_graph: DependencyGraph):
        self.dep_graph = dep_graph
        self.var_name_mapping = {}
        self.used_temp_var_names = set([SELF_IDENTIFIER, CLASS_NAME, "SettaArgsObj"])
        self.code = ""
        self.lines: dict[GraphKeyType, PythonCodeLine] = {}

    def generate_code(self):
        processed_nodes = set()
        cycles_detected = []

        for key, node in self.dep_graph.graph.items():
            if not node.isTopLevel:
                continue

            cycles_detected.extend(
                self._process_node_and_deps(key, node, processed_nodes)
            )

        if cycles_detected:
            print(f"Found {len(cycles_detected)} cycles during code generation")
            print(cycles_detected)

        self.code = self.generate_wrapper_class()

    def _process_node_and_deps(self, graph_key, node, processed_nodes, path=None):
        """Process a node and its dependencies, recording any cycles found."""
        if graph_key in processed_nodes:
            return []  # Already processed, no cycle

        # Initialize the path if this is the top-level call
        if path is None:
            path = []

        # Check if we've encountered this node before in current path
        if graph_key in path:
            # Cycle detected! Extract the full cycle as graph keys
            cycle_start = path.index(graph_key)
            cycle = path[cycle_start:] + [graph_key]
            return [cycle]

        # Add current node to path
        path.append(graph_key)

        cycles = []
        # Process dependencies first
        for dep_key in node.deps:
            if dep_key not in processed_nodes:
                dep_node = self.dep_graph.graph[dep_key]
                cycles.extend(
                    self._process_node_and_deps(
                        dep_key, dep_node, processed_nodes, path
                    )
                )

        # Now process this node
        self.create_line(graph_key, node)

        # Mark as processed and remove from path
        processed_nodes.add(graph_key)
        path.pop()

        return cycles  # Return all cycles found

    def generate_wrapper_class(self):
        code = CLASS_DEF
        indent = "        "
        indent_len = len(indent)
        for key, l in self.lines.items():
            curr_pos = len(code) + indent_len
            code = f"{code}{indent}{l.var_str}\n"
            self.lines[key].pos = curr_pos
        return code

    def create_line(self, graph_key, node: Node):
        value = self.get_value(node)
        var_name = self.create_var_name(graph_key, node)
        prefix = f"{var_name} = "
        final_str = f"{prefix}{value}"
        self.lines[graph_key] = PythonCodeLine(final_str, len(prefix), len(value))

    def create_var_name(self, graph_key, node: Node):
        if isinstance(node, ParamNode):
            var_name = f"{SELF_IDENTIFIER}.{node.full_path_name}"
        elif node.isTopLevel:
            var_name = f"{SELF_IDENTIFIER}.{node.name}"
        else:
            var_name = create_unique_name(node.name, self.used_temp_var_names)
            self.used_temp_var_names.add(var_name)

        self.var_name_mapping[graph_key] = var_name
        return var_name

    def get_value(self, node: Node):
        if isinstance(node, SectionNode):
            return self.get_section_value(node)
        return self.get_param_value(node)

    def get_section_value(self, node: SectionNode):
        t = node.type
        if t == C.SECTION:
            if node.callable:
                return self.construct_callable(node.callable, node.deps)
            else:
                return self.construct_dict(node.deps)
        elif t == C.LIST_ROOT:
            return self.construct_list(node.deps)
        elif t in [C.DICT_ROOT, C.GROUP]:
            return self.construct_dict(node.deps)
        # elif t == C.TEXT_BLOCK:
        #     output = f'"""{x["value"]}"""'
        # else:
        #     output = None

    def get_param_value(self, node: ParamNode):
        t = node.type
        if t == C.TEXT or t == C.SLIDER or t == C.DROPDOWN:
            return node.value
        elif t == C.SWITCH:
            return "True" if node.value == "true" else "False"
        elif t == C.COLOR_PICKER:
            return f'"{node.value}"'
        elif t == C.NESTED_PARAM:
            return self.construct_dict(node.deps)

    def construct_dict(self, dependency_keys):
        output = ""
        idx = 0
        for idx, d in enumerate(dependency_keys):
            prefix = "" if idx == 0 else ", "
            name = self.dep_graph.graph[d].name
            var_name = self.var_name_mapping[d]
            output += f'{prefix}"{name}": {var_name}'
        return "{" + output + "}"

    def construct_list(self, dependency_keys):
        output = ", ".join(self.var_name_mapping[d] for d in dependency_keys)
        return f"[{output}]"

    def construct_callable(self, callable, dependency_keys):
        output = ""
        for idx, key in enumerate(dependency_keys):
            prefix = "" if idx == 0 else ", "
            var_name = self.var_name_mapping[key]
            node: ParamNode = self.dep_graph.graph[key]
            passing_style = node.passing_style
            if passing_style == ParameterPassingStyle.ARGS:
                prefix = "*"
            elif passing_style == ParameterPassingStyle.KWARGS:
                prefix = "**"
            elif (
                passing_style == ParameterPassingStyle.DEFAULT
                or passing_style == ParameterPassingStyle.KEYWORD_ONLY
            ):
                prefix += f"{node.name}="

            output += f"{prefix}{var_name}"

        output = f"{callable}({output})"
        return output

    def change_line_value(self, graph_key, value):
        self.dep_graph.change_node_value(graph_key, value)
        self.generate_code()
        return self.lines[graph_key].value_position[0]
