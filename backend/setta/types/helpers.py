import copy
import math
import re
from pathlib import Path
from typing import TYPE_CHECKING, TypeVar, assert_never

from setta.database.utils import create_new_id
from setta.types.chart import ChartType
from setta.types.code_obj_impls import (
    BaseCodeObjImpl,
    CodeCallableCodeObjImpl,
    CodeObjType,
)
from setta.types.core import (
    Core,
    Variant,
    compute_initial_nonPresetImpls,
    get_default_section_core_name,
)
from setta.types.generated.chart_settings_unions import BaseChartSettingsTypeAdapter
from setta.types.generated.effective_impls import (
    get_effective_impl,
    set_effective_impl_value,
)
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseChildlessCodeObjImplArgsWithCallable,
    BaseCodeObjImplArgs,
    BaseCodeObjImplArgsWithCallable,
    BaseCodeSectionImplArgsWithCallable,
    BaseDictSectionImplArgsWithCallable,
    BaseParentCodeObjImplArgsWithCallable,
    BaseParentSectionImplArgsWithCallable,
    BaseSectionImplArgs,
    BaseSectionImplArgsWithCallable,
    BaseSectionWithParamsImplArgsWithCallable,
    BrowserSectionImplArgsWithCallable,
    ChartSectionImplArgsWithCallable,
    CodeCallableCodeObjImplArgsWithCallable,
    CoreArgs,
    GenPythonCodeSectionImplArgsWithCallable,
    ImageSectionImplArgsWithCallable,
    SocialSectionImplArgsWithCallable,
    TextBlockSectionImplArgsWithCallable,
    TextParamCodeObjImplArgs,
)
from setta.types.generated.impl_creation_fns import (
    create_code_obj_impl,
    create_section_impl,
)
from setta.types.generated.settings_state import (
    SettingsState,
    get_user_default_code_obj_from_settings,
    get_user_default_section_from_settings,
)
from setta.types.generated.unions import (
    BaseChildlessCodeObjImplUnion,
    BaseCodeObjImplUnion,
    BaseParamCodeObjImplUnion,
    BaseSectionImplArgsUnion,
)
from setta.types.project_config import TopLevelSectionLayout
from setta.types.section_impls import (
    BaseDictSectionImpl,
    BaseParentSectionImpl,
    BaseSectionImpl,
    BaseSectionWithParamsImpl,
    BrowserAreaViewMode,
    CallableSectionImpl,
    ConfigLanguage,
    GroupSectionImpl,
    ListRootSectionImpl,
    SectionSize,
    SectionType,
    SectionWithParamsDisplayMode,
    TextBlockDisplayMode,
    TextBlockFormat,
    TextBlockSectionImpl,
)
from setta.types.simplified_states import Position
from setta.types.specific_file_watcher import FileWatcherCoreUpdate
from setta.utils.generate_memorable_string import generate_memorable_string
from setta.utils.utils import insert_into_array, move_item_in_array

if TYPE_CHECKING:
    from setta.types.project_state import (
        ProjectStateBackend,
        ProjectStateCore,
        ProjectStateSingleConfig,
    )


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


def get_curr_effective_section_impl(
    p: "ProjectStateSingleConfig",
    section_id: str,
):
    variant = get_curr_section_variant(p, section_id)
    base_impl = p.sectionImpls[variant.impl]
    core = p.sections[section_id]
    return get_effective_impl(base_impl, core, variant)


def get_curr_effective_section_impl_with_type_guard(
    project_state: "ProjectStateSingleConfig",
    section_id: str,
    impl_type: type[GenericBaseSectionImplType],
) -> GenericBaseSectionImplType:
    impl = get_curr_effective_section_impl(project_state, section_id)

    if not isinstance(impl, impl_type):
        raise ValueError(f"Section {section_id} failed type guard")

    return impl


