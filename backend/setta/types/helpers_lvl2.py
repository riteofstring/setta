import copy
from typing import TYPE_CHECKING, TypeVar

from setta.database.utils import create_new_id, remap_ids, rename_keys
from setta.types.clipboard import ProjectStateCoreWithSectionVariantMap
from setta.types.code_obj_impls import BaseParentCodeObjImpl
from setta.types.core import Core, Variant
from setta.types.generated.unions import BaseCodeObjImplUnion, BaseSectionImplUnion
from setta.types.helpers import (
    get_curr_effective_section_impl,
    get_variant_base_and_effective_code_obj_impl,
    get_variant_base_and_effective_section_impl,
)
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import (
    SINGLETON_SECTION_TYPES,
    ProjectStateBackend,
    ProjectStateCore,
    ProjectStateSingleConfig,
)
from setta.types.section_impls import (
    BaseDictSectionImpl,
    BaseParentSectionImpl,
    BaseSectionWithParamsImpl,
    CallableSectionImpl,
)
from setta.types.simplified_states import Position
from setta.utils.generate_memorable_string import generate_memorable_string

if TYPE_CHECKING:
    from setta.types.generated.impl_args_as_typed_dicts import ProjectConfigArgs


T = TypeVar("T", bound=BaseSectionImplUnion | BaseCodeObjImplUnion)


def remove_singleton_sections_if_already_present(
    p: ProjectStateSingleConfig, data: ProjectStateCoreWithSectionVariantMap
):
    # need this to access get_curr_effective_section_impl
    tempConfig = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(sectionVariantMap=data.sectionVariantMap),
        **data.core.model_dump(),
    )
    toRemove: set[str] = set()
    for s in tempConfig.sections:
        impl = get_curr_effective_section_impl(tempConfig, s)
        if impl.type in SINGLETON_SECTION_TYPES and getattr(
            p.singletonSections, impl.type.value
        ):
            toRemove.add(s)
    data.core.sections = {
        k: v for k, v in data.core.sections.items() if k not in toRemove
    }


def inferTopLevelSections(data: ProjectStateCoreWithSectionVariantMap):
    # need this to access parentSectionMap
    tempConfig = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(sectionVariantMap=data.sectionVariantMap),
        **data.core.model_dump(),
    )
    return [k for k, v in tempConfig.parentSectionMap.items() if not v]


def merge_single_config_into_backend(
    x: ProjectStateBackend, config: ProjectStateSingleConfig
):
    return ProjectStateBackend(
        sections={**x.sections, **config.sections},
        sectionImpls={**x.sectionImpls, **config.sectionImpls},
        sectionVariants={**x.sectionVariants, **config.sectionVariants},
        codeObjs={**x.codeObjs, **config.codeObjs},
        codeObjImpls={**x.codeObjImpls, **config.codeObjImpls},
        codeObjVariants={**x.codeObjVariants, **config.codeObjVariants},
        projectConfigs={
            **x.projectConfigs,
            config.projectConfig.id: config.projectConfig,
        },
        defaultProjectConfigId=x.defaultProjectConfigId,
    )


def prepare_sections_for_copy(
    p: ProjectStateCore, sections_to_process: set[str]
) -> ProjectStateCore:
    # Collectors for all the IDs we need
    section_ids: set[str] = set()
    section_impl_ids: set[str] = set()
    section_variant_ids: set[str] = set()
    code_obj_ids: set[str] = set()
    code_obj_impl_ids: set[str] = set()
    code_obj_variant_ids: set[str] = set()

    sections_to_process = copy.deepcopy(sections_to_process)
    code_objs_to_process: set[str] = set()

    # Process sections recursively
    while sections_to_process:
        section_id = sections_to_process.pop()
        if section_id in section_ids:
            continue

        section_ids.add(section_id)
        section = p.sections[section_id]

        for variant_id in section.variants:
            if variant_id in section_variant_ids:
                continue
            section_variant_ids.add(variant_id)
            variant, impl, effective_impl = get_variant_base_and_effective_section_impl(
                p, section, variant_id
            )
            section_impl_ids.add(impl.id)
            section_impl_ids.update(variant.nonPresetImpls)

            if isinstance(effective_impl, BaseParentSectionImpl):
                # Add child sections to process list
                sections_to_process.update(effective_impl.children)
            elif isinstance(effective_impl, BaseSectionWithParamsImpl):
                code_objs_to_process.update(effective_impl.codeObjVariantMap)

    # Process code_objs recursively
    while code_objs_to_process:
        obj_id = code_objs_to_process.pop()
        if obj_id in code_obj_ids:
            continue

        code_obj_ids.add(obj_id)
        obj = p.codeObjs[obj_id]

        for variant_id in obj.variants:
            if variant_id in code_obj_variant_ids:
                continue
            code_obj_variant_ids.add(variant_id)
            variant, base_impl, effective_impl = (
                get_variant_base_and_effective_code_obj_impl(p, obj, variant_id)
            )
            code_obj_impl_ids.add(base_impl.id)
            code_obj_impl_ids.update(variant.nonPresetImpls)

            if isinstance(effective_impl, BaseParentCodeObjImpl):
                code_objs_to_process.update(effective_impl.children)

    # Build the sliced state
    sections = {x: p.sections[x] for x in section_ids}
    sectionImpls = {x: p.sectionImpls[x] for x in section_impl_ids}
    sectionVariants = {x: p.sectionVariants[x] for x in section_variant_ids}
    codeObjs = {x: p.codeObjs[x] for x in code_obj_ids}
    codeObjImpls = {x: p.codeObjImpls[x] for x in code_obj_impl_ids}
    codeObjVariants = {x: p.codeObjVariants[x] for x in code_obj_variant_ids}
    return ProjectStateCore(
        sections=sections,
        sectionImpls=sectionImpls,
        sectionVariants=sectionVariants,
        codeObjs=codeObjs,
        codeObjImpls=codeObjImpls,
        codeObjVariants=codeObjVariants,
    )


