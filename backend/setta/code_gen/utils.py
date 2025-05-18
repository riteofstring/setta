import copy

from setta.utils.section_contents import findAllParametersAndPathMaps
from setta.utils.utils import replace_null_keys_with_none

from ..utils.constants import BASE_UI_TYPES, C

SELF_IDENTIFIER = "s"
CLASS_NAME = "S"
CLASS_DEF = f"""
class {CLASS_NAME}:
    def __init__({SELF_IDENTIFIER}):
""".lstrip()


def get_artifacts(p, id):
    artifactGroupIds = p["sections"][id]["artifactGroupIds"]
    artifacts = []
    for groupId in artifactGroupIds:
        for transform in p["artifactGroups"][groupId]["artifactTransforms"]:
            artifacts.append(p["artifacts"][transform["artifactId"]])
    return artifacts


def get_drawing(p, id):
    return p["sections"][id]["drawing"]


def get_chat_message(p, id):
    return p["sections"][id]["latestChatMessage"]


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
    return codeInfoChildren.get(id, [])


def get_section_code_info_children(p, section_id):
    codeInfoColId = get_selected_section_variant(p, section_id)["codeInfoColId"]
    if not codeInfoColId:
        codeInfoCol = new_code_info_col()
    else:
        codeInfoCol = p["codeInfoCols"][codeInfoColId]
    return codeInfoCol["children"]


def get_top_level_param_ids(p, id):
    selected_item_id = get_selected_item_id(p, id)
    children = get_code_info_children(p, id, selected_item_id)
    return [c for c in children if p["codeInfo"][c]["rcType"] == C.PARAMETER]


def get_param_ui_type(p, section_id, id):
    ui_type_col_id = p["sections"][section_id]["uiTypeColId"]
    ui_type_col = p["uiTypeCols"][ui_type_col_id] if ui_type_col_id else {}
    ui_type_col_entry = ui_type_col.get(id, new_ui_type_col_entry())
    ui_type_id = ui_type_col_entry["uiTypeId"]
    ui_type = p["uiTypes"].get(ui_type_id) or BASE_UI_TYPES[ui_type_id]
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


def get_section_path_full_name(p, section_id):
    parent_id = p["sections"][section_id]["parentId"]
    if not parent_id:
        return p["sections"][section_id]["name"]

    child_id = section_id
    output = ""
    while parent_id:
        if get_section_type(p, parent_id) == C.LIST_ROOT:
            idx = get_section_children(p, parent_id).index(section_id)
            output = f"[{idx}]{output}"
        else:
            child_name = p["sections"][child_id]["name"]
            output = f'["{child_name}"]{output}'

        child_id = parent_id
        parent_id = p["sections"][parent_id]["parentId"]

    # child_id will contain the highest parent's id
    child_name = p["sections"][child_id]["name"]
    return f"{child_name}{output}"


def sanitize_name(name):
    # Replace brackets, quotes and other invalid chars with underscores
    invalid_chars = "[]\"' "
    name = "".join("_" if c in invalid_chars else c for c in name)

    # Remove consecutive underscores
    while "__" in name:
        name = name.replace("__", "_")

    # Remove leading/trailing underscores
    name = name.strip("_")

    return name


def create_unique_name(name, used_names):
    counter = 2
    while name in used_names:
        name = f"{name}_{counter}"
        counter += 1
    return name


def export_for_interactive_fn(p):
    p["codeInfoCols"] = replace_null_keys_with_none(p["codeInfoCols"])
    e = ExporterForInteractiveFn(p)
    e.export()
    return e


def export_section_to_dict(
    codeInfo,
    codeInfoChildren,
    sectionVariant,
    pinnedUnpinnedDict,
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
        )
        e.export()
        output[k] = e

    return output


def export_param_sweep_section_to_dict(sweep, codeInfo, codeInfoChildren):
    codeInfoChildren = replace_null_keys_with_none(codeInfoChildren)
    e = ParamSweepSectionToDict(sweep, codeInfo, codeInfoChildren)
    e.export()
    return e


def export_single_run_group_to_dict(runGroup, sections, sectionVariants):
    runGroup = replace_null_keys_with_none(runGroup)
    e = SingleRunGroupToDict(runGroup, sections, sectionVariants)
    e.export()
    return e


def remove_unneeded_sections(p, keep_section_types):
    to_pop = []
    for id in p["sections"].keys():
        section_type = get_section_type(p, id)
        if section_type not in keep_section_types:
            to_pop.append(id)
    for id in to_pop:
        parentId = p["sections"][id]["parentId"]
        if parentId:
            parentVariant = get_selected_section_variant(p, parentId)
            parentVariant["children"] = [
                c for c in parentVariant["children"] if c != id
            ]
        p["sections"].pop(id, None)
        p["projectConfig"]["children"].pop(id, None)


