from abc import ABC, abstractmethod
from dataclasses import dataclass

from setta.code_gen.python.ast_utils import find_undefined_special_var_expressions
from setta.code_gen.utils import (
    SELF_IDENTIFIER,
    create_unique_name,
    sanitize_name,
)
from setta.types.code_objs import BaseParamCodeObjImpl, ParameterPassingStyle
from setta.types.helpers import (
    CodeObjAndImpl,
    SectionAndImpl,
    get_code_obj_impl,
    get_param_ui_type,
    get_section_and_impl,
    get_section_callable,
    get_section_code_info_children,
    get_section_impl,
    get_selected_item,
    get_selected_section_variant,
    get_top_level_param_ids,
    get_top_level_params,
)
from setta.types.project_state import (
    ProjectStateSingleConfig,
)
from setta.types.sections import (
    BaseSectionWithParamsImpl,
    CallableSectionImpl,
    DictRootSectionImpl,
    DictSectionImpl,
    GlobalVariablesSectionImpl,
    GroupSectionImpl,
    ListRootSectionImpl,
    SectionType,
    TextBlockSectionImpl,
)
from setta.utils.utils import replace_at_positions

from ..utils.constants import C

GraphKeyType = tuple[str, str | None]


@dataclass
class Node(ABC):
    id: str
    name: str
    full_path_name: str
    type: str
    isTopLevel: bool
    deps: dict
    value: str | None

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
    value: str  # type: ignore
    passing_style: ParameterPassingStyle

    @property
    def has_name_and_value(self):
        return bool(self.name) and self.value is not None and self.value != ""


@dataclass
class GraphKeySeparated:
    sectionId: str
    paramInfoId: str | None