def convert_backend_to_single_config(p: ProjectStateBackend, projectConfigId: str):
    project_config = p.projectConfigs[projectConfigId]
    project_state_core = prepare_sections_for_copy(
        p, set(project_config.topLevelSections.keys())
    )

    # Build the sliced state
    return ProjectStateSingleConfig(
        sections=project_state_core.sections,
        sectionImpls=project_state_core.sectionImpls,
        sectionVariants=project_state_core.sectionVariants,
        codeObjs=project_state_core.codeObjs,
        codeObjImpls=project_state_core.codeObjImpls,
        codeObjVariants=project_state_core.codeObjVariants,
        projectConfig=project_config,
    )


def remap_section_variant_map(
    section_variant_map: dict[str, str],
    section_id_map: dict[str, str] | None,
    section_variant_id_map: dict[str, str] | None,
):
    if section_id_map:
        section_variant_map = rename_keys(section_variant_map, section_id_map)
        if section_variant_id_map:
            section_variant_map = {
                k: section_variant_id_map[v] for k, v in section_variant_map.items()
            }
    return section_variant_map


def copy_project_config(
    project_config: ProjectConfig,
    new_config_name: str | None = None,
    do_create_new_id=False,
    section_id_map: dict[str, str] | None = None,
    section_variant_id_map: dict[str, str] | None = None,
):
    new_values: ProjectConfigArgs = {}
    if new_config_name:
        new_values["name"] = new_config_name
    if do_create_new_id:
        new_values["id"] = create_new_id()
    if section_id_map:
        if project_config.entryCodeBlockId:
            new_values["entryCodeBlockId"] = section_id_map[
                project_config.entryCodeBlockId
            ]
        new_values["topLevelSections"] = rename_keys(
            project_config.topLevelSections, section_id_map
        )
        new_values["sectionVariantMap"] = remap_section_variant_map(
            project_config.sectionVariantMap, section_id_map, section_variant_id_map
        )
        new_values["activeIds"] = [section_id_map[v] for v in project_config.activeIds]

    return project_config.model_copy(update=new_values, deep=True)


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


def copy_sections_and_other_info(p: ProjectStateCore):
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

    project_core = ProjectStateCore(
        sections=newSections,
        sectionImpls=newSectionImpls,
        sectionVariants=newSectionVariants,
        codeObjs=newCodeObjs,
        codeObjImpls=newCodeObjImpls,
        codeObjVariants=newCodeObjVariants,
    )
    return project_core, sectionIdMap, sectionVariantIdMap


def copy_project(
    p: ProjectStateSingleConfig,
    new_config_name: str | None = None,
    do_create_new_id=False,
):
    newProjectCore, sectionIdMap, sectionVariantIdMap = copy_sections_and_other_info(p)
    newProjectConfig = copy_project_config(
        p.projectConfig,
        new_config_name,
        do_create_new_id,
        sectionIdMap,
        sectionVariantIdMap,
    )

    return ProjectStateSingleConfig(
        projectConfig=newProjectConfig, **newProjectCore.model_dump()
    )


def paste_sections(
    p: "ProjectStateSingleConfig",
    data: "ProjectStateCoreWithSectionVariantMap",
    position: Position,
    asRef: bool,
):
    if not asRef:
        newCore, sectionIdMap, sectionVariantIdMap = copy_sections_and_other_info(
            data.core
        )
        data.core = newCore
        data.sectionVariantMap = remap_section_variant_map(
            data.sectionVariantMap, sectionIdMap, sectionVariantIdMap
        )

    remove_singleton_sections_if_already_present(p, data)
    topLevelSectionIds = inferTopLevelSections(data)
    topLevelSections = {
        k: TopLevelSectionLayout(x=position.x, y=position.y) for k in topLevelSectionIds
    }

    p.projectConfig.topLevelSections.update(topLevelSections)
    p.projectConfig.sectionVariantMap.update(data.sectionVariantMap)
    p.sections.update(data.core.sections)
    p.sectionImpls.update(data.core.sectionImpls)
    p.sectionVariants.update(data.core.sectionVariants)
    p.codeObjs.update(data.core.codeObjs)
    p.codeObjImpls.update(data.core.codeObjImpls)
    p.codeObjVariants.update(data.core.codeObjVariants)
