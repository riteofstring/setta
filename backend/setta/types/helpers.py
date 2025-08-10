import copy
import math
import re
from typing import TypeVar, assert_never

from setta.database.utils import create_new_id
from setta.types.code_obj_impls import (
    BaseCodeObjImpl,
    BaseParentCodeObjImpl,
    CodeCallableCodeObjImpl,
    CodeObjType,
)
from setta.types.core import (
    Core,
    Variant,
    compute_initial_default_variant,
    compute_initial_nonPresetImpls,
    get_default_section_core_name,
)
from setta.types.generated.effective_impls import (
    get_effective_impl,
    set_effective_impl_value,
)
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseChildlessCodeObjImplArgsWithCallable,
    BaseCodeObjImplArgs,
    BaseCodeObjImplArgsWithCallable,
    BaseParentCodeObjImplArgsWithCallable,
    BaseParentSectionImplArgsWithCallable,
    BaseSectionImplArgs,
    BaseSectionImplArgsWithCallable,
    BaseSectionWithParamsImplArgsWithCallable,
)
from setta.types.generated.impl_creation_fns import (
    create_code_obj_impl,
    create_section_impl,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.generated.unions import (
    BaseChildlessCodeObjImplUnion,
    BaseCodeObjImplUnion,
    BaseParamCodeObjImplUnion,
)
from setta.types.impl_helpers import (
    update_variants,
)
from setta.types.project_state import (
    ProjectStateBackend,
    ProjectStateCore,
    ProjectStateSingleConfig,
    TopLevelSectionLayout,
)
from setta.types.section_impls import (
    BaseParentSectionImpl,
    BaseSectionImpl,
    BaseSectionWithParamsImpl,
    CallableSectionImpl,
    DictSectionImpl,
    ListRootSectionImpl,
    SectionSize,
    SectionType,
)
from setta.types.simplified_states import Position
from setta.utils.generate_memorable_string import generate_memorable_string
from setta.utils.utils import insert_into_array


class ProjectNotFound(Exception):
    pass


class ProjectNameTaken(Exception):
    pass


GenericBaseSectionImplType = TypeVar(
    "GenericBaseSectionImplType", bound=BaseSectionImpl
)


GenericBaseCodeObjImplType = TypeVar(
    "GenericBaseCodeObjImplType", bound=BaseCodeObjImpl
)


def convert_backend_to_single_config(p: ProjectStateBackend, projectConfigId: str):
    project_config = p.projectConfigs[projectConfigId]

    # Collectors for all the IDs we need
    section_ids: set[str] = set()
    section_impl_ids: set[str] = set()
    section_variant_ids: set[str] = set()
    code_obj_ids: set[str] = set()
    code_obj_impl_ids: set[str] = set()
    code_obj_variant_ids: set[str] = set()

    # Start with top-level sections from project config
    sections_to_process: set[str] = set(project_config.topLevelSections.keys())
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
            variant = p.sectionVariants[variant_id]
            section_impl_ids.add(variant.impl)
            section_impl_ids.update(variant.nonPresetImpls)
            impl = p.sectionImpls[variant.impl]
            effective_impl = get_effective_impl(impl, section, variant)

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
            variant = p.codeObjVariants[variant_id]
            code_obj_impl_ids.add(variant.impl)
            code_obj_impl_ids.update(variant.nonPresetImpls)
            base_impl = p.codeObjImpls[variant.impl]
            effective_impl = get_effective_impl(base_impl, obj, variant)
            if isinstance(effective_impl, BaseParentCodeObjImpl):
                code_objs_to_process.update(effective_impl.children)

    # Build the sliced state
    return ProjectStateSingleConfig(
        sections={x: p.sections[x] for x in section_ids},
        sectionImpls={x: p.sectionImpls[x] for x in section_impl_ids},
        sectionVariants={x: p.sectionVariants[x] for x in section_variant_ids},
        codeObjs={x: p.codeObjs[x] for x in code_obj_ids},
        codeObjImpls={x: p.codeObjImpls[x] for x in code_obj_impl_ids},
        codeObjVariants={x: p.codeObjVariants[x] for x in code_obj_variant_ids},
        projectConfig=project_config,
        modCount=p.modCount,
    )


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
        modCount=config.modCount,
    )


