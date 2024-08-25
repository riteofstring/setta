import copy

from ..utils.constants import C
from .find_placeholders import double_braces, needs_generated_python
from .utils import process_refs


def get_args_var_name(var_name):
    return f"{C.ARGS_PREFIX}{var_name}"


def get_section_type(p, id):
    ui_type_id = p["sections"][id]["uiTypeId"]
    return p["uiTypes"][ui_type_id]["type"]


def get_selected_item(p, id):
    selected_item = get_selected_section_variant(p, id)["selectedItem"]
    if selected_item:
        return p["codeInfo"][selected_item]
    return None


def get_selected_item_name(p, id):
    selected_item = get_selected_item(p, id)
    if selected_item:
        return selected_item["name"]
    return None


def get_param_ids(p, id):
    selected_item = get_selected_item(p, id)
    if selected_item:
        return selected_item["children"]
    collection_id = p["sections"][id]["codeInfoId"]
    return p["codeInfo"][collection_id]["children"]


def get_param_ui_type(p, section_id, id):
    ui_type_col_id = p["sections"][section_id]["uiTypeColId"]
    ui_type_id = p["uiTypeCols"][ui_type_col_id][id]["uiTypeId"]
    ui_type = p["uiTypes"][ui_type_id]
    return ui_type["type"]


def get_mapped_db_source(p, section_id):
    section = p["sections"][section_id]
    dbSource = section["dbSource"]
    dbSource = dbSource if dbSource else C.DEFAULT_DB_ALIAS
    return p["dbSourceMapping"][dbSource]


def get_mapped_db_source_and_variant_id(p, section_id):
    section = p["sections"][section_id]
    variantId = section["variantId"]
    dbSource = get_mapped_db_source(p, section_id)
    return dbSource, variantId


def get_selected_section_variant(p, section_id):
    dbSource, variantId = get_mapped_db_source_and_variant_id(p, section_id)
    return p["sectionVariants"][dbSource][variantId]


def get_section_variants(p, section_id):
    section = p["sections"][section_id]
    variantIds = section["variantIds"]
    dbSource = get_mapped_db_source(p, section_id)
    return [p["sectionVariants"][dbSource][v] for v in variantIds]


def no_entered_value(value):
    return value is None or value == ""


def get_var_name(var_names):
    name = f"__x{len(var_names)}"
    var_names.add(name)
    return name


def maybe_create_var_name(
    section_id,
    param_info_id,
    param_name,
    var_names,
    var_name_mapping,
    var_name_reverse_mapping,
    is_global=False,
    is_args_obj=False,
):
    mapping_key = (section_id, param_info_id, is_args_obj)
    var_name = var_name_mapping.get(mapping_key)
    if not var_name:
        var_name = param_name if is_global else get_var_name(var_names)
        var_name_mapping[mapping_key] = var_name
        var_name_reverse_mapping[var_name] = mapping_key
    return var_name


def export_selected(p):
    e = Exporter(p)
    e.export()
    return e


def get_code(p):
    for id, s in p["sections"].items():
        if (
            get_section_type(p, id) == C.CODE
            and s["codeLanguage"] == "python"
            and needs_generated_python(s["code"])
        ):
            return s["code"]
    return double_braces(C.SETTA_GENERATED_PYTHON)


def flatten_groups(p):
    for sid in p["sections"].keys():
        if get_section_type(p, sid) != C.DECK:
            continue

        children = get_selected_section_variant(p, sid)["children"]
        if sid in p["projectConfig"]["children"]:
            for c in children:
                p["projectConfig"]["children"][c] = {}
        else:
            parentId = None
            for possible_parent_id in p["sections"].keys():
                parent_idx = get_selected_section_variant(p, possible_parent_id)[
                    "children"
                ].index(sid)
                if parent_idx != -1:
                    parentId = possible_parent_id
                    break
            if parentId is None:
                raise ValueError
            parentSelectedVariant = get_selected_section_variant(p, parentId)
            parentSelectedVariant["children"] = (
                parentSelectedVariant["children"][:parent_idx]
                + children
                + parentSelectedVariant["children"][parent_idx:]
            )


