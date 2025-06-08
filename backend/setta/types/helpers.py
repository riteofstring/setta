from setta.database.utils import create_new_id
from setta.types.project_state import (
    CodeInfo,
    CodeInfoCol,
    CodeInfoType,
    EVEntry,
    ProjectState,
    Section,
    UITypeColEntry,
)
from setta.utils.constants import C


class ProjectNotFound(Exception):
    pass


def get_section_type(p: ProjectState, id: str):
    ui_type_id = p.sections[id].uiTypeId
    ui_type = p.uiTypes[ui_type_id]
    return ui_type.type


def get_selected_section_variant(p: ProjectState, section_id: str):
    variantId = p.sections[section_id].variantId
    return p.variants[variantId]


def get_selected_item(p: ProjectState, id: str):
    variant = get_selected_section_variant(p, id)
    selected_item = variant.selectedItem
    if selected_item:
        return p.codeInfo[selected_item]


def get_section_children(p: ProjectState, id: str) -> list[str]:
    variant = get_selected_section_variant(p, id)
    return variant.children


def get_top_level_param_ids(p: ProjectState, id: str) -> list[str]:
    section_code_info_children = get_section_code_info_children(p, id)
    selected_item = get_selected_item(p, id)
    sid = selected_item.id if selected_item else None
    if sid not in section_code_info_children:
        section_code_info_children[sid] = []
    children = section_code_info_children[sid]
    return [c for c in children if p.codeInfo[c].rcType == CodeInfoType.parameter]


def get_section_code_info_children(p: ProjectState, section_id: str):
    variant = get_selected_section_variant(p, section_id)
    codeInfoColId = variant.codeInfoColId
    if not codeInfoColId:
        newId = create_new_id()
        codeInfoCol = CodeInfoCol()
        p.codeInfoCols[newId] = codeInfoCol
        variant.codeInfoColId = newId
    else:
        codeInfoCol = p.codeInfoCols[codeInfoColId]
    return codeInfoCol.children


def get_param_ui_type(p: ProjectState, section_id: str, id: str):
    ui_type_col_id = p.sections[section_id].uiTypeColId
    ui_type_col = p.uiTypeCols[ui_type_col_id] if ui_type_col_id else {}
    if id not in ui_type_col:
        ui_type_col[id] = UITypeColEntry()
    ui_type_col_entry = ui_type_col[id]
    ui_type_id = ui_type_col_entry.uiTypeId
    ui_type = p.uiTypes[ui_type_id]
    return ui_type.type


def get_section_path_full_name(p: ProjectState, section_id: str):
    parent_id = p.sections[section_id].parentId
    if not parent_id:
        return p.sections[section_id].name

    child_id = section_id
    output = ""
    while parent_id:
        if get_section_type(p, parent_id) == C.LIST_ROOT:
            idx = get_section_children(p, parent_id).index(section_id)
            output = f"[{idx}]{output}"
        else:
            child_name = p.sections[child_id].name
            output = f'["{child_name}"]{output}'

        child_id = parent_id
        parent_id = p.sections[parent_id].parentId

    # child_id will contain the highest parent's id
    child_name = p.sections[child_id].name
    return f"{child_name}{output}"


def item_is_already_selected(p: ProjectState, sectionId: str, selectedItemName: str):
    selected_item = get_selected_item(p, sectionId)
    return selected_item and selected_item.name == selectedItemName


def item_has_been_selected_before(
    p: ProjectState, sectionId: str, selectedItemName: str
):
    code_info_children = get_section_code_info_children(p, sectionId)
    for c in code_info_children[None]:
        if p.codeInfo[c].name == selectedItemName:
            return c
    return None


def add_code_info(
    state: ProjectState,
    section_id: str,
    info: CodeInfo,
    parent: str | None = None,
    insert_idx: int | None = None,
):
    state.codeInfo[info.id] = info
    code_info_children = get_section_code_info_children(state, section_id)

    if parent not in code_info_children:
        code_info_children[parent] = []

    if insert_idx is None:
        code_info_children[parent].append(info.id)
    else:
        code_info_children[parent].insert(insert_idx, info.id)

    code_info_children[info.id] = []


def create_children_code_info(
    state: ProjectState, section_id: str, parent: str, params: list[CodeInfo]
):
    existing_children_name_to_id = {}
    code_info_children = get_section_code_info_children(state, section_id)
    for c in code_info_children.get(parent, []):
        existing_children_name_to_id[state.codeInfo[c].name] = c

    param_ids_in_order = []
    for p in params:
        existing_id = existing_children_name_to_id.get(p.name)
        if existing_id:
            p.id = existing_id
        param_ids_in_order.append(p.id)
        if not existing_id:
            add_code_info(state, section_id, p, parent)
        else:
            state.codeInfo[existing_id] = p

    code_info_children[parent] = param_ids_in_order


def set_param_entered_value(
    p: ProjectState, sectionId: str, paramInfoId: str, value: str
):
    variant = get_selected_section_variant(p, sectionId)
    if paramInfoId not in variant.values:
        variant.values[paramInfoId] = EVEntry()
    variant.values[paramInfoId].value = value


def get_top_level_sections(p: ProjectState, projectConfigId: str) -> dict[str, Section]:
    output = {}
    projectConfig = p.projectConfigs[projectConfigId]
    for c in projectConfig.children.keys():
        output[c] = p.sections[c]
    return output


def get_children_of_selected_item(p: ProjectState, sectionId: str):
    param_ids = get_top_level_param_ids(p, sectionId)
    return [p.codeInfo[x] for x in param_ids]


def confirm_config_name(p: ProjectState, projectConfigName: str):
    for projectConfigId, config in p.projectConfigs.items():
        if projectConfigName == config.name:
            return projectConfigId
    raise ProjectNotFound
