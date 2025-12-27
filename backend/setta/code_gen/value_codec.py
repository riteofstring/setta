from collections.abc import Callable
from typing import assert_never

from setta.code_gen.dependency_graph import (
    DependencyGraph,
    ParamNode,
    SectionNode,
)
from setta.code_gen.value_mode import PythonValueMode
from setta.types.code_obj_impls import CodeObjType, ParameterPassingStyle
from setta.types.dependency_value import DependencyValueType
from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.types.generated.dependency_values import BaseDependencyValueUnion
from setta.types.section_impls import SectionType

VarLookup = Callable[[BaseDependencyKeyUnion], str]


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
        helper_module_alias: str = "_setta_value_helpers",
    ):
        self.dep_graph = dep_graph
        self.var_lookup = var_lookup
        self.mode = mode
        self.helper_module_alias = helper_module_alias
        self._required_imports: set[str] = set()

    def reset_usage(self) -> None:
        """Clear helper-tracking state before a new render pass."""
        self._required_imports.clear()

    @property
    def required_imports(self) -> tuple[str, ...]:
        """Sorted helper import statements this codec relied on."""
        return tuple(sorted(self._required_imports))

    def format_param_expression(self, node: ParamNode) -> str:
        param_type = node.type
        literal_value = self._expect_literal(node)
        return self._format_param_literal(param_type, literal_value, node.deps)

    def format_dict(self, deps: dict[BaseDependencyKeyUnion, bool]) -> str:
        parts: list[str] = []
        for dep_key, is_used in deps.items():
            if not is_used:
                continue
            node = self.dep_graph.graph[dep_key]
            parts.append(f'"{node.name}": {self.var_lookup(dep_key)}')
        joined = ", ".join(parts)
        return "{" + joined + "}"

    def format_list(self, deps: dict[BaseDependencyKeyUnion, bool]) -> str:
        items = [
            self.var_lookup(dep_key) for dep_key, is_used in deps.items() if is_used
        ]
        return "[" + ", ".join(items) + "]"

    def format_section(self, node: SectionNode) -> str | None:
        section_type = node.type
        match section_type:
            case SectionType.Callable:
                return self._format_callable_section(node)
            case SectionType.ListRoot:
                return self.format_list(node.deps)
            case SectionType.Group | SectionType.Dict:
                return self.format_dict(node.deps)
            case SectionType.MetaControl:
                return self._format_meta_control_section(node)
            case SectionType.TextBlock:
                if node.value:
                    return repr(node.value.payload)
                return "None"
            case SectionType.Draw:
                if node.value:
                    return self.format_dependency_value(node.value)
                return "None"
            case _:
                return None

    def format_dependency_value(self, value: BaseDependencyValueUnion) -> str:
        """Render an arbitrary dependency value using the configured value mode."""
        match value.type:
            case DependencyValueType.Literal:
                return value.payload
            case DependencyValueType.Base64:
                return self._format_base64_value(value.payload)
            case DependencyValueType.FileRead:
                return self._format_file_read_value(value.payload)
            case _:
                assert_never(value.type)

    def _expect_literal(self, node: ParamNode) -> str:
        value: BaseDependencyValueUnion | None = node.value
        if value is None:
            return ""
        if value.type is not DependencyValueType.Literal:
            raise ValueError(
                f"Unsupported dependency value kind {value.type} for node {node.full_path_name}"
            )
        return value.payload

    def _format_callable_section(self, node: SectionNode) -> str:
        if not node.value:
            return "None"
        callable_name = node.value.payload
        return self._construct_callable(callable_name, node.deps)

    def _format_meta_control_section(self, node: SectionNode) -> str:
        if node.value is None:
            return "None"
        if node.value.type is not DependencyValueType.Literal:
            raise ValueError(
                f"Unsupported dependency value kind {node.value} for meta control {node.full_path_name}"
            )
        control_type = node.control_code_obj_type
        if control_type is None:
            raise ValueError(f"Missing control code obj type for {node.full_path_name}")
        literal_value = node.value.payload
        return self._format_param_literal(control_type, literal_value)

    def _format_param_literal(
        self,
        param_type: CodeObjType,
        literal_value: str,
        deps: dict[BaseDependencyKeyUnion, bool] | None = None,
    ) -> str:
        if param_type in (
            CodeObjType.TextParam,
            CodeObjType.CodeParam,
            CodeObjType.SliderParam,
            CodeObjType.RotaryParam,
            CodeObjType.DropdownParam,
        ):
            return literal_value

        if param_type in (
            CodeObjType.TextAreaParam,
            CodeObjType.PasswordParam,
            CodeObjType.DropzoneParam,
        ):
            return repr(literal_value)

        if param_type == CodeObjType.SwitchParam:
            return "True" if literal_value == "true" else "False"

        if param_type == CodeObjType.ColorPickerParam:
            return f'"{literal_value}"'

        if param_type == CodeObjType.NestedParam:
            if deps is None:
                raise ValueError("NestedParam requires dependency mapping.")
            return self.format_dict(deps)

        raise ValueError(f"Unsupported CodeObjType {param_type}")

    def _construct_callable(
        self, callable_name: str, deps: dict[BaseDependencyKeyUnion, bool]
    ) -> str:
        rendered_args = ""
        idx = 0
        for dep_key, is_used in deps.items():
            if not is_used:
                continue
            node = self.dep_graph.graph[dep_key]
            if not isinstance(node, ParamNode):
                continue
            prefix = "" if idx == 0 else ", "
            var_name = self.var_lookup(dep_key)
            passing_style = node.passing_style
            if passing_style == ParameterPassingStyle.ARGS:
                prefix = "*"
            elif passing_style == ParameterPassingStyle.KWARGS:
                prefix = "**"
            elif passing_style in (
                ParameterPassingStyle.DEFAULT,
                ParameterPassingStyle.KEYWORD_ONLY,
            ):
                prefix += f"{node.name}="

            rendered_args += f"{prefix}{var_name}"
            idx += 1

        return f"{callable_name}({rendered_args})"

    def _format_base64_value(self, payload: str) -> str:
        if self.mode is PythonValueMode.LIVE_RUNTIME:
            return repr(payload)
        helper_alias = self._require_value_helpers()
        return f"{helper_alias}.decode_base64_value({repr(payload)})"

    def _format_file_read_value(self, payload: str) -> str:
        if self.mode is PythonValueMode.LIVE_RUNTIME:
            return repr(payload)
        helper_alias = self._require_value_helpers()
        return f"{helper_alias}.read_file_value({repr(payload)})"

    def _require_value_helpers(self) -> str:
        import_stmt = (
            "from setta.code_gen.python import value_helpers as "
            f"{self.helper_module_alias}"
        )
        self._required_imports.add(import_stmt)
        return self.helper_module_alias
