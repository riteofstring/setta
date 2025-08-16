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
    BaseDictSectionImplArgsWithCallable,
    BaseParentCodeObjImplArgsWithCallable,
    BaseParentSectionImplArgsWithCallable,
    BaseSectionImplArgs,
    BaseSectionImplArgsWithCallable,
    BaseSectionWithParamsImplArgsWithCallable,
    CodeCallableCodeObjImplArgsWithCallable,
    GenPythonCodeSectionImplArgsWithCallable,
    TextParamCodeObjImplArgs,
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
    BaseDictSectionImpl,
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
from setta.types.specific_file_watcher import FileWatcherCoreUpdate
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
    return ProjectStateSingleConfig(
        sections={x: p.sections[x] for x in section_ids},
        sectionImpls={x: p.sectionImpls[x] for x in section_impl_ids},
        sectionVariants={x: p.sectionVariants[x] for x in section_variant_ids},
        codeObjs={x: p.codeObjs[x] for x in code_obj_ids},
        codeObjImpls={x: p.codeObjImpls[x] for x in code_obj_impl_ids},
        codeObjVariants={x: p.codeObjVariants[x] for x in code_obj_variant_ids},
        projectConfig=project_config,
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
    )


def get_curr_effective_section_impl_with_type_guard(
    project_state: ProjectStateSingleConfig,
    section_id: str,
    impl_type: type[GenericBaseSectionImplType],
) -> GenericBaseSectionImplType:
    impl = project_state.get_curr_effective_section_impl(section_id)

    if not isinstance(impl, impl_type):
        raise ValueError(f"Section {section_id} failed type guard")

    return impl


def get_variant_effective_section_impl(
    p: ProjectStateSingleConfig, sectionId: str, variantId: str
):
    variant = p.sectionVariants[variantId]
    impl = p.sectionImpls[variant.impl]
    core = p.sections[sectionId]
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
    return p.codeObjVariants[variant_id]


def get_curr_effective_code_obj_impl(
    p: ProjectStateSingleConfig,
    sectionId: str,
    codeObjId: str,
):
    variant = get_curr_code_obj_variant(p, sectionId, codeObjId)
    baseImpl = p.codeObjImpls[variant.impl]
    core = p.codeObjs[codeObjId]
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
    variant = p.get_curr_section_variant(sectionId)
    impl = p.sectionImpls[variant.impl]
    core = p.sections[sectionId]
    set_effective_impl_value(impl, core, variant, args)


def set_curr_effective_code_obj_impl_value(
    p: ProjectStateSingleConfig,
    sectionId: str,
    codeObjId: str,
    args: BaseCodeObjImplArgsWithCallable,
):
    variant = get_curr_code_obj_variant(p, sectionId, codeObjId)
    impl = p.codeObjImpls[variant.impl]
    core = p.codeObjs[codeObjId]
    set_effective_impl_value(impl, core, variant, args)


def get_curr_section_base_impl(p: ProjectStateSingleConfig, sectionId: str):
    variant = p.get_curr_section_variant(sectionId)
    return p.sectionImpls[variant.impl]


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
    section_impl = p.get_curr_effective_section_impl(section_id)
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
        parent_id = p.get_curr_effective_section_impl(parent_id).parentId

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
    impl = p.get_curr_effective_section_impl(calledBy)
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
        impl = p.get_curr_effective_section_impl(id)
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
    impl = p.get_curr_effective_section_impl(calledBy)
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
    old_impl = p.codeObjImpls[variant.impl]
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
    impl = p.codeObjImpls[variant.impl]
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


def create_kwarg_objs(
    settings: SettingsState, p: ProjectStateSingleConfig, sectionId: str
):
    newImpl = create_code_obj_impl(
        CodeObjType.TextParam,
        settings.textParamCodeObjDefault,
        TextParamCodeObjImplArgs(coreNameEditable=True),
    )
    newCore = Core(name="")
    add_code_obj(p, sectionId, newCore, newImpl)
    return newCore.id


