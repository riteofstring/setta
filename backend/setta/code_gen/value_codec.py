from collections.abc import Callable

from setta.code_gen.dependency_graph import (
    DependencyGraph,
    GraphKeyType,
    ParamNode,
)
from setta.types.code_obj_impls import CodeObjType

VarLookup = Callable[[GraphKeyType], str]


class PythonValueCodec:
    """
    Convert dependency graph nodes into the canonical Python expressions emitted by the generator.

    The codec owns the dict/list formatting helpers so we can share the logic between the code
    generator and listener runtime without duplicating string assembly.
    """

    def __init__(self, dep_graph: DependencyGraph, var_lookup: VarLookup):
        self.dep_graph = dep_graph
        self.var_lookup = var_lookup

    def format_param_expression(self, node: ParamNode) -> str:
        param_type = node.type

        if param_type in (
            CodeObjType.TextParam,
            CodeObjType.CodeParam,
            CodeObjType.SliderParam,
            CodeObjType.DropdownParam,
        ):
            return node.value

        if param_type == CodeObjType.SwitchParam:
            return "True" if node.value == "true" else "False"

        if param_type == CodeObjType.ColorPickerParam:
            return f'"{node.value}"'

        if param_type == CodeObjType.NestedParam:
            return self.format_dict(node.deps)

        raise ValueError(f"Unsupported CodeObjType {param_type}")

    def format_dict(self, deps: dict[GraphKeyType, bool]) -> str:
        parts: list[str] = []
        for graph_key, is_used in deps.items():
            if not is_used:
                continue
            node = self.dep_graph.graph[graph_key]
            parts.append(f'"{node.name}": {self.var_lookup(graph_key)}')
        joined = ", ".join(parts)
        return "{" + joined + "}"

    def format_list(self, deps: dict[GraphKeyType, bool]) -> str:
        items = [
            self.var_lookup(graph_key) for graph_key, is_used in deps.items() if is_used
        ]
        return "[" + ", ".join(items) + "]"