def get_curr_section_variant(
    p: ProjectStateSingleConfig,
    section_id: str,
):
    variant_id = p.projectConfig.sectionVariantMap[section_id]
    return p.sectionVariants[variant_id]


def get_curr_effective_section_impl(
    p: ProjectStateSingleConfig,
    section_id: str,
):
    variant = get_curr_section_variant(p, section_id)
    base_impl = get_section_impl(p, variant.impl)
    core = get_section_core(p, section_id)
    return get_effective_impl(base_impl, core, variant)


def get_curr_effective_section_impl_with_type_guard(
    project_state: ProjectStateSingleConfig,
    section_id: str,
    impl_type: type[GenericBaseSectionImplType],
) -> GenericBaseSectionImplType:
    impl = get_curr_effective_section_impl(project_state, section_id)

    if not isinstance(impl, impl_type):
        raise ValueError(f"Section {section_id} failed type guard")

    return impl


def get_variant_effective_section_impl(
    p: ProjectStateSingleConfig, sectionId: str, variantId: str
):
    variant = get_section_variant(p, variantId)
    impl = get_section_impl(p, variant.impl)
    core = get_section_core(p, sectionId)
    return get_effective_impl(impl, core, variant)


def get_variant_base_and_effective_section_impl(
    p: ProjectStateCore, core: Core, variant_id: str
):
    variant = p.sectionVariants[variant_id]
    base_impl = p.sectionImpls[variant.impl]
    impl = get_effective_impl(base_impl, core, variant)
    return variant, base_impl, impl


def get_curr_code_obj_variant(
    p: ProjectStateSingleConfig, sectionId: str, codeObjId: str
):
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, sectionId, BaseSectionWithParamsImpl
    )
    variant_id = section_impl.codeObjVariantMap[codeObjId]
    return get_code_obj_variant(p, variant_id)


def get_curr_effective_code_obj_impl(
    p: ProjectStateSingleConfig,
    sectionId: str,
    codeObjId: str,
):
    variant = get_curr_code_obj_variant(p, sectionId, codeObjId)
    baseImpl = get_code_obj_impl(p, variant.impl)
    core = get_code_obj_core(p, codeObjId)
    return get_effective_impl(baseImpl, core, variant)


def get_curr_effective_code_obj_impl_with_type_guard(
    project_state: ProjectStateSingleConfig,
    sectionId: str,
    codeObjId: str,
    impl_type: type[GenericBaseCodeObjImplType],
) -> GenericBaseCodeObjImplType:
    impl = get_curr_effective_code_obj_impl(project_state, sectionId, codeObjId)

    if not isinstance(impl, impl_type):
        raise ValueError(f"Section {sectionId}, codeObj {codeObjId} failed type guard")

    return impl


def get_variant_base_code_obj_impl(p: ProjectStateSingleConfig, variantId: str):
    variant = p.codeObjVariants[variantId]
    return p.codeObjImpls[variant.impl]


def get_variant_base_and_effective_code_obj_impl(
    p: ProjectStateCore, core: Core, variant_id: str
):
    variant = p.codeObjVariants[variant_id]
    base_impl = p.codeObjImpls[variant.impl]
    impl = get_effective_impl(base_impl, core, variant)
    return variant, base_impl, impl


def set_curr_effective_section_impl_value(
    p: ProjectStateSingleConfig, sectionId: str, args: BaseSectionImplArgsWithCallable
):
    variant = get_curr_section_variant(p, sectionId)
    impl = get_section_impl(p, variant.impl)
    core = get_section_core(p, sectionId)
    set_effective_impl_value(impl, core, variant, args)


def set_curr_effective_code_obj_impl_value(
    p: ProjectStateSingleConfig,
    sectionId: str,
    codeObjId: str,
    args: BaseCodeObjImplArgsWithCallable,
):
    variant = get_curr_code_obj_variant(p, sectionId, codeObjId)
    impl = get_code_obj_impl(p, variant.impl)
    core = get_code_obj_core(p, sectionId)
    set_effective_impl_value(impl, core, variant, args)


def get_section_core(p: ProjectStateSingleConfig, sectionId: str):
    return p.sections[sectionId]


