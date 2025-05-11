import copy
from dataclasses import dataclass
from typing import Tuple

from setta.code_gen.utils import (
    get_code_info_children,
    get_param_ui_type,
    get_section_children,
    get_section_name,
    get_section_type,
    get_selected_item_name,
    get_selected_section_variant,
    get_top_level_param_ids,
    is_valid_value,
    sanitize_name,
)
from setta.database.db.sectionVariants.utils import new_ev_entry
from setta.utils.utils import replace_null_keys_with_none

from ..utils.constants import C, ParameterPassingStyle


class DependencyGraph:
    def __init__(self, p):
        self.graph: dict[Tuple[str, str | None], Node] = {}
        self.p = copy.deepcopy(p)
        self.p["codeInfoCols"] = replace_null_keys_with_none(self.p["codeInfoCols"])
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
        self.export_sections(
            list(self.p["projectConfig"]["children"].keys()), isTopLevel=True
        )

    def export_sections(self, ids, isTopLevel=False, parent_node=None):
        return [
            self.export_section(x, isTopLevel, parent_node, idx)
            for idx, x in enumerate(ids)
        ]

    def export_section(self, id, isTopLevel=False, parent_node=None, idx=None):
        graph_key = self.create_graph_key(id)
        section = self.get_node(graph_key)
        if not section:
            type = get_section_type(self.p, id)
            name = get_section_name(self.p, id)
            full_path_name = self.create_full_path_name(parent_node, idx, name)
            if type == C.SECTION:
                node = SectionNode(
                    id=id,
                    name=name,
                    full_path_name=full_path_name,
                    type=type,
                    isTopLevel=isTopLevel,
                    callable=get_selected_item_name(self.p, id),
                    deps=[],
                )
                node.deps = self.export_section_params(id, parent_node=node)
                self.add_to_graph(graph_key, node)
            elif type in [C.LIST_ROOT, C.DICT_ROOT, C.GROUP]:
                children = [
                    c
                    for c in get_section_children(self.p, id)
                    if get_section_type(self.p, c) in self.section_types_to_process
                ]
                node = SectionNode(
                    id=id,
                    name=name,
                    full_path_name=full_path_name,
                    type=type,
                    isTopLevel=isTopLevel,
                    callable=None,
                    deps=[],
                )
                node.deps = self.export_sections(children, parent_node=node)
                self.add_to_graph(graph_key, node)
            # elif type == C.GLOBAL_VARIABLES:
            #     self.export_section_params(id)
            # elif type == C.TEXT_BLOCK:
            #     variant = get_selected_section_variant(self.p, id)
            #     info["value"] = variant["description"]
            #     info["dependencies"] = []
            #     self.output[output_key] = info
            # else:
            #     raise ValueError
        return graph_key

    def export_section_params(self, sectionId, parent_node=None):
        paramIds = get_top_level_param_ids(self.p, sectionId)
        return self.export_params(sectionId, paramIds, parent_node=parent_node)

    def export_params(self, sectionId, paramIds, parent_node=None):
        output_node_keys = []
        for idx, pid in enumerate(paramIds):
            graph_key = self.create_graph_key(sectionId, pid)
            param = self.get_node(graph_key)
            if not param:
                codeInfo = self.p["codeInfo"][pid]
                param_children = get_code_info_children(self.p, sectionId, pid)
                if len(param_children) > 0:
                    type = C.NESTED_PARAM
                else:
                    type = get_param_ui_type(self.p, sectionId, pid)
                name = codeInfo["name"]
                full_path_name = self.create_full_path_name(parent_node, idx, name)
                param = ParamNode(
                    id=pid,
                    name=name,
                    full_path_name=full_path_name,
                    type=type,
                    isTopLevel=False,
                    value=self.export_param_value(sectionId, pid),
                    passing_style=codeInfo["passingStyle"],
                    deps=[],
                )
                param.deps = self.export_params(
                    sectionId, param_children, parent_node=param
                )
                self.add_to_graph(graph_key, param)
            if param.has_name_and_value:
                output_node_keys.append(graph_key)
        return output_node_keys

    def export_param_value(self, sectionId, paramId):
        variant = get_selected_section_variant(self.p, sectionId)
        if paramId in variant["values"]:
            value = variant["values"][paramId]["value"]
        else:
            value = new_ev_entry()["value"]
        return value

    def create_graph_key(self, section_id, param_info_id=None):
        return (section_id, param_info_id)

    def add_to_graph(self, graph_key, obj):
        self.graph[graph_key] = obj

    def get_node(self, graph_key):
        return self.graph.get(graph_key)

    def create_full_path_name(self, parent_node, idx, name):
        if not parent_node:
            return name
        if parent_node.type == C.LIST_ROOT:
            return f"{parent_node.full_path_name}__{idx}"
        elif (
            parent_node.type == C.SECTION
            or parent_node.type == C.DICT_ROOT
            or parent_node.type == C.GROUP
            or parent_node.type == C.NESTED_PARAM
        ):
            return f"{parent_node.full_path_name}__{sanitize_name(name)}"
        return name


@dataclass
class Node:
    id: str
    name: str
    full_path_name: str
    type: str
    isTopLevel: bool


@dataclass
class SectionNode(Node):
    callable: str | None
    deps: list


@dataclass
class ParamNode(Node):
    value: str
    passing_style: ParameterPassingStyle
    deps: list
    type: str

    @property
    def has_name_and_value(self):
        return self.name and is_valid_value(self.value)