class Exporter:
    def __init__(self, p):
        self.output = {}
        self.p = copy.deepcopy(p)
        self.var_names = set()
        self.var_name_mapping = {}
        self.var_name_reverse_mapping = {}

    def export(self):
        flatten_groups(self.p)
        self.export_global_variables_and_remove_script()
        self.export_sections(list(self.p["projectConfig"]["children"].keys()))

    def export_global_variables_and_remove_script(self):
        to_pop = []
        for id in self.p["sections"].keys():
            section_type = get_section_type(self.p, id)
            if section_type == C.GLOBAL_VARIABLES:
                self.export_section_params(id, is_global=True)
            if section_type not in [C.SECTION, C.LIST_ROOT, C.DICT_ROOT]:
                to_pop.append(id)
        for id in to_pop:
            self.p["sections"].pop(id)
            self.p["projectConfig"]["children"].pop(id)

    def export_sections(self, ids):
        return [self.export_section(x) for x in ids]

    def export_section(self, id):
        var_name = maybe_create_var_name(
            id,
            None,
            None,
            self.var_names,
            self.var_name_mapping,
            self.var_name_reverse_mapping,
        )
        if var_name not in self.output:
            type = get_section_type(self.p, id)
            info = {
                "sectionId": id,
                "name": self.p["sections"][id]["name"],
                "type": type,
            }
            if type == C.SECTION:
                (
                    params,
                    unused_params,
                    positionalOnlyParams,
                ) = self.export_section_params(id)
                info["value"] = {
                    "callable": get_selected_item_name(self.p, id),
                    "params": params,
                    "unusedParams": unused_params,
                    "positionalOnlyParams": positionalOnlyParams,
                }
                self.output[var_name] = info
            elif type in [C.LIST_ROOT, C.DICT_ROOT]:
                children = get_selected_section_variant(self.p, id)["children"]
                info["value"] = self.export_sections(children)
                self.output[var_name] = info
            else:
                raise ValueError
        return var_name

    def export_args_obj(self, id):
        var_name = maybe_create_var_name(
            id,
            None,
            None,
            self.var_names,
            self.var_name_mapping,
            self.var_name_reverse_mapping,
            is_args_obj=True,
        )
        if var_name not in self.output:
            params, unused_params, positionalOnlyParams = self.export_section_params(id)
            info = {
                "sectionId": id,
                "name": self.p["sections"][id]["name"],
                "type": C.SECTION,
                "value": {
                    "callable": None,
                    "params": params,
                    "unusedParams": unused_params,
                    "positionalOnlyParams": positionalOnlyParams,
                },
            }
            self.output[var_name] = info
        return var_name

    def export_section_params(self, section_id, is_global=False):
        ids = get_param_ids(self.p, section_id)
        return self.export_params(section_id, ids, is_global=is_global)

    def export_params(self, section_id, ids, is_global=False):
        var_names = [self.export_param(section_id, x, is_global) for x in ids]
        params = []
        unused_params = []
        positionalOnlyParams = set()
        for v in var_names:
            if no_entered_value(self.output[v]["value"]):
                unused_params.append(v)
            else:
                params.append(v)

            curr_param_info_id = self.output[v]["paramInfoId"]
            positionalOnly = self.p["codeInfo"][curr_param_info_id]["positionalOnly"]
            if positionalOnly:
                positionalOnlyParams.add(v)
        return params, unused_params, positionalOnlyParams

    def export_param(self, section_id, id, is_global=False):
        codeInfo = self.p["codeInfo"][id]
        param_name = codeInfo["name"]
        var_name = maybe_create_var_name(
            section_id,
            id,
            param_name,
            self.var_names,
            self.var_name_mapping,
            self.var_name_reverse_mapping,
            is_global=is_global,
        )

        if var_name not in self.output:
            param_children = codeInfo["children"]
            if len(param_children) > 0:
                params, _, _ = self.export_params(section_id, param_children)
                info = {
                    "sectionId": section_id,
                    "paramInfoId": id,
                    "name": param_name,
                    "type": C.NESTED_PARAM,
                    "value": params,
                }
                self.output[var_name] = info
            else:
                value, deps = self.export_param_value(section_id, id)
                self.output[var_name] = {
                    "value": value,
                    "paramInfoId": id,
                    "sectionId": section_id,
                    "name": param_name,
                    "deps": deps,
                    "type": get_param_ui_type(self.p, section_id, id),
                    "is_global": is_global,
                }

        return var_name

    def export_param_value(self, section_id, id):
        dbSource, variantId = get_mapped_db_source_and_variant_id(self.p, section_id)
        value = self.p["sectionVariants"][dbSource][variantId]["values"][id]
        refs = self.p["evRefs"][section_id][id]
        deps = []
        value = process_refs(value, refs, self.maybe_create_ref_var_name)
        return value, deps

    def maybe_create_ref_var_name(
        self, ref_section_id, ref_param_info_id, ref_is_args_obj
    ):
        if ref_is_args_obj:
            return self.export_args_obj(ref_section_id)
        elif ref_param_info_id:
            return self.export_param(ref_section_id, ref_param_info_id, is_global=False)
        elif ref_section_id:
            return self.export_section(ref_section_id)
        else:
            raise ValueError

    def get_ref_var_name(self, ref_section_id, ref_param_info_id, ref_is_args_obj):
        return self.var_name_mapping[
            (ref_section_id, ref_param_info_id, ref_is_args_obj)
        ]
