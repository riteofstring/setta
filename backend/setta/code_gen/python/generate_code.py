from dataclasses import dataclass

from setta.code_gen.dependency_graph import (
    DependencyGraph,
    GraphKeyType,
    Node,
    ParamNode,
    SectionNode,
)
from setta.code_gen.utils import (
    CLASS_DEF,
    SELF_IDENTIFIER,
)
from setta.types.code_obj_impls import CodeObjType, ParameterPassingStyle
from setta.types.section_impls import SectionType


@dataclass
class PythonCodeLine:
    var_str: str
    prefix_len: int
    value_len: int
    pos: int | None = None

    @property
    def value_pos_start(self):
        """Returns a tuple of (value_pos_start, value_pos_end)"""
        if self.pos is None:
            return None
        value_pos_start = self.pos + self.prefix_len
        # value_pos_end = value_pos_start + self.value_len
        return value_pos_start


class PythonCodeGenerator:
    def __init__(
        self, dep_graph: DependencyGraph, gen_code_prefix: str, gen_code_suffix: str
    ):
        self.dep_graph = dep_graph
        self.gen_code_prefix = gen_code_prefix
        self.gen_code_suffix = gen_code_suffix
        self.reset()

    def reset(self):
        self.var_name_mapping: dict[GraphKeyType, str] = {}  # graph_key to var name
        self.reverse_var_name_mapping: dict[
            str, GraphKeyType
        ] = {}  # var name to graph_key
        self.value_pos_start_to_graph_key: dict[int, GraphKeyType] = {}
        self.code: str = ""
        self.lines: dict[GraphKeyType, PythonCodeLine] = {}

    def generate_code(self):
        self.reset()
        processed_nodes = set()
        cycles_detected = []

        for key, node in self.dep_graph.graph.items():
            if not node.isTopLevel or not node.has_name_and_value:
                continue

            cycles_detected.extend(
                self._process_node_and_deps(key, node, processed_nodes)
            )

        if cycles_detected:
            print(f"Found {len(cycles_detected)} cycles during code generation")
            print(cycles_detected)

        code = self.generate_wrapper_class()
        gen_code_suffix_position = len(code)
        self.code = f"{code}{self.gen_code_suffix}"
        return gen_code_suffix_position

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
        for dep_key, is_used in node.deps.items():
            if not is_used:
                continue
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
        if self.gen_code_prefix:
            code = f"{self.gen_code_prefix}\n{code}"
        indent = "        "
        indent_len = len(indent)

        # no sections or params? Then just pass.
        if len(self.lines) == 0:
            return f"{code}{indent}pass\n"

        for key, l in self.lines.items():
            curr_pos = len(code) + indent_len
            code = f"{code}{indent}{l.var_str}\n"
            self.lines[key].pos = curr_pos
            value_pos_start = self.lines[key].value_pos_start
            if value_pos_start is not None:
                self.value_pos_start_to_graph_key[value_pos_start] = key
        return code

    def create_line(self, graph_key, node: Node):
        value = self.get_value(node)
        var_name = self.create_var_name(graph_key, node)
        prefix = f"{var_name} = "
        final_str = f"{prefix}{value}"
        self.lines[graph_key] = PythonCodeLine(final_str, len(prefix), len(value))

    def create_var_name(self, graph_key, node: Node):
        var_name = f"{SELF_IDENTIFIER}.{node.full_path_name}"
        self.var_name_mapping[graph_key] = var_name
        self.reverse_var_name_mapping[var_name] = graph_key
        return var_name

    def get_value(self, node: Node):
        if isinstance(node, SectionNode):
            return self.get_section_value(node)
        elif isinstance(node, ParamNode):
            return self.get_param_value(node)
        else:
            raise ValueError

    def get_section_value(self, node: SectionNode):
        t = node.type
        if t == SectionType.Callable:
            if node.value:
                return self.construct_callable(node.value, node.deps)
            else:
                return self.construct_dict(node.deps)
        elif t == SectionType.ListRoot:
            return self.construct_list(node.deps)
        elif t in [SectionType.DictRoot, SectionType.Group]:
            return self.construct_dict(node.deps)
        else:
            raise ValueError
        # elif t == UITypeName.TEXT_BLOCK:
        #     output = f'"""{x["value"]}"""'
        # else:
        #     output = None

    def get_param_value(self, node: ParamNode):
        t = node.type
        if (
            t == CodeObjType.TextParam
            or t == CodeObjType.SliderParam
            or t == CodeObjType.DropdownParam
        ):
            return node.value
        elif t == CodeObjType.SwitchParam:
            return "True" if node.value == "true" else "False"
        elif t == CodeObjType.ColorPickerParam:
            return f'"{node.value}"'
        elif t == CodeObjType.NestedParam:
            return self.construct_dict(node.deps)
        else:
            raise ValueError

    def construct_dict(self, deps):
        output = ""
        idx = 0
        for d, is_used in deps.items():
            if not is_used:
                continue
            prefix = "" if idx == 0 else ", "
            name = self.dep_graph.graph[d].name
            var_name = self.var_name_mapping[d]
            output += f'{prefix}"{name}": {var_name}'
            idx += 1
        return "{" + output + "}"

    def construct_list(self, deps):
        output = ", ".join(
            self.var_name_mapping[d] for d, is_used in deps.items() if is_used
        )
        return f"[{output}]"

    def construct_callable(self, value, deps):
        output = ""
        idx = 0
        for d, is_used in deps.items():
            if not is_used:
                continue
            node = self.dep_graph.graph[d]
            # it's possible for a section node to have a callable
            # that depends on another section. So here we only want ParamNodes
            # when constructing the parameters of a callable.
            if not isinstance(node, ParamNode):
                continue
            prefix = "" if idx == 0 else ", "
            var_name = self.var_name_mapping[d]
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
            idx += 1

        output = f"{value}({output})"
        return output

    def change_value(self, graph_key, value):
        self.dep_graph.change_value(graph_key, value)
        self.generate_code()
        code_line = self.lines.get(graph_key)
        # code_line still might not exist if value is empty
        # or if the node doesn't have a name (e.g. a kwarg whose name hasn't been set yet)
        if code_line:
            return code_line.value_pos_start
        return None

    def set_gen_code_prefix(self, new_prefix):
        self.gen_code_prefix = new_prefix
        self.generate_code()

    def set_gen_code_suffix(self, new_suffix):
        self.gen_code_suffix = new_suffix
        return self.generate_code()
