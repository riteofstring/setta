import copy

from setta.utils.section_contents import get_param_ids, get_param_ids_to_show_in_area
from setta.utils.utils import (
    QuoteInsensitiveDict,
    replace_null_keys_with_none,
    try_json,
)

from ..utils.constants import BASE_UI_TYPE_IDS, C
from .find_placeholders import double_braces, needs_generated_python
from .utils import process_refs


def get_args_var_name(var_name):
    return f"{C.ARGS_PREFIX}{var_name}"


def get_section_type(p, id):
    ui_type_id = p["sections"][id]["uiTypeId"]
    return p["uiTypes"][ui_type_id]["type"]


def get_artifacts(p, id):
    return p["sections"][id]["artifacts"]


def get_drawings(p, id):
    return p["sections"][id]["drawings"]


def get_section_name(p, id):
    return p["sections"][id]["name"]


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


def get_selected_item_id(p, id):
    selected_item = get_selected_item(p, id)
    if selected_item:
        return selected_item["id"]
    return None


def get_code_info_children(p, section_id, id):
    codeInfoChildren = get_section_code_info_children(p, section_id)
    return codeInfoChildren[id]


def get_section_code_info_children(p, section_id):
    codeInfoColId = get_selected_section_variant(p, section_id)["codeInfoColId"]
    return p["codeInfoCols"][codeInfoColId]["children"]


def get_top_level_param_ids(p, id):
    selected_item_id = get_selected_item_id(p, id)
    return get_code_info_children(p, id, selected_item_id)


def get_param_ui_type(p, section_id, id):
    ui_type_col_id = p["sections"][section_id]["uiTypeColId"]
    ui_type_col = p["uiTypeCols"][ui_type_col_id]
    if id not in ui_type_col:
        ui_type_id = BASE_UI_TYPE_IDS[C.TEXT]
    else:
        ui_type_id = ui_type_col[id]["uiTypeId"]
    ui_type = p["uiTypes"][ui_type_id]
    return ui_type["type"]


def get_selected_section_variant(p, section_id):
    variantId = get_selected_section_variant_id(p, section_id)
    return p["sectionVariants"][variantId]


def get_section_variant_ids(p, section_id):
    return p["sections"][section_id]["variantIds"]


def get_section_variants(p, section_id):
    variantIds = get_section_variant_ids(p, section_id)
    return [p["sectionVariants"][v] for v in variantIds]


def get_selected_section_variant_id(p, section_id):
    return p["sections"][section_id]["variantId"]


def get_section_variant_attr(p, variantId, attr):
    return p["sectionVariants"][variantId][attr]


def get_variant_code(p, variantId):
    return get_section_variant_attr(p, variantId, "code")


def get_variant_name(p, variantId):
    return get_section_variant_attr(p, variantId, "name")


def get_section_code(p, id):
    return get_selected_section_variant(p, id)["code"]


def get_section_children(p, id):
    return get_selected_section_variant(p, id)["children"]


def no_entered_value(value):
    return value is None or value == ""


def get_var_name(var_name_mapping):
    return f"__x{len(var_name_mapping)}"


def get_for_section_id(p, section_id):
    for sid, s in p["sections"].items():
        if s["paramSweepSectionId"] == section_id:
            return sid
    return None


def get_param_full_path_name(id, pathMap, codeInfo):
    if len(pathMap[id]) == 1:
        return codeInfo[pathMap[id][0]]["name"]
    else:
        name = ""
        for pathIdx, currId in enumerate(pathMap[id]):
            if pathIdx == 0:
                name = codeInfo[currId]["name"]
            else:
                name += f'["{codeInfo[currId]["name"]}"]'
        return name


def export_selected(p, always_export_args_objs):
    p["codeInfoCols"] = replace_null_keys_with_none(p["codeInfoCols"])
    e = Exporter(p, always_export_args_objs=always_export_args_objs)
    e.export()
    return e


def simple_export_selected(p):
    p["codeInfoCols"] = replace_null_keys_with_none(p["codeInfoCols"])
    e = SimpleExporter(p)
    e.export()
    return e


def export_section_to_dict(
    codeInfo,
    codeInfoChildren,
    sectionVariant,
    pinnedUnpinnedDict,
    configLanguage,
):
    codeInfoChildren = replace_null_keys_with_none(codeInfoChildren)
    output = {}
    for k, v in pinnedUnpinnedDict.items():
        e = SectionToDict(
            codeInfo,
            codeInfoChildren,
            sectionVariant,
            v["topLevelParamIds"],
            v.get("requiredParamIds", None),
            configLanguage,
        )
        e.export()
        output[k] = e

    return output