class ExporterForInteractiveFn:
    def __init__(self, p):
        self.output = {}
        self.p = copy.deepcopy(p)
        self.var_name_mapping = {}

    def export(self):
        remove_unneeded_sections(
            self.p,
            [
                C.SECTION,
                C.LIST_ROOT,
                C.DICT_ROOT,
                C.GROUP,
                C.IMAGE,
                # C.CHART,
                C.DRAW,
                C.CHAT,
                C.GLOBAL_VARIABLES,
                C.TEXT_BLOCK,
            ],
        )
        for id in list(self.p["projectConfig"]["children"].keys()):
            name = get_section_name(self.p, id)
            value, value_is_returned = self.export_section(id, name)
            if value_is_returned:
                self.output[name] = value

    def export_section(self, id, name):
        type = get_section_type(self.p, id)
        self.create_var_mapping((id,), name)
        value = None
        value_is_returned = True
        if type == C.SECTION:
            selectedItem = get_selected_item_name(self.p, id)
            params = self.export_section_params(
                id, f'{name}["params"]', is_global=False
            )
            value = {"selectedItem": selectedItem, "params": params}
            self.create_var_mapping((id, "selectedItem"), f'{name}["selectedItem"]')
        elif type in [C.LIST_ROOT, C.DICT_ROOT, C.GROUP]:
            children = get_section_children(self.p, id)
            if type == C.LIST_ROOT:
                value = [
                    self.export_section(c, f"{name}[{idx}]")
                    for idx, c in enumerate(children)
                ]
            elif type in [C.DICT_ROOT, C.GROUP]:
                value = {}
                for c in children:
                    child_name = get_section_name(self.p, c)
                    value[child_name] = self.export_section(
                        c, f'{name}["{child_name}"]'
                    )
        elif type in [C.IMAGE]:
            artifacts = get_artifacts(self.p, id)
            img = artifacts[0]["value"] if len(artifacts) > 0 else None
            value = {"image": img}
            self.create_var_mapping((id, "image"), f'{name}["image"]')
        elif type == C.DRAW:
            value = {
                "drawing": get_drawing(self.p, id),
            }
            self.create_var_mapping((id, "drawing"), f'{name}["drawing"]')
        elif type == C.CHAT:
            latestChatMessage = get_chat_message(self.p, id)
            artifacts = get_artifacts(self.p, id)
            chatHistory = artifacts[0]["value"] if len(artifacts) > 0 else None
            value = {"latestChatMessage": latestChatMessage, "chatHistory": chatHistory}
            self.create_var_mapping(
                (id, "latestChatMessage"), f'{name}["latestChatMessage"]'
            )
            self.create_var_mapping((id, "chatHistory"), f'{name}["chatHistory"]')
        elif type == C.GLOBAL_VARIABLES:
            self.output.update(self.export_section_params(id, "", is_global=True))
            value_is_returned = False
        elif type == C.TEXT_BLOCK:
            variant = get_selected_section_variant(self.p, id)
            value = {"text": variant["description"]}
            self.create_var_mapping((id, "text"), f'{name}["text"]')
        else:
            raise ValueError
        return value, value_is_returned

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
        values = get_selected_section_variant(self.p, section_id)["values"]
        if id in values:
            return values[id]["value"]
        return ""

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
    ):
        self.output = {}
        self.prettyOutput = {}
        self.codeInfo = codeInfo
        self.codeInfoChildren = codeInfoChildren
        self.sectionVariant = sectionVariant
        self.topLevelParamIds = topLevelParamIds
        self.requiredParamIds = set(requiredParamIds) if requiredParamIds else None

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
        values = self.sectionVariant["values"]
        if id in values:
            value = values[id]["value"]
        else:
            value = new_ev_entry()["value"]
        return value, value


class ParamSweepSectionToDict:
    def __init__(
        self,
        sweep,
        codeInfo,
        codeInfoChildren,
    ):
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
        if selectedItem:
            selectedItemName = self.codeInfo[selectedItem]["name"]
            currObj = {selectedItemName: []}
            curr = currObj[selectedItemName]
        else:
            curr = currObj = []
        result = findAllParametersAndPathMaps(
            allCodeInfo=self.codeInfo,
            codeInfoChildren=self.codeInfoChildren,
            startingId=selectedItem,
        )
        pathMap = result["pathMap"]
        for p in params:
            if p["paramInfoId"]:
                paramFullPathName = get_param_full_path_name(
                    p["paramInfoId"], pathMap, self.codeInfo
                )
            else:
                paramFullPathName = None
            curr.append({paramFullPathName: p["values"]})
        self.prettyOutput.append(currObj)


class SingleRunGroupToDict:
    def __init__(
        self,
        runGroup,
        sections,
        sectionVariants,
    ):
        self.prettyOutput = {}
        self.runGroup = runGroup
        self.sections = sections
        self.sectionVariants = sectionVariants

    def export(self):
        if not self.runGroup:
            return
        for s in self.sections.values():
            if not s["parentId"]:
                result = self.export_section_details(s["id"], None)
                if result:
                    self.prettyOutput.update(result)

    def export_section_details(self, sectionId, parentVariantId):
        details = self.runGroup.get(sectionId, {}).get(parentVariantId, None)
        if not details or not details["selected"]:
            return {}
        section_info = self.sections[sectionId]
        section_name = section_info["name"]
        output = {section_name: {}}

        for variantId, selected in details["versions"].items():
            if not selected:
                continue
            variant = self.sectionVariants[variantId]
            variant_name = f"@{variant['name']}"
            children = variant["children"]
            child_dict = {}
            for c in children:
                child_result = self.export_section_details(c, variantId)
                if child_result:
                    child_dict.update(child_result)
            output[section_name][variant_name] = child_dict

        if len(section_info["variantIds"]) == 1:
            output[section_name] = output[section_name][variant_name]

        for paramSweepSectionVariantId, selected in details["paramSweeps"].items():
            if not selected:
                continue
            param_sweep_name = (
                f"~{self.sectionVariants[paramSweepSectionVariantId]['name']}"
            )
            output[section_name][param_sweep_name] = {}

        return output