def get_section_impl(p: ProjectStateSingleConfig, implId: str):
    return p.sectionImpls[implId]


def get_section_variant(p: ProjectStateSingleConfig, variantId: str):
    return p.sectionVariants[variantId]


def get_curr_section_base_impl(p: ProjectStateSingleConfig, sectionId: str):
    variant = get_curr_section_variant(p, sectionId)
    return get_section_impl(p, variant.impl)


def get_code_obj_core(p: ProjectStateCore, codeObjId: str):
    return p.codeObjs[codeObjId]


def get_code_obj_impl(p: ProjectStateCore, implId: str):
    return p.codeObjImpls[implId]


def get_code_obj_variant(p: ProjectStateCore, variantId: str):
    return p.codeObjVariants[variantId]


def get_curr_section_callable_code_obj(p: ProjectStateSingleConfig, section_id: str):
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, CallableSectionImpl
    )
    if section_impl.callable:
        return p.codeObjs[section_impl.callable]
    return None


def get_curr_section_children_ids(
    p: ProjectStateSingleConfig,
    section_id: str,
):
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, BaseParentSectionImpl
    )
    return section_impl.children


def get_curr_top_level_param_ids(
    p: ProjectStateSingleConfig,
    section_id: str,
) -> list[str]:
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, BaseSectionWithParamsImpl
    )
    if isinstance(section_impl, CallableSectionImpl):
        callableId = section_impl.callable
        if not callableId:
            return []
        code_obj_impl = get_curr_effective_code_obj_impl(p, section_id, callableId)
        if isinstance(code_obj_impl, CodeCallableCodeObjImpl):
            return code_obj_impl.children
    elif isinstance(section_impl, DictSectionImpl):
        return section_impl.topLevelParamIds
    raise TypeError


def get_section_path_full_name(p: ProjectStateSingleConfig, section_id: str):
    section_impl = get_curr_effective_section_impl(p, section_id)
    parent_id = section_impl.parentId
    if not parent_id:
        return p.sections[section_id].name

    child_id = section_id
    output = ""
    while parent_id:
        if isinstance(section_impl, ListRootSectionImpl):
            idx = get_curr_section_children_ids(p, parent_id).index(section_id)
            output = f"[{idx}]{output}"
        else:
            child_name = p.sections[child_id].name
            output = f'["{child_name}"]{output}'

        child_id = parent_id
        parent_id = get_curr_effective_section_impl(p, parent_id).parentId

    # child_id will contain the highest parent's id
    child_name = p.sections[child_id].name
    return f"{child_name}{output}"


def callable_is_already_selected(
    p: ProjectStateSingleConfig, sectionId: str, callableName: str
):
    selected_item = get_curr_section_callable_code_obj(p, sectionId)
    return selected_item and selected_item.name == callableName


def callable_has_been_selected_before(
    p: ProjectStateSingleConfig, sectionId: str, callableName: str
):
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, sectionId, CallableSectionImpl
    )
    for c in section_impl.codeObjVariantMap.keys():
        if p.codeObjs[c].name == callableName:
            return c
    return None


def add_code_obj(
    p: ProjectStateSingleConfig,
    section_id: str,
    code_obj: Core,
    code_obj_impl: BaseCodeObjImplUnion,
):
    code_obj_variant = Variant(
        impl=code_obj_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(code_obj_impl),
    )
    code_obj.variants.append(code_obj_variant.id)
    if not code_obj.defaultVariant:
        code_obj.defaultVariant = code_obj_variant.id
    p.codeObjs[code_obj.id] = code_obj
    p.codeObjImpls[code_obj_impl.id] = code_obj_impl
    p.codeObjVariants[code_obj_variant.id] = code_obj_variant

    set_curr_effective_section_impl_value(
        p,
        section_id,
        BaseSectionWithParamsImplArgsWithCallable(
            codeObjVariantMap=lambda currMap: {
                **currMap,
                code_obj.id: code_obj_variant.id,
            }
        ),
    )

    return code_obj_variant


