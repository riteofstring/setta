import ast
import copy

from runcoder.backend.db_path import DEFAULT_DB_ALIAS

from ..utils.constants import (
    CODE,
    DECK,
    DICT_ROOT,
    GLOBAL_VARIABLES,
    LIST_ROOT,
    SECTION,
    TEXT,
)
from .find_placeholders import double_braces, needs_generated_python

ARG_PREFIX = "__"


def get_args_var_name(var_name):
    return f"{ARG_PREFIX}{var_name}"


def get_section_config(p, id):
    ui_type_id = p["sections"][id]["uiTypeId"]
    return p["uiTypes"][ui_type_id]["config"]


def get_section_type(p, id):
    ui_type_id = p["sections"][id]["uiTypeId"]
    return p["uiTypes"][ui_type_id]["type"]


def get_selected_item(p, id):
    selected_item = p["sections"][id]["selectedItem"]
    if selected_item:
        return p["codeInfo"][selected_item]["name"]
    return None


def get_param_ids(p, id):
    selected_item = p["sections"][id]["selectedItem"]
    if selected_item:
        return p["codeInfo"][selected_item]["children"]
    return p["codeInfo"][get_section_config(p, id)["codeInfoId"]]["children"]


def get_param_ui_type_id(p, section_id, id):
    ui_type_col_id = p["sections"][section_id]["uiTypeColId"]
    return p["uiTypeCols"][ui_type_col_id][id]["uiTypeId"]


def get_param_ui_type(p, section_id, id):
    ui_type_id = get_param_ui_type_id(p, section_id, id)
    ui_type = p["uiTypes"][ui_type_id]
    return ui_type["type"]


def get_original_param_ui_type(p, section_id, id):
    ui_type_id = get_param_ui_type_id(p, section_id, id)
    return p["uiTypes"][ui_type_id]["type"]


def get_param_var_name_for_autocomplete(section_name, param_name):
    return f'{get_args_var_name(section_name)}["{param_name}"]'


def no_entered_value(value):
    return value is None or value == ""


def get_var_names_from_value(value):
    root = ast.parse(value)
    return {node.id for node in ast.walk(root) if isinstance(node, ast.Name)}


def get_top_level_section_names(p):
    top_level = p["projectConfig"]["children"]
    output = set()
    for x in top_level.keys():
        section_name = p["sections"][x]["name"]
        output.add(section_name)
        output.add(get_args_var_name(section_name))
    return output


def is_top_level_arg_var_name(var_name):
    return var_name.startswith(ARG_PREFIX)


def get_section_name_to_id(p):
    return {v["name"]: k for k, v in p["sections"].items()}


def get_var_name(p, section_id, curr_var_name):
    section_name = p["sections"][section_id]["name"]
    return section_name if curr_var_name == "" else curr_var_name


def get_param_var_name(param_var_names):
    name = f"__p{len(param_var_names)}"
    param_var_names.add(name)
    return name


def get_list_or_dict_value(p, children, type):
    if type == LIST_ROOT:
        return f"[None for _ in range({len(children)})]"
    elif type == DICT_ROOT:
        children_names = [p["sections"][id]["name"] for id in children]
        return f"{{k:None for k in {children_names}}}"


def construct_curr_var_name(p, idx, curr_section_id, var_name, type):
    if type == LIST_ROOT:
        return f"{var_name}[{idx}]"
    elif type == DICT_ROOT:
        section_name = p["sections"][curr_section_id]["name"]
        return f"{var_name}['{section_name}']"


def export_selected(p):
    e = Exporter(p)
    e.export()
    return e.output


def get_code(p):
    for id, s in p["sections"].items():
        if (
            get_section_type(p, id) == CODE
            and s["codeLanguage"] == "python"
            and needs_generated_python(s["code"])
        ):
            return s["code"]
    return double_braces("RUNCODER_GENERATED_CODE")


def flatten_groups(p):
    for sid, section in p["sections"].items():
        if get_section_type(p, sid) != DECK:
            continue

        children = section["children"]
        if sid in p["projectConfig"]["children"]:
            for c in children:
                p["projectConfig"]["children"][c] = {}
        else:
            parentId = None
            for possible_parent in p["sections"].values():
                parent_idx = possible_parent["children"].index(sid)
                if parent_idx != -1:
                    parentId = possible_parent["id"]
                    break
            if parentId is None:
                raise ValueError
            parentSection = p["sections"][parentId]
            parentSection["children"] = (
                parentSection["children"][:parent_idx]
                + children
                + parentSection["children"][parent_idx:]
            )


