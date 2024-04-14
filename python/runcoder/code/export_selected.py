import ast
import copy

from runcoder.backend.db_path import DEFAULT_DB_ALIAS

from ..utils.constants import (
    CODE,
    DECK,
    DICT_ROOT,
    GLOBAL_PARAM_SWEEP,
    GLOBAL_VARIABLES,
    INFO,
    LIST_ROOT,
    PARAM_SWEEP,
    SECTION,
    TERMINAL,
    TEXT,
    VAR_CONTROL,
)
from .find_placeholders import double_braces, needs_generated_python


def get_args_var_name(var_name):
    return f"_{var_name}"


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
    # if is_section_ui_type(ui_type):
    #     return REF
    return ui_type["type"]


def get_original_param_ui_type(p, section_id, id):
    ui_type_id = get_param_ui_type_id(p, section_id, id)
    return p["uiTypes"][ui_type_id]["type"]


def get_param_var_name(section_name, param_name):
    return f'{get_args_var_name(section_name)}["{param_name}"]'


def no_entered_value(value):
    return value is None or value == ""


def get_var_names_from_value(value):
    root = ast.parse(value)
    return {node.id for node in ast.walk(root) if isinstance(node, ast.Name)}


def get_top_level_section_names(p):
    top_level = p["projectConfig"]["children"]
    return {p["sections"][x]["name"] for x in top_level.keys()}


def get_section_name_to_id(p):
    return {v["name"]: k for k, v in p["sections"].items()}


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
        self.param_var_names = set()
        self.top_level_section_names = set()
        self.section_name_to_id = {}

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
                self.export_params(id, curr_var_name="", is_global=True)
            if section_type in [
                GLOBAL_VARIABLES,
                CODE,
                VAR_CONTROL,
                INFO,
                PARAM_SWEEP,
                TERMINAL,
                GLOBAL_PARAM_SWEEP,
            ]:
                to_pop.append(id)
        for id in to_pop:
            self.p["sections"].pop(id)
            self.p["projectConfig"]["children"].pop(id)

    def export_sections(self, ids):
        return [self.export_section(x) for x in ids]

    def export_section(self, id, curr_var_name="", hidden=False):
        section_name = self.p["sections"][id]["name"]
        var_name = section_name if curr_var_name == "" else curr_var_name
        if var_name not in self.output:
            self.output[var_name] = {
                "sectionId": id,
                "name": var_name,
                "value": self.export_section_value(id, curr_var_name),
                "type": get_section_type(self.p, id),
                "hidden": hidden
            }
        return var_name

    def export_section_value(self, id, curr_var_name):
        type = get_section_type(self.p, id)
        if type == SECTION:
            params, unused_params = self.export_params(id, curr_var_name)
            return {
                "callable": get_selected_item(self.p, id),
                "params": params,
                "unusedParams": unused_params,
            }
        elif type == LIST_ROOT:
            children = self.p["sections"][id]["children"]
            self.export_args_var(id, curr_var_name, type, list_len=len(children))
            section_name = self.p["sections"][id]["name"]
            return [
                self.export_section(sid, curr_var_name=f"{section_name}[{idx}]", hidden=True)
                for idx, sid in enumerate(children)
            ]
        # elif type in [DICT_ROOT, DECK]:
        # return self.export_sections(self.p["sections"][id]["children"])

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
        if not is_global:
            self.export_args_var(section_id, curr_var_name)
            section_name = self.p["sections"][section_id]["name"]
            var_name = get_param_var_name(section_name, param_name)
        else:
            var_name = param_name

        self.output[var_name] = {
            "paramInfoId": id,
            "sectionId": section_id,
            "name": param_name,
            "value": value,
            "deps": deps,
            "type": get_param_ui_type(self.p, section_id, id),
            "var_name_generated": is_global,
        }
        return var_name

    def export_param_value(self, section_id, id):
        section = self.p["sections"][section_id]
        ev_col_id = section["evColId"]
        dbSource = section["dbSource"]
        dbSource = dbSource if dbSource else DEFAULT_DB_ALIAS
        value = self.p["evCols"][dbSource][ev_col_id]["values"][id]
        # original_type = get_original_param_ui_type(self.p, section_id, id)
        if value:
            deps = []
            var_names = get_var_names_from_value(value)
            for v in var_names.intersection(self.top_level_section_names):
                self.export_section(self.section_name_to_id[v])
                deps.append(v)
            return value, deps
        return value, []

    def export_args_var(self, section_id, curr_var_name, type=DICT_ROOT, list_len=0):
        section_name = self.p["sections"][section_id]["name"]
        args_var_name = get_args_var_name(
            section_name if curr_var_name == "" else curr_var_name
        )
        if args_var_name not in self.output:
            if type == DICT_ROOT:
                value = "{}"
            elif type == LIST_ROOT:
                value = f"[{{}} for _ in range({list_len})]"
            else:
                raise ValueError
            self.output[args_var_name] = {
                "sectionId": None,
                "value": value,
                "deps": [],
                "type": TEXT,
            }
        return args_var_name
