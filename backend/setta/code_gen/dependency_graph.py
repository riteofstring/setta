from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass, replace

from setta.code_gen.dependency_value import DependencyValue, DependencyValueKind
from setta.code_gen.python.ast_utils import find_undefined_special_var_expressions
from setta.code_gen.utils import (
    SELF_IDENTIFIER,
    create_unique_name,
    sanitize_name,
)
from setta.types.code_obj_impls import (
    BaseChildlessCodeObjImpl,
    BaseParamCodeObjImpl,
    BaseParentCodeObjImpl,
    CodeObjType,
    ParameterPassingStyle,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl,
)
from setta.types.helpers_lvl2 import (
    get_curr_section_callable_code_obj,
    get_curr_top_level_param_ids,
)
from setta.types.project_state import (
    ProjectStateSingleConfig,
)
from setta.types.section_impls import (
    BaseSectionImpl,
    BaseParentSectionImpl,
    SectionType,
    TextBlockSectionImpl,
    DrawSectionImpl,
)
from setta.utils.utils import replace_at_positions

GraphKeyType = tuple[str, str | None]


@dataclass
class Node(ABC):
    id: str
    name: str
    full_path_name: str
    type: str
    isTopLevel: bool
    deps: dict
    value: DependencyValue | None

    @property
    @abstractmethod
    def has_name_and_value(self) -> bool:
        pass


@dataclass
class SectionNode(Node):
    @property
    def has_name_and_value(self) -> bool:
        return True


@dataclass
class ParamNode(Node):
    passing_style: ParameterPassingStyle

    @property
    def has_name_and_value(self):
        if not self.name:
            return False
        if self.value is None:
            return False
        return self.value.payload != ""


@dataclass
class GraphKeySeparated:
    sectionId: str
    paramInfoId: str | None


@dataclass
class RenameReferenceChangedValue:
    sectionId: str
    paramInfoId: str | None
    newValue: str


@dataclass(frozen=True)
class SectionExportContext:
    project_state: ProjectStateSingleConfig
    section_id: str
    section_name: str
    section_impl: BaseSectionImpl
    full_path_name: str
    is_top_level: bool
    parent_node: Node | None
    idx: int | None
    graph_key: GraphKeyType


SectionExporter = Callable[[SectionExportContext], None]


