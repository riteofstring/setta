import copy
from typing import TYPE_CHECKING, Any, TypeVar

from setta.database.utils import create_new_id, remap_ids, rename_keys
from setta.project_state.project_state_summary_types import (
    ProjectStateSummary,
    ProjectStateSummaryParam,
    ProjectStateSummarySection,
)
from setta.types.clipboard import ProjectStateCoreWithSectionVariantMap
from setta.types.code_obj_impls import BaseParentCodeObjImpl, ParameterPassingStyle
from setta.types.core import Core, Variant
from setta.types.edges import Edge
from setta.types.generated.unions import BaseCodeObjImplUnion, BaseSectionImplUnion
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl,
    get_variant_base_and_effective_code_obj_impl,
    get_variant_base_and_effective_section_impl,
)
from setta.types.helpers_lvl2 import get_meta_control_param_id, get_top_level_param_ids
from setta.types.id import ID
from setta.types.project_config import (
    Position,
    ProjectConfig,
    TopLevelSectionLayout,
    ViewModeConfig,
)
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
    DrawSectionImpl,
    MetaControlSectionImpl,
    TypeErrorIgnoreState,
)
from setta.types.shown_params import ShownParamIds
from setta.utils.generate_memorable_string import generate_memorable_string

if TYPE_CHECKING:
    from setta.types.generated.impl_args_as_typed_dicts import ProjectConfigArgs
    from setta.types.generated.shared_modifier import SharedModifier


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
    p: ProjectStateCore, sections_to_process: set[ID]
) -> ProjectStateCore:
    # Collectors for all the IDs we need
    section_ids: set[ID] = set()
    section_impl_ids: set[ID] = set()
    section_variant_ids: set[ID] = set()
    code_obj_ids: set[ID] = set()
    code_obj_impl_ids: set[ID] = set()
    code_obj_variant_ids: set[ID] = set()

    sections_to_process = copy.deepcopy(sections_to_process)
    code_objs_to_process: set[ID] = set()

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
            elif isinstance(effective_impl, MetaControlSectionImpl):
                if effective_impl.metaControlParamId is not None:
                    code_objs_to_process.add(effective_impl.metaControlParamId)

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


