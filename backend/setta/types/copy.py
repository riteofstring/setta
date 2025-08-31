from typing import TypeVar
from setta.database.utils import create_new_id, remap_ids, rename_keys, rename_values
from setta.types.code_obj_impls import BaseChildlessCodeObjImpl, BaseParentCodeObjImpl
from setta.types.core import Core, Variant
from setta.types.generated.impl_args_as_typed_dicts import ProjectConfigArgs
from setta.types.generated.unions import BaseCodeObjImplUnion, BaseSectionImplUnion
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    BaseDictSectionImpl,
    BaseParentSectionImpl,
    BaseSectionWithParamsImpl,
    CallableSectionImpl,
)
from setta.utils.generate_memorable_string import generate_memorable_string


T = TypeVar("T", bound=BaseSectionImplUnion | BaseCodeObjImplUnion)


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
    newCodeObjImpls, codeObjImplIdMap = copy_impls(p.codeObjImpls)
    newCodeObjVariants, codeObjVariantIdMap = copy_variants(
        p.codeObjVariants, codeObjImplIdMap
    )
    newCodeObjs, codeObjIdMap = copy_cores(p.codeObjs, codeObjVariantIdMap)
    update_code_obj_impl_details(newCodeObjImpls, codeObjIdMap)

    newSectionImpls, sectionImplIdMap = copy_impls(p.sectionImpls)
    newSectionVariants, sectionVariantIdMap = copy_variants(
        p.sectionVariants, sectionImplIdMap
    )
    newSections, sectionIdMap = copy_cores(p.sections, sectionVariantIdMap)
    update_section_impl_details(
        newSectionImpls, sectionIdMap, codeObjIdMap, codeObjVariantIdMap
    )


def copy_variants(variants: dict[str, Variant], implIdMap: dict[str, str]):
    newVariants, variantIdMap = remap_ids(variants)
    for c in newVariants.values():
        c.id = variantIdMap[c.id]
        c.impl = implIdMap[c.impl]
        c.nonPresetImpls = [implIdMap[v] for v in c.nonPresetImpls]

    return newVariants, variantIdMap


def copy_cores(cores: dict[str, Core], variantIdMap: dict[str, str]):
    newCores, coreIdMap = remap_ids(cores)

    for c in newCores.values():
        c.id = coreIdMap[c.id]
        c.variants = [variantIdMap[v] for v in c.variants]
        if c.defaultVariant:
            c.defaultVariant = variantIdMap[c.defaultVariant]

    return newCores, coreIdMap


def copy_impls(impls: dict[str, T]):
    nonPresets: dict[str, T] = {}
    presets: dict[str, T] = {}
    for k, v in impls.items():
        if v.isPreset:
            presets[k] = v
        else:
            nonPresets[k] = v

    newImpls, implIdMap = remap_ids(nonPresets)
    for c in newImpls.values():
        c.id = implIdMap[c.id]
        c.name = generate_memorable_string()

    return {**newImpls, **presets}, {**implIdMap, **{k: k for k in presets.keys()}}


def update_code_obj_impl_details(
    codeObjImpls: dict[str, BaseCodeObjImplUnion], codeObjIdMap: dict[str, str]
):
    for c in codeObjImpls.values():
        if isinstance(c, BaseParentCodeObjImpl):
            c.children = [codeObjIdMap[v] for v in c.children]


def update_section_impl_details(
    sectionImpls: dict[str, BaseSectionImplUnion],
    sectionIdMap: dict[str, str],
    codeObjIdMap: dict[str, str],
    codeObjVariantIdMap: dict[str, str],
):
    for c in sectionImpls.values():
        if isinstance(c, BaseParentSectionImpl):
            c.children = [sectionIdMap[v] for v in c.children]
        if isinstance(c, BaseSectionWithParamsImpl):
            c.codeObjVariantMap = rename_keys(c.codeObjVariantMap, codeObjIdMap)
            c.codeObjVariantMap = {
                k: codeObjVariantIdMap[v] for k, v in c.codeObjVariantMap.items()
            }
            c.pinnedParams = [codeObjIdMap[v] for v in c.pinnedParams]
            c.selectedParams = [codeObjIdMap[v] for v in c.selectedParams]
        if isinstance(c, BaseDictSectionImpl):
            c.topLevelParamIds = [codeObjIdMap[v] for v in c.topLevelParamIds]
        if isinstance(c, CallableSectionImpl):
            if c.callable:
                c.callable = codeObjIdMap[c.callable]


# def copy_sections(
#     sections,
#     section_variant_id_map,
#     ui_type_id_map,
#     ui_type_col_id_map,
# ):
#     new_sections, section_id_map = remap_ids(sections)
#     for section in new_sections.values():
#         section["id"] = section_id_map[section["id"]]
#         section["variantId"] = section_variant_id_map[section["variantId"]]
#         section["defaultVariantId"] = section_variant_id_map[
#             section["defaultVariantId"]
#         ]
#         section["uiTypeId"] = ui_type_id_map[section["uiTypeId"]]
#         if section["uiTypeColId"]:
#             section["uiTypeColId"] = ui_type_col_id_map[section["uiTypeColId"]]
#         section["variantIds"] = [
#             section_variant_id_map[x] for x in section["variantIds"]
#         ]
#         section["nonPresetUITypeIds"] = [
#             ui_type_id_map[x] for x in section["nonPresetUITypeIds"]
#         ]
#         section["parentId"] = section_id_map.get(section["parentId"], None)

#     return new_sections, section_id_map


# def copy_relative_positions(relative_positions, section_id_map):
#     return rename_keys(relative_positions, section_id_map)
