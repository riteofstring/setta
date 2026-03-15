import logging
import math
import re
from typing import TYPE_CHECKING, assert_never

from setta.secrets.password_store import get_password_secret, set_password_secret
from setta.types.code_obj_impls import (
    BaseChildlessCodeObjImpl,
    BaseCodeObjImpl,
    BaseParamCodeObjImpl,
    BaseParentCodeObjImpl,
    CodeCallableCodeObjImpl,
    CodeObjType,
    ControlCodeObjTypeSet,
    DropzoneMode,
    DropzoneParamCodeObjImpl,
    PasswordParamCodeObjImpl,
    SectionParamCodeObjTypeSet,
)
from setta.types.core import (
    Core,
    Variant,
    compute_initial_nonPresetImpls,
)
from setta.types.dropzone import normalize_dropzone_value
from setta.types.edges import Edge
from setta.types.generated.effective_impls import (
    get_effective_impl,
    set_effective_impl_value,
)
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseChildlessCodeObjImplArgsWithCallable,
    BaseDictSectionImplArgsWithCallable,
    BaseParamCodeObjImplArgsWithCallable,
    BaseParentCodeObjImplArgsWithCallable,
    BaseSectionWithParamsImplArgsWithCallable,
    ChatSectionImplArgsWithCallable,
    CodeCallableCodeObjImplArgsWithCallable,
    CodeParamCodeObjImplArgs,
    CoreArgs,
    MetaControlSectionImplArgsWithCallable,
)
from setta.types.generated.impl_creation_fns import (
    create_code_obj_impl,
)
from setta.types.generated.settings_state import (
    SettingsState,
    get_user_default_code_obj_from_settings,
)
from setta.types.generated.unions import (
    BaseChildlessCodeObjImplUnion,
    BaseCodeObjImplUnion,
    BaseParamCodeObjImplUnion,
)
from setta.types.helpers_lvl1 import (
    get_curr_code_obj_variant,
    get_curr_effective_code_obj_impl,
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl,
    get_curr_effective_section_impl_with_type_guard,
    get_curr_section_variant,
    get_variant_base_and_effective_code_obj_impl_with_type_guard,
    get_variant_effective_section_impl,
    set_curr_effective_code_obj_impl_value,
    set_curr_effective_section_impl_value,
)
from setta.types.id import ID
from setta.types.section_impls import (
    BaseDictSectionImpl,
    BaseParentSectionImpl,
    BaseSectionWithParamsImpl,
    CallableSectionImpl,
    ChatSectionImpl,
    ChatSectionState,
    ListRootSectionImpl,
    MetaControlSectionImpl,
)
from setta.utils.name_validation import (
    validate_project_name,
    validate_section_name,
)

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from setta.types.project_state import (
        ProjectStateBackend,
        ProjectStateCore,
        ProjectStateSingleConfig,
    )


def get_curr_section_callable_code_obj(p: "ProjectStateSingleConfig", section_id: ID):
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, CallableSectionImpl
    )
    if section_impl.callable:
        return p.codeObjs[section_impl.callable]
    return None


def get_curr_meta_control_impl_with_type_guard(
    p: "ProjectStateSingleConfig", section_id: ID
) -> MetaControlSectionImpl:
    impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, MetaControlSectionImpl
    )
    if impl.metaControlParamId is None:
        raise KeyError(f"Meta control {section_id} has no control param id.")
    if impl.metaControlParamId not in impl.codeObjVariantMap:
        raise KeyError(f"Meta control {section_id} missing code obj variant mapping.")
    return impl


def get_meta_control_param_id(p: "ProjectStateSingleConfig", section_id: ID) -> ID:
    impl = get_curr_meta_control_impl_with_type_guard(p, section_id)
    param_id = impl.metaControlParamId
    if param_id not in p.codeObjs:
        raise KeyError(f"Meta control {section_id} missing control code obj core.")
    if param_id not in impl.codeObjVariantMap:
        raise KeyError(
            f"Meta control {section_id} missing variant map for control param."
        )
    variant_id = impl.codeObjVariantMap[param_id]
    if variant_id not in p.codeObjVariants:
        raise KeyError(
            f"Meta control {section_id} missing variant for control param {param_id}."
        )
    code_obj_impl = p.codeObjImpls[p.codeObjVariants[variant_id].impl]
    if code_obj_impl.type not in ControlCodeObjTypeSet:
        raise TypeError(
            f"Meta control {section_id} uses unsupported code obj type {code_obj_impl.type}."
        )
    return param_id