def add_kwarg(settings: SettingsState, p: ProjectStateSingleConfig, sectionId: str):
    sectionImpl = get_curr_effective_section_impl_with_type_guard(
        p, sectionId, BaseSectionWithParamsImpl
    )
    if isinstance(sectionImpl, CallableSectionImpl):
        return add_kwarg_to_callable_section(settings, p, sectionId, sectionImpl)
    elif isinstance(sectionImpl, BaseDictSectionImpl):
        return add_kwarg_to_dict_section(settings, p, sectionId)
    raise TypeError


def add_kwarg_to_callable_section(
    settings: SettingsState,
    p: ProjectStateSingleConfig,
    sectionId: str,
    sectionImpl: CallableSectionImpl,
):
    callableId = sectionImpl.callable
    if not callableId:
        raise ValueError

    newId = create_kwarg_objs(settings, p, sectionId)

    set_curr_effective_code_obj_impl_value(
        p,
        sectionId,
        callableId,
        CodeCallableCodeObjImplArgsWithCallable(
            children=lambda currChildren: [*currChildren, newId]
        ),
    )

    return newId


def add_kwarg_to_dict_section(
    settings: SettingsState,
    p: ProjectStateSingleConfig,
    sectionId: str,
):
    newId = create_kwarg_objs(settings, p, sectionId)

    set_curr_effective_section_impl_value(
        p,
        sectionId,
        BaseDictSectionImplArgsWithCallable(
            topLevelParamIds=lambda curr: [*curr, newId]
        ),
    )

    return newId


def delete_kwarg(p: ProjectStateSingleConfig, sectionId: str):
    sectionImpl = get_curr_effective_section_impl_with_type_guard(
        p, sectionId, BaseSectionWithParamsImpl
    )
    if isinstance(sectionImpl, CallableSectionImpl):
        return delete_kwarg_from_callable_section(p, sectionId, sectionImpl)
    elif isinstance(sectionImpl, BaseDictSectionImpl):
        return delete_kwarg_from_dict_section(p, sectionId)
    raise TypeError


def delete_kwarg_from_callable_section(
    p: ProjectStateSingleConfig,
    sectionId: str,
    sectionImpl: CallableSectionImpl,
):
    callableId = sectionImpl.callable
    if not callableId:
        raise ValueError

    set_curr_effective_code_obj_impl_value(
        p,
        sectionId,
        callableId,
        CodeCallableCodeObjImplArgsWithCallable(
            children=lambda currChildren: currChildren[:-1]
        ),
    )


def delete_kwarg_from_dict_section(
    p: ProjectStateSingleConfig,
    sectionId: str,
):
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        BaseDictSectionImplArgsWithCallable(topLevelParamIds=lambda curr: curr[:-1]),
    )


def maybe_update_gen_python_code_section(p: ProjectStateSingleConfig, code: str):
    sectionId = p.singletonSections.genPythonCode
    if not sectionId:
        return
    set_curr_effective_section_impl_value(
        p, sectionId, GenPythonCodeSectionImplArgsWithCallable(code=code)
    )


def get_json_source_files_to_watch(p: ProjectStateSingleConfig):
    filename_set = set()
    for s in p.sections.values():
        for v in s.variants:
            variant, _, impl = get_variant_base_and_effective_section_impl(p, s, v)
            if isinstance(impl, BaseDictSectionImpl) and impl.isJsonSource:
                filename_set.add(variant.name)
    return filename_set


def get_variants_for_json_source_update(
    p: ProjectStateCore, coreUpdate: FileWatcherCoreUpdate
):
    variantsToLoad: set[str] = set()
    processed = set()
    for section in p.sections.values():
        for variant_id in section.variants:
            if variant_id in variantsToLoad:
                continue
            processed.add(variant_id)
            variant, _, impl = get_variant_base_and_effective_section_impl(
                p, section, variant_id
            )
            if (
                not isinstance(impl, BaseDictSectionImpl)
                or not impl.isJsonSource
                or variant.name != str(coreUpdate.relPath)
            ):
                continue

            variantsToLoad.add(variant_id)
    return variantsToLoad


# function onClickAddKwargFn(sectionId, objInfoId) {
#   return () => {
#     useProjectState.setState((state) => {
#       function callbackFn({ sectionId, parentId, idx, state }) {
#         addKwarg({ sectionId, parentId, insertIdx: idx + 1, state });
#       }

