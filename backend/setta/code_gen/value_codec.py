from collections.abc import Callable

from setta.code_gen.dependency_graph import (
    DependencyGraph,
    ParamNode,
)
from setta.code_gen.dependency_key import DependencyKey
from setta.code_gen.dependency_value import (
    DependencyValue,
    DependencyValueKind,
)
from setta.code_gen.value_mode import PythonValueMode
from setta.types.code_obj_impls import CodeObjType

VarLookup = Callable[[DependencyKey], str]


class PythonValueCodec:
    """
    Convert dependency graph nodes into the canonical Python expressions emitted by the generator.

    The codec owns the dict/list formatting helpers so we can share the logic between the code
    generator and listener runtime without duplicating string assembly.
    """

    def __init__(
        self,
        dep_graph: DependencyGraph,
        var_lookup: VarLookup,
        *,
        mode: PythonValueMode = PythonValueMode.LIVE_RUNTIME,
    ):
        self.dep_graph = dep_graph
        self.var_lookup = var_lookup
        self.mode = mode

    def format_param_expression(self, node: ParamNode) -> str:
        param_type = node.type
        literal_value = self._expect_literal(node)

        if param_type in (
            CodeObjType.TextParam,
            CodeObjType.CodeParam,
            CodeObjType.SliderParam,
            CodeObjType.DropdownParam,
        ):
            return literal_value

        if param_type == CodeObjType.SwitchParam:
            return "True" if literal_value == "true" else "False"

        if param_type == CodeObjType.ColorPickerParam:
            return f'"{literal_value}"'

        if param_type == CodeObjType.NestedParam:
            return self.format_dict(node.deps)

        raise ValueError(f"Unsupported CodeObjType {param_type}")

    def format_dict(self, deps: dict[DependencyKey, bool]) -> str:
        parts: list[str] = []
        for dep_key, is_used in deps.items():
            if not is_used:
                continue
            node = self.dep_graph.graph[dep_key]
            parts.append(f'"{node.name}": {self.var_lookup(dep_key)}')
        joined = ", ".join(parts)
        return "{" + joined + "}"

    def format_list(self, deps: dict[DependencyKey, bool]) -> str:
        items = [
            self.var_lookup(dep_key) for dep_key, is_used in deps.items() if is_used
        ]
        return "[" + ", ".join(items) + "]"

    def _expect_literal(self, node: ParamNode) -> str:
        value: DependencyValue | None = node.value
        if value is None:
            return ""
        if value.kind is not DependencyValueKind.LITERAL:
            raise ValueError(
                f"Unsupported dependency value kind {value.kind} for node {node.full_path_name}"
            )
        return value.payload