def get_variant_effective_section_impl(
    p: "ProjectStateSingleConfig", sectionId: str, variantId: str
):
    variant = p.sectionVariants[variantId]
    impl = p.sectionImpls[variant.impl]
    core = p.sections[sectionId]
    return get_effective_impl(impl, core, variant)


def get_variant_base_and_effective_section_impl(
    p: "ProjectStateCore", core: Core, variant_id: str
):
    variant = p.sectionVariants[variant_id]
    base_impl = p.sectionImpls[variant.impl]
    impl = get_effective_impl(base_impl, core, variant)
    return variant, base_impl, impl


def get_variant_base_and_effective_section_impl_with_type_guard(
    p: "ProjectStateCore",
    core: Core,
    variant_id: str,
    impl_type: type[GenericBaseSectionImplType],
) -> tuple[Variant, GenericBaseSectionImplType, GenericBaseSectionImplType]:
    variant, base_impl, impl = get_variant_base_and_effective_section_impl(
        p, core, variant_id
    )
    if not isinstance(base_impl, impl_type) or not isinstance(impl, impl_type):
        raise TypeError
    return variant, base_impl, impl


def get_curr_section_variant(
    p: "ProjectStateSingleConfig",
    section_id: str,
):
    variant_id = p.projectConfig.sectionVariantMap[section_id]
    return p.sectionVariants[variant_id]


def get_curr_code_obj_variant(
    p: "ProjectStateSingleConfig", sectionId: str, codeObjId: str
):
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, sectionId, BaseSectionWithParamsImpl
    )
    variant_id = section_impl.codeObjVariantMap[codeObjId]
    return p.codeObjVariants[variant_id]


def get_curr_effective_code_obj_impl(
    p: "ProjectStateSingleConfig",
    sectionId: str,
    codeObjId: str,
):
    variant = get_curr_code_obj_variant(p, sectionId, codeObjId)
    baseImpl = p.codeObjImpls[variant.impl]
    core = p.codeObjs[codeObjId]
    return get_effective_impl(baseImpl, core, variant)


def get_curr_effective_code_obj_impl_with_type_guard(
    project_state: "ProjectStateSingleConfig",
    sectionId: str,
    codeObjId: str,
    impl_type: type[GenericBaseCodeObjImplType],
) -> GenericBaseCodeObjImplType:
    impl = get_curr_effective_code_obj_impl(project_state, sectionId, codeObjId)

    if not isinstance(impl, impl_type):
        raise ValueError(f"Section {sectionId}, codeObj {codeObjId} failed type guard")

    return impl


def get_variant_base_code_obj_impl(p: "ProjectStateSingleConfig", variantId: str):
    variant = p.codeObjVariants[variantId]
    return p.codeObjImpls[variant.impl]


def get_variant_base_and_effective_code_obj_impl(
    p: "ProjectStateCore", core: Core, variant_id: str
):
    variant = p.codeObjVariants[variant_id]
    base_impl = p.codeObjImpls[variant.impl]
    impl = get_effective_impl(base_impl, core, variant)
    return variant, base_impl, impl


def set_curr_effective_section_impl_value(
    p: "ProjectStateSingleConfig", sectionId: str, args: BaseSectionImplArgsWithCallable
):
    variant = get_curr_section_variant(p, sectionId)
    impl = p.sectionImpls[variant.impl]
    core = p.sections[sectionId]
    set_effective_impl_value(impl, core, variant, args)


def set_curr_effective_code_obj_impl_value(
    p: "ProjectStateSingleConfig",
    sectionId: str,
    codeObjId: str,
    args: BaseCodeObjImplArgsWithCallable,
):
    variant = get_curr_code_obj_variant(p, sectionId, codeObjId)
    impl = p.codeObjImpls[variant.impl]
    core = p.codeObjs[codeObjId]
    set_effective_impl_value(impl, core, variant, args)