#       const paramsAreSelected = helperForAddDeleteKwarg(
#         sectionId,
#         state,
#         callbackFn,
#       );
#       if (!paramsAreSelected) {
#         addKwarg({ sectionId, parentId: objInfoId, state });
#       }
#     });
#   };
# }

# function onClickDeleteKwargFn(sectionId, objInfoId) {
#   return () => {
#     useProjectState.setState((state) => {
#       let kwargIds = [];

#       function callbackFn({ codeInfoChildren, parentId, idx }) {
#         if (parentId) {
#           kwargIds.push(codeInfoChildren[parentId][idx + 1]);
#         }
#       }

#       const paramsAreSelected = helperForAddDeleteKwarg(
#         sectionId,
#         state,
#         callbackFn,
#       );
#       if (paramsAreSelected) {
#         deleteCodeInfo(sectionId, kwargIds, state);
#       } else {
#         deleteLastKwarg({
#           sectionId,
#           parentId: objInfoId,
#           state,
#         });
#       }
#     });
#   };
# }

# function helperForAddDeleteKwarg(sectionId, state, callbackFn) {
#   const { ids: selectedParamIds } = getAllSelectedParamIds(sectionId, state);
#   if (selectedParamIds.length > 0) {
#     const { codeInfoColId } = getSectionVariant(sectionId, state);
#     const codeInfoChildren = state.codeInfoCols[codeInfoColId].children;
#     for (const p of selectedParamIds) {
#       let parentId, idx;
#       for (const [id, children] of Object.entries(codeInfoChildren)) {
#         if (children.includes(p)) {
#           parentId = id;
#           idx = children.indexOf(p);
#           break;
#         }
#       }
#       callbackFn({ codeInfoChildren, sectionId, parentId, idx, state });
#     }
#     return true;
#   }
#   return false;
# }


# export function deleteSelectedKwargs(sectionId) {
#   useProjectState.setState((x) => {
#     const { ids: selectedParamIds } = getAllSelectedParamIds(sectionId, x);
#     deleteCodeInfo(sectionId, selectedParamIds, x);
#   });
# }


# export function deleteLastKwarg({ sectionId, parentId = null, state }) {
#   const kwargIds = getKwargIds(sectionId, parentId, state);
#   const numKwargs = kwargIds.length;
#   if (numKwargs === 0) {
#     return;
#   }
#   const kwargId = kwargIds[numKwargs - 1];
#   deleteCodeInfo(sectionId, [kwargId], state);
# }


# export function addKwarg({
#   sectionId,
#   name = "",
#   parentId = null,
#   insertIdx = null,
#   state,
# }) {
#   const kwargInfo = createCodeInfo({
#     name,
#     rcType: CodeInfoTypeEnum.PARAMETER,
#     editable: true,
#   });
#   addCodeInfo({
#     sectionId,
#     info: kwargInfo,
#     parent: parentId,
#     insertIdx,
#     state,
#   });
#   return kwargInfo.id;
# }

# export function pinSelectedKwargs(sectionId) {
#   useProjectState.setState((x) => {
#     const { ids: selectedParamIds } = getAllSelectedParamIds(sectionId, x);
#     for (const p of selectedParamIds) {
#       x.codeInfo[p].isPinned = !x.codeInfo[p].isPinned;
#       x.codeInfo[p].isSelected = false;
#     }
#   });
# }

# function getKwargIds(sectionId, codeInfoId, _state) {
#   const state = _state ?? useProjectState.getState();
#   const codeInfoChildren = getCodeInfoCol(sectionId, state).children;
#   return codeInfoChildren[codeInfoId].filter((x) => state.codeInfo[x].editable);
# }

# export function getAllSelectedParamIds(sectionId, state) {
#   const codeInfoState = state.codeInfo;
#   const { selectedItem } = getSectionVariant(sectionId, state);
#   const codeInfoChildren = getCodeInfoCol(sectionId, state).children;
#   const { ids, pathMap } = findAllParametersAndPathMaps({
#     allCodeInfo: codeInfoState,
#     codeInfoChildren,
#     startingId: selectedItem,
#     additionalOutputCondition: (c) => c?.isSelected,
#   });
#   return { ids, pathMap };
# }