def convert_backend_to_single_config(p: ProjectStateBackend, projectConfigId: ID):
    if projectConfigId not in p.projectConfigs:
        raise KeyError(f"Unknown project config: {projectConfigId}")
    project_config = p.projectConfigs[projectConfigId]
    project_state_core = prepare_sections_for_copy(
        p, set(project_config.sectionVariantMap.keys())
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


def build_project_state_summary(
    project_state: ProjectStateSingleConfig,
) -> ProjectStateSummary:
    """Create a lightweight project summary for agent workflows."""

    project_config = project_state.projectConfig
    singleton_members = {
        value
        for value in project_state.singletonSections.model_dump(
            exclude_none=True
        ).values()
        if value
    }
    shown_param_visibility = {
        variant_id: _collect_visible_top_level_param_ids(shown_ids)
        for variant_id, shown_ids in project_state.shownParamIds.items()
    }
    parent_section_map = dict(project_state.parentSectionMap)
    top_level_layouts = project_state.projectConfig.topLevelSections
    sections: list[ProjectStateSummarySection] = []

    for section_id, core in project_state.sections.items():
        variant_id = project_state.projectConfig.sectionVariantMap.get(section_id)
        if variant_id is None:
            continue

        variant = project_state.sectionVariants[variant_id]
        impl = get_curr_effective_section_impl(project_state, section_id)

        parameters: list[ProjectStateSummaryParam] = []
        if isinstance(impl, BaseSectionWithParamsImpl):
            parameters = _build_section_param_summaries(
                project_state,
                impl,
                shown_param_visibility.get(variant_id, set()),
            )
        elif isinstance(impl, MetaControlSectionImpl):
            parameters = _build_meta_control_param_summaries(
                project_state,
                section_id,
                impl,
            )

        child_section_ids: list[ID] = []
        if isinstance(impl, BaseParentSectionImpl):
            child_section_ids = list(impl.children)

        section_summary = ProjectStateSummarySection(
            sectionId=section_id,
            coreName=core.name,
            variantId=variant_id,
            variantName=variant.name,
            sectionType=impl.type,
            parentSectionId=parent_section_map.get(section_id),
            childSectionIds=child_section_ids,
            isFrozen=variant.isFrozen,
            isMinimized=bool(getattr(impl, "isMinimized", False)),
            isSingletonMember=section_id in singleton_members,
            hideParams=bool(getattr(impl, "hideParams", False)),
            hideUnpinnedParams=bool(getattr(impl, "hideUnpinnedParams", False)),
            topLevelLayout=top_level_layouts.get(section_id),
            layoutLocked=bool(getattr(impl, "positionAndSizeLocked", False)),
            parameters=parameters,
            codeFileBinding=getattr(impl, "codeFileBinding", None),
            imagePath=getattr(impl, "imagePath", None),
            chartDataPath=getattr(impl, "dataPath", None),
            drawLayerAssetPaths=_collect_draw_layer_asset_paths(impl),
        )
        sections.append(section_summary)

    return ProjectStateSummary(
        projectConfig=project_config,
        sections=sections,
        singletonSections=project_state.singletonSections,
        parentSectionMap=parent_section_map,
        shownParamVariantIds=list(project_state.shownParamIds.keys()),
        requiredDecodedImages=list(project_state.requiredDecodedImages),
        genCodeBinding=project_state.genCodeBinding,
    )


def _build_section_param_summaries(
    project_state: ProjectStateSingleConfig,
    section_impl: BaseSectionWithParamsImpl,
    visible_top_level_ids: set[ID],
) -> list[ProjectStateSummaryParam]:
    top_level_param_ids = get_top_level_param_ids(project_state, section_impl)
    if not top_level_param_ids:
        return []

    pinned_param_ids = set(section_impl.pinnedParams)
    selected_param_ids = set(section_impl.selectedParams)

    summaries: list[ProjectStateSummaryParam] = []
    for param_id in top_level_param_ids:
        if param_id not in project_state.codeObjs:
            continue

        variant_id = section_impl.codeObjVariantMap.get(param_id)
        if not variant_id:
            continue

        code_obj = project_state.codeObjs[param_id]
        _, _, param_impl = get_variant_base_and_effective_code_obj_impl(
            project_state, code_obj, variant_id
        )
        summaries.append(
            ProjectStateSummaryParam(
                paramId=param_id,
                name=code_obj.name,
                type=param_impl.type,
                passingStyle=getattr(
                    param_impl, "passingStyle", ParameterPassingStyle.DEFAULT
                ),
                isPinned=param_id in pinned_param_ids,
                isSelected=param_id in selected_param_ids,
                isHidden=_param_is_hidden(
                    param_id,
                    section_impl,
                    visible_top_level_ids,
                    pinned_param_ids,
                ),
                valuePreview=_truncate_value_preview(
                    getattr(param_impl, "value", None)
                ),
            )
        )
    return summaries


def _build_meta_control_param_summaries(
    project_state: ProjectStateSingleConfig,
    section_id: ID,
    section_impl: MetaControlSectionImpl,
) -> list[ProjectStateSummaryParam]:
    param_id = get_meta_control_param_id(project_state, section_id)
    variant_id = section_impl.codeObjVariantMap[param_id]
    code_obj = project_state.codeObjs[param_id]
    _, _, param_impl = get_variant_base_and_effective_code_obj_impl(
        project_state,
        code_obj,
        variant_id,
    )
    return [
        ProjectStateSummaryParam(
            paramId=param_id,
            name=code_obj.name,
            type=param_impl.type,
            passingStyle=getattr(
                param_impl, "passingStyle", ParameterPassingStyle.DEFAULT
            ),
            isPinned=False,
            isSelected=False,
            isHidden=False,
            valuePreview=_truncate_value_preview(getattr(param_impl, "value", None)),
        )
    ]


def _collect_visible_top_level_param_ids(shown_ids: ShownParamIds) -> set[ID]:
    visible: set[ID] = set()
    visible.update(shown_ids.pinned.topLevelParamIds)
    visible.update(shown_ids.unpinned.topLevelParamIds)
    return visible


def _param_is_hidden(
    param_id: ID,
    section_impl: BaseSectionWithParamsImpl,
    visible_top_level_ids: set[ID],
    pinned_param_ids: set[ID],
) -> bool:
    if getattr(section_impl, "hideParams", False):
        return True
    if section_impl.hideUnpinnedParams and param_id not in pinned_param_ids:
        return True
    if visible_top_level_ids and param_id not in visible_top_level_ids:
        return True
    return False


def _collect_draw_layer_asset_paths(section_impl) -> list[str]:
    if not isinstance(section_impl, DrawSectionImpl):
        return []
    seen: set[str] = set()
    paths: list[str] = []
    for layer in section_impl.layers:
        for element in layer.elements:
            path = element.dataPath
            if path and path not in seen:
                seen.add(path)
                paths.append(path)
    return paths


def _truncate_value_preview(value: Any, limit: int = 120) -> str | None:
    if value is None:
        return None
    value_str = value if isinstance(value, str) else str(value)
    if len(value_str) <= limit:
        return value_str
    return f"{value_str[: limit - 3]}..."


def remap_section_variant_map(
    section_variant_map: dict[ID, ID],
    section_id_map: dict[ID, ID] | None,
    section_variant_id_map: dict[ID, ID] | None,
):
    if section_id_map:
        section_variant_map = rename_keys(section_variant_map, section_id_map)
        if section_variant_id_map:
            section_variant_map = {
                k: section_variant_id_map[v] for k, v in section_variant_map.items()
            }
    return section_variant_map


def remap_view_modes(
    view_modes: dict[ID, ViewModeConfig],
    section_id_map: dict[ID, ID] | None,
):
    if not section_id_map:
        return view_modes
    remapped_view_modes: dict[ID, ViewModeConfig] = {}
    for view_mode_id, view_mode in view_modes.items():
        visibility = rename_keys(view_mode.visibilityBySectionId, section_id_map)
        remapped_view_modes[view_mode_id] = view_mode.model_copy(
            update={"visibilityBySectionId": visibility},
            deep=True,
        )
    return remapped_view_modes


def copy_project_config(
    project_config: ProjectConfig,
    new_config_name: str | None = None,
    do_create_new_id=False,
    section_id_map: dict[ID, ID] | None = None,
    section_variant_id_map: dict[ID, ID] | None = None,
    code_obj_id_map: dict[ID, ID] | None = None,
):
    new_values: ProjectConfigArgs = {}
    if new_config_name:
        new_values["name"] = new_config_name
    if do_create_new_id:
        new_values["id"] = create_new_id()
    if section_id_map:
        if section_variant_id_map is None:
            raise ValueError("Section variant map is required to remap project config.")
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
        new_values["viewModes"] = remap_view_modes(
            project_config.viewModes, section_id_map
        )
        if project_config.edges:
            if code_obj_id_map is None:
                raise ValueError("Code obj map is required to remap edges.")
            new_values["edges"] = _remap_edges(
                project_config.edges,
                section_id_map,
                section_variant_id_map,
                code_obj_id_map,
            )

    return project_config.model_copy(update=new_values, deep=True)


def _remap_edges(
    edges: list[Edge],
    section_id_map: dict[ID, ID],
    section_variant_id_map: dict[ID, ID],
    code_obj_id_map: dict[ID, ID],
) -> list[Edge]:
    remapped: list[Edge] = []
    for edge in edges:
        if edge.sourceSectionId not in section_id_map:
            raise KeyError(f"Section {edge.sourceSectionId} missing for edge remap.")
        if edge.targetSectionId not in section_id_map:
            raise KeyError(f"Section {edge.targetSectionId} missing for edge remap.")
        if edge.sourceVariantId not in section_variant_id_map:
            raise KeyError(f"Variant {edge.sourceVariantId} missing for edge remap.")
        if edge.targetVariantId not in section_variant_id_map:
            raise KeyError(f"Variant {edge.targetVariantId} missing for edge remap.")
        if edge.targetPortId not in code_obj_id_map:
            raise KeyError(f"Param {edge.targetPortId} missing for edge remap.")
        remapped.append(
            edge.model_copy(
                update={
                    "sourceSectionId": section_id_map[edge.sourceSectionId],
                    "sourceVariantId": section_variant_id_map[edge.sourceVariantId],
                    "targetSectionId": section_id_map[edge.targetSectionId],
                    "targetVariantId": section_variant_id_map[edge.targetVariantId],
                    "targetPortId": code_obj_id_map[edge.targetPortId],
                },
                deep=True,
            )
        )
    return remapped


def copy_variants(variants: dict[ID, Variant], implIdMap: dict[ID, ID]):
    newVariants, variantIdMap = remap_ids(variants)
    for c in newVariants.values():
        c.id = variantIdMap[c.id]
        c.impl = implIdMap[c.impl]
        c.nonPresetImpls = [implIdMap[v] for v in c.nonPresetImpls]

    return newVariants, variantIdMap


def copy_cores(cores: dict[ID, Core], variantIdMap: dict[ID, ID]):
    newCores, coreIdMap = remap_ids(cores)

    for c in newCores.values():
        c.id = coreIdMap[c.id]
        c.variants = [variantIdMap[v] for v in c.variants]
        if c.defaultVariant:
            c.defaultVariant = variantIdMap[c.defaultVariant]

    return newCores, coreIdMap


def copy_impls(impls: dict[ID, T]):
    nonPresets: dict[ID, T] = {}
    presets: dict[ID, T] = {}
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
    codeObjImpls: dict[ID, BaseCodeObjImplUnion], codeObjIdMap: dict[ID, ID]
):
    for c in codeObjImpls.values():
        if isinstance(c, BaseParentCodeObjImpl):
            c.children = [codeObjIdMap[v] for v in c.children]