def export_param_sweep_section_to_dict(sweep, codeInfo, codeInfoChildren):
    codeInfoChildren = replace_null_keys_with_none(codeInfoChildren)
    e = ParamSweepSectionToDict(sweep, codeInfo, codeInfoChildren)
    e.export()
    return e


def get_first_section_code_that_needs_generated_python(p):
    for id in p["sections"].keys():
        if code_section_needs_generated_python(p, id):
            return get_section_code(p, id)
    return double_braces(C.SETTA_GENERATED_PYTHON)


def code_section_needs_generated_python(p, id):
    code = get_section_code(p, id)
    return (
        get_section_type(p, id) == C.CODE
        and p["sections"][id]["codeLanguage"] == "python"
        and needs_generated_python(code)
    )


def flatten_groups(p):
    for sid in p["sections"].keys():
        if get_section_type(p, sid) != C.DECK:
            continue

        children = get_section_children(p, sid)
        if sid in p["projectConfig"]["children"]:
            for c in children:
                p["projectConfig"]["children"][c] = {}
        else:
            parentId = None
            for possible_parent_id in p["sections"].keys():
                parent_idx = get_section_children(p, possible_parent_id)[
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


def export_global_variables_and_remove_script(
    p, keep_section_types, fn_export_global_variables
):
    to_pop = []
    for id in p["sections"].keys():
        section_type = get_section_type(p, id)
        if section_type == C.GLOBAL_VARIABLES:
            fn_export_global_variables(id, is_global=True)
        if section_type not in keep_section_types:
            to_pop.append(id)
    for id in to_pop:
        p["sections"].pop(id)
        p["projectConfig"]["children"].pop(id)


class Exporter:
    def __init__(self, p, always_export_args_objs):
        self.output = {}
        self.p = copy.deepcopy(p)
        self.var_name_mapping = {}
        self.var_name_reverse_mapping = {}
        self.always_export_args_objs = always_export_args_objs

    def export(self):
        flatten_groups(self.p)
        export_global_variables_and_remove_script(
            self.p,
            [C.SECTION, C.LIST_ROOT, C.DICT_ROOT, C.CODE, C.INTERACTIVE_CODE],
            self.export_section_params,
        )
        self.export_sections(list(self.p["projectConfig"]["children"].keys()))

    def export_sections(self, ids):
        return [self.export_section(x) for x in ids]

    def export_section(self, id):
        var_name = self.maybe_create_var_name(
            id,
            None,
            None,
        )
        if var_name not in self.output:
            type = get_section_type(self.p, id)
            info = {
                "sectionId": id,
                "name": get_section_name(self.p, id),
                "type": type,
            }
            if type == C.SECTION:
                if self.always_export_args_objs:
                    self.export_args_obj(id)
                (
                    params,
                    unused_params,
                    positionalOnlyParams,
                ) = self.export_section_params(id)

                if id in self.p["selectedItemEVRefs"]:
                    callable, used_ref_var_names = process_refs(
                        get_selected_item_name(self.p, id),
                        self.p["selectedItemEVRefs"][id],
                        self.maybe_create_ref_var_name,
                    )
                else:
                    callable = get_selected_item_name(self.p, id)
                    used_ref_var_names = []

                info["value"] = {
                    "callable": callable,
                    "unusedParams": unused_params,
                    "positionalOnlyParams": positionalOnlyParams,
                }
                info["dependencies"] = [*params, *used_ref_var_names]
                self.output[var_name] = info
            elif type in [C.LIST_ROOT, C.DICT_ROOT]:
                children = get_section_children(self.p, id)
                info["value"] = self.export_sections(children)
                info["dependencies"] = info["value"]
                self.output[var_name] = info
            elif type in [C.CODE, C.INTERACTIVE_CODE]:
                if (
                    code_section_needs_generated_python(self.p, id)
                    and id in self.p["codeEVRefs"]
                ):
                    # make sure any necessary variables get created.
                    process_refs(
                        get_section_code(self.p, id),
                        self.p["codeEVRefs"][id],
                        self.maybe_create_ref_var_name,
                    )
            else:
                raise ValueError
        return var_name

    def export_args_obj(self, id):
        var_name = self.maybe_create_var_name(
            id,
            None,
            None,
            is_args_obj=True,
        )
        if var_name not in self.output:
            params, unused_params, positionalOnlyParams = self.export_section_params(id)
            info = {
                "sectionId": id,
                "name": get_section_name(self.p, id),
                "type": C.SECTION,
                "value": {
                    "callable": None,
                    "unusedParams": unused_params,
                    "positionalOnlyParams": positionalOnlyParams,
                },
                "dependencies": params,
            }
            self.output[var_name] = info
        return var_name

    def export_section_params(self, section_id, is_global=False):
        ids = get_top_level_param_ids(self.p, section_id)
        return self.export_params(section_id, ids, is_global=is_global)

    def export_params(self, section_id, ids, is_global=False):
        var_names = [self.export_param(section_id, x, is_global) for x in ids]
        var_names = [x for x in var_names if x]
        params = []
        unused_params = []
        positionalOnlyParams = set()
        for v in var_names:
            if no_entered_value(self.output[v]["value"]):
                unused_params.append(v)
            else:
                params.append(v)

            curr_param_info_id = self.output[v]["paramInfoId"]
            positionalOnly = self.p["codeInfo"][curr_param_info_id].get(
                "positionalOnly", False
            )
            if positionalOnly:
                positionalOnlyParams.add(v)
        return params, unused_params, positionalOnlyParams

    def export_param(self, section_id, id, is_global=False):
        codeInfo = self.p["codeInfo"][id]
        param_name = codeInfo["name"]
        if not param_name:
            return None
        var_name = self.maybe_create_var_name(
            section_id,
            id,
            param_name,
            is_global=is_global,
        )

        if var_name not in self.output:
            param_children = get_code_info_children(self.p, section_id, id)
            if len(param_children) > 0:
                params, _, _ = self.export_params(section_id, param_children)
                info = {
                    "sectionId": section_id,
                    "paramInfoId": id,
                    "name": param_name,
                    "type": C.NESTED_PARAM,
                    "value": params,
                    "dependencies": params,
                }
                self.output[var_name] = info
            else:
                value, used_ref_var_names = self.export_param_value(section_id, id)
                self.output[var_name] = {
                    "sectionId": section_id,
                    "paramInfoId": id,
                    "name": param_name,
                    "type": get_param_ui_type(self.p, section_id, id),
                    "value": value,
                    "dependencies": used_ref_var_names,
                }

        return var_name

    def export_param_value(self, section_id, id):
        variant = get_selected_section_variant(self.p, section_id)
        value = variant["values"][id]["value"]
        refs = self.p["paramEVRefs"][section_id][id]
        value, used_ref_var_names = process_refs(
            value, refs, self.maybe_create_ref_var_name
        )
        return value, used_ref_var_names

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

    def maybe_create_var_name(
        self,
        section_id,
        param_info_id,
        param_name,
        is_global=False,
        is_args_obj=False,
    ):
        mapping_key = (section_id, param_info_id, is_args_obj)
        var_name = self.var_name_mapping.get(mapping_key)
        if not var_name:
            var_name = param_name if is_global else get_var_name(self.var_name_mapping)
            self.var_name_mapping[mapping_key] = var_name
            self.var_name_reverse_mapping[var_name] = mapping_key
        elif var_name not in self.output:
            # this means the var_name has already been created
            # but it hasn't been added to the output.
            # This only happens in a circular dependency.
            raise RecursionError("There is a circular reference")
        return var_name


class SimpleExporter:
    def __init__(self, p):
        self.output = {}
        self.p = copy.deepcopy(p)
        self.var_name_mapping = {}
        self.var_name_reverse_mapping = QuoteInsensitiveDict()

    def export(self):
        flatten_groups(self.p)
        export_global_variables_and_remove_script(
            self.p,
            [C.SECTION, C.LIST_ROOT, C.DICT_ROOT, C.IMAGE, C.LINE_PLOT, C.DRAW],
            self.export_global_variables,
        )
        for id in list(self.p["projectConfig"]["children"].keys()):
            name = get_section_name(self.p, id)
            self.output[name] = self.export_section(id, name)

    def export_global_variables(self, id, **_):
        self.output.update(self.export_section_params(id, "", is_global=True))

    def export_section(self, id, name):
        type = get_section_type(self.p, id)
        self.create_var_mapping((id,), name)
        if type == C.SECTION:
            selectedItem = get_selected_item_name(self.p, id)
            params = self.export_section_params(
                id, f'{name}["params"]', is_global=False
            )
            value = {"selectedItem": selectedItem, "params": params}
            self.create_var_mapping((id, "selectedItem"), f'{name}["selectedItem"]')
        elif type in [C.LIST_ROOT, C.DICT_ROOT]:
            children = get_section_children(self.p, id)
            if type == C.LIST_ROOT:
                value = [
                    self.export_section(c, f"{name}[{idx}]")
                    for idx, c in enumerate(children)
                ]
            elif type == C.DICT_ROOT:
                value = {}
                for c in children:
                    child_name = get_section_name(self.p, c)
                    value[child_name] = self.export_section(
                        c, f'{name}["{child_name}"]'
                    )
        elif type in [C.IMAGE, C.LINE_PLOT]:
            value = get_artifacts(self.p, id)
            self.create_var_mapping((id, "artifact"), name)
        elif type == C.DRAW:
            value = get_drawings(self.p, id)
            self.create_var_mapping((id, "drawing"), name)
        else:
            raise ValueError
        return value

    def export_section_params(self, section_id, name, is_global):
        return self.export_params(
            section_id, get_top_level_param_ids(self.p, section_id), name, is_global
        )

    def export_params(self, section_id, ids, name, is_global):
        params = {}
        for param_id in ids:
            codeInfo = self.p["codeInfo"][param_id]
            param_name = codeInfo["name"]
            if not param_name:
                continue
            param_children = get_code_info_children(self.p, section_id, param_id)
            if len(param_children) > 0:
                value = self.export_params(section_id, param_children, name, is_global)
            else:
                value = self.export_param_value(section_id, param_id)
            param_name = codeInfo["name"]
            params[param_name] = value
            if is_global:
                self.create_var_mapping((section_id, param_id), param_name)
            else:
                self.create_var_mapping(
                    (section_id, param_id), f'{name}["{param_name}"]'
                )
        return params

    def export_param_value(self, section_id, id):
        variant = get_selected_section_variant(self.p, section_id)
        value = variant["values"][id]["value"]
        return value

    def create_var_mapping(self, key, value):
        self.var_name_mapping[key] = value
        self.var_name_reverse_mapping[value] = key


class SectionToDict:
    def __init__(
        self,
        codeInfo,
        codeInfoChildren,
        sectionVariant,
        topLevelParamIds,
        requiredParamIds,
        configLanguage,
    ):
        self.output = {}
        self.prettyOutput = {}
        self.codeInfo = codeInfo
        self.codeInfoChildren = codeInfoChildren
        self.sectionVariant = sectionVariant
        self.topLevelParamIds = topLevelParamIds
        self.requiredParamIds = set(requiredParamIds) if requiredParamIds else None
        self.configLanguage = configLanguage

    def export(self):
        self.output, self.prettyOutput = self.export_params(self.topLevelParamIds)

    def export_params(self, ids):
        params = {}
        prettyParams = {}
        for param_id in ids:
            if (
                self.requiredParamIds is not None
                and param_id not in self.requiredParamIds
            ):
                continue
            codeInfo = self.codeInfo[param_id]
            param_name = codeInfo["name"]
            if not param_name:
                continue
            param_children = self.codeInfoChildren[param_id]
            if len(param_children) > 0:
                value, prettyValue = self.export_params(param_children)
            else:
                value, prettyValue = self.export_param_value(param_id)
            params[codeInfo["name"]] = {
                "id": param_id,
                "value": value,
                "editable": codeInfo["editable"],
            }
            prettyParams[codeInfo["name"]] = prettyValue
        return params, prettyParams

    def export_param_value(self, id):
        value = self.sectionVariant["values"][id]["value"]
        if self.configLanguage == "json":
            value = try_json(value)
        return value, value


class ParamSweepSectionToDict:
    def __init__(
        self,
        sweep,
        codeInfo,
        codeInfoChildren,
    ):
        self.output = {}
        self.prettyOutput = []
        self.sweep = sweep
        self.codeInfo = codeInfo
        self.codeInfoChildren = codeInfoChildren

    def export(self):
        for selectedItemSweep in self.sweep:
            self.export_selected_item_sweep(selectedItemSweep)

    def export_selected_item_sweep(self, selectedItemSweep):
        selectedItem = selectedItemSweep["selectedItem"]
        params = selectedItemSweep["params"]
        # self.output[selectedItem] = {}
        if selectedItem:
            selectedItemName = self.codeInfo[selectedItem]["name"]
            currObj = {selectedItemName: {}}
            curr = currObj[selectedItemName]
        else:
            curr = currObj = {}
        for p in params:
            result = get_param_ids(
                self.codeInfo,
                self.codeInfoChildren,
                selectedItem,
                lambda p: p["rcType"] == C.PARAMETER,
            )
            pathMap = result["pathMap"]
            paramFullPathName = get_param_full_path_name(
                p["paramInfoId"], pathMap, self.codeInfo
            )
            curr[paramFullPathName] = p["values"]
        self.prettyOutput.append(currObj)
