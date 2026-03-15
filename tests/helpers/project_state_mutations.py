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
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
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
    CodeCallableCodeObjImplArgsWithCallable,
    CodeParamCodeObjImplArgs,
    MetaControlSectionImplArgsWithCallable,
)
from setta.types.generated.impl_creation_fns import create_code_obj_impl
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
    set_curr_effective_code_obj_impl_value,
    set_curr_effective_section_impl_value,
)
from setta.types.id import ID
from setta.types.section_impls import (
    BaseDictSectionImpl,
    BaseSectionWithParamsImpl,
    CallableSectionImpl,
    MetaControlSectionImpl,
)
from setta.utils.name_validation import validate_project_name, validate_section_name

if TYPE_CHECKING:
    from setta.types.project_state import (
        ProjectStateBackend,
        ProjectStateSingleConfig,
    )


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

    for section_id in section_ids:
        set_curr_effective_section_impl_value(
            p,
            section_id,
            BaseSectionWithParamsImplArgsWithCallable(
                codeObjVariantMap=lambda curr_map: {
                    **curr_map,
                    code_obj.id: code_obj_variant.id,
                }
            ),
        )

    return code_obj_variant


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
                if value in [choice.color for choice in impl.colorChoices]:
                    return value
                return impl.colorChoices[0].color
            if is_color_hex(value):
                return value
            return "#ff0000"
        case _:
            assert_never(impl.type)


def is_color_hex(string):
    pattern = r"^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$"
    return bool(re.match(pattern, string))


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
    for code_obj_id in callable_code_obj_impl.children:
        match = p.codeObjs[code_obj_id]
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
    section_id: ID,
    param_id: ID,
    value: str,
):
    impl = get_curr_effective_code_obj_impl(p, section_id, param_id)
    if isinstance(impl, PasswordParamCodeObjImpl):
        variant = get_curr_code_obj_variant(p, section_id, param_id)
        core = p.codeObjs[param_id]
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
        p,
        section_id,
        param_id,
        BaseChildlessCodeObjImplArgsWithCallable(value=value),
    )


def set_project_config_name(
    p: "ProjectStateBackend", project_config_id: ID, new_name: str
):
    normalized = validate_project_name(p, project_config_id, new_name)
    p.projectConfigs[project_config_id].name = normalized


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


def change_param_impl(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    section_id: ID,
    param_info_id: ID,
    selected_id: ID,
):
    section_impl = get_curr_effective_section_impl(p, section_id)
    if isinstance(section_impl, MetaControlSectionImpl):
        allowed_types = ControlCodeObjTypeSet
    elif isinstance(section_impl, BaseSectionWithParamsImpl):
        allowed_types = SectionParamCodeObjTypeSet
    else:
        raise TypeError(f"Section {section_id} does not support params.")

    variant = get_curr_code_obj_variant(p, section_id, param_info_id)
    core = p.codeObjs[param_info_id]
    old_impl = p.codeObjImpls[variant.impl]
    old_effective_impl = get_effective_impl(old_impl, core, variant)
    impl = p.codeObjImpls.get(selected_id)
    if impl is not None:
        impl_type = impl.type
    else:
        impl_type = CodeObjType[selected_id]
    if impl_type not in allowed_types:
        raise ValueError(
            f"Section {section_id} does not allow code obj type {impl_type}."
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
    section_id: ID,
    param_info_id: ID,
    new_config: dict,
):
    variant = get_curr_code_obj_variant(p, section_id, param_info_id)
    impl = p.codeObjImpls[variant.impl]
    for key, value in new_config.items():
        setattr(impl, key, value)
    maybe_convert_code_obj_value(impl, impl, p.codeObjs[param_info_id], variant)


def create_kwarg_objs(
    settings: SettingsState, p: "ProjectStateSingleConfig", section_ids: list[ID]
):
    new_impl = create_code_obj_impl(
        CodeObjType.CodeParam,
        settings.codeParamCodeObjDefault,
        CodeParamCodeObjImplArgs(coreNameEditable=True),
    )
    new_core = Core(name="")

    add_code_obj(p, section_ids, new_core, new_impl)
    return new_core.id


def add_kwarg(settings: SettingsState, p: "ProjectStateSingleConfig", section_id: ID):
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, BaseSectionWithParamsImpl
    )
    if isinstance(section_impl, CallableSectionImpl):
        new_param_id = add_kwarg_to_callable_section(
            settings, p, section_id, section_impl
        )
    elif isinstance(section_impl, BaseDictSectionImpl):
        new_param_id = add_kwarg_to_dict_section(settings, p, section_id, section_impl)
    else:
        raise TypeError
    return new_param_id


def add_kwarg_to_callable_section(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    section_id: ID,
    section_impl: CallableSectionImpl,
):
    callable_id = section_impl.callable
    if not callable_id:
        raise ValueError

    new_id = create_kwarg_objs(settings, p, [section_id])

    set_curr_effective_code_obj_impl_value(
        p,
        section_id,
        callable_id,
        CodeCallableCodeObjImplArgsWithCallable(
            children=lambda curr_children: [*curr_children, new_id]
        ),
    )

    return new_id