def _get_curr_section_children_ids(
    p: "ProjectStateSingleConfig",
    section_id: ID,
):
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, BaseParentSectionImpl
    )
    return section_impl.children


def get_curr_top_level_param_ids(
    p: "ProjectStateSingleConfig",
    section_id: ID,
) -> list[ID]:
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, BaseSectionWithParamsImpl
    )
    return get_top_level_param_ids(p, section_impl)


def get_top_level_param_ids(
    p: "ProjectStateCore", section_impl: BaseSectionWithParamsImpl
) -> list[ID]:
    parentCodeObjId: ID | None = None
    if isinstance(section_impl, CallableSectionImpl):
        parentCodeObjId = section_impl.callable
    elif isinstance(section_impl, BaseDictSectionImpl):
        parentCodeObjId = section_impl.topLevelParamId
    else:
        raise TypeError

    if not parentCodeObjId:
        return []

    codeObj = p.codeObjs[parentCodeObjId]
    _, _, code_obj_impl = get_variant_base_and_effective_code_obj_impl_with_type_guard(
        p,
        codeObj,
        section_impl.codeObjVariantMap[parentCodeObjId],
        BaseParentCodeObjImpl,
    )
    return code_obj_impl.children


def get_section_path_full_name(p: "ProjectStateSingleConfig", section_id: ID):
    parent_id = p.parentSectionMap[section_id]
    if not parent_id:
        return p.sections[section_id].name

    child_id = section_id
    output = ""
    while parent_id:
        child_impl = get_curr_effective_section_impl(p, child_id)
        if isinstance(child_impl, ListRootSectionImpl):
            idx = _get_curr_section_children_ids(p, parent_id).index(child_id)
            output = f"[{idx}]{output}"
        else:
            child_name = p.sections[child_id].name
            output = f'["{child_name}"]{output}'

        child_id = parent_id
        parent_id = p.parentSectionMap[parent_id]

    # child_id will contain the highest parent's id
    child_name = p.sections[child_id].name
    return f"{child_name}{output}"


def add_code_obj(
    p: "ProjectStateSingleConfig",
    section_ids: list[ID],
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

    for s in section_ids:
        set_curr_effective_section_impl_value(
            p,
            s,
            BaseSectionWithParamsImplArgsWithCallable(
                codeObjVariantMap=lambda currMap: {
                    **currMap,
                    code_obj.id: code_obj_variant.id,
                }
            ),
        )

    return code_obj_variant


def add_meta_control_code_obj(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    section_id: ID,
    code_obj_type: CodeObjType,
):
    if code_obj_type not in ControlCodeObjTypeSet:
        raise ValueError(f"Unsupported meta control type {code_obj_type}")
    code_obj_impl = create_code_obj_impl(
        type=code_obj_type,  # type: ignore
        defaults=get_user_default_code_obj_from_settings(settings, code_obj_type),  # type: ignore
    )
    if code_obj_impl.type == CodeObjType.SliderParam:
        code_obj_impl.value = convert_code_obj_value(
            code_obj_impl,
            code_obj_impl.value,
        )
    code_obj = Core()
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
        MetaControlSectionImplArgsWithCallable(
            metaControlParamId=code_obj.id,
            codeObjVariantMap={code_obj.id: code_obj_variant.id},
        ),
    )


def update_variant_impl_props(
    p: "ProjectStateSingleConfig", variant_ids: list[ID], new_impl: BaseCodeObjImpl
):
    for variant_id in variant_ids:
        variant = p.codeObjVariants[variant_id]
        impl = p.codeObjImpls[variant.impl]
        p.codeObjImpls[variant.impl] = impl.model_copy(
            update=new_impl.model_dump(exclude_unset=True)
        )