class DependencyGraph:
    def __init__(self, p: ProjectStateSingleConfig):
        self.section_types_to_process = (
                CallableSectionImpl,
                DictSectionImpl,
                ListRootSectionImpl,
                DictRootSectionImpl,
                GroupSectionImpl,
                GlobalVariablesSectionImpl,
                TextBlockSectionImpl,
            
        )
        self.construct_graph(p)

    def reset(self):
        self.graph: dict[GraphKeyType, Node] = {}
        self.full_path_name_to_graph_key: dict[str, GraphKeyType] = {}
        self.nodes_with_potential_refs: dict[GraphKeyType, dict[str, int]] = {}
        self.all_sections_in_project_config: set[str] = set()

    def construct_graph(self, p: ProjectStateSingleConfig):
        self.reset()
        ids = list(p.projectConfig.topLevelSections.keys())
        sections = [get_section_and_impl(p, x) for x in ids]
        self.export_sections(p, sections, isTopLevel=True)
        self.resolve_references()

    def export_sections(
        self,
        p: ProjectStateSingleConfig,
        sections: list[SectionAndImpl],
        isTopLevel=False,
        parent_node=None,
    ):
        deps = {}
        for idx, s in enumerate(sections):
            graph_key = self.export_section(p, s, isTopLevel, parent_node, idx)
            node = self.get_node(graph_key)
            if node:
                deps[graph_key] = node.has_name_and_value
        return deps

    def export_section(
        self,
        p: ProjectStateSingleConfig,
        section: SectionAndImpl,
        isTopLevel=False,
        parent_node: Node | None = None,
        idx: int | None = None,
    ):
        graph_key = self.create_graph_key(section.core.id)
        section_node = self.get_node(graph_key)
        if not section_node:
            name = section.core.name
            full_path_name = self.create_full_path_name(parent_node, idx, name)
            if isinstance(section.impl, CallableSectionImpl):
                value, potential_refs = self.export_section_callable(p, section.impl)
                if potential_refs:
                    self.nodes_with_potential_refs[graph_key] = potential_refs
                node = SectionNode(
                    id=section.core.id,
                    name=name,
                    full_path_name=full_path_name,
                    type=section.impl.type,
                    isTopLevel=isTopLevel,
                    value=value,
                    deps={},
                )
                node.deps = self.export_section_params(
                    p, section.impl, parent_node=node
                )
                self.add_to_graph(graph_key, node)
            elif isinstance(
                section.impl,
                (
                    ListRootSectionImpl,
                    DictRootSectionImpl,
                    GroupSectionImpl,
                ),
            ):
                children: list[SectionAndImpl] = []
                for c in section.impl.children:
                    child_section = p.sections[c]
                    child_impl = get_section_impl(p, c)
                    if isinstance(child_impl, self.section_types_to_process):
                        children.append(
                            SectionAndImpl(core=child_section, impl=child_impl)
                        )

                node = SectionNode(
                    id=section.core.id,
                    name=name,
                    full_path_name=full_path_name,
                    type=section.impl.type,
                    isTopLevel=isTopLevel,
                    value=None,
                    deps={},
                )
                node.deps = self.export_sections(p, children, parent_node=node)
                self.add_to_graph(graph_key, node)
            elif isinstance(section.impl, GlobalVariablesSectionImpl):
                self.export_section_params(p, section.impl, isTopLevel=True)
            # elif type == UITypeName.TEXT_BLOCK:
            #     variant = get_selected_section_variant(p, id)
            #     info["value"] = variant["description"]
            #     info["dependencies"] = []
            #     self.output[output_key] = info
            # else:
            #     raise ValueError
        self.all_sections_in_project_config.add(section.core.id)
        return graph_key

    def export_section_callable(
        self, p: ProjectStateSingleConfig, sectionImpl: CallableSectionImpl
    ):
        callable = get_section_callable(p, sectionImpl)
        if callable:
            potential_refs = find_undefined_special_var_expressions(
                callable.core.name, SELF_IDENTIFIER, keep_attr_only=True
            )
            return callable.core.name, potential_refs
        return None, None

    def export_section_params(
        self,
        p: ProjectStateSingleConfig,
        section: SectionAndImpl,
        parent_node: Node | None = None,
        isTopLevel=False,
    ):
        if not isinstance(section.impl, BaseSectionWithParamsImpl):
            return []
        params = get_top_level_params(p, section.impl)
        return self.export_params(
            p,
            section.core.id,
            params,
            parent_node=parent_node,
            isTopLevel=isTopLevel,
        )

    def export_params(
        self,
        p: ProjectStateSingleConfig,
        sectionId: str,
        params: list[CodeObjAndImpl],
        parent_node: Node | None = None,
        isTopLevel=False,
    ):
        output_deps = {}
        for idx, param in enumerate(params):
            if not isinstance(param.impl, BaseParamCodeObjImpl):
                continue
            graph_key = self.create_graph_key(sectionId, param.core.id)
            param_node = self.get_node(graph_key)
            if not param_node:
                param_children = param.impl.children
                if len(param_children) > 0:
                    type = C.NESTED_PARAM
                else:
                    type = param.impl.type
                name = param.core.name
                full_path_name = self.create_full_path_name(parent_node, idx, name)
                value, potential_refs = self.export_param_value(p, sectionId, pid)
                if potential_refs:
                    self.nodes_with_potential_refs[graph_key] = potential_refs
                param = ParamNode(
                    id=param.core.id,
                    name=name,
                    full_path_name=full_path_name,
                    type=type,
                    isTopLevel=isTopLevel,
                    value=value,
                    passing_style=param.impl.passingStyle,
                    deps={},
                )
                param.deps = self.export_params(
                    p, sectionId, , parent_node=param
                )
                self.add_to_graph(graph_key, param)
            output_deps[graph_key] = param.has_name_and_value
        return output_deps

    def export_param_value(
        self, p: ProjectStateSingleConfig, sectionId: str, paramId: str
    ):
        variant = get_selected_section_variant(p, sectionId)
        if paramId in variant.values:
            value = variant.values[paramId].value
            potential_refs = find_undefined_special_var_expressions(
                value, SELF_IDENTIFIER, keep_attr_only=True
            )
            return value, potential_refs
        else:
            value = EVEntry().value
            return value, None

    def add_to_graph(self, graph_key, node: Node):
        self.graph[graph_key] = node
        self.full_path_name_to_graph_key[node.full_path_name] = graph_key

    def change_value(self, graph_key, value):
        node = self.graph[graph_key]
        node.value = value
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
        if parent_node.type == SectionType.LIST_ROOT:
            return f"{parent_node.full_path_name}__{idx}"
        elif (
            parent_node.type == SectionType.CALLABLE
            or parent_node.type == SectionType.DICT_ROOT
            or parent_node.type == SectionType.GROUP
            or parent_node.type == C.NESTED_PARAM
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
            for ref in potential_refs.keys():
                if ref in self.full_path_name_to_graph_key:
                    # Found a reference, add it to dependencies if not already there
                    target_key = self.full_path_name_to_graph_key[ref]
                    target_node = self.graph[target_key]
                    node.deps[target_key] = target_node.has_name_and_value

    # compares with "previous" dep graph to find nodes that have been renamed
    # and then changes the values of nodes that contain those old names
    def rename_references(self, old_dep_graph: "DependencyGraph"):
        renamings = {}
        for k, v in old_dep_graph.graph.items():
            node = self.get_node(k)
            if not node:
                continue
            if v.full_path_name != node.full_path_name:
                renamings[k] = (v.full_path_name, node.full_path_name)

        changed_node_values = {}
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
                node.value, positions = replace_at_positions(
                    node.value, replacements, return_positions=True
                )
                self.nodes_with_potential_refs[k] = {
                    name: position for position, name in positions
                }
                changed_node_values[k] = node.value

        self.resolve_references()
        return changed_node_values

    def create_graph_key(self, section_id: str, param_info_id: str | None = None):
        return (section_id, param_info_id)

    def extract_ids_from_graph_key(self, graph_key: GraphKeyType) -> GraphKeySeparated:
        return GraphKeySeparated(sectionId=graph_key[0], paramInfoId=graph_key[1])
