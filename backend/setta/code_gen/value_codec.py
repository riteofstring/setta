import json
from collections.abc import Callable
from typing import assert_never

from setta.code_gen.dependency_graph import (
    DependencyGraph,
    Node,
    ParamNode,
    SectionNode,
)
from setta.code_gen.value_mode import PythonValueMode
from setta.types.code_obj_impls import CodeObjType, ParameterPassingStyle
from setta.types.dependency_value import DependencyValueType
from setta.types.dropzone import dropzone_value_to_attachments
from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.types.generated.dependency_values import BaseDependencyValueUnion
from setta.types.project_config import (
    CodeObjValueRepresentationMode,
    SectionRepresentationMode,
)
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
        collection_item_indent: str = "    ",
        collection_close_indent: str = "",
        max_inline_collection_chars: int = 88,
        multiline_collection_min_items: int = 4,
    ):
        self.dep_graph = dep_graph
        self.var_lookup = var_lookup
        self.mode = mode
        self.helper_module_alias = helper_module_alias
        self.collection_item_indent = collection_item_indent
        self.collection_close_indent = collection_close_indent
        self.max_inline_collection_chars = max_inline_collection_chars
        self.multiline_collection_min_items = multiline_collection_min_items
        self._required_imports: set[str] = set()

    def reset_usage(self) -> None:
        """Clear helper-tracking state before a new render pass."""
        self._required_imports.clear()

    @property
    def required_imports(self) -> tuple[str, ...]:
        """Sorted helper import statements this codec relied on."""
        return tuple(sorted(self._required_imports))

    def format_param_expression(self, node: ParamNode) -> str:
        if node.type is CodeObjType.PasswordParam:
            return self._format_password_value(node.id)
        param_type = node.type
        literal_value = self._expect_literal(node)
        return self.format_param_value(
            param_type,
            literal_value,
            node.deps,
            node.value_representation,
        )

    def format_dict(self, deps: dict[BaseDependencyKeyUnion, bool]) -> str:
        parts: list[str] = []
        for dep_key, is_used in deps.items():
            if not is_used:
                continue
            node = self.dep_graph.graph[dep_key]
            if not self._node_in_codegen(node):
                continue
            parts.append(f"{repr(node.name)}: {self.var_lookup(dep_key)}")
        return self._format_collection("{", "}", parts)

    def format_list(self, deps: dict[BaseDependencyKeyUnion, bool]) -> str:
        items = []
        for dep_key, is_used in deps.items():
            if not is_used:
                continue
            node = self.dep_graph.graph[dep_key]
            if not self._node_in_codegen(node):
                continue
            items.append(self.var_lookup(dep_key))
        return self._format_collection("[", "]", items)

    def _format_collection(
        self,
        open_bracket: str,
        close_bracket: str,
        items: list[str],
    ) -> str:
        if not items:
            return f"{open_bracket}{close_bracket}"
        joined = ", ".join(items)
        inline = f"{open_bracket}{joined}{close_bracket}"
        if not self._should_multiline_collection(items, inline):
            return inline
        item_indent = self.collection_item_indent
        close_indent = self.collection_close_indent
        lines = [f"{item_indent}{item}," for item in items]
        return (
            f"{open_bracket}\n" + "\n".join(lines) + f"\n{close_indent}{close_bracket}"
        )

    def _should_multiline_collection(self, items: list[str], inline: str) -> bool:
        if any("\n" in item for item in items):
            return True
        if len(items) >= self.multiline_collection_min_items:
            return True
        return len(inline) > self.max_inline_collection_chars

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
            case SectionType.Prompt:
                if node.value:
                    return repr(node.value.payload)
                return "None"
            case SectionType.Chat:
                if not node.value:
                    raise ValueError(
                        f"Chat section {node.full_path_name} missing value."
                    )
                representation = node.representation
                if representation is SectionRepresentationMode.expression:
                    if node.value.type is not DependencyValueType.Literal:
                        raise ValueError(
                            f"Chat section {node.full_path_name} expected literal expression payload."
                        )
                    return node.value.payload
                if representation is SectionRepresentationMode.file_path:
                    if node.value.type is not DependencyValueType.Literal:
                        raise ValueError(
                            f"Chat section {node.full_path_name} expected literal file path payload."
                        )
                    return repr(node.value.payload)
                if representation is SectionRepresentationMode.file_read:
                    return self.format_dependency_value(node.value)
                raise ValueError(
                    f"Unsupported representation {representation} for Chat section {node.full_path_name}"
                )
            case SectionType.Image:
                if not node.value:
                    raise ValueError(
                        f"Image section {node.full_path_name} missing value."
                    )
                representation = node.representation
                if representation is SectionRepresentationMode.expression:
                    if node.value.type is not DependencyValueType.Literal:
                        raise ValueError(
                            f"Image section {node.full_path_name} expected literal expression payload."
                        )
                    return node.value.payload
                if representation is SectionRepresentationMode.file_path:
                    if node.value.type is not DependencyValueType.Literal:
                        raise ValueError(
                            f"Image section {node.full_path_name} expected literal file path payload."
                        )
                    return repr(node.value.payload)
                if representation is SectionRepresentationMode.file_read:
                    return self.format_dependency_value(node.value)
                raise ValueError(
                    f"Unsupported representation {representation} for Image section {node.full_path_name}"
                )
            case SectionType.Draw:
                if not node.value:
                    raise ValueError(
                        f"Draw section {node.full_path_name} missing value."
                    )
                representation = node.representation
                if representation is SectionRepresentationMode.expression:
                    if node.value.type is not DependencyValueType.Literal:
                        raise ValueError(
                            f"Draw section {node.full_path_name} expected literal expression payload."
                        )
                    return node.value.payload
                if representation is SectionRepresentationMode.file_path:
                    if node.value.type is not DependencyValueType.Literal:
                        raise ValueError(
                            f"Draw section {node.full_path_name} expected literal file path payload."
                        )
                    return repr(node.value.payload)
                if representation is SectionRepresentationMode.file_read:
                    return self.format_dependency_value(node.value)
                raise ValueError(
                    f"Unsupported representation {representation} for Draw section {node.full_path_name}"
                )
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
        if control_type is CodeObjType.PasswordParam:
            if node.control_code_obj_id is None:
                raise ValueError(
                    f"Missing control code obj id for {node.full_path_name}"
                )
            return self._format_password_value(node.control_code_obj_id)
        literal_value = node.value.payload
        representation = (
            node.control_value_representation
            or CodeObjValueRepresentationMode.expression
        )
        return self.format_param_value(
            control_type,
            literal_value,
            None,
            representation,
        )

    def format_param_value(
        self,
        param_type: CodeObjType,
        literal_value: str,
        deps: dict[BaseDependencyKeyUnion, bool] | None,
        representation: CodeObjValueRepresentationMode,
    ) -> str:
        if param_type == CodeObjType.DropzoneParam:
            return self._format_dropzone_value(literal_value, representation)
        if representation is CodeObjValueRepresentationMode.string:
            return repr(literal_value)
        if representation is CodeObjValueRepresentationMode.json_parsed:
            parsed = self._parse_json_value(literal_value)
            if parsed is None:
                return repr(literal_value)
            return repr(parsed)
        if representation is CodeObjValueRepresentationMode.expression:
            return self._format_param_literal(param_type, literal_value, deps)
        raise ValueError(
            f"Unsupported representation {representation} for code obj type {param_type}"
        )

    def _format_param_literal(
        self,
        param_type: CodeObjType,
        literal_value: str,
        deps: dict[BaseDependencyKeyUnion, bool] | None = None,
    ) -> str:
        if param_type in (
            CodeObjType.CodeParam,
            CodeObjType.SliderParam,
            CodeObjType.RotaryParam,
            CodeObjType.DropdownParam,
        ):
            return literal_value

        if param_type in (
            CodeObjType.TextParam,
            CodeObjType.TextAreaParam,
            CodeObjType.PasswordParam,
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

    def _parse_json_value(self, literal_value: str) -> object | None:
        try:
            return json.loads(literal_value)
        except json.JSONDecodeError:
            return None

    def _format_dropzone_value(
        self,
        literal_value: str,
        representation: CodeObjValueRepresentationMode,
    ) -> str:
        if representation is CodeObjValueRepresentationMode.file_path:
            return self._format_dropzone_entries(literal_value, read_files=False)
        if representation is CodeObjValueRepresentationMode.file_read:
            return self._format_dropzone_entries(literal_value, read_files=True)
        raise ValueError(
            f"Unsupported representation for DropzoneParam: {representation.value}"
        )

    def _format_dropzone_entries(
        self,
        literal_value: str,
        *,
        read_files: bool,
    ) -> str:
        if literal_value == "":
            return "[]"
        attachments = dropzone_value_to_attachments(literal_value)
        if attachments is None:
            return repr(literal_value)
        items: list[str] = []
        for attachment in attachments:
            if not isinstance(attachment, dict):
                items.append(repr(attachment))
                continue
            kind = attachment.get("kind")
            if kind == "file":
                path = attachment.get("id")
                if isinstance(path, str):
                    if read_files:
                        items.append(self._format_file_read_value(path))
                    else:
                        items.append(repr(path))
                    continue
            if kind == "text":
                text = attachment.get("text")
                if isinstance(text, str):
                    items.append(repr(text))
                    continue
            items.append(repr(attachment))
        return self._format_collection("[", "]", items)

    def _construct_callable(
        self, callable_name: str, deps: dict[BaseDependencyKeyUnion, bool]
    ) -> str:
        items: list[str] = []
        for dep_key, is_used in deps.items():
            if not is_used:
                continue
            node = self.dep_graph.graph[dep_key]
            if not self._node_in_codegen(node):
                continue
            if not isinstance(node, ParamNode):
                continue
            var_name = self.var_lookup(dep_key)
            passing_style = node.passing_style
            if passing_style == ParameterPassingStyle.ARGS:
                items.append(f"*{var_name}")
            elif passing_style == ParameterPassingStyle.KWARGS:
                items.append(f"**{var_name}")
            elif passing_style in (
                ParameterPassingStyle.DEFAULT,
                ParameterPassingStyle.KEYWORD_ONLY,
            ):
                items.append(f"{node.name}={var_name}")
            else:
                items.append(var_name)

        return self._format_collection(f"{callable_name}(", ")", items)

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

    def _format_password_value(self, code_obj_id: str) -> str:
        helper_alias = self._require_value_helpers()
        return f"{helper_alias}.read_password_value({repr(str(code_obj_id))})"

    def _node_in_codegen(self, node: Node) -> bool:
        return getattr(node, "include_in_codegen", True)

    def _require_value_helpers(self) -> str:
        import_stmt = (
            "from setta.code_gen.python import value_helpers as "
            f"{self.helper_module_alias}"
        )
        self._required_imports.add(import_stmt)
        return self.helper_module_alias
