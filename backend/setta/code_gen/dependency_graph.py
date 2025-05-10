import copy

from setta.code_gen.utils import (
    get_code_info_children,
    get_param_ui_type,
    get_section_children,
    get_section_name,
    get_section_name_for_code_gen,
    get_section_type,
    get_selected_item_name,
    get_selected_section_variant,
    get_top_level_param_ids,
    no_entered_value,
    remove_unneeded_sections,
)
from setta.database.db.sectionVariants.utils import new_ev_entry
from setta.utils.utils import replace_null_keys_with_none

from ..utils.constants import C


class DependencyGraph:
    def __init__(self, p):
        self.output = {}
        self.p = copy.deepcopy(p)
        self.p["codeInfoCols"] = replace_null_keys_with_none(self.p["codeInfoCols"])
        self.section_types_to_process = [
            C.SECTION,
            C.LIST_ROOT,
            C.DICT_ROOT,
            C.GROUP,
            C.GLOBAL_VARIABLES,
            C.TEXT_BLOCK,
        ]
        self.used_var_names = set()
        self.export()

    def export(self):
        remove_unneeded_sections(
            self.p,
            self.section_types_to_process,
        )
        self.export_sections(
            list(self.p["projectConfig"]["children"].keys()), isTopLevel=True
        )

    def export_sections(self, ids, isTopLevel=False):
        return [self.export_section(x, isTopLevel) for x in ids]

    def export_section(self, id, isTopLevel=False):
        output_key = self.create_output_key(id)
        if output_key not in self.output:
            type = get_section_type(self.p, id)
            if type == C.SECTION:
                self.output[output_key] = SectionNode(self.p, self.used_var_names, id, isTopLevel)
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
            # elif type == C.GLOBAL_VARIABLES:
            #     # don't need to process the output since the global variables get added directly to the output
            #     # i.e. they aren't children of anything
            #     self.export_section_params(id)
            # elif type == C.TEXT_BLOCK:
            #     variant = get_selected_section_variant(self.p, id)
            #     info["value"] = variant["description"]
            #     info["dependencies"] = []
            #     self.output[output_key] = info
            # else:
            #     raise ValueError
        return output_key

    def export_param(self, section_id, id):
        codeInfo = self.p["codeInfo"][id]
        param_name = codeInfo["name"]
        if not param_name:
            return None
        var_name = self.create_var_name(
            section_id,
            id,
        )

        if var_name not in self.output:
            param_children = get_code_info_children(self.p, section_id, id)
            if len(param_children) > 0:
                used_params, _, _ = self.export_params(section_id, param_children)
                info = {
                    "sectionId": section_id,
                    "paramInfoId": id,
                    "name": param_name,
                    "type": C.NESTED_PARAM,
                    "value": used_params,
                    "dependencies": used_params,
                }
                self.output[var_name] = info
            else:
                (
                    value,
                    used_ref_var_names,
                ) = self.export_param_value(section_id, id)
                self.output[var_name] = {
                    "sectionId": section_id,
                    "paramInfoId": id,
                    "name": param_name,
                    "type": get_param_ui_type(self.p, section_id, id),
                    "value": value,
                    "dependencies": used_ref_var_names,
                }

        return var_name

    def create_output_key(self, section_id, param_info_id=None):
        return (section_id, param_info_id)




class SectionNode:
    def __init__(self, p, used_var_names, sectionId, isTopLevel):
        self.id = sectionId
        self.name = get_section_name(p, self.id)
        self.var_name = self.create_var_name(p, used_var_names)
        self.isTopLevel = isTopLevel
        self.used_params, self.unused_params = self.export_params(p)
        self.callable = get_selected_item_name(p, self.id)


    def export_params(self, p):
        selected_section_variant = get_selected_section_variant(p, self.id)
        paramIds = get_top_level_param_ids(p, self.id)
        params = [ParamNode(selected_section_variant, x) for x in paramIds]
        used_params = []
        unused_params = []
        for v in params:
            if v.has_value:
                used_params.append(v)
            else:
                unused_params.append(v)
        return used_params, unused_params


    def create_var_name(self, p, used_var_names):
        return get_section_name_for_code_gen(p, self.id, used_var_names)
    


class ParamNode:
    def __init__(self, p, selected_section_variant, paramInfoId):
        self.id = paramInfoId
        self.value = self.export_value(selected_section_variant)
        self.has_value = not no_entered_value(self.value)
        self.passing_style = p["codeInfo"][self.id]["passingStyle"]


    def export_value(self, variant):
        if self.id in variant["values"]:
            value = variant["values"][self.id]["value"]
            used_ref_var_names = []  # TODO: use ast to find references to other sections
        else:
            value = new_ev_entry()["value"]
            used_ref_var_names = []
        return value