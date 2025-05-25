from setta.project_state.project_state import (
    CodeInfoCol,
    CodeInfoType,
    ProjectState,
    UITypeColEntry,
)
from setta.utils.constants import C


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
    if selected_item:
        children = section_code_info_children.get(selected_item.id, [])
    else:
        children = section_code_info_children[None]
    return [c for c in children if p.codeInfo[c].rcType == CodeInfoType.PARAMETER]


def get_section_code_info_children(p: ProjectState, section_id: str):
    variant = get_selected_section_variant(p, section_id)
    codeInfoColId = variant.codeInfoColId
    if not codeInfoColId:
        codeInfoCol = CodeInfoCol()
    else:
        codeInfoCol = p.codeInfoCols[codeInfoColId]
    return codeInfoCol.children


def get_param_ui_type(p: ProjectState, section_id: str, id: str):
    ui_type_col_id = p.sections[section_id].uiTypeColId
    ui_type_col = p.uiTypeCols[ui_type_col_id] if ui_type_col_id else {}
    ui_type_col_entry = ui_type_col.get(id, UITypeColEntry())
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
