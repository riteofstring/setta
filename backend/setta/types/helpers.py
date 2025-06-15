from setta.database.utils import create_new_id
from setta.types.base_ui_types import BASE_UI_TYPE_IDS, UITypeName
from setta.types.project_state import (
    CodeInfo,
    CodeInfoCol,
    CodeInfoType,
    EVEntry,
    ProjectConfigChild,
    ProjectStateBackend,
    ProjectStateSingleConfig,
    UITypeColEntry,
)
from setta.types.sections import Section, SectionConfig, SectionVariant
from setta.types.simplified_states import SimplifiedSectionCreation


class ProjectNotFound(Exception):
    pass


class ProjectNameTaken(Exception):
    pass


def convert_backend_to_single_config(
    p: ProjectStateBackend, projectConfigId: str
) -> ProjectStateSingleConfig:
    project_config = p.projectConfigs[projectConfigId]

    # Collectors for all the IDs we need
    section_ids: set[str] = set()
    variant_ids: set[str] = set()
    code_info_ids: set[str] = set()
    code_info_col_ids: set[str] = set()
    ui_type_ids: set[str] = set()
    ui_type_col_ids: set[str] = set()

    # Start with top-level sections from project config
    sections_to_process = list(project_config.children.keys())

    # Process sections recursively
    while sections_to_process:
        section_id = sections_to_process.pop()
        if section_id in section_ids:
            continue

        section_ids.add(section_id)
        section = p.sections[section_id]

        # Collect UI type references
        ui_type_ids.add(section.uiTypeId)
        ui_type_ids.update(section.nonPresetUITypeIds)

        # Collect UI type column reference
        if section.uiTypeColId:
            ui_type_col_ids.add(section.uiTypeColId)

        for variant_id in section.variantIds:
            if variant_id in variant_ids:
                continue
            variant_ids.add(variant_id)
            variant = p.variants[variant_id]

            # Add child sections to process list
            sections_to_process.extend(variant.children)

            # Collect code info column reference
            if variant.codeInfoColId:
                code_info_col_ids.add(variant.codeInfoColId)

    # Process code info columns to find code info IDs
    for col_id in code_info_col_ids:
        col = p.codeInfoCols[col_id]
        # Collect all code info IDs from all children lists
        for code_info_id, code_info_children in col.children.items():
            if code_info_id:
                code_info_ids.add(code_info_id)
            code_info_ids.update(code_info_children)

    # Process UI type columns to find additional UI type references
    for col_id in ui_type_col_ids:
        col_entries = p.uiTypeCols[col_id]
        for entry in col_entries.values():
            ui_type_ids.add(entry.uiTypeId)
            ui_type_ids.update(entry.nonPresetUITypeIds)

    # Build the sliced state
    return ProjectStateSingleConfig(
        sections={x: p.sections[x] for x in section_ids},
        variants={x: p.variants[x] for x in variant_ids},
        codeInfo={x: p.codeInfo[x] for x in code_info_ids},
        codeInfoCols={x: p.codeInfoCols[x] for x in code_info_col_ids},
        uiTypes={x: p.uiTypes[x] for x in ui_type_ids},
        uiTypeCols={x: p.uiTypeCols[x] for x in ui_type_col_ids},
        projectConfig=project_config,
    )


def merge_single_config_into_backend(
    x: ProjectStateBackend, config: ProjectStateSingleConfig
):
    return ProjectStateBackend(
        sections={**x.sections, **config.sections},
        variants={**x.variants, **config.variants},
        codeInfo={**x.codeInfo, **config.codeInfo},
        codeInfoCols={**x.codeInfoCols, **config.codeInfoCols},
        uiTypes={**x.uiTypes, **config.uiTypes},
        uiTypeCols={**x.uiTypeCols, **config.uiTypeCols},
        projectConfigs={
            **x.projectConfigs,
            config.projectConfig.id: config.projectConfig,
        },
        defaultProjectConfigId=x.defaultProjectConfigId,
    )


def get_section_type(p: ProjectStateSingleConfig, id: str):
    ui_type_id = p.sections[id].uiTypeId
    ui_type = p.uiTypes[ui_type_id]
    return ui_type.type


def get_selected_section_variant(p: ProjectStateSingleConfig, section_id: str):
    variantId = p.projectConfig.sectionConfigs[section_id].variantId
    return p.variants[variantId]