def get_curr_section_base_impl(p: "ProjectStateSingleConfig", sectionId: str):
    variant = get_curr_section_variant(p, sectionId)
    return p.sectionImpls[variant.impl]


def get_curr_section_callable_code_obj(p: "ProjectStateSingleConfig", section_id: str):
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, CallableSectionImpl
    )
    if section_impl.callable:
        return p.codeObjs[section_impl.callable]
    return None


def get_curr_section_children_ids(
    p: "ProjectStateSingleConfig",
    section_id: str,
):
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, BaseParentSectionImpl
    )
    return section_impl.children


def get_curr_top_level_param_ids(
    p: "ProjectStateSingleConfig",
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
    elif isinstance(section_impl, BaseDictSectionImpl):
        return section_impl.topLevelParamIds
    raise TypeError


def get_section_path_full_name(p: "ProjectStateSingleConfig", section_id: str):
    section_impl = get_curr_effective_section_impl(p, section_id)
    parent_id = p.parentSectionMap[section_id]
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
        parent_id = p.parentSectionMap[parent_id]

    # child_id will contain the highest parent's id
    child_name = p.sections[child_id].name
    return f"{child_name}{output}"


def callable_is_already_selected(
    p: "ProjectStateSingleConfig", sectionId: str, callableName: str
):
    selected_item = get_curr_section_callable_code_obj(p, sectionId)
    return selected_item and selected_item.name == callableName


def callable_has_been_selected_before(
    p: "ProjectStateSingleConfig", sectionId: str, callableName: str
):
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, sectionId, CallableSectionImpl
    )
    for c in section_impl.codeObjVariantMap.keys():
        if p.codeObjs[c].name == callableName:
            return c
    return None