def add_children_of_callable(
    p: ProjectStateSingleConfig,
    section_id: str,
    callable_id: str,
    new_params: list[Core],
    new_param_impl_map: dict[str, BaseParamCodeObjImplUnion],
):
    callable_code_obj_impl = get_curr_effective_code_obj_impl_with_type_guard(
        p, section_id, callable_id, CodeCallableCodeObjImpl
    )
    existing_param_core: dict[str, Core] = {}
    for c in callable_code_obj_impl.children:
        match = p.codeObjs[c]
        existing_param_core[match.name] = match

    param_ids_in_order = []
    for new_param in new_params:
        existing = existing_param_core.get(new_param.name)
        new_param_impl = new_param_impl_map[new_param.id]
        if existing:
            update_variants(p, existing.variants, new_param_impl)
            param_ids_in_order.append(existing.id)
        else:
            add_code_obj(p, section_id, new_param, new_param_impl)
            param_ids_in_order.append(new_param.id)

    set_curr_effective_code_obj_impl_value(
        p,
        section_id,
        callable_id,
        BaseParentCodeObjImplArgsWithCallable(children=param_ids_in_order),
    )


def set_param_entered_value(
    p: ProjectStateSingleConfig,
    sectionId: str,
    paramId: str,
    value: str,
):
    set_curr_effective_code_obj_impl_value(
        p, sectionId, paramId, BaseChildlessCodeObjImplArgsWithCallable(value=value)
    )


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


def create_section(
    settings: SettingsState,
    p: ProjectStateSingleConfig,
    impl_type: SectionType,
    impl_overrides: dict | None = None,
    core_overrides: dict | None = None,
):
    impl = create_section_impl(
        impl_type,
        get_user_default_section_from_settings(settings, impl_type),
        impl_overrides,
    )
    variant = Variant(impl=impl.id, nonPresetImpls=compute_initial_nonPresetImpls(impl))
    if not core_overrides:
        core_overrides = {}
    core = Core(
        name=get_default_section_core_name(impl_type),
        **compute_initial_default_variant(variant),
        **core_overrides,
    )
    p.projectConfig.sectionVariantMap[core.id] = variant.id
    p.sections[core.id] = core
    p.sectionImpls[impl.id] = impl
    p.sectionVariants[variant.id] = variant

    return core.id


def create_top_level_section(
    settings: SettingsState,
    p: ProjectStateSingleConfig,
    impl_type: SectionType,
    position: Position,
    impl_overrides: dict | None = None,
    core_overrides: dict | None = None,
):
    sectionId = create_section(settings, p, impl_type, impl_overrides, core_overrides)
    p.projectConfig.topLevelSections[sectionId] = TopLevelSectionLayout(
        **position.model_dump()
    )
    return sectionId


def create_child_sections(
    settings: SettingsState,
    p: ProjectStateSingleConfig,
    parentId: str,
    impl_type: SectionType,
    numChildren: int,
    startIdx: int | None,
):
    effectiveImpl = get_curr_effective_section_impl_with_type_guard(
        p, parentId, BaseParentSectionImpl
    )
    size = SectionSize(width=effectiveImpl.size.width)
    newIds = [
        create_section(settings, p, impl_type, {"size": size, "parentId": parentId})
        for _ in range(numChildren)
    ]
    if startIdx is None:
        startIdx = len(effectiveImpl.children)

    set_curr_effective_section_impl_value(
        p,
        parentId,
        BaseParentSectionImplArgsWithCallable(
            children=lambda currChildren: insert_into_array(
                currChildren, startIdx, newIds
            )
        ),
    )

    return newIds


def create_child_sections_via_incrementer(
    settings: SettingsState,
    p: ProjectStateSingleConfig,
    calledBy: str,
    impl_type: SectionType,
    numChildren: int,
):
    impl = get_curr_effective_section_impl(p, calledBy)
    if isinstance(impl, BaseParentSectionImpl):
        parentId = calledBy
        startIdx = 0
    else:
        parentId = impl.parentId
        if not parentId:
            raise ValueError
        parentImpl = get_curr_effective_section_impl_with_type_guard(
            p, parentId, BaseParentSectionImpl
        )
        startIdx = parentImpl.children.index(calledBy) + 1
    create_child_sections(settings, p, parentId, impl_type, numChildren, startIdx)


