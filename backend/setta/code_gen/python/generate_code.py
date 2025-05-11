from dataclasses import dataclass
from typing import Optional

from setta.code_gen.dependency_graph import (
    DependencyGraph,
    Node,
    ParamNode,
    SectionNode,
)
from setta.code_gen.utils import CLASS_DEF, CLASS_NAME, SELF_IDENTIFIER

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

    def generate_code(self):
        lines = {}
        processed_nodes = set()
        for key, node in self.dep_graph.graph.items():
            if not node.isTopLevel:
                continue
            self._process_node_and_deps(key, node, lines, processed_nodes)

        code = self.generate_wrapper_class(lines)
        return code, lines

    def _process_node_and_deps(self, graph_key, node, lines, processed_nodes):
        if graph_key in processed_nodes:
            return

        for dep_key in node.deps:
            if dep_key not in processed_nodes:
                dep_node = self.dep_graph.graph[dep_key]
                self._process_node_and_deps(dep_key, dep_node, lines, processed_nodes)

        var_str, prefix_len, value_len = self.create_line(graph_key, node)
        if var_str:
            lines[graph_key] = PythonCodeLine(var_str, prefix_len, value_len)

        processed_nodes.add(graph_key)

    def generate_wrapper_class(self, lines):
        code = CLASS_DEF
        indent = "        "
        indent_len = len(indent)
        for key, l in lines.items():
            curr_pos = len(code) + indent_len
            code = f"{code}{indent}{l.var_str}\n"
            lines[key].pos = curr_pos
        return code

    def create_line(self, graph_key, node: Node):
        value = self.get_value(node)
        var_name = self.create_var_name(graph_key, node)
        prefix = f"{var_name} = "
        final_str = f"{prefix}{value}"
        return final_str, len(prefix), len(value)

    def create_var_name(self, graph_key, node: Node):
        if isinstance(node, ParamNode):
            var_name = f"{SELF_IDENTIFIER}.{node.full_path_name}"
        elif node.isTopLevel:
            var_name = f"{SELF_IDENTIFIER}.{node.name}"
        else:
            var_name = node.name
            counter = 2
            while var_name in self.used_temp_var_names:
                var_name = f"{var_name}_{counter}"
                counter += 1
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
