from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, Tuple

from setta.code_gen.python.ast_utils import find_undefined_special_var_expressions
from setta.code_gen.utils import (
    SELF_IDENTIFIER,
    create_unique_name,
    sanitize_name,
)
from setta.project_state.project_state import (
    EVEntry,
    ParameterPassingStyle,
    ProjectState,
)
from setta.utils.utils import replace_at_positions

from ..utils.constants import C

GraphKeyType = Tuple[str, str | None]


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
    value: str
    passing_style: ParameterPassingStyle

    @property
    def has_name_and_value(self):
        return self.name and self.value is not None and self.value != ""


class DependencyGraph:
    def __init__(self, p: ProjectState, projectConfigId: str):
        self.section_types_to_process = set(
            [
                C.SECTION,
                C.LIST_ROOT,
                C.DICT_ROOT,
                C.GROUP,
                C.GLOBAL_VARIABLES,
                C.TEXT_BLOCK,
            ]
        )
        self.construct_graph(p, projectConfigId)

    def reset(self):
        self.graph: dict[GraphKeyType, Node] = {}
        self.full_path_name_to_graph_key: dict[str, GraphKeyType] = {}
        self.nodes_with_potential_refs: dict[GraphKeyType, dict[str, int]] = {}
        self.all_sections_in_project_config: set[str] = set()

    def construct_graph(self, p: ProjectState, projectConfigId: str):
        self.reset()
        ids = list(p.projectConfigs[projectConfigId].children.keys())
        self.export_sections(p, ids, isTopLevel=True)
        self.resolve_references()

    def export_sections(
        self, p: ProjectState, ids: list[str], isTopLevel=False, parent_node=None
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
        p: ProjectState,
        id: str,
        isTopLevel=False,
        parent_node: Optional[Node] = None,
        idx: Optional[int] = None,
    ):
        graph_key = self.create_graph_key(id)
        section = self.get_node(graph_key)
        if not section:
            type = p.get_section_type(id)
            name = p.sections[id].name
            full_path_name = self.create_full_path_name(parent_node, idx, name)
            if type == C.SECTION:
                value, potential_refs = self.export_section_value(p, id)
                if potential_refs:
                    self.nodes_with_potential_refs[graph_key] = potential_refs
                node = SectionNode(
                    id=id,
                    name=name,
                    full_path_name=full_path_name,
                    type=type,
                    isTopLevel=isTopLevel,
                    value=value,
                    deps={},
                )
                node.deps = self.export_section_params(p, id, parent_node=node)
                self.add_to_graph(graph_key, node)
            elif type in [C.LIST_ROOT, C.DICT_ROOT, C.GROUP]:
                children = [
                    c
                    for c in p.get_section_children(id)
                    if p.get_section_type(c) in self.section_types_to_process
                ]
                node = SectionNode(
                    id=id,
                    name=name,
                    full_path_name=full_path_name,
                    type=type,
                    isTopLevel=isTopLevel,
                    value=None,
                    deps={},
                )
                node.deps = self.export_sections(p, children, parent_node=node)
                self.add_to_graph(graph_key, node)
            elif type == C.GLOBAL_VARIABLES:
                self.export_section_params(p, id, isTopLevel=True)
            # elif type == C.TEXT_BLOCK:
            #     variant = get_selected_section_variant(p, id)
            #     info["value"] = variant["description"]
            #     info["dependencies"] = []
            #     self.output[output_key] = info
            # else:
            #     raise ValueError
        self.all_sections_in_project_config.add(id)
        return graph_key

    def export_section_value(self, p: ProjectState, sectionId: str):
        selected_item = p.get_selected_item(sectionId)
        if selected_item:
            selected_item_name = selected_item.name
            potential_refs = find_undefined_special_var_expressions(
                selected_item_name, SELF_IDENTIFIER, keep_attr_only=True
            )
            return selected_item_name, potential_refs
        return None, None

    def export_section_params(
        self,
        p: ProjectState,
        sectionId: str,
        parent_node: Optional[Node] = None,
        isTopLevel=False,
    ):
        paramIds = p.get_top_level_param_ids(sectionId)
        return self.export_params(
            p, sectionId, paramIds, parent_node=parent_node, isTopLevel=isTopLevel
        )

    def export_params(
        self,
        p: ProjectState,
        sectionId: str,
        paramIds: list[str],
        parent_node: Optional[Node] = None,
        isTopLevel=False,
    ):
        output_deps = {}
        for idx, pid in enumerate(paramIds):
            graph_key = self.create_graph_key(sectionId, pid)
            param = self.get_node(graph_key)
            if not param:
                codeInfo = p.codeInfo[pid]
                param_children = p.get_section_code_info_children(sectionId).get(
                    pid, []
                )
                if len(param_children) > 0:
                    type = C.NESTED_PARAM
                else:
                    type = p.get_param_ui_type(sectionId, pid)
                name = codeInfo.name
                full_path_name = self.create_full_path_name(parent_node, idx, name)
                value, potential_refs = self.export_param_value(p, sectionId, pid)
                if potential_refs:
                    self.nodes_with_potential_refs[graph_key] = potential_refs
                param = ParamNode(
                    id=pid,
                    name=name,
                    full_path_name=full_path_name,
                    type=type,
                    isTopLevel=isTopLevel,
                    value=value,
                    passing_style=codeInfo.passingStyle,
                    deps={},
                )
                param.deps = self.export_params(
                    p, sectionId, param_children, parent_node=param
                )
                self.add_to_graph(graph_key, param)
            output_deps[graph_key] = param.has_name_and_value
        return output_deps

    def export_param_value(self, p: ProjectState, sectionId: str, paramId: str):
        variant = p.get_selected_section_variant(sectionId)
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
        self, parent_node: Optional[Node], idx: Optional[int], name: str
    ):
        if not parent_node:
            return sanitize_name(name)
        if parent_node.type == C.LIST_ROOT:
            return f"{parent_node.full_path_name}__{idx}"
        elif (
            parent_node.type == C.SECTION
            or parent_node.type == C.DICT_ROOT
            or parent_node.type == C.GROUP
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

    def create_graph_key(self, section_id: str, param_info_id: Optional[str] = None):
        return (section_id, param_info_id)

    @staticmethod
    def extract_ids_from_graph_key(graph_key):
        return {"sectionId": graph_key[0], "paramInfoId": graph_key[1]}