class DependencyGraph:
    def __init__(self, p: ProjectStateSingleConfig):
        self.section_exporters: dict[SectionType, SectionExporter] = {
            SectionType.Callable: self._export_callable_section,
            SectionType.Dict: self._export_dict_section,
            SectionType.DictRoot: self._export_parent_section,
            SectionType.ListRoot: self._export_parent_section,
            SectionType.Group: self._export_parent_section,
            SectionType.GlobalVariables: self._export_global_variables_section,
            SectionType.TextBlock: self._export_text_block_section,
            SectionType.Draw: self._export_draw_section,
        }
        self.construct_graph(p)

    def reset(self):
        self.graph: dict[GraphKeyType, Node] = {}
        self.full_path_name_to_graph_key: dict[str, GraphKeyType] = {}
        self.nodes_with_potential_refs: dict[GraphKeyType, dict[str, int]] = {}

    def construct_graph(self, p: ProjectStateSingleConfig):
        self.reset()
        ids = list(p.projectConfig.topLevelSections.keys())
        self.export_sections(p, ids, isTopLevel=True)
        self.resolve_references()

    def export_sections(
        self,
        p: ProjectStateSingleConfig,
        ids: list[str],
        isTopLevel=False,
        parent_node=None,
    ):
        deps = {}
        for idx, x in enumerate(ids):
            graph_key = self.export_section(p, x, isTopLevel, parent_node, idx)
            node = self.get_node(graph_key)
            if node:
                deps[graph_key] = node.has_name_and_value
        return deps

    def export_section(
        self,
        p: ProjectStateSingleConfig,
        id: str,
        isTopLevel=False,
        parent_node: Node | None = None,
        idx: int | None = None,
    ):
        graph_key = self.create_graph_key(id)
        section_node = self.get_node(graph_key)
        if not section_node:
            sectionImpl = get_curr_effective_section_impl(p, id)
            exporter = self.section_exporters.get(sectionImpl.type)
            if not exporter:
                return graph_key
            name = p.sections[id].name
            full_path_name = self.create_full_path_name(parent_node, idx, name)
            ctx = SectionExportContext(
                project_state=p,
                section_id=id,
                section_name=name,
                section_impl=sectionImpl,
                full_path_name=full_path_name,
                is_top_level=isTopLevel,
                parent_node=parent_node,
                idx=idx,
                graph_key=graph_key,
            )
            exporter(ctx)
        return graph_key

    def _export_callable_section(self, ctx: SectionExportContext):
        value, potential_refs = self.export_section_callable(
            ctx.project_state, ctx.section_id
        )
        if potential_refs:
            self.nodes_with_potential_refs[ctx.graph_key] = potential_refs
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=ctx.section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=DependencyValue.literal(value) if value is not None else None,
            deps={},
        )
        node.deps = self.export_section_params(
            ctx.project_state, ctx.section_id, parent_node=node
        )
        self.add_to_graph(ctx.graph_key, node)

    def _export_parent_section(self, ctx: SectionExportContext):
        section_impl = ctx.section_impl
        if not isinstance(section_impl, BaseParentSectionImpl):
            return
        children: list[str] = []
        for child_id in section_impl.children:
            child_impl = get_curr_effective_section_impl(ctx.project_state, child_id)
            if child_impl.type in self.section_exporters:
                children.append(child_id)
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=None,
            deps={},
        )
        node.deps = self.export_sections(
            ctx.project_state, children, parent_node=node
        )
        self.add_to_graph(ctx.graph_key, node)

    def _export_dict_section(self, ctx: SectionExportContext):
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=ctx.section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=None,
            deps={},
        )
        node.deps = self.export_section_params(
            ctx.project_state, ctx.section_id, parent_node=node
        )
        self.add_to_graph(ctx.graph_key, node)

    def _export_global_variables_section(self, ctx: SectionExportContext):
        self.export_section_params(
            ctx.project_state, ctx.section_id, isTopLevel=True
        )

    def _export_text_block_section(self, ctx: SectionExportContext):
        section_impl = ctx.section_impl
        if not isinstance(section_impl, TextBlockSectionImpl):
            return
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=DependencyValue.literal(section_impl.text),
            deps={},
        )
        self.add_to_graph(ctx.graph_key, node)

    def _export_draw_section(self, ctx: SectionExportContext):
        section_impl = ctx.section_impl
        if not isinstance(section_impl, DrawSectionImpl):
            return
        rendered_value = section_impl.renderedValue
        payload = rendered_value if isinstance(rendered_value, str) else ""
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=DependencyValue.literal(payload),
            deps={},
        )
        self.add_to_graph(ctx.graph_key, node)

    def export_section_callable(self, p: ProjectStateSingleConfig, sectionId: str):
        callable = get_curr_section_callable_code_obj(p, sectionId)
        if callable:
            potential_refs = find_undefined_special_var_expressions(
                callable.name, SELF_IDENTIFIER, keep_attr_only=True
            )
            return callable.name, potential_refs
        return None, None

    def export_section_params(
        self,
        p: ProjectStateSingleConfig,
        sectionId: str,
        parent_node: Node | None = None,
        isTopLevel=False,
    ):
        paramIds = get_curr_top_level_param_ids(p, sectionId)
        return self.export_params(
            p,
            sectionId,
            paramIds,
            parent_node=parent_node,
            isTopLevel=isTopLevel,
        )

    def export_params(
        self,
        p: ProjectStateSingleConfig,
        sectionId: str,
        paramIds: list[str],
        parent_node: Node | None = None,
        isTopLevel=False,
    ):
        output_deps = {}
        for idx, pid in enumerate(paramIds):
            graph_key = self.create_graph_key(sectionId, pid)
            param_node = self.get_node(graph_key)
            if not param_node:
                code_obj_impl = get_curr_effective_code_obj_impl_with_type_guard(
                    p, sectionId, pid, BaseParamCodeObjImpl
                )
                name = p.codeObjs[pid].name
                raw_value = ""
                if isinstance(code_obj_impl, BaseChildlessCodeObjImpl):
                    raw_value = code_obj_impl.value
                full_path_name = self.create_full_path_name(parent_node, idx, name)
                potential_refs = find_undefined_special_var_expressions(
                    raw_value, SELF_IDENTIFIER, keep_attr_only=True
                )
                if potential_refs:
                    self.nodes_with_potential_refs[graph_key] = potential_refs
                param_node = ParamNode(
                    id=pid,
                    name=name,
                    full_path_name=full_path_name,
                    type=code_obj_impl.type,
                    isTopLevel=isTopLevel,
                    value=DependencyValue.literal(raw_value)
                    if isinstance(code_obj_impl, BaseChildlessCodeObjImpl)
                    else None,
                    passing_style=code_obj_impl.passingStyle,
                    deps={},
                )
                if isinstance(code_obj_impl, BaseParentCodeObjImpl):
                    param_node.deps = self.export_params(
                        p, sectionId, code_obj_impl.children, parent_node=param_node
                    )
                self.add_to_graph(graph_key, param_node)
            output_deps[graph_key] = param_node.has_name_and_value
        return output_deps

    def add_to_graph(self, graph_key, node: Node):
        self.graph[graph_key] = node
        self.full_path_name_to_graph_key[node.full_path_name] = graph_key

    def change_value(self, graph_key, value):
        node = self.graph[graph_key]
        node.value = self._coerce_dependency_value(value)
        is_used = node.has_name_and_value
        for other_node in self.graph.values():
            if graph_key in other_node.deps:
                other_node.deps[graph_key] = is_used

    def get_node(self, graph_key):
        return self.graph.get(graph_key)

    def create_full_path_name(
        self, parent_node: Node | None, idx: int | None, name: str
    ):
        if not parent_node:
            return sanitize_name(name)
        if parent_node.type == SectionType.ListRoot:
            return f"{parent_node.full_path_name}__{idx}"
        elif (
            parent_node.type == SectionType.Callable
            or parent_node.type == SectionType.DictRoot
            or parent_node.type == SectionType.Group
            or parent_node.type == SectionType.Dict
            or parent_node.type == CodeObjType.NestedParam
        ):
            return create_unique_name(
                f"{parent_node.full_path_name}__{sanitize_name(name)}",
                self.full_path_name_to_graph_key,
            )

        return sanitize_name(name)

    def resolve_references(self):
        """Resolve all potential references and update dependencies."""
        for graph_key, potential_refs in self.nodes_with_potential_refs.items():
            node = self.graph[graph_key]
            if node.value is None or node.value.kind is not DependencyValueKind.LITERAL:
                continue
            for ref in potential_refs.keys():
                if ref in self.full_path_name_to_graph_key:
                    # Found a reference, add it to dependencies if not already there
                    target_key = self.full_path_name_to_graph_key[ref]
                    target_node = self.graph[target_key]
                    node.deps[target_key] = target_node.has_name_and_value

    # compares with "previous" dep graph to find nodes that have been renamed
    # and then changes the values of nodes that contain those old names
    def rename_references(
        self, old_dep_graph: "DependencyGraph"
    ) -> list[RenameReferenceChangedValue]:
        renamings: dict[GraphKeyType, tuple[str, str]] = {}
        for k, v in old_dep_graph.graph.items():
            node = self.get_node(k)
            if not node:
                continue
            if v.full_path_name != node.full_path_name:
                renamings[k] = (v.full_path_name, node.full_path_name)

        changed_node_values: list[RenameReferenceChangedValue] = []
        for k, v in self.nodes_with_potential_refs.items():
            replacements = []
            for ref, location in v.items():
                graph_key = old_dep_graph.full_path_name_to_graph_key.get(ref)
                if not graph_key:
                    continue
                details = renamings.get(graph_key)
                if details:
                    old_name, new_name = details
                    replacements.append((location, old_name, new_name))
            if replacements:
                node = self.get_node(k)
                if not node:
                    continue
                literal_value = node.value
                if (
                    literal_value is None
                    or literal_value.kind is not DependencyValueKind.LITERAL
                ):
                    continue
                new_payload, positions = replace_at_positions(
                    literal_value.payload, replacements, return_positions=True
                )
                node.value = replace(
                    literal_value,
                    payload=new_payload,
                )
                self.nodes_with_potential_refs[k] = {
                    name: position for position, name in positions
                }
                ids = self.extract_ids_from_graph_key(k)
                changed_node_values.append(
                    RenameReferenceChangedValue(
                        sectionId=ids.sectionId,
                        paramInfoId=ids.paramInfoId,
                        newValue=node.value.payload if node.value else "",
                    )
                )

        self.resolve_references()
        return changed_node_values

    def create_graph_key(self, section_id: str, param_info_id: str | None = None):
        return (section_id, param_info_id)

    def extract_ids_from_graph_key(self, graph_key: GraphKeyType) -> GraphKeySeparated:
        return GraphKeySeparated(sectionId=graph_key[0], paramInfoId=graph_key[1])

    def _coerce_dependency_value(
        self, value: DependencyValue | str | None
    ) -> DependencyValue | None:
        if value is None:
            return None
        if isinstance(value, DependencyValue):
            return value
        return DependencyValue.literal(value)