def add_code_obj(
    p: "ProjectStateSingleConfig",
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


def update_variants(
    p: "ProjectStateSingleConfig", variant_ids: list[str], new_impl: BaseCodeObjImpl
):
    for variant_id in variant_ids:
        variant = p.codeObjVariants[variant_id]
        impl = p.codeObjImpls[variant.impl]
        p.codeObjImpls[variant.impl] = impl.model_copy(
            update=new_impl.model_dump(exclude_unset=True)
        )


def add_children_of_callable(
    p: "ProjectStateSingleConfig",
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
    p: "ProjectStateSingleConfig",
    sectionId: str,
    paramId: str,
    value: str,
):
    set_curr_effective_code_obj_impl_value(
        p, sectionId, paramId, BaseChildlessCodeObjImplArgsWithCallable(value=value)
    )


def confirm_config_name(p: "ProjectStateBackend", projectConfigName: str):
    for projectConfigId, config in p.projectConfigs.items():
        if projectConfigName == config.name:
            return projectConfigId
    raise ProjectNotFound


def set_project_config_name(
    p: "ProjectStateBackend", projectConfigId: str, newName: str
):
    for k, v in p.projectConfigs.items():
        if k != projectConfigId and v.name == newName:
            raise ProjectNameTaken(f"{newName} is already taken")
    p.projectConfigs[projectConfigId].name = newName


def create_section(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    impl_type: SectionType,
    impl_overrides: BaseSectionImplArgsUnion | None = None,
    core_overrides: CoreArgs | None = None,
):
    impl = create_section_impl(  # type: ignore
        impl_type,  # type: ignore
        get_user_default_section_from_settings(settings, impl_type),  # type: ignore
        impl_overrides,  # type: ignore
    )
    variant = Variant(impl=impl.id, nonPresetImpls=compute_initial_nonPresetImpls(impl))
    default_core_args: CoreArgs = {
        "name": get_default_section_core_name(impl_type),
        **compute_initial_default_variant(variant),
    }
    if core_overrides:
        default_core_args.update(core_overrides)
    core = Core(**default_core_args)
    p.projectConfig.sectionVariantMap[core.id] = variant.id
    p.sections[core.id] = core
    p.sectionImpls[impl.id] = impl
    p.sectionVariants[variant.id] = variant

    return core.id


def create_top_level_section(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    impl_type: SectionType,
    position: Position,
    impl_overrides: BaseSectionImplArgsUnion | None = None,
    core_overrides: CoreArgs | None = None,
):
    sectionId = create_section(settings, p, impl_type, impl_overrides, core_overrides)
    p.projectConfig.topLevelSections[sectionId] = TopLevelSectionLayout(
        **position.model_dump()
    )
    return sectionId


def create_child_sections(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
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
        create_section(settings, p, impl_type, {"size": size})
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
    p: "ProjectStateSingleConfig",
    calledBy: str,
    impl_type: SectionType,
    numChildren: int,
):
    impl = get_curr_effective_section_impl(p, calledBy)
    if isinstance(impl, BaseParentSectionImpl):
        parentId = calledBy
        startIdx = 0
    else:
        parentId = p.parentSectionMap[calledBy]
        if not parentId:
            raise ValueError
        parentImpl = get_curr_effective_section_impl_with_type_guard(
            p, parentId, BaseParentSectionImpl
        )
        startIdx = parentImpl.children.index(calledBy) + 1
    create_child_sections(settings, p, parentId, impl_type, numChildren, startIdx)


def delete_sections(p: "ProjectStateSingleConfig", sectionIds: list[str]):
    to_delete = get_all_sections_for_deletion_or_copying(p, sectionIds)
    for id in to_delete:
        parentId = p.parentSectionMap[id]
        # delete from parent's current children list
        if parentId:
            set_curr_effective_section_impl_value(
                p,
                parentId,
                BaseParentSectionImplArgsWithCallable(
                    children=lambda currChildren: [x for x in currChildren if x != id]
                ),
            )

        still_used = check_if_section_is_still_used_somewhere(p, id)
        if not still_used:
            del p.sections[id]
            if not parentId:
                del p.projectConfig.topLevelSections[id]

    p.validate_active_ids()


def delete_child_sections_via_decrementer(
    p: "ProjectStateSingleConfig", calledBy: str, numChildren: int
):
    impl = get_curr_effective_section_impl(p, calledBy)
    if isinstance(impl, BaseParentSectionImpl):
        sectionIds = impl.children[:numChildren]
    else:
        parentId = p.parentSectionMap[calledBy]
        if not parentId:
            raise ValueError
        parentImpl = get_curr_effective_section_impl_with_type_guard(
            p, parentId, BaseParentSectionImpl
        )
        startIdx = parentImpl.children.index(calledBy) + 1
        sectionIds = parentImpl.children[startIdx : startIdx + numChildren]

    delete_sections(p, sectionIds)


def check_if_section_is_still_used_somewhere(
    p: "ProjectStateSingleConfig", sectionId: str
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
    p: "ProjectStateSingleConfig", sectionIds: list[str]
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
    p: "ProjectStateSingleConfig", sectionId: str
):
    output: list[str] = []
    core = p.sections[sectionId]
    for variantId in core.variants:
        impl = get_variant_effective_section_impl(p, sectionId, variantId)
        if isinstance(impl, BaseParentSectionImpl):
            output.extend(impl.children)
    return output


def create_new_section_variant(p: "ProjectStateSingleConfig", sectionId: str):
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
    p: "ProjectStateSingleConfig", codeObjId: str, codeObjVariantId: str
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
    p: "ProjectStateSingleConfig",
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
            type=type,  # type: ignore
            defaults=get_user_default_code_obj_from_settings(settings, type),  # type: ignore
        )
        p.codeObjImpls[impl.id] = impl

    variant.impl = impl.id
    if not impl.isPreset and impl.id not in variant.nonPresetImpls:
        variant.nonPresetImpls.append(impl.id)

    maybe_convert_code_obj_value(old_impl, impl, p.codeObjs[paramInfoId], variant)