def delete_sections(p: ProjectStateSingleConfig, sectionIds: list[str]):
    to_delete = get_all_sections_for_deletion_or_copying(p, sectionIds)
    for id in to_delete:
        impl = get_curr_effective_section_impl(p, id)
        # delete from parent's current children list
        if impl.parentId:
            set_curr_effective_section_impl_value(
                p,
                impl.parentId,
                BaseParentSectionImplArgsWithCallable(
                    children=lambda currChildren: [x for x in currChildren if x != id]
                ),
            )

        still_used = check_if_section_is_still_used_somewhere(p, id)
        if not still_used:
            del p.sections[id]
            if not impl.parentId:
                del p.projectConfig.topLevelSections[id]


def delete_child_sections_via_decrementer(
    p: ProjectStateSingleConfig, calledBy: str, numChildren: int
):
    impl = get_curr_effective_section_impl(p, calledBy)
    if isinstance(impl, BaseParentSectionImpl):
        sectionIds = impl.children[:numChildren]
    else:
        if not impl.parentId:
            raise ValueError
        parentImpl = get_curr_effective_section_impl_with_type_guard(
            p, impl.parentId, BaseParentSectionImpl
        )
        startIdx = parentImpl.children.index(calledBy) + 1
        sectionIds = parentImpl.children[startIdx : startIdx + numChildren]

    delete_sections(p, sectionIds)


def check_if_section_is_still_used_somewhere(
    p: ProjectStateSingleConfig, sectionId: str
):
    for s in p.sections.values():
        if sectionId in s.sharedModifier.get("children", []):
            return True
    for s in p.sectionImpls.values():
        if isinstance(s, BaseParentSectionImpl) and sectionId in s.children:
            return True
    for s in p.sectionVariants.values():
        if sectionId in s.modifier.get("children", []):
            return True
    return False


def get_all_sections_for_deletion_or_copying(
    p: ProjectStateSingleConfig, sectionIds: list[str]
):
    idsToDelete = copy.deepcopy(sectionIds)
    visited = set()
    idx = 0
    while idx < len(idsToDelete):
        currId = idsToDelete[idx]
        if currId not in visited:
            currChildren = get_section_descendants_from_all_variants(p, currId)
            idsToDelete.extend(currChildren)
            visited.add(currId)
        idx += 1
    return set(idsToDelete)


def get_section_descendants_from_all_variants(
    p: ProjectStateSingleConfig, sectionId: str
):
    output: list[str] = []
    core = p.sections[sectionId]
    for variantId in core.variants:
        impl = get_variant_effective_section_impl(p, sectionId, variantId)
        if isinstance(impl, BaseParentSectionImpl):
            output.extend(impl.children)
    return output


def create_new_section_variant(p: ProjectStateSingleConfig, sectionId: str):
    currBaseImpl = get_curr_section_base_impl(p, sectionId)
    if currBaseImpl.isPreset:
        newBaseImpl = currBaseImpl
    else:
        newBaseImpl = currBaseImpl.model_copy(
            update=BaseSectionImplArgs(
                id=create_new_id(), name=generate_memorable_string()
            ),
            deep=True,
        )

    newVariant = Variant(
        impl=newBaseImpl.id, nonPresetImpls=compute_initial_nonPresetImpls(newBaseImpl)
    )
    core = p.sections[sectionId]

    if isinstance(newBaseImpl, BaseSectionWithParamsImpl):
        newCodeObjVariantMap: dict[str, str] = {}
        for codeObjId, codeObjVariantId in newBaseImpl.codeObjVariantMap.items():
            newCodeObjVariantMap[codeObjId] = create_new_code_obj_version(
                p, codeObjId, codeObjVariantId
            )
        set_effective_impl_value(
            newBaseImpl,
            core,
            newVariant,
            BaseSectionWithParamsImplArgsWithCallable(
                codeObjVariantMap=newCodeObjVariantMap
            ),
        )

    core.variants.append(newVariant.id)
    p.sectionImpls[newBaseImpl.id] = newBaseImpl
    p.sectionVariants[newVariant.id] = newVariant
    p.projectConfig.sectionVariantMap[sectionId] = newVariant.id