def add_children_of_callable(
    p: "ProjectStateSingleConfig",
    section_id: ID,
    callable_id: ID,
    new_params: list[Core],
    new_param_impl_map: dict[ID, BaseParamCodeObjImplUnion],
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
            existing_impl = get_curr_effective_code_obj_impl_with_type_guard(
                p, section_id, existing.id, BaseParamCodeObjImpl
            )
            if isinstance(existing_impl, BaseChildlessCodeObjImpl) and isinstance(
                new_param_impl, BaseChildlessCodeObjImpl
            ):
                new_param_impl = new_param_impl.model_copy(
                    update={"value": existing_impl.value}
                )
            update_variant_impl_props(p, existing.variants, new_param_impl)
            param_ids_in_order.append(existing.id)
        else:
            add_code_obj(p, [section_id], new_param, new_param_impl)
            param_ids_in_order.append(new_param.id)

    set_curr_effective_code_obj_impl_value(
        p,
        section_id,
        callable_id,
        BaseParentCodeObjImplArgsWithCallable(children=param_ids_in_order),
    )


def set_param_entered_value(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    paramId: ID,
    value: str,
):
    impl = get_curr_effective_code_obj_impl(p, sectionId, paramId)
    if isinstance(impl, PasswordParamCodeObjImpl):
        variant = get_curr_code_obj_variant(p, sectionId, paramId)
        core = p.codeObjs[paramId]
        _, base_impl, effective_impl = (
            get_variant_base_and_effective_code_obj_impl_with_type_guard(
                p, core, variant.id, PasswordParamCodeObjImpl
            )
        )
        set_password_secret(str(effective_impl.id), value)
        base_impl.hasSecret = value != ""
        value = ""
    if isinstance(impl, DropzoneParamCodeObjImpl):
        if impl.mode == DropzoneMode.STATELESS:
            value = ""
        else:
            value = normalize_dropzone_value(value, impl.maxAttachments)
    set_curr_effective_code_obj_impl_value(
        p, sectionId, paramId, BaseChildlessCodeObjImplArgsWithCallable(value=value)
    )


def set_project_config_name(
    p: "ProjectStateBackend", projectConfigId: ID, newName: str
):
    normalized = validate_project_name(p, projectConfigId, newName)
    p.projectConfigs[projectConfigId].name = normalized


def _prune_unused_code_objs(p: "ProjectStateSingleConfig") -> None:
    # Sections own large param graphs. Repeated create/delete cycles can leave
    # orphaned code objs behind, ballooning loadProjectConfig payload sizes.
    used_code_obj_ids: set[ID] = set()

    for section_id, core in p.sections.items():
        for variant_id in core.variants:
            impl = get_variant_effective_section_impl(p, section_id, variant_id)
            code_obj_variant_map = getattr(impl, "codeObjVariantMap", None)
            if code_obj_variant_map is None:
                continue
            if not isinstance(code_obj_variant_map, dict):
                raise TypeError(
                    f"Expected codeObjVariantMap to be dict for section {section_id}."
                )
            used_code_obj_ids.update(code_obj_variant_map.keys())

    pending: list[ID] = list(used_code_obj_ids)
    reachable: set[ID] = set()
    while pending:
        code_obj_id = pending.pop()
        if code_obj_id in reachable:
            continue
        if code_obj_id not in p.codeObjs:
            raise KeyError(f"Missing code obj {code_obj_id}.")
        reachable.add(code_obj_id)
        code_obj = p.codeObjs[code_obj_id]
        for variant_id in code_obj.variants:
            if variant_id not in p.codeObjVariants:
                raise KeyError(
                    f"Missing code obj variant {variant_id} for code obj {code_obj_id}."
                )
            variant = p.codeObjVariants[variant_id]
            impl_id = variant.impl
            if impl_id not in p.codeObjImpls:
                raise KeyError(
                    f"Missing code obj impl {impl_id} for code obj variant {variant_id}."
                )
            impl = p.codeObjImpls[impl_id]
            if isinstance(impl, BaseParentCodeObjImpl):
                pending.extend([child_id for child_id in impl.children if child_id])

    for code_obj_id in list(p.codeObjs.keys()):
        if code_obj_id not in reachable:
            delete_code_obj(p, code_obj_id)


def change_param_impl(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    paramInfoId: ID,
    selectedId: ID,
):
    section_impl = get_curr_effective_section_impl(p, sectionId)
    if isinstance(section_impl, MetaControlSectionImpl):
        allowed_types = ControlCodeObjTypeSet
    elif isinstance(section_impl, BaseSectionWithParamsImpl):
        allowed_types = SectionParamCodeObjTypeSet
    else:
        raise TypeError(f"Section {sectionId} does not support params.")

    variant = get_curr_code_obj_variant(
        p,
        sectionId,
        paramInfoId,
    )
    core = p.codeObjs[paramInfoId]
    old_impl = p.codeObjImpls[variant.impl]
    old_effective_impl = get_effective_impl(old_impl, core, variant)
    impl = None
    if selectedId in p.codeObjImpls:
        impl = p.codeObjImpls[selectedId]
    if impl is not None:
        impl_type = impl.type
    else:
        # selectedId will be the CodeObjType name
        impl_type = CodeObjType[selectedId]
    if impl_type not in allowed_types:
        raise ValueError(
            f"Section {sectionId} does not allow code obj type {impl_type}."
        )
    if impl is None:
        impl = create_code_obj_impl(
            type=impl_type,  # type: ignore
            defaults=get_user_default_code_obj_from_settings(settings, impl_type),  # type: ignore
        )
        p.codeObjImpls[impl.id] = impl

    variant.impl = impl.id
    if not impl.isPreset and impl.id not in variant.nonPresetImpls:
        variant.nonPresetImpls.append(impl.id)

    if isinstance(old_effective_impl, BaseParamCodeObjImpl) and isinstance(
        impl, BaseParamCodeObjImpl
    ):
        set_effective_impl_value(
            impl,
            core,
            variant,
            BaseParamCodeObjImplArgsWithCallable(
                coreNameEditable=old_effective_impl.coreNameEditable,
                coreNameType=old_effective_impl.coreNameType,
                passingStyle=old_effective_impl.passingStyle,
                typeAnnotation=old_effective_impl.typeAnnotation,
            ),
        )

    maybe_convert_code_obj_value(old_impl, impl, core, variant)


def update_param_impl_config(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    paramInfoId: ID,
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
        old_is_password = isinstance(old_effective_impl, PasswordParamCodeObjImpl)
        new_is_password = isinstance(new_impl, PasswordParamCodeObjImpl)
        if old_is_password:
            old_secret = get_password_secret(str(old_effective_impl.id))
            if new_is_password:
                if new_impl.id != old_effective_impl.id and old_secret != "":
                    set_password_secret(str(new_impl.id), old_secret)
                if new_impl.id != old_effective_impl.id:
                    set_password_secret(str(old_effective_impl.id), "")
            else:
                set_password_secret(str(old_effective_impl.id), "")
            old_value = ""
            if (
                isinstance(old_impl, PasswordParamCodeObjImpl)
                and new_impl.id != old_effective_impl.id
            ):
                old_impl.hasSecret = False
        if new_is_password:
            if not old_is_password and old_value != "":
                set_password_secret(str(new_impl.id), old_value)
            if isinstance(new_impl, PasswordParamCodeObjImpl):
                new_impl.hasSecret = get_password_secret(str(new_impl.id)) != ""
            new_value = ""
        else:
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
            | CodeObjType.DateParam
            | CodeObjType.TimeParam
            | CodeObjType.DropdownParam
            | CodeObjType.PasswordParam
            | CodeObjType.TextAreaParam
        ):
            return value
        case CodeObjType.DropzoneParam:
            if impl.mode == DropzoneMode.STATELESS:
                return ""
            return normalize_dropzone_value(value, impl.maxAttachments)
        case CodeObjType.SliderParam | CodeObjType.RotaryParam:
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
            if len(impl.colorChoices) > 0:
                if value in [c.color for c in impl.colorChoices]:
                    return value
                return impl.colorChoices[0].color
            elif is_color_hex(value):
                return value
            return "#ff0000"
        case _:
            assert_never(impl.type)


def is_color_hex(string):
    pattern = r"^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$"
    return bool(re.match(pattern, string))


def create_kwarg_objs(
    settings: SettingsState, p: "ProjectStateSingleConfig", sectionIds: list[ID]
):
    newImpl = create_code_obj_impl(
        CodeObjType.CodeParam,
        settings.codeParamCodeObjDefault,
        CodeParamCodeObjImplArgs(coreNameEditable=True),
    )
    newCore = Core(name="")

    add_code_obj(p, sectionIds, newCore, newImpl)
    return newCore.id


def add_kwarg(settings: SettingsState, p: "ProjectStateSingleConfig", sectionId: ID):
    sectionImpl = get_curr_effective_section_impl_with_type_guard(
        p, sectionId, BaseSectionWithParamsImpl
    )
    if isinstance(sectionImpl, CallableSectionImpl):
        new_param_id = add_kwarg_to_callable_section(
            settings, p, sectionId, sectionImpl
        )
    elif isinstance(sectionImpl, BaseDictSectionImpl):
        new_param_id = add_kwarg_to_dict_section(settings, p, sectionId, sectionImpl)
    else:
        raise TypeError
    return new_param_id


def add_kwarg_to_callable_section(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    sectionImpl: CallableSectionImpl,
):
    callableId = sectionImpl.callable
    if not callableId:
        raise ValueError

    newId = create_kwarg_objs(settings, p, [sectionId])

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
    sectionId: ID,
    sectionImpl: BaseDictSectionImpl,
):
    top_level_param_id = sectionImpl.topLevelParamId
    if top_level_param_id is None:
        new_top_level_impl = create_code_obj_impl(
            CodeObjType.NestedParam, settings.nestedParamCodeObjDefault
        )
        new_top_level_core = Core(name="")
        add_code_obj(p, [sectionId], new_top_level_core, new_top_level_impl)
        set_curr_effective_section_impl_value(
            p,
            sectionId,
            BaseDictSectionImplArgsWithCallable(topLevelParamId=new_top_level_core.id),
        )
        sectionImpl = get_curr_effective_section_impl_with_type_guard(
            p, sectionId, BaseDictSectionImpl
        )
        top_level_param_id = sectionImpl.topLevelParamId

    if top_level_param_id is None:
        raise ValueError(
            f"Failed to initialize topLevelParamId for section {sectionId}"
        )

    sectionIds = []
    for section in p.sections.values():
        impl = get_curr_effective_section_impl(p, section.id)
        if isinstance(impl, BaseDictSectionImpl):
            if impl.topLevelParamId == top_level_param_id:
                sectionIds.append(section.id)

    newId = create_kwarg_objs(settings, p, sectionIds)

    set_curr_effective_code_obj_impl_value(
        p,
        sectionId,
        top_level_param_id,
        BaseParentCodeObjImplArgsWithCallable(
            children=lambda currChildren: [*currChildren, newId]
        ),
    )
    return newId