def update_param_impl_config(
    p: "ProjectStateSingleConfig",
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
    settings: SettingsState, p: "ProjectStateSingleConfig", sectionId: str
):
    newImpl = create_code_obj_impl(
        CodeObjType.TextParam,
        settings.textParamCodeObjDefault,
        TextParamCodeObjImplArgs(coreNameEditable=True),
    )
    newCore = Core(name="")
    add_code_obj(p, sectionId, newCore, newImpl)
    return newCore.id


def add_kwarg(settings: SettingsState, p: "ProjectStateSingleConfig", sectionId: str):
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
    p: "ProjectStateSingleConfig",
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
    p: "ProjectStateSingleConfig",
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


def delete_kwarg(p: "ProjectStateSingleConfig", sectionId: str):
    sectionImpl = get_curr_effective_section_impl_with_type_guard(
        p, sectionId, BaseSectionWithParamsImpl
    )
    if isinstance(sectionImpl, CallableSectionImpl):
        return delete_kwarg_from_callable_section(p, sectionId, sectionImpl)
    elif isinstance(sectionImpl, BaseDictSectionImpl):
        return delete_kwarg_from_dict_section(p, sectionId)
    raise TypeError


def delete_kwarg_from_callable_section(
    p: "ProjectStateSingleConfig",
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
    p: "ProjectStateSingleConfig",
    sectionId: str,
):
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        BaseDictSectionImplArgsWithCallable(topLevelParamIds=lambda curr: curr[:-1]),
    )


def maybe_update_gen_python_code_section(p: "ProjectStateSingleConfig", code: str):
    sectionId = p.singletonSections.GenPythonCode
    if not sectionId:
        return
    set_curr_effective_section_impl_value(
        p, sectionId, GenPythonCodeSectionImplArgsWithCallable(code=code)
    )


def get_json_source_files_to_watch(p: "ProjectStateSingleConfig"):
    filename_set = set()
    for s in p.sections.values():
        for v in s.variants:
            variant, _, impl = get_variant_base_and_effective_section_impl(p, s, v)
            if isinstance(impl, BaseDictSectionImpl) and impl.isJsonSource:
                filename_set.add(variant.name)
    return filename_set


def get_variants_for_json_source_update(
    p: "ProjectStateCore", coreUpdate: FileWatcherCoreUpdate
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


def delete_section_variant_or_ask(
    p: "ProjectStateSingleConfig", sectionId: str, variantId: str
):
    core = p.sections[sectionId]
    variant, _, impl = get_variant_base_and_effective_section_impl(p, core, variantId)
    if isinstance(impl, BaseDictSectionImpl) and impl.isJsonSource:
        return Path(variant.name).resolve()
    delete_section_variant(p, sectionId, variantId)


def delete_section_variant(
    p: "ProjectStateSingleConfig", sectionId: str, variantId: str
):
    core = p.sections[sectionId]
    if len(core.variants) < 2:
        return  # can't delete variant if there's only 1
    core.variants = [v for v in core.variants if v != variantId]
    if core.defaultVariant == variantId:
        core.defaultVariant = core.variants[0]
    if get_curr_section_variant(p, sectionId).id == variantId:
        p.projectConfig.sectionVariantMap[sectionId] = core.variants[0]

    del p.sectionVariants[variantId]


def toggle_variant_json_source(
    p: "ProjectStateSingleConfig", sectionId: str, variantId: str
):
    core = p.sections[sectionId]
    variant, base_impl, _ = get_variant_base_and_effective_section_impl_with_type_guard(
        p, core, variantId, BaseDictSectionImpl
    )
    newIsJsonSource = not base_impl.isJsonSource
    newConfigLanguage = (
        ConfigLanguage.json if newIsJsonSource else ConfigLanguage.python
    )
    set_effective_impl_value(
        base_impl,
        core,
        variant,
        BaseDictSectionImplArgsWithCallable(
            isJsonSource=newIsJsonSource, configLanguage=newConfigLanguage
        ),
    )


def toggle_variant_frozen(p: "ProjectStateSingleConfig", variantId: str):
    p.sectionVariants[variantId].isFrozen = not p.sectionVariants[variantId].isFrozen


def compute_initial_default_variant(variant: Variant):
    return CoreArgs(variants=[variant.id], defaultVariant=variant.id)


def set_text_block_text(p: "ProjectStateSingleConfig", sectionId: str, text: str):
    impl = get_curr_effective_section_impl_with_type_guard(
        p, sectionId, TextBlockSectionImpl
    )
    set_curr_effective_section_impl_value(
        p, sectionId, TextBlockSectionImplArgsWithCallable(text=text)
    )
    if impl.headingAsSectionName:
        first_heading = get_first_heading_or_text(text)
        if first_heading:
            p.sections[sectionId].name = first_heading


def get_first_heading_or_text(markdown: str):
    trimmed_markdown = markdown.lstrip()
    heading_match = re.search(r"(^|\n)(#+)\s*(.*?)(?=\n|$)", trimmed_markdown)

    if heading_match:
        # Return the heading text (group 3 captures the text after # and spaces)
        return heading_match.group(3).strip()

    return None


def toggle_position_lock(p: "ProjectStateSingleConfig", sectionId: str):
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        BaseSectionImplArgsWithCallable(positionAndSizeLocked=lambda curr: not curr),
    )