class Exporter:
    def __init__(self, p):
        self.output = {}
        self.p = copy.deepcopy(p)
        self.param_var_names = set()
        self.top_level_section_names = set()
        self.section_name_to_id = {}
        self.var_name_mapping = {}

    def export(self):
        flatten_groups(self.p)
        self.top_level_section_names = get_top_level_section_names(self.p)
        self.section_name_to_id = get_section_name_to_id(self.p)
        self.export_global_variables_and_remove_script()
        self.export_sections(list(self.p["projectConfig"]["children"].keys()))

    def export_global_variables_and_remove_script(self):
        to_pop = []
        for id in self.p["sections"].keys():
            section_type = get_section_type(self.p, id)
            if section_type == GLOBAL_VARIABLES:
                self.export_params(id, curr_var_name="", is_global=True)
            if section_type not in [SECTION, LIST_ROOT, DICT_ROOT]:
                to_pop.append(id)
        for id in to_pop:
            self.p["sections"].pop(id)
            self.p["projectConfig"]["children"].pop(id)

    def export_sections(self, ids):
        return [self.export_section(x) for x in ids]

    def export_section(self, id, curr_var_name=""):
        var_name = get_var_name(self.p, id, curr_var_name)
        if var_name not in self.output:
            type = get_section_type(self.p, id)
            info = {
                "sectionId": id,
                "name": var_name,
                "type": type,
            }
            if type == SECTION:
                params, unused_params = self.export_params(id, curr_var_name)
                info["value"] = {
                    "callable": get_selected_item(self.p, id),
                    "params": params,
                    "unusedParams": unused_params,
                }
                self.output[var_name] = info
            elif type in [LIST_ROOT, DICT_ROOT]:
                children = self.p["sections"][id]["children"]
                self.export_args_var(id, curr_var_name, type, children)
                info["value"] = get_list_or_dict_value(self.p, children, type)
                self.output[var_name] = info
                for idx, sid in enumerate(children):
                    curr_var_name = construct_curr_var_name(
                        self.p, idx, sid, var_name, type
                    )
                    self.export_section(sid, curr_var_name=curr_var_name)
            else:
                raise ValueError
        return var_name

    def export_params(self, section_id, curr_var_name, is_global=False):
        ids = get_param_ids(self.p, section_id)
        var_names = [
            self.export_param(section_id, x, curr_var_name, is_global) for x in ids
        ]
        params = []
        unused_params = []
        for v in var_names:
            if no_entered_value(self.output[v]["value"]):
                unused_params.append(v)
            else:
                params.append(v)
        return params, unused_params

    def export_param(self, section_id, id, curr_var_name, is_global=False):
        value, deps = self.export_param_value(section_id, id)
        param_name = self.p["codeInfo"][id]["name"]
        info = {
            "paramInfoId": id,
            "sectionId": section_id,
            "name": param_name,
            "deps": deps,
            "type": get_param_ui_type(self.p, section_id, id),
            "is_global": is_global,
        }

        if not is_global:
            self.export_args_var(section_id, curr_var_name)
            var_name_for_autocomplete = get_param_var_name_for_autocomplete(
                get_var_name(self.p, section_id, curr_var_name), param_name
            )
            var_name = self.var_name_mapping.get(var_name_for_autocomplete)
            if not var_name:
                var_name = get_param_var_name(self.param_var_names)
                self.var_name_mapping[var_name_for_autocomplete] = var_name
            if var_name not in self.output:
                self.output[var_name] = {**info, "value": value}
                self.output[var_name_for_autocomplete] = {
                    **info,
                    "value": var_name if value else value,
                }
        else:
            var_name = param_name

        return var_name

    def export_param_value(self, section_id, id):
        section = self.p["sections"][section_id]
        ev_col_id = section["evColId"]
        dbSource = section["dbSource"]
        dbSource = dbSource if dbSource else DEFAULT_DB_ALIAS
        dbSource = self.p["dbSourceMapping"][dbSource]
        value = self.p["evCols"][dbSource][ev_col_id]["values"][id]
        if value:
            deps = []
            var_names = get_var_names_from_value(value)
            for v in var_names.intersection(self.top_level_section_names):
                if is_top_level_arg_var_name(v):
                    section_name = v.lstrip(ARG_PREFIX)
                    section_id = self.section_name_to_id[section_name]
                    self.export_params(section_id, section_name)
                else:
                    self.export_section(self.section_name_to_id[v])
                deps.append(v)
            return value, deps
        return value, []

    def export_args_var(self, section_id, curr_var_name, type=SECTION, children=[]):
        args_var_name = get_args_var_name(
            get_var_name(self.p, section_id, curr_var_name)
        )
        if args_var_name not in self.output:
            if type == SECTION:
                value = "{}"
            elif type == DICT_ROOT:
                children_names = [self.p["sections"][id]["name"] for id in children]
                value = f"{{k:{{}} for k in {children_names}}}"
            elif type == LIST_ROOT:
                value = f"[{{}} for _ in range({len(children)})]"
            else:
                raise ValueError
            self.output[args_var_name] = {
                "sectionId": None,
                "value": value,
                "deps": [],
                "type": TEXT,
            }