def add_kwarg_to_dict_section(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    section_id: ID,
    section_impl: BaseDictSectionImpl,
):
    top_level_param_id = section_impl.topLevelParamId
    if top_level_param_id is None:
        new_top_level_impl = create_code_obj_impl(
            CodeObjType.NestedParam, settings.nestedParamCodeObjDefault
        )
        new_top_level_core = Core(name="")
        add_code_obj(p, [section_id], new_top_level_core, new_top_level_impl)
        set_curr_effective_section_impl_value(
            p,
            section_id,
            BaseDictSectionImplArgsWithCallable(topLevelParamId=new_top_level_core.id),
        )
        section_impl = get_curr_effective_section_impl_with_type_guard(
            p, section_id, BaseDictSectionImpl
        )
        top_level_param_id = section_impl.topLevelParamId

    if top_level_param_id is None:
        raise ValueError(
            f"Failed to initialize topLevelParamId for section {section_id}"
        )

    section_ids = []
    for section in p.sections.values():
        impl = get_curr_effective_section_impl(p, section.id)
        if isinstance(impl, BaseDictSectionImpl):
            if impl.topLevelParamId == top_level_param_id:
                section_ids.append(section.id)

    new_id = create_kwarg_objs(settings, p, section_ids)

    set_curr_effective_code_obj_impl_value(
        p,
        section_id,
        top_level_param_id,
        BaseParentCodeObjImplArgsWithCallable(
            children=lambda curr_children: [*curr_children, new_id]
        ),
    )
    return new_id


def delete_kwarg(settings: SettingsState, p: "ProjectStateSingleConfig", section_id: ID):
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, BaseSectionWithParamsImpl
    )
    if isinstance(section_impl, CallableSectionImpl):
        removed_param_id = delete_kwarg_from_callable_section(
            p, section_id, section_impl
        )
    elif isinstance(section_impl, BaseDictSectionImpl):
        removed_param_id = delete_kwarg_from_dict_section(p, section_id, section_impl)
    else:
        raise TypeError
    if removed_param_id in section_impl.edgeInputParams:
        next_inputs = [
            param_id
            for param_id in section_impl.edgeInputParams
            if param_id != removed_param_id
        ]
        set_section_edge_inputs(settings, p, section_id, next_inputs)
    return removed_param_id


def delete_kwarg_from_callable_section(
    p: "ProjectStateSingleConfig",
    section_id: ID,
    section_impl: CallableSectionImpl,
):
    callable_id = section_impl.callable
    if not callable_id:
        raise ValueError
    callable_impl = get_curr_effective_code_obj_impl_with_type_guard(
        p, section_id, callable_id, BaseParentCodeObjImpl
    )
    if not callable_impl.children:
        raise ValueError(f"Section {section_id} has no kwargs to delete.")
    removed_param_id = callable_impl.children[-1]

    set_curr_effective_code_obj_impl_value(
        p,
        section_id,
        callable_id,
        CodeCallableCodeObjImplArgsWithCallable(
            children=lambda curr_children: curr_children[:-1]
        ),
    )
    return removed_param_id


def delete_kwarg_from_dict_section(
    p: "ProjectStateSingleConfig", section_id: ID, section_impl: BaseDictSectionImpl
):
    if not section_impl.topLevelParamId:
        raise ValueError
    top_level_impl = get_curr_effective_code_obj_impl_with_type_guard(
        p, section_id, section_impl.topLevelParamId, BaseParentCodeObjImpl
    )
    if not top_level_impl.children:
        raise ValueError(f"Section {section_id} has no kwargs to delete.")
    removed_param_id = top_level_impl.children[-1]
    set_curr_effective_code_obj_impl_value(
        p,
        section_id,
        section_impl.topLevelParamId,
        BaseParentCodeObjImplArgsWithCallable(
            children=lambda curr_children: curr_children[:-1]
        ),
    )
    return removed_param_id


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
    section_id: ID,
    edge_input_params: list[ID],
):
    core = p.sections[section_id]
    if "edgeInputParams" in core.sharedModifier:
        del core.sharedModifier["edgeInputParams"]
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, BaseSectionWithParamsImpl
    )
    deduped: list[ID] = []
    seen: set[ID] = set()
    for param_id in edge_input_params:
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
            p, section_id, param_id, BaseParamCodeObjImpl
        )
        if param_impl.type != CodeObjType.CodeParam:
            change_param_impl(
                settings, p, section_id, param_id, CodeObjType.CodeParam.value
            )

    removed_ports = set(section_impl.edgeInputParams) - set(deduped)
    if removed_ports:
        variant_id = get_curr_section_variant(p, section_id).id
        remaining_edges: list[Edge] = []
        removed_edges: list[Edge] = []
        for edge in p.projectConfig.edges:
            if (
                edge.targetSectionId == section_id
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
        section_id,
        BaseSectionWithParamsImplArgsWithCallable(edgeInputParams=deduped),
    )


def set_section_name(p: "ProjectStateSingleConfig", section_id: ID, name: str):
    normalized = validate_section_name(p, section_id, name)
    p.sections[section_id].name = normalized
    p._section_slug_cache = None