def toggle_minimized(p: "ProjectStateSingleConfig", sectionId: str):
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        BaseSectionImplArgsWithCallable(isMinimized=lambda curr: not curr),
    )


def set_code(p: "ProjectStateSingleConfig", sectionId: str, code: str):
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        BaseCodeSectionImplArgsWithCallable(code=code),
    )


def set_section_param_filter(p: "ProjectStateSingleConfig", sectionId: str, value: str):
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        BaseSectionWithParamsImplArgsWithCallable(paramFilter=value),
    )


def set_section_variant(p: "ProjectStateSingleConfig", sectionId: str, variantId: str):
    p.projectConfig.sectionVariantMap[sectionId] = variantId


def set_default_section_variant(
    p: "ProjectStateSingleConfig", sectionId: str, variantId: str
):
    p.sections[sectionId].defaultVariant = variantId


def set_section_variant_name(p: "ProjectStateSingleConfig", variantId: str, name: str):
    p.sectionVariants[variantId].name = name


def set_section_sizes(
    p: "ProjectStateSingleConfig", sectionSizes: dict[str, SectionSize]
):
    for s, size in sectionSizes.items():
        set_curr_effective_section_impl_value(
            p, s, BaseSectionImplArgsWithCallable(size=size)
        )


def set_section_name(p: "ProjectStateSingleConfig", sectionId: str, name: str):
    if name:
        p.sections[sectionId].name = name


def set_text_block_display_mode(
    p: "ProjectStateSingleConfig", sectionId: str, displayMode: TextBlockDisplayMode
):
    set_curr_effective_section_impl_value(
        p, sectionId, TextBlockSectionImplArgsWithCallable(displayMode=displayMode)
    )


def set_section_with_params_display_mode(
    p: "ProjectStateSingleConfig",
    sectionId: str,
    displayMode: SectionWithParamsDisplayMode,
):
    set_curr_effective_section_impl_value(
        p, sectionId, BaseSectionWithParamsImplArgsWithCallable(displayMode=displayMode)
    )


def set_browser_area_view_mode(
    p: "ProjectStateSingleConfig",
    sectionId: str,
    viewMode: BrowserAreaViewMode,
):
    set_curr_effective_section_impl_value(
        p, sectionId, BrowserSectionImplArgsWithCallable(viewMode=viewMode)
    )


