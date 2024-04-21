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
    return output


def is_top_level_arg_var_name(var_name):
    return var_name.startswith(ARG_PREFIX)


def get_section_name_to_id(p):
    return {v["name"]: k for k, v in p["sections"].items()}


def get_section_var_name(p, existing_var_names, section_id):
    if section_id in p["projectConfig"]["children"]:
        section_name = p["sections"][section_id]["name"]
        return section_name
    return create_var_name(existing_var_names)


def get_param_var_name(existing_var_names):
    return create_var_name(existing_var_names)


def create_var_name(existing_var_names):
    name = f"__x{len(existing_var_names)}"
    existing_var_names.add(name)
    return name


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


class Exporter:
    def __init__(self, p):
        self.output = {}
        self.p = copy.deepcopy(p)
        self.existing_var_names = set()
        self.top_level_section_names = set()
        self.section_name_to_id = {}
        self.var_name_mapping = {}

    def export(self):
        self.top_level_section_names = get_top_level_section_names(self.p)
        self.section_name_to_id = get_section_name_to_id(self.p)
        self.export_global_variables_and_remove_script()
        self.export_sections(list(self.p["projectConfig"]["children"].keys()))

    def export_global_variables_and_remove_script(self):
        to_pop = []
        for id in self.p["sections"].keys():
            section_type = get_section_type(self.p, id)
            if section_type == GLOBAL_VARIABLES:
                self.export_params(id, is_global=True)
            if section_type not in [SECTION, LIST_ROOT, DICT_ROOT, DECK]:
                to_pop.append(id)
        for id in to_pop:
            self.p["sections"].pop(id)
            self.p["projectConfig"]["children"].pop(id)

    def export_sections(self, ids):
        return [self.export_section(x) for x in ids]

    def export_section(self, id):
        var_name = get_section_var_name(self.p, self.existing_var_names, id)
        if var_name not in self.output:
            type = get_section_type(self.p, id)
            info = {
                "sectionId": id,
                "name": self.p["sections"][id]["name"],
                "type": type,
            }
            if type == SECTION:
                params, unused_params = self.export_params(id)
                info["value"] = {
                    "callable": get_selected_item(self.p, id),
                    "params": params,
                    "unusedParams": unused_params,
                }
                self.output[var_name] = info
            elif type in [LIST_ROOT, DICT_ROOT]:
                info["value"] = self.export_sections(self.p["sections"][id]["children"])
                self.output[var_name] = info
        return var_name

    def export_params(self, section_id, is_global=False):
        ids = get_param_ids(self.p, section_id)
        var_names = [self.export_param(section_id, x, is_global) for x in ids]
        params = []
        unused_params = []
        for v in var_names:
            if no_entered_value(self.output[v]["value"]):
                unused_params.append(v)
            else:
                params.append(v)
        return params, unused_params

    def export_param(self, section_id, id, is_global=False):
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

        var_name = (
            param_name if is_global else get_param_var_name(self.existing_var_names)
        )

        if var_name not in self.output:
            self.output[var_name] = {**info, "value": value}

        return var_name

    def export_param_value(self, section_id, id):
        section = self.p["sections"][section_id]
        ev_col_id = section["evColId"]
        dbSource = section["dbSource"]
        dbSource = dbSource if dbSource else DEFAULT_DB_ALIAS
        dbSource = self.p["dbSourceMapping"][dbSource]
        value = self.p["evCols"][dbSource][ev_col_id]["values"][id]
        deps = []
        if not value:
            return value, deps
        if isinstance(value, str):
            var_names = get_var_names_from_value(value)
            for v in var_names.intersection(self.top_level_section_names):
                self.export_section(self.section_name_to_id[v])
                deps.append(v)
        elif isinstance(value, dict):
            pass
        return value, deps