def delete_kwarg(settings: SettingsState, p: "ProjectStateSingleConfig", sectionId: ID):
    sectionImpl = get_curr_effective_section_impl_with_type_guard(
        p, sectionId, BaseSectionWithParamsImpl
    )
    if isinstance(sectionImpl, CallableSectionImpl):
        removed_param_id = delete_kwarg_from_callable_section(p, sectionId, sectionImpl)
    elif isinstance(sectionImpl, BaseDictSectionImpl):
        removed_param_id = delete_kwarg_from_dict_section(p, sectionId, sectionImpl)
    else:
        raise TypeError
    if removed_param_id in sectionImpl.edgeInputParams:
        next_inputs = [
            param_id
            for param_id in sectionImpl.edgeInputParams
            if param_id != removed_param_id
        ]
        set_section_edge_inputs(settings, p, sectionId, next_inputs)
    return removed_param_id


def delete_kwarg_from_callable_section(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    sectionImpl: CallableSectionImpl,
):
    callableId = sectionImpl.callable
    if not callableId:
        raise ValueError
    callable_impl = get_curr_effective_code_obj_impl_with_type_guard(
        p, sectionId, callableId, BaseParentCodeObjImpl
    )
    if not callable_impl.children:
        raise ValueError(f"Section {sectionId} has no kwargs to delete.")
    removed_param_id = callable_impl.children[-1]

    set_curr_effective_code_obj_impl_value(
        p,
        sectionId,
        callableId,
        CodeCallableCodeObjImplArgsWithCallable(
            children=lambda currChildren: currChildren[:-1]
        ),
    )
    return removed_param_id


