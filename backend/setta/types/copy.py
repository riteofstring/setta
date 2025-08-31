from setta.database.utils import create_new_id, remap_ids, rename_keys
from setta.types.core import Core, Variant
from setta.types.generated.impl_args_as_typed_dicts import ProjectConfigArgs
from setta.types.generated.unions import BaseCodeObjImplUnion
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.utils.generate_memorable_string import generate_memorable_string


def copy_project_config(
    project_config: ProjectConfig,
    new_config_name: str | None = None,
    do_create_new_id=False,
    section_id_map: dict[str, str] | None = None,
):
    new_values: ProjectConfigArgs = {}
    if new_config_name:
        new_values["name"] = new_config_name
    if do_create_new_id:
        new_values["id"] = create_new_id()
    if section_id_map:
        new_values["topLevelSections"] = rename_keys(
            project_config.topLevelSections, section_id_map
        )
    return project_config.model_copy(update=new_values, deep=True)


def copy_project(
    p: ProjectStateSingleConfig,
    new_config_name: str | None = None,
    do_create_new_id=False,
):
    new_info = copy_sections_and_other_info(p)
    new_project_config = copy_project_config(
        p.projectConfig,
        new_config_name,
        do_create_new_id,
        new_info["section_id_map"],
    )

    return {
        **project,
        **new_info,
        "projectConfig": new_project_config,
    }


def copy_sections_and_other_info(p: ProjectStateSingleConfig):
    newCodeObjImpls, codeObjImplIdMap = copy_code_obj_impls(p.codeObjImpls)
    newCodeObjVariants, codeObjVariantIdMap = copy_code_obj_variants(
        p.codeObjVariants, codeObjImplIdMap
    )
    newCodeObjs, codeObjIdMap = copy_code_objs(p.codeObjs, codeObjVariantIdMap)
    new_section_variants, section_variant_id_map = copy_section_variants(
        x["sectionVariants"], code_info_id_map, code_info_col_id_map
    )
    new_ui_types, ui_type_id_map = copy_ui_types(x["uiTypes"])
    new_ui_type_cols, ui_type_col_id_map = copy_ui_type_cols(
        x["uiTypeCols"], ui_type_id_map, code_info_id_map
    )
    new_sections, section_id_map = copy_sections(
        x["sections"],
        section_variant_id_map,
        ui_type_id_map,
        ui_type_col_id_map,
    )
    update_section_variant_children(new_section_variants, section_id_map)

    return {
        "codeInfo": new_code_info,
        "codeInfoCols": new_code_info_cols,
        "sectionVariants": new_section_variants,
        "uiTypes": new_ui_types,
        "uiTypeCols": new_ui_type_cols,
        "sections": new_sections,
        "section_id_map": section_id_map,
    }


def copy_sections(
    sections,
    section_variant_id_map,
    ui_type_id_map,
    ui_type_col_id_map,
):
    new_sections, section_id_map = remap_ids(sections)
    for section in new_sections.values():
        section["id"] = section_id_map[section["id"]]
        section["variantId"] = section_variant_id_map[section["variantId"]]
        section["defaultVariantId"] = section_variant_id_map[
            section["defaultVariantId"]
        ]
        section["uiTypeId"] = ui_type_id_map[section["uiTypeId"]]
        if section["uiTypeColId"]:
            section["uiTypeColId"] = ui_type_col_id_map[section["uiTypeColId"]]
        section["variantIds"] = [
            section_variant_id_map[x] for x in section["variantIds"]
        ]
        section["nonPresetUITypeIds"] = [
            ui_type_id_map[x] for x in section["nonPresetUITypeIds"]
        ]
        section["parentId"] = section_id_map.get(section["parentId"], None)

    return new_sections, section_id_map


def copy_relative_positions(relative_positions, section_id_map):
    return rename_keys(relative_positions, section_id_map)


def copy_code_obj_impls(codeObjImpls: dict[str, BaseCodeObjImplUnion]):
    newCodeObjImpls, codeObjImplIdMap = remap_ids(codeObjImpls)
    for c in newCodeObjImpls.values():
        c.id = codeObjImplIdMap[c.id]

    return newCodeObjImpls, codeObjImplIdMap


def copy_code_obj_variants(
    codeObjVariants: dict[str, Variant], codeObjImplIdMap: dict[str, str]
):
    newCodeObjVariants, codeObjVariantIdMap = remap_ids(codeObjVariants)
    for c in newCodeObjVariants.values():
        c.id = codeObjVariantIdMap[c.id]
        c.impl = codeObjImplIdMap[c.impl]
        c.nonPresetImpls = [codeObjImplIdMap[v] for v in c.nonPresetImpls]

    return newCodeObjVariants, codeObjVariantIdMap


def copy_code_objs(codeObjs: dict[str, Core], codeObjVariantIdMap: dict[str, str]):
    newCodeObjs, codeObjIdMap = remap_ids(codeObjs)

    for c in newCodeObjs.values():
        c.id = codeObjIdMap[c.id]
        c.variants = [codeObjVariantIdMap[v] for v in c.variants]
        if c.defaultVariant:
            c.defaultVariant = codeObjVariantIdMap[c.defaultVariant]

    return newCodeObjs, codeObjIdMap


def copy_section_variants(section_variants, code_info_id_map, code_info_col_id_map):
    new_section_variants, section_variant_id_map = remap_ids(section_variants)

    for obj in new_section_variants.values():
        if not obj["isJsonSource"]:
            obj["name"] = generate_memorable_string()
        obj["values"] = rename_keys(obj["values"], code_info_id_map)
        if obj["codeInfoColId"]:
            obj["codeInfoColId"] = code_info_col_id_map[obj["codeInfoColId"]]
        if obj["selectedItem"]:
            obj["selectedItem"] = code_info_id_map[obj["selectedItem"]]

    return new_section_variants, section_variant_id_map


def update_section_variant_children(section_variants, section_id_map):
    for obj in section_variants.values():
        obj["children"] = [section_id_map[x] for x in obj["children"]]


def copy_ui_types(ui_types):
    non_preset_ui_types = {k: v for k, v in ui_types.items() if not v["presetType"]}
    new_ui_types, ui_type_id_map = remap_ids(non_preset_ui_types)

    for u in new_ui_types.values():
        u["id"] = ui_type_id_map[u["id"]]

    preset_ui_types = {k: v for k, v in ui_types.items() if v["presetType"]}
    # preset ids shouldn't change
    for k in preset_ui_types.keys():
        ui_type_id_map[k] = k

    return {**new_ui_types, **preset_ui_types}, ui_type_id_map


def copy_ui_type_cols(ui_type_cols, ui_type_id_map, code_info_id_map):
    new_ui_type_cols, ui_type_col_id_map = remap_ids(ui_type_cols)

    for id in new_ui_type_cols.keys():
        new_ui_type_cols[id] = rename_keys(new_ui_type_cols[id], code_info_id_map)
        col = new_ui_type_cols[id]
        for code_info_id, u in col.items():
            col[code_info_id]["uiTypeId"] = ui_type_id_map[u["uiTypeId"]]
            col[code_info_id]["nonPresetUITypeIds"] = [
                ui_type_id_map[x] for x in col[code_info_id]["nonPresetUITypeIds"]
            ]

    return new_ui_type_cols, ui_type_col_id_map
