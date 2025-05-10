import copy

from setta.code_gen.utils import (
    get_code_info_children,
    get_param_ui_type,
    get_section_name,
    get_section_name_for_code_gen,
    get_section_type,
    get_selected_item_name,
    get_selected_section_variant,
    get_top_level_param_ids,
    value_exists,
)
from setta.database.db.sectionVariants.utils import new_ev_entry
from setta.utils.utils import replace_null_keys_with_none

from ..utils.constants import C


class DependencyGraph:
    def __init__(self, p):
        self.graph = {}
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
        self.used_var_names = set()
        self.export_sections(
            list(self.p["projectConfig"]["children"].keys()), isTopLevel=True
        )

    def export_sections(self, ids, isTopLevel=False):
        return [self.export_section(x, isTopLevel) for x in ids]

    def export_section(self, id, isTopLevel=False):
        graph_key = self.create_graph_key(id)
        section = self.get_node(graph_key)
        if not section:
            type = get_section_type(self.p, id)
            if type == C.SECTION:
                self.add_to_graph(graph_key, SectionNode(id, self, isTopLevel))
            # elif type in [C.LIST_ROOT, C.DICT_ROOT, C.GROUP]:
            #     children = get_section_children(self.p, id)
            #     children = [
            #         c
            #         for c in children
            #         if get_section_type(self.p, c) in self.section_types_to_process
            #     ]
            #     info["value"] = self.export_sections(children)
            #     info["dependencies"] = info["value"]
            #     self.output[output_key] = info
            elif type == C.GLOBAL_VARIABLES:
                export_section_params(id, self)
            # elif type == C.TEXT_BLOCK:
            #     variant = get_selected_section_variant(self.p, id)
            #     info["value"] = variant["description"]
            #     info["dependencies"] = []
            #     self.output[output_key] = info
            # else:
            #     raise ValueError
        # return output_key

    def create_graph_key(self, section_id, param_info_id=None):
        return (section_id, param_info_id)

    def add_to_graph(self, graph_key, obj):
        self.graph[graph_key] = obj

    def get_node(self, graph_key):
        return self.graph.get(graph_key)



class SectionNode:
    def __init__(self, id, dep_graph, isTopLevel):
        super().__init__()
        self.id = id
        self.name = get_section_name(dep_graph.p, self.id)
        self.var_name = self.create_var_name(dep_graph.p, dep_graph.used_var_names)
        self.isTopLevel = isTopLevel
        self.callable = get_selected_item_name(dep_graph.p, self.id)
        self.deps = export_section_params(self.id, dep_graph)

    def create_var_name(self, p, used_var_names):
        return get_section_name_for_code_gen(p, self.id, used_var_names)


class ParamNode:
    def __init__(self, sectionId, id, dep_graph: DependencyGraph):
        super().__init__()
        self.id = id
        codeInfo = dep_graph.p["codeInfo"][self.id]
        self.name = codeInfo["name"]
        self.var_name = self.create_var_name(dep_graph.p, dep_graph.used_var_names)
        self.value = self.export_value(dep_graph.p, sectionId)
        self.passing_style = codeInfo["passingStyle"]

        param_children = get_code_info_children(dep_graph.p, sectionId, self.id)
        self.deps = export_params(sectionId, param_children, dep_graph)
        if len(self.deps) > 0:
            self.type = C.NESTED_PARAM
        else:
            self.type = get_param_ui_type(dep_graph.p, sectionId, self.id)

    def export_value(self, p, sectionId):
        variant = get_selected_section_variant(p, sectionId)
        if self.id in variant["values"]:
            value = variant["values"][self.id]["value"]
        else:
            value = new_ev_entry()["value"]
        return value

    def create_var_name(self, p, used_var_names):
        return get_section_name_for_code_gen(p, self.id, used_var_names)
    
    @property
    def has_name_and_value(self):
        return self.name and value_exists(self.value)



def export_section_params(sectionId, dep_graph):
    paramIds = get_top_level_param_ids(dep_graph.p, sectionId)
    return export_params(sectionId, paramIds, dep_graph)

def export_params(sectionId, paramIds, dep_graph: DependencyGraph):
    deps = []
    for pid in paramIds:
        graph_key = dep_graph.create_graph_key(sectionId, pid)
        param = dep_graph.get_node(graph_key)
        if not param:
            param = ParamNode(sectionId, pid, dep_graph)
            dep_graph.add_to_graph(graph_key, param)
        if param.has_name_and_value:
            deps.append(param)
    return deps