def set_text_block_format(
    p: "ProjectStateSingleConfig", sectionId: str, format: TextBlockFormat
):
    set_curr_effective_section_impl_value(
        p, sectionId, TextBlockSectionImplArgsWithCallable(format=format)
    )


def set_social_url(p: "ProjectStateSingleConfig", sectionId: str, url: str):
    set_curr_effective_section_impl_value(
        p, sectionId, SocialSectionImplArgsWithCallable(url=url)
    )


def set_image_area_image_path(
    p: "ProjectStateSingleConfig", sectionId: str, imagePath: str
):
    set_curr_effective_section_impl_value(
        p, sectionId, ImageSectionImplArgsWithCallable(imagePath=imagePath)
    )


def set_chart_area_data_path(
    p: "ProjectStateSingleConfig", sectionId: str, dataPath: str
):
    set_curr_effective_section_impl_value(
        p, sectionId, ChartSectionImplArgsWithCallable(dataPath=dataPath)
    )


def set_chart_type(p: "ProjectStateSingleConfig", sectionId: str, chartType: ChartType):
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        ChartSectionImplArgsWithCallable(
            chartSettings=lambda currChartSettings: BaseChartSettingsTypeAdapter.validate_python(
                {**currChartSettings.model_dump(), "type": chartType}
            )
        ),
    )


def move_section_to_pane(
    p: "ProjectStateSingleConfig", sectionId: str, position: Position
):
    oldParentId = p.parentSectionMap[sectionId]
    if oldParentId:
        # remove from old parent
        set_curr_effective_section_impl_value(
            p,
            oldParentId,
            BaseParentSectionImplArgsWithCallable(
                children=lambda currChildren: [
                    c for c in currChildren if c != sectionId
                ]
            ),
        )
        # add to pane
        p.projectConfig.topLevelSections[sectionId] = TopLevelSectionLayout(
            x=position.x, y=position.y
        )
    else:
        # it's already on the pane, so just adjust its position
        p.projectConfig.topLevelSections[sectionId].x = position.x
        p.projectConfig.topLevelSections[sectionId].y = position.y


def move_section_to_parent_section(
    p: "ProjectStateSingleConfig",
    newParentId: str,
    sectionId: str,
    idx: int,
):
    oldParentId = p.parentSectionMap[sectionId]
    if oldParentId and oldParentId == newParentId:
        set_curr_effective_section_impl_value(
            p,
            oldParentId,
            BaseParentSectionImplArgsWithCallable(
                children=lambda currChildren: move_item_in_array(
                    currChildren, currChildren.index(sectionId), idx
                )
            ),
        )
        return

    if oldParentId:
        # filter out of old parent
        set_curr_effective_section_impl_value(
            p,
            oldParentId,
            BaseParentSectionImplArgsWithCallable(
                children=lambda currChildren: [
                    c for c in currChildren if c != sectionId
                ]
            ),
        )
    else:
        del p.projectConfig.topLevelSections[sectionId]

    set_curr_effective_section_impl_value(
        p,
        newParentId,
        BaseParentSectionImplArgsWithCallable(
            children=lambda currChildren: insert_into_array(
                currChildren, idx, [sectionId]
            )
        ),
    )


def group_sections(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    sectionIds: list[str],
):
    currParentIds: set[str | None] = set()
    for s in sectionIds:
        currParentIds.add(p.parentSectionMap[s])
    if len(currParentIds) != 1:
        # for now, we only allow siblings to be grouped
        return False

    parentId = list(currParentIds)[0]
    if not parentId:
        # create group at min(x), min(y)
        x = min(p.projectConfig.topLevelSections[s].x for s in sectionIds)
        y = min(p.projectConfig.topLevelSections[s].y for s in sectionIds)
        groupId = create_top_level_section(
            settings, p, SectionType.Group, Position(x=x, y=y)
        )
    else:
        # create group in parent, at index min(idx)
        children = get_curr_section_children_ids(p, parentId)
        idx = min(children.index(s) for s in sectionIds)
        groupId = create_child_sections(
            settings, p, parentId, SectionType.Group, 1, idx
        )
        groupId = groupId[0]

    for i, s in enumerate(sectionIds):
        move_section_to_parent_section(p, groupId, s, i)

    return True