def create_new_code_obj_version(
    p: ProjectStateSingleConfig, codeObjId: str, codeObjVariantId: str
):
    currBaseImpl = get_variant_base_code_obj_impl(p, codeObjVariantId)
    if currBaseImpl.isPreset:
        newBaseImpl = currBaseImpl
    else:
        newBaseImpl = currBaseImpl.model_copy(
            update=BaseCodeObjImplArgs(
                id=create_new_id(),
                name=generate_memorable_string(),
            ),
            deep=True,
        )

    newVariant = Variant(
        impl=newBaseImpl.id, nonPresetImpls=compute_initial_nonPresetImpls(newBaseImpl)
    )
    core = p.codeObjs[codeObjId]

    core.variants.append(newVariant.id)
    p.codeObjImpls[newBaseImpl.id] = newBaseImpl
    p.codeObjVariants[newVariant.id] = newVariant
    return newVariant.id


def change_param_impl(
    settings: SettingsState,
    p: ProjectStateSingleConfig,
    sectionId: str,
    paramInfoId: str,
    selectedId: str,
):
    variant = get_curr_code_obj_variant(
        p,
        sectionId,
        paramInfoId,
    )
    old_impl = get_code_obj_impl(p, variant.impl)
    impl = p.codeObjImpls.get(selectedId, None)
    if not impl:
        # selectedId will be the CodeObjType name
        type = CodeObjType[selectedId]
        impl = create_code_obj_impl(
            type=type, defaults=get_user_default_code_obj_from_settings(settings, type)
        )
        p.codeObjImpls[impl.id] = impl

    variant.impl = impl.id
    if not impl.isPreset and impl.id not in variant.nonPresetImpls:
        variant.nonPresetImpls.append(impl.id)

    maybe_convert_code_obj_value(old_impl, impl, p.codeObjs[paramInfoId], variant)


def update_param_impl_config(
    p: ProjectStateSingleConfig,
    sectionId: str,
    paramInfoId: str,
    newConfig: dict,
):
    variant = get_curr_code_obj_variant(
        p,
        sectionId,
        paramInfoId,
    )
    impl = get_code_obj_impl(p, variant.impl)
    for k, v in newConfig.items():
        setattr(impl, k, v)
    maybe_convert_code_obj_value(impl, impl, p.codeObjs[paramInfoId], variant)


def get_user_default_code_obj_from_settings(settings: SettingsState, x: CodeObjType):
    return getattr(settings, x[0].lower() + x[1:] + "CodeObjDefault")


def get_user_default_section_from_settings(settings: SettingsState, x: SectionType):
    return getattr(settings, x[0].lower() + x[1:] + "SectionDefault")


def maybe_convert_code_obj_value(old_impl, new_impl, core, variant):
    if isinstance(old_impl, BaseChildlessCodeObjImplUnion) and isinstance(
        new_impl, BaseChildlessCodeObjImplUnion
    ):
        old_effective_impl = get_effective_impl(old_impl, core, variant)
        old_value = old_effective_impl.value
        new_value = convert_code_obj_value(new_impl, old_value)
        set_effective_impl_value(
            new_impl,
            core,
            variant,
            BaseChildlessCodeObjImplArgsWithCallable(value=new_value),
        )


def convert_code_obj_value(impl: BaseChildlessCodeObjImplUnion, value: str):
    match impl.type:
        case (
            CodeObjType.CodeParam
            | CodeObjType.TextParam
            | CodeObjType.DropdownParam
            | CodeObjType.PasswordParam
        ):
            return value
        case CodeObjType.SliderParam:
            try:
                x = float(value)
                if not math.isnan(x):
                    return str(max(min(x, impl.max), impl.min))
            except (ValueError, TypeError):
                pass
            return str(impl.min)
        case CodeObjType.SwitchParam:
            return "false" if value == "0" else "true"
        case CodeObjType.ColorPickerParam:
            if len(impl.choices) > 0:
                if value in [c.color for c in impl.choices]:
                    return value
                return impl.choices[0].color
            elif is_color_hex(value):
                return value
            return "#ff0000"
        case _:
            assert_never(impl.type)


def is_color_hex(string):
    pattern = r"^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$"
    return bool(re.match(pattern, string))


# use this if lambda function isn't sufficient for the type checker
def get_code_obj_variant_map_update_fn(newMappings: dict[str, str]):
    def fn(currMap: dict[str, str]):
        return {**currMap, **newMappings}

    return fn
