import logging
from dataclasses import dataclass

from setta.code_gen.dependency_graph import (
    DependencyGraph,
    Node,
    ParamNode,
    SectionNode,
)
from setta.code_gen.utils import (
    CLASS_DEF,
    GEN_CODE_INSTANCE_NAME,
)
from setta.code_gen.value_codec import PythonValueCodec
from setta.code_gen.value_mode import PythonValueMode
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.utils.constants import C

logger = logging.getLogger(__name__)
GEN_CODE_SEPARATOR = "\n" * C.GEN_CODE_SEPARATOR_NEWLINES
GEN_CODE_BODY_INDENT = "        "
GEN_CODE_MULTILINE_CONTINUATION_INDENT = f"{GEN_CODE_BODY_INDENT}    "


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
        self,
        dep_graph: DependencyGraph,
        gen_code_prefix: str,
        gen_code_suffix: str,
        *,
        value_mode: PythonValueMode = PythonValueMode.PACKAGED_RUNTIME,
    ):
        self.dep_graph = dep_graph
        self.gen_code_prefix = gen_code_prefix
        self.gen_code_suffix = gen_code_suffix
        self.value_mode = value_mode
        self.value_codec = PythonValueCodec(
            self.dep_graph,
            self._lookup_var_name,
            mode=value_mode,
            collection_item_indent=GEN_CODE_MULTILINE_CONTINUATION_INDENT,
            collection_close_indent=GEN_CODE_BODY_INDENT,
        )
        self.reset()

    def reset(self):
        self.value_codec.reset_usage()
        self.var_name_mapping: dict[
            BaseDependencyKeyUnion, str
        ] = {}  # dep_key to var name
        self.reverse_var_name_mapping: dict[
            str, BaseDependencyKeyUnion
        ] = {}  # var name to dep_key
        self.value_pos_start_to_dep_key: dict[int, BaseDependencyKeyUnion] = {}
        self.generated_code: str = ""
        self.code: str = ""
        self.lines: dict[BaseDependencyKeyUnion, PythonCodeLine] = {}

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
            logger.warning(
                "Found %d dependency cycles during code generation",
                len(cycles_detected),
            )
            logger.debug("Dependency cycles: %s", cycles_detected)

        # Store only the generated body separately; full code is prefix + body + suffix.
        prefix_offset = len(self.gen_code_prefix) + len(GEN_CODE_SEPARATOR)
        self.generated_code = self.generate_wrapper_class(prefix_offset)
        # Persist blank separator lines between prefix/body/suffix.
        self.code = f"{self.gen_code_prefix}{GEN_CODE_SEPARATOR}{self.generated_code}{GEN_CODE_SEPARATOR}{self.gen_code_suffix}"
        # Position offset accounts for prefix + separator newlines.
        return prefix_offset + len(self.generated_code) + len(GEN_CODE_SEPARATOR)

    def _process_node_and_deps(self, dep_key, node, processed_nodes, path=None):
        """Process a node and its dependencies, recording any cycles found."""
        if dep_key in processed_nodes:
            return []  # Already processed, no cycle

        # Initialize the path if this is the top-level call
        if path is None:
            path = []

        # Check if we've encountered this node before in current path
        if dep_key in path:
            # Cycle detected! Extract the full cycle as dependency keys
            cycle_start = path.index(dep_key)
            cycle = path[cycle_start:] + [dep_key]
            return [cycle]

        # Add current node to path
        path.append(dep_key)

        cycles = []
        # Process dependencies first
        for child_dep_key, is_used in node.deps.items():
            if not is_used:
                continue
            if child_dep_key not in processed_nodes:
                dep_node = self.dep_graph.graph[child_dep_key]
                cycles.extend(
                    self._process_node_and_deps(
                        child_dep_key, dep_node, processed_nodes, path
                    )
                )

        # Now process this node
        self.create_line(dep_key, node)

        # Mark as processed and remove from path
        processed_nodes.add(dep_key)
        path.pop()

        return cycles  # Return all cycles found

    def generate_wrapper_class(self, position_offset: int):
        code = CLASS_DEF
        helper_block = self._helper_import_block()
        if helper_block:
            code = f"{helper_block}\n{code}"
        indent = GEN_CODE_BODY_INDENT
        indent_len = len(indent)

        # no sections or params? Then just pass.
        if len(self.lines) == 0:
            return f"{code}{indent}pass"

        lines = list(self.lines.items())
        last_index = len(lines) - 1
        for i, (key, l) in enumerate(lines):
            curr_pos = position_offset + len(code) + indent_len
            line_str = f"{indent}{l.var_str}"
            code = f"{code}{line_str}"
            if i < last_index:
                code = f"{code}\n"
            self.lines[key].pos = curr_pos
            value_pos_start = self.lines[key].value_pos_start
            if value_pos_start is not None:
                self.value_pos_start_to_dep_key[value_pos_start] = key
        return code

    def _helper_import_block(self) -> str | None:
        helper_imports = self.value_codec.required_imports
        if not helper_imports:
            return None
        return "\n".join(helper_imports)

    def create_line(self, dep_key, node: Node):
        value = self.get_value(node)
        if not value:
            return
        if self._should_wrap_multiline(node) and "\n" in value:
            value = self._wrap_multiline_expression(value)
        var_name = self.create_var_name(dep_key, node)
        prefix = f"{var_name} = "
        final_str = f"{prefix}{value}"
        self.lines[dep_key] = PythonCodeLine(final_str, len(prefix), len(value))

    def _should_wrap_multiline(self, node: Node) -> bool:
        if isinstance(node, ParamNode):
            return node.type == CodeObjType.CodeParam
        if isinstance(node, SectionNode):
            return node.control_code_obj_type == CodeObjType.CodeParam
        return False

    def _wrap_multiline_expression(self, value: str) -> str:
        lines = value.splitlines()
        if not lines:
            return value
        indented_lines = [
            f"{GEN_CODE_MULTILINE_CONTINUATION_INDENT}{line}" for line in lines
        ]
        return "(\n" + "\n".join(indented_lines) + f"\n{GEN_CODE_BODY_INDENT})"

    def create_var_name(self, dep_key, node: Node):
        var_name = f"{GEN_CODE_INSTANCE_NAME}.{node.full_path_name}"
        self.var_name_mapping[dep_key] = var_name
        self.reverse_var_name_mapping[var_name] = dep_key
        return var_name

    def _lookup_var_name(self, dep_key: BaseDependencyKeyUnion) -> str:
        return self.var_name_mapping[dep_key]

    def get_value(self, node: Node):
        if isinstance(node, SectionNode):
            return self.value_codec.format_section(node)
        elif isinstance(node, ParamNode):
            return self.value_codec.format_param_expression(node)
        else:
            raise ValueError

    def change_value(self, dep_key, value):
        self.dep_graph.change_value(dep_key, value)
        self.generate_code()
        code_line = self.lines.get(dep_key)
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