def ungroup_groups(p: "ProjectStateSingleConfig", groupIds: list[str]):
    for g in groupIds:
        ungroup_group(p, g)


def ungroup_group(p: "ProjectStateSingleConfig", groupId: str):
    impl = get_curr_effective_section_impl_with_type_guard(p, groupId, GroupSectionImpl)

    parentId = p.parentSectionMap[groupId]
    if not parentId:
        for c in impl.children:
            layout = p.projectConfig.topLevelSections[groupId]
            move_section_to_pane(p, c, Position(x=layout.x, y=layout.y))
    else:
        groupIdx = get_curr_section_children_ids(p, parentId).index(groupId)
        for i, c in enumerate(impl.children):
            move_section_to_parent_section(p, parentId, c, groupIdx + i)

    delete_sections(p, [groupId])


def toggle_param_selected(
    p: "ProjectStateSingleConfig", sectionId: str, paramInfoId: str
):
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        BaseSectionWithParamsImplArgsWithCallable(
            selectedParams=lambda curr: [x for x in curr if x != paramInfoId]
            if paramInfoId in curr
            else [*curr, paramInfoId]
        ),
    )


def unselect_all_params(p: "ProjectStateSingleConfig"):
    for s in p.sections.keys():
        impl = get_curr_effective_section_impl(p, s)
        if isinstance(impl, BaseSectionWithParamsImpl):
            set_curr_effective_section_impl_value(
                p,
                s,
                BaseSectionWithParamsImplArgsWithCallable(selectedParams=[]),
            )


# for (const sectionId of Object.keys(x.sections)) {
#   const impl = getCurrEffectiveSectionImpl(x, sectionId);
#   if (isBaseSectionWithParamsImpl(impl)) {
#     setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
#       x,
#       sectionId,
#       { selectedParams: [] },
#     );
#   }
# }


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


# export async function guiToYaml(sectionId, variantId) {
#   const sectionType = getSectionType(sectionId);
#   if (
#     sectionType !== UITypeNameEnum.GLOBAL_VARIABLES &&
#     sectionType !== UITypeNameEnum.SECTION
#   ) {
#     return;
#   }

#   const state = useProjectState.getState();
#   const { codeInfoChildren, parentCodeInfoId } =
#     getCodeChildrenAndParentCodeInfoId(null, state, variantId);
#   const codeInfo = state.codeInfo;
#   const pinnedIds = getParamIdsToShowInArea(
#     true,
#     codeInfo,
#     codeInfoChildren,
#     parentCodeInfoId,
#   );
#   const unpinnedIds = getParamIdsToShowInArea(
#     false,
#     codeInfo,
#     codeInfoChildren,
#     parentCodeInfoId,
#   );
#   pinnedIds.requiredParamIds = Object.keys(pinnedIds.requiredParamIdsToPaths);
#   unpinnedIds.requiredParamIds = Object.keys(
#     unpinnedIds.requiredParamIdsToPaths,
#   );
#   delete pinnedIds.requiredParamIdsToPaths;
#   delete unpinnedIds.requiredParamIdsToPaths;
#   const sectionVariant = state.variants[variantId];

#   const res = await route_section_to_yaml({
#     codeInfo,
#     codeInfoChildren,
#     sectionVariant,
#     pinnedIds,
#     unpinnedIds,
#   });
#   if (res200(res)) {
#     const { originalObj, yamlValue } = res.data;
#     useOriginalYamlObj.setState({
#       [variantId]: originalObj,
#     });
#     useYamlValue.setState({ [variantId]: yamlValue });
#   }
# }