def update_section_impl_details(
    sectionImpls: dict[ID, BaseSectionImplUnion],
    sectionIdMap: dict[ID, ID],
    codeObjIdMap: dict[ID, ID],
    codeObjVariantIdMap: dict[ID, ID],
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
            c.edgeInputParams = [codeObjIdMap[v] for v in c.edgeInputParams]
        if isinstance(c, BaseDictSectionImpl):
            if c.topLevelParamId:
                c.topLevelParamId = codeObjIdMap[c.topLevelParamId]
        if isinstance(c, CallableSectionImpl):
            if c.callable:
                c.callable = codeObjIdMap[c.callable]


def _remap_id(value: ID, id_map: dict[ID, ID], label: str) -> ID:
    if value not in id_map:
        raise KeyError(f"{label} {value} missing for remap.")
    return id_map[value]


def _remap_id_list(
    ids: list[ID],
    id_map: dict[ID, ID],
    label: str,
) -> list[ID]:
    return [_remap_id(value, id_map, label) for value in ids]


def _remap_optional_id(
    value: ID | None,
    id_map: dict[ID, ID],
    label: str,
) -> ID | None:
    if value is None:
        return None
    return _remap_id(value, id_map, label)


def _remap_code_obj_variant_map(
    code_obj_variant_map: dict[ID, ID],
    code_obj_id_map: dict[ID, ID],
    code_obj_variant_id_map: dict[ID, ID],
) -> dict[ID, ID]:
    remapped: dict[ID, ID] = {}
    for code_obj_id, variant_id in code_obj_variant_map.items():
        if code_obj_id not in code_obj_id_map:
            raise KeyError(f"Code obj {code_obj_id} missing for remap.")
        if variant_id not in code_obj_variant_id_map:
            raise KeyError(f"Variant {variant_id} missing for remap.")
        remapped[code_obj_id_map[code_obj_id]] = code_obj_variant_id_map[variant_id]
    return remapped


def _remap_ignore_type_errors(
    ignore_type_errors: TypeErrorIgnoreState,
    code_obj_id_map: dict[ID, ID],
) -> None:
    if ignore_type_errors.params:
        ignore_type_errors.params = {
            _remap_id(param_id, code_obj_id_map, "Param"): value
            for param_id, value in ignore_type_errors.params.items()
        }


def update_code_obj_modifier_details(
    codeObjs: dict[ID, Core],
    codeObjVariants: dict[ID, Variant],
    codeObjIdMap: dict[ID, ID],
):
    for core in codeObjs.values():
        if "children" in core.sharedModifier:
            core.sharedModifier["children"] = _remap_id_list(
                core.sharedModifier["children"], codeObjIdMap, "Code obj"
            )
    for variant in codeObjVariants.values():
        if "children" in variant.modifier:
            variant.modifier["children"] = _remap_id_list(
                variant.modifier["children"], codeObjIdMap, "Code obj"
            )


def update_section_modifier_details(
    sections: dict[ID, Core],
    sectionVariants: dict[ID, Variant],
    sectionIdMap: dict[ID, ID],
    codeObjIdMap: dict[ID, ID],
    codeObjVariantIdMap: dict[ID, ID],
):
    for core in sections.values():
        _remap_section_modifier(
            core.sharedModifier,
            sectionIdMap,
            codeObjIdMap,
            codeObjVariantIdMap,
        )
    for variant in sectionVariants.values():
        _remap_section_modifier(
            variant.modifier,
            sectionIdMap,
            codeObjIdMap,
            codeObjVariantIdMap,
        )


def _remap_section_modifier(
    modifier: "SharedModifier",
    section_id_map: dict[ID, ID],
    code_obj_id_map: dict[ID, ID],
    code_obj_variant_id_map: dict[ID, ID],
) -> None:
    if "children" in modifier:
        modifier["children"] = _remap_id_list(
            modifier["children"], section_id_map, "Section"
        )
    if "codeObjVariantMap" in modifier:
        modifier["codeObjVariantMap"] = _remap_code_obj_variant_map(
            modifier["codeObjVariantMap"],
            code_obj_id_map,
            code_obj_variant_id_map,
        )
    if "pinnedParams" in modifier:
        modifier["pinnedParams"] = _remap_id_list(
            modifier["pinnedParams"], code_obj_id_map, "Param"
        )
    if "selectedParams" in modifier:
        modifier["selectedParams"] = _remap_id_list(
            modifier["selectedParams"], code_obj_id_map, "Param"
        )
    if "edgeInputParams" in modifier:
        modifier["edgeInputParams"] = _remap_id_list(
            modifier["edgeInputParams"], code_obj_id_map, "Param"
        )
    if "topLevelParamId" in modifier:
        modifier["topLevelParamId"] = _remap_optional_id(
            modifier["topLevelParamId"], code_obj_id_map, "Param"
        )
    if "metaControlParamId" in modifier:
        modifier["metaControlParamId"] = _remap_optional_id(
            modifier["metaControlParamId"], code_obj_id_map, "Param"
        )
    if "callable" in modifier:
        modifier["callable"] = _remap_optional_id(
            modifier["callable"], code_obj_id_map, "Code obj"
        )
    if "ignoreTypeErrors" in modifier:
        _remap_ignore_type_errors(modifier["ignoreTypeErrors"], code_obj_id_map)


def copy_sections_and_other_info(p: ProjectStateCore):
    newCodeObjImpls, codeObjImplIdMap = copy_impls(p.codeObjImpls)
    newCodeObjVariants, codeObjVariantIdMap = copy_variants(
        p.codeObjVariants, codeObjImplIdMap
    )
    newCodeObjs, codeObjIdMap = copy_cores(p.codeObjs, codeObjVariantIdMap)
    update_code_obj_impl_details(newCodeObjImpls, codeObjIdMap)
    update_code_obj_modifier_details(newCodeObjs, newCodeObjVariants, codeObjIdMap)

    newSectionImpls, sectionImplIdMap = copy_impls(p.sectionImpls)
    newSectionVariants, sectionVariantIdMap = copy_variants(
        p.sectionVariants, sectionImplIdMap
    )
    newSections, sectionIdMap = copy_cores(p.sections, sectionVariantIdMap)
    update_section_impl_details(
        newSectionImpls, sectionIdMap, codeObjIdMap, codeObjVariantIdMap
    )
    update_section_modifier_details(
        newSections,
        newSectionVariants,
        sectionIdMap,
        codeObjIdMap,
        codeObjVariantIdMap,
    )

    project_core = ProjectStateCore(
        sections=newSections,
        sectionImpls=newSectionImpls,
        sectionVariants=newSectionVariants,
        codeObjs=newCodeObjs,
        codeObjImpls=newCodeObjImpls,
        codeObjVariants=newCodeObjVariants,
    )
    return project_core, sectionIdMap, sectionVariantIdMap, codeObjIdMap


def copy_project(
    p: ProjectStateSingleConfig,
    new_config_name: str | None = None,
    do_create_new_id=False,
):
    (
        newProjectCore,
        sectionIdMap,
        sectionVariantIdMap,
        codeObjIdMap,
    ) = copy_sections_and_other_info(p)
    newProjectConfig = copy_project_config(
        p.projectConfig,
        new_config_name,
        do_create_new_id,
        sectionIdMap,
        sectionVariantIdMap,
        codeObjIdMap,
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
        (
            newCore,
            sectionIdMap,
            sectionVariantIdMap,
            _code_obj_id_map,
        ) = copy_sections_and_other_info(data.core)
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
