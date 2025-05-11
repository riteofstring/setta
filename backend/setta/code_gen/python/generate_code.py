from dataclasses import dataclass
from typing import Optional

from setta.code_gen.dependency_graph import DependencyGraph, Node, ParamNode, SectionNode

from ...utils.constants import C, ParameterPassingStyle

SELF_IDENTIFIER = "s"
CLASS_NAME = "S"


CLASS_DEF = f"""
from setta.code_gen.python.args_obj import SettaArgsObj

class {CLASS_NAME}:
    def __init__({SELF_IDENTIFIER}):
        {SELF_IDENTIFIER}.args = SettaArgsObj()
""".lstrip()


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
        self.used_var_names = set([SELF_IDENTIFIER, CLASS_NAME, "SettaArgsObj"])

    def generate_code(self, force_appear_key=None):
        lines = {}
        for graph_key, node in self.dep_graph.graph.items():
            force_appear = force_appear_key == graph_key
            var_str, prefix_len, value_len = self.create_line(
                graph_key, node, force_appear=force_appear
            )
            if var_str:
                lines[graph_key] = PythonCodeLine(var_str, prefix_len, value_len)

        code = self.generate_wrapper_class(lines)
        return code, lines

    def generate_wrapper_class(self, lines):
        code = CLASS_DEF
        indent = "        "
        indent_len = len(indent)
        for key, l in lines.items():
            curr_pos = len(code) + indent_len
            code = f"{code}{indent}{l.var_str}\n"
            lines[key].pos = curr_pos
        return code

    def create_line(self, graph_key, node: Node, force_appear):
        value = self.get_value(node)
        if value or force_appear:
            var_name = self.create_var_name(graph_key, node)
            prefix = var_declaration(var_name, value, return_prefix=True)
            final_str = f"{prefix}{value}"
            return final_str, len(prefix), len(value)
        return None, None, None
    
    def create_var_name(self, graph_key, node:Node):
        var_name = node.name
        if node.isTopLevel:
            var_name = f"{SELF_IDENTIFIER}.{var_name}"
        counter = 2
        while var_name in self.used_var_names:
            var_name = f"{var_name}_{counter}"
            counter += 1
    
        self.var_name_mapping[graph_key] = var_name
        self.used_var_names.add(var_name)
        return var_name

    def get_value(self, node: Node):
        if isinstance(node, SectionNode):
            return self.get_section_value(node)
        return self.get_param_value(node)

    def get_section_value(self, node: SectionNode):
        t = node.type
        if t == C.SECTION:
            if not node.callable:
                return self.construct_dict(node.deps)
            else:
                output = self.get_callable_params(
                    x["value"]["usedParams"], x["value"]["passingStyles"]
                )
                prefix = f"{x['value']['callable']}("
                output = f"{prefix}{output})"
        elif t == C.LIST_ROOT:
            return self.construct_list(node.deps)
        # elif t in [C.DICT_ROOT, C.GROUP, C.NESTED_PARAM]:
        #     output = get_dict_contents(x["value"], dep_graph)
        #     output = "{" + output + "}"
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

    def get_callable_params(self, dependency_keys):
        return self.get_mappings(dependency_keys)

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

    def get_mappings(self, dependency_keys, is_dict=False):
        output = ""
        curr_position = 0
        for idx, key in enumerate(dependency_keys):
            v = self.var_name_mapping[key]
            prefix = "" if idx == 0 else ", "
            node = self.dep_graph[key]
            if passingStyles.get(key) == ParameterPassingStyle.ARGS:
                prefix = "*"
            elif passingStyles.get(key) == ParameterPassingStyle.KWARGS:
                prefix = "**"
            elif is_dict or (
                passingStyles.get(key) == ParameterPassingStyle.DEFAULT
                or passingStyles.get(key) == ParameterPassingStyle.KEYWORD_ONLY
            ):
                var_decl_prefix = var_declaration(
                    dep_graph[key]["name"],
                    v,
                    is_dict,
                    return_prefix=True,
                    is_callable_param=True,
                )
                prefix += var_decl_prefix

            curr_output = f"{prefix}{v}"
            curr_position += len(curr_output)
            output += curr_output

        return output


def var_declaration(
    var_name, value, is_dict=False, return_prefix=False, is_callable_param=False
):
    if is_dict:
        prefix = f'"{var_name}": '
    else:
        prefix = f"{var_name}=" if is_callable_param else f"{var_name} = "
    if return_prefix:
        return prefix
    return f"{prefix}{value}"