def delete_kwarg_from_dict_section(
    p: "ProjectStateSingleConfig", sectionId: ID, sectionImpl: BaseDictSectionImpl
):
    if not sectionImpl.topLevelParamId:
        raise ValueError
    top_level_impl = get_curr_effective_code_obj_impl_with_type_guard(
        p, sectionId, sectionImpl.topLevelParamId, BaseParentCodeObjImpl
    )
    if not top_level_impl.children:
        raise ValueError(f"Section {sectionId} has no kwargs to delete.")
    removed_param_id = top_level_impl.children[-1]
    set_curr_effective_code_obj_impl_value(
        p,
        sectionId,
        sectionImpl.topLevelParamId,
        BaseParentCodeObjImplArgsWithCallable(
            children=lambda currChildren: currChildren[:-1]
        ),
    )
    return removed_param_id


def compute_initial_default_variant(variant: Variant):
    return CoreArgs(variants=[variant.id], defaultVariant=variant.id)


def get_first_heading_or_text(markdown: str):
    trimmed_markdown = markdown.lstrip()
    heading_match = re.search(
        r"(?:^|\n)#+\s*(.*?)(?=\n|$)",
        trimmed_markdown,
    )

    if heading_match:
        heading_text = heading_match.group(1).strip()
        if heading_text:
            return heading_text

    return None


