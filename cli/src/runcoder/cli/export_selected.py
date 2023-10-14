from ..utils.constants import (
    DECK,
    DICT_ROOT,
    FN,
    LIST_ROOT,
    REF,
    SECTION,
    is_section_ui_type,
)


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


def get_chained_selected_item(p, chained_from_var_name, id):
    selected_item = p["sections"][id]["selectedItem"]
    if selected_item:
        name = p["codeInfo"][selected_item]["name"]
        return f"{chained_from_var_name}.{name}"
    return None


def get_param_ids(p, id):
    selected_item = p["sections"][id]["selectedItem"]
    if selected_item:
        return p["codeInfo"][selected_item]["children"]
    return p["codeInfo"][get_section_config(p, id)["collections"][0]]["children"]


def get_param_ui_type_id(p, section_id, id):
    ui_type_col_id = p["sections"][section_id]["uiTypeColId"]
    return p["uiTypeCols"][ui_type_col_id][id]["uiTypeId"]


def get_param_ui_type(p, section_id, id):
    ui_type_id = get_param_ui_type_id(p, section_id, id)
    ui_type = p["uiTypes"][ui_type_id]
    if is_section_ui_type(ui_type):
        return REF
    return ui_type["type"]


def get_original_param_ui_type(p, section_id, id):
    ui_type_id = get_param_ui_type_id(p, section_id, id)
    return p["uiTypes"][ui_type_id]["type"]


def get_param_child_id(p, section_id, id):
    section_children = p["sections"][section_id]["currChildren"]
    for s in section_children:
        if p["sections"][s]["paramInfoId"] == id:
            return s
    return None


def get_section_var_name(section_var_names, id):
    if id in section_var_names:
        return section_var_names[id]
    name = f"s{len(section_var_names)}"
    section_var_names[id] = name
    return name


def get_param_var_name(param_var_names):
    name = f"p{len(param_var_names)}"
    param_var_names.add(name)
    return name


def no_entered_value(value):
    return value is None or value == ""


def export_selected(p):
    e = Exporter(p)
    e.export()
    return e.output


class Exporter:
    def __init__(self, p):
        self.output = {}
        self.p = p
        self.section_var_names = {}
        self.param_var_names = set()

    def export(self):
        self.export_sections(list(self.p["projectConfig"]["children"].keys()))

    def export_sections(self, ids):
        return [self.export_section(x) for x in ids]

    def export_section(self, id):
        var_name = get_section_var_name(self.section_var_names, id)
        if var_name not in self.output:
            self.output[var_name] = {
                "sectionId": id,
                "name": self.p["sections"][id]["name"],
                "value": self.export_section_value(id),
                "type": get_section_type(self.p, id),
            }
        return var_name

    def export_section_value(self, id):
        type = get_section_type(self.p, id)
        if type == SECTION:
            params, unused_params = self.export_params(id)
            return {
                "callable": get_selected_item(self.p, id),
                "params": params,
                "unusedParams": unused_params,
            }
        elif type == FN:
            chained_from_var_name = self.export_section(
                self.p["sections"][id]["chainedFrom"]
            )
            params, unused_params = self.export_params(id)
            return {
                "callable": get_chained_selected_item(
                    self.p, chained_from_var_name, id
                ),
                "params": params,
                "unusedParams": unused_params,
            }
        elif type in [LIST_ROOT, DICT_ROOT, DECK]:
            return self.export_sections(self.p["sections"][id]["currChildren"])

    def export_params(self, section_id):
        ids = get_param_ids(self.p, section_id)
        var_names = [self.export_param(section_id, x) for x in ids]
        params = []
        unused_params = []
        for v in var_names:
            if no_entered_value(self.output[v]["value"]):
                unused_params.append(v)
            else:
                params.append(v)
        return params, unused_params

    def export_param(self, section_id, id):
        value = self.export_param_value(section_id, id)
        var_name = get_param_var_name(self.param_var_names)
        self.output[var_name] = {
            "paramInfoId": id,
            "sectionId": section_id,
            "name": self.p["codeInfo"][id]["name"],
            "value": value,
            "type": get_param_ui_type(self.p, section_id, id),
        }
        return var_name

    def export_param_value(self, section_id, id):
        ev_col_id = self.p["sections"][section_id]["evColId"]
        value = self.p["evCols"][ev_col_id][id]
        original_type = get_original_param_ui_type(self.p, section_id, id)
        possible_child_id = get_param_child_id(self.p, section_id, id)
        if possible_child_id:
            return self.export_section(possible_child_id)
        elif value and original_type == REF:
            return self.export_section(value)
        return value