def get_selected_item(p: ProjectStateSingleConfig, id: str):
    variant = get_selected_section_variant(p, id)
    selected_item = variant.selectedItem
    if selected_item:
        return p.codeInfo[selected_item]


def get_section_children(p: ProjectStateSingleConfig, id: str) -> list[str]:
    variant = get_selected_section_variant(p, id)
    return variant.children


def get_top_level_param_ids(p: ProjectStateSingleConfig, id: str) -> list[str]:
    section_code_info_children = get_section_code_info_children(p, id)
    selected_item = get_selected_item(p, id)
    sid = selected_item.id if selected_item else None
    if sid not in section_code_info_children:
        section_code_info_children[sid] = []
    children = section_code_info_children[sid]
    return [c for c in children if p.codeInfo[c].rcType == CodeInfoType.PARAMETER]


def get_section_code_info_children(p: ProjectStateSingleConfig, section_id: str):
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


def get_param_ui_type(p: ProjectStateSingleConfig, section_id: str, id: str):
    ui_type_col_id = p.sections[section_id].uiTypeColId
    ui_type_col = p.uiTypeCols[ui_type_col_id] if ui_type_col_id else {}
    if id not in ui_type_col:
        ui_type_col[id] = UITypeColEntry()
    ui_type_col_entry = ui_type_col[id]
    ui_type_id = ui_type_col_entry.uiTypeId
    ui_type = p.uiTypes[ui_type_id]
    return ui_type.type


def get_section_path_full_name(p: ProjectStateSingleConfig, section_id: str):
    parent_id = p.sections[section_id].parentId
    if not parent_id:
        return p.sections[section_id].name

    child_id = section_id
    output = ""
    while parent_id:
        if get_section_type(p, parent_id) == UITypeName.LIST_ROOT:
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


def item_is_already_selected(
    p: ProjectStateSingleConfig, sectionId: str, selectedItemName: str
):
    selected_item = get_selected_item(p, sectionId)
    return selected_item and selected_item.name == selectedItemName


def item_has_been_selected_before(
    p: ProjectStateSingleConfig, sectionId: str, selectedItemName: str
):
    code_info_children = get_section_code_info_children(p, sectionId)
    for c in code_info_children[None]:
        if p.codeInfo[c].name == selectedItemName:
            return c
    return None


def add_code_info(
    state: ProjectStateSingleConfig,
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
    state: ProjectStateSingleConfig,
    section_id: str,
    parent: str,
    params: list[CodeInfo],
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
    p: ProjectStateSingleConfig,
    sectionId: str,
    paramInfoId: str,
    value: str,
):
    variant = get_selected_section_variant(p, sectionId)
    if paramInfoId not in variant.values:
        variant.values[paramInfoId] = EVEntry()
    variant.values[paramInfoId].value = value


def get_top_level_sections(p: ProjectStateSingleConfig) -> dict[str, Section]:
    output = {}
    projectConfig = p.projectConfig
    for c in projectConfig.children.keys():
        output[c] = p.sections[c]
    return output


def get_children_of_selected_item(p: ProjectStateSingleConfig, sectionId: str):
    param_ids = get_top_level_param_ids(p, sectionId)
    return [p.codeInfo[x] for x in param_ids]


def confirm_config_name(p: ProjectStateBackend, projectConfigName: str):
    for projectConfigId, config in p.projectConfigs.items():
        if projectConfigName == config.name:
            return projectConfigId
    raise ProjectNotFound


def set_project_config_name(p: ProjectStateBackend, projectConfigId: str, newName: str):
    for k, v in p.projectConfigs.items():
        if k != projectConfigId and v.name == newName:
            raise ProjectNameTaken(f"{newName} is already taken")
    p.projectConfigs[projectConfigId].name = newName


def create_sections(
    p: ProjectStateSingleConfig,
    sections: list[SimplifiedSectionCreation],
):
    for s in sections:
        new_section = Section(name=s.name, uiTypeId=BASE_UI_TYPE_IDS[s.type])
        new_section_config = SectionConfig(size=s.size)
        p.sections[new_section.id] = new_section
        p.variants[new_section_config.variantId] = SectionVariant()
        new_section.variantIds = [new_section_config.variantId]
        new_section.defaultVariantId = new_section_config.variantId
        p.projectConfig.sectionConfigs[new_section.id] = new_section_config
        p.projectConfig.children[new_section.id] = ProjectConfigChild(
            x=s.position.x, y=s.position.y
        )