def get_first_markdown_heading(markdown: str):
    heading_match = re.search(
        r"(?m)^ {0,3}#{1,6}(?!#)\s*(\S.*)$",
        markdown,
    )
    if heading_match:
        heading_text = heading_match.group(1).strip()
        if heading_text:
            return heading_text
    return None


def _maybe_clear_edge_target_value(p: "ProjectStateSingleConfig", edge: Edge):
    if edge.targetSectionId not in p.sections:
        return
    if edge.targetSectionId not in p.projectConfig.sectionVariantMap:
        raise KeyError(
            f"Section {edge.targetSectionId} missing active variant for edge update."
        )
    for existing in p.projectConfig.edges:
        if (
            existing.targetSectionId == edge.targetSectionId
            and existing.targetVariantId == edge.targetVariantId
            and existing.targetPortId == edge.targetPortId
        ):
            return
    if p.projectConfig.sectionVariantMap[edge.targetSectionId] != edge.targetVariantId:
        return
    if edge.targetPortId not in p.codeObjs:
        raise KeyError(f"Param {edge.targetPortId} missing for edge cleanup.")
    set_param_entered_value(p, edge.targetSectionId, edge.targetPortId, "")


def set_section_edge_inputs(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    edgeInputParams: list[ID],
):
    core = p.sections[sectionId]
    if "edgeInputParams" in core.sharedModifier:
        del core.sharedModifier["edgeInputParams"]
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, sectionId, BaseSectionWithParamsImpl
    )
    deduped: list[ID] = []
    seen: set[ID] = set()
    for param_id in edgeInputParams:
        if param_id not in p.codeObjs:
            raise KeyError(f"Input param {param_id} not found in project state.")
        if param_id in seen:
            continue
        seen.add(param_id)
        deduped.append(param_id)

    new_edge_inputs = [
        param_id for param_id in deduped if param_id not in section_impl.edgeInputParams
    ]
    for param_id in new_edge_inputs:
        param_impl = get_curr_effective_code_obj_impl_with_type_guard(
            p, sectionId, param_id, BaseParamCodeObjImpl
        )
        if param_impl.type != CodeObjType.CodeParam:
            change_param_impl(
                settings, p, sectionId, param_id, CodeObjType.CodeParam.value
            )

    removed_ports = set(section_impl.edgeInputParams) - set(deduped)
    if removed_ports:
        variant_id = get_curr_section_variant(p, sectionId).id
        remaining_edges: list[Edge] = []
        removed_edges: list[Edge] = []
        for edge in p.projectConfig.edges:
            if (
                edge.targetSectionId == sectionId
                and edge.targetVariantId == variant_id
                and edge.targetPortId in removed_ports
            ):
                removed_edges.append(edge)
            else:
                remaining_edges.append(edge)
        p.projectConfig.edges = remaining_edges
        for edge in removed_edges:
            _maybe_clear_edge_target_value(p, edge)

    set_curr_effective_section_impl_value(
        p,
        sectionId,
        BaseSectionWithParamsImplArgsWithCallable(edgeInputParams=deduped),
    )


def set_section_name(p: "ProjectStateSingleConfig", sectionId: ID, name: str):
    normalized = validate_section_name(p, sectionId, name)
    p.sections[sectionId].name = normalized
    p._section_slug_cache = None


def set_chat_section_chat_id(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    chatId: ID | None,
):
    get_curr_effective_section_impl_with_type_guard(p, sectionId, ChatSectionImpl)
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        ChatSectionImplArgsWithCallable(
            chatId=chatId,
        ),
    )


def set_chat_section_state(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    state: ChatSectionState,
):
    get_curr_effective_section_impl_with_type_guard(p, sectionId, ChatSectionImpl)
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        ChatSectionImplArgsWithCallable(
            messages=state.messages,
            inputText=state.inputText,
            waitingForResponse=state.waitingForResponse,
            toolCallArguments=state.toolCallArguments,
            activeBranchId=state.activeBranchId,
            branches=state.branches,
        ),
    )


def delete_code_obj(p: "ProjectStateCore", codeObjId: ID):
    codeObj = p.codeObjs[codeObjId]
    for v in codeObj.variants:
        variant = p.codeObjVariants.get(v)
        if not variant:
            continue
        for i in variant.nonPresetImpls:
            impl = p.codeObjImpls.get(i)
            if not impl or impl.isPreset:
                continue
            if isinstance(impl, PasswordParamCodeObjImpl):
                set_password_secret(str(impl.id), "")
            del p.codeObjImpls[i]
        del p.codeObjVariants[v]
    del p.codeObjs[codeObjId]
