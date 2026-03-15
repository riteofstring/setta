import logging
import math
import re
from typing import TYPE_CHECKING, assert_never

from setta.secrets.password_store import get_password_secret, set_password_secret
from setta.types.artifact import (
    DrawAreaLayer,
)
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
    TextParamCodeObjImpl,
)
from setta.types.core import (
    Core,
    Variant,
    compute_initial_nonPresetImpls,
    get_default_section_core_name,
)
from setta.types.dropzone import normalize_dropzone_value
from setta.types.edges import Edge
from setta.types.generated.effective_impls import (
    get_effective_impl,
    set_effective_impl_value,
)
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseChildlessCodeObjImplArgsWithCallable,
    BaseCodeObjImplArgs,
    BaseCodeSectionImplArgsWithCallable,
    BaseDictSectionImplArgsWithCallable,
    BaseParamCodeObjImplArgsWithCallable,
    BaseParentCodeObjImplArgsWithCallable,
    BaseParentSectionImplArgsWithCallable,
    BaseSectionWithParamsImplArgsWithCallable,
    ChatSectionImplArgsWithCallable,
    CodeCallableCodeObjImplArgsWithCallable,
    CodeParamCodeObjImplArgs,
    CoreArgs,
    GroupSectionImplArgsWithCallable,
    ImageSectionImplArgsWithCallable,
    ListRootSectionImplArgsWithCallable,
    MetaControlSectionImplArgsWithCallable,
    TextBlockSectionImplArgsWithCallable,
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
from setta.types.generated.user_defaults import UserDefaultTaskBoardSectionImpl
from setta.types.helpers_lvl1 import (
    get_curr_code_obj_variant,
    get_curr_effective_code_obj_impl,
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl,
    get_curr_effective_section_impl_with_type_guard,
    get_curr_section_variant,
    get_variant_base_and_effective_code_obj_impl_with_type_guard,
    get_variant_base_code_obj_impl,
    get_variant_effective_section_impl,
    set_curr_effective_code_obj_impl_value,
    set_curr_effective_section_impl_value,
)
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.id import ID, create_new_id
from setta.types.project_config import Position, TopLevelSectionLayout
from setta.types.section_impls import (
    BaseCodeSectionImpl,
    BaseDictSectionImpl,
    BaseParentSectionImpl,
    BaseSectionWithParamsImpl,
    CallableSectionImpl,
    ChatSectionImpl,
    ChatSectionState,
    CodeFileBinding,
    DrawSectionImpl,
    GroupSectionImpl,
    ListRootSectionImpl,
    ListRootViewMode,
    MetaControlSectionImpl,
    SectionSize,
    SectionSizeMode,
    SectionType,
    SpreadsheetGridDensity,
    SpreadsheetSectionImpl,
    TaskBoardColumn,
    TaskBoardSectionImpl,
    TaskBoardTask,
    TaskBoardViewMode,
    TerminalSectionImpl,
    TextBlockFormat,
    TextBlockSectionImpl,
    TypeErrorIgnoreState,
)
from setta.utils.errors import InvalidSectionName
from setta.utils.generate_memorable_string import generate_memorable_string
from setta.utils.name_validation import (
    validate_project_name,
    validate_section_name,
)
from setta.utils.paths import normalize_workspace_path
from setta.utils.utils import insert_into_array, move_item_in_array

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from setta.types.project_state import (
        ProjectStateBackend,
        ProjectStateCore,
        ProjectStateSingleConfig,
    )


DISALLOWED_PARENT_DEFAULT_CHILD_SECTION_TYPES = frozenset(
    {
        SectionType.GlobalVariables,
        SectionType.GenPythonCode,
        SectionType.GenPythonMetadata,
        SectionType.StateMachineStart,
        SectionType.StateMachineGate,
        SectionType.StateMachineEnd,
    }
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


def get_curr_section_children_ids(
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
            idx = get_curr_section_children_ids(p, parent_id).index(child_id)
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


def create_default_task_board_columns() -> list[TaskBoardColumn]:
    return [
        TaskBoardColumn(name="Todo", color="#3b82f6", sortIndex=0),
        TaskBoardColumn(name="Doing", color="#a855f7", sortIndex=1),
        TaskBoardColumn(name="Done", color="#10b981", sortIndex=2),
    ]


def _task_board_columns_explicitly_overridden(
    impl_overrides: BaseSectionImplArgsUnion | None,
) -> bool:
    if impl_overrides is None:
        return False
    if isinstance(impl_overrides, dict):
        return "columns" in impl_overrides
    fields_set = getattr(impl_overrides, "model_fields_set", None)
    if isinstance(fields_set, set):
        return "columns" in fields_set
    return hasattr(impl_overrides, "columns")


def create_section(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    impl_type: SectionType,
    impl_overrides: BaseSectionImplArgsUnion | None = None,
    core_overrides: CoreArgs | None = None,
    control_code_obj_type: CodeObjType | None = None,
):
    section_defaults = get_user_default_section_from_settings(settings, impl_type)
    if (
        impl_type == SectionType.TaskBoard
        and isinstance(section_defaults, UserDefaultTaskBoardSectionImpl)
        and section_defaults.columns is None
    ):
        section_defaults = section_defaults.model_copy(
            deep=True,
            update={"columns": []},
        )
    impl = create_section_impl(  # type: ignore
        impl_type,  # type: ignore
        section_defaults,  # type: ignore
        impl_overrides,  # type: ignore
    )
    if (
        isinstance(impl, TaskBoardSectionImpl)
        and len(impl.columns) == 0
        and not _task_board_columns_explicitly_overridden(impl_overrides)
        and settings.taskBoardSectionDefault.columns is None
    ):
        impl.columns = create_default_task_board_columns()
    impl.size = normalize_section_size(settings, impl.type, impl.id, impl.size)
    variant = Variant(impl=impl.id, nonPresetImpls=compute_initial_nonPresetImpls(impl))
    default_core_args: CoreArgs = {
        "name": get_default_section_core_name(impl_type),
        **compute_initial_default_variant(variant),
    }
    if isinstance(impl, TextBlockSectionImpl) and impl.headingAsSectionName:
        first_heading = (
            get_first_markdown_heading(impl.text)
            if impl.format == TextBlockFormat.Markdown
            else get_first_heading_or_text(impl.text)
        )
        if first_heading:
            default_core_args["name"] = first_heading
    if core_overrides:
        default_core_args.update(core_overrides)
    core = Core(**default_core_args)
    if isinstance(impl, DrawSectionImpl):
        init_draw_section_layer(impl)

    p.projectConfig.sectionVariantMap[core.id] = variant.id
    p.sections[core.id] = core
    p.sectionImpls[impl.id] = impl
    p.sectionVariants[variant.id] = variant

    if isinstance(impl, MetaControlSectionImpl):
        control_type = (
            control_code_obj_type
            if control_code_obj_type is not None
            else CodeObjType.SliderParam
        )
        add_meta_control_code_obj(settings, p, core.id, control_type)

    return core.id


def init_draw_section_layer(impl: DrawSectionImpl):
    layer = DrawAreaLayer(elements=[])
    impl.layers = [layer]


def _coerce_section_size_value(
    section_id: ID,
    dimension: str,
    value: float | SectionSizeMode,
) -> float | SectionSizeMode:
    if value == SectionSizeMode.auto:
        return value
    if isinstance(value, bool):
        raise ValueError(
            f"Section {section_id} has invalid {dimension} value {value!r}."
        )
    numeric = float(value)
    if not math.isfinite(numeric):
        raise ValueError(
            f"Section {section_id} has non-finite {dimension} value {value!r}."
        )
    return numeric


def _clamp_section_dimension(
    value: float | SectionSizeMode, min_value: float, max_value: float
) -> float | SectionSizeMode:
    if value == SectionSizeMode.auto:
        return value
    if max_value < min_value:
        max_value = min_value
    return max(min_value, min(max_value, value))


def normalize_section_size(
    settings: SettingsState,
    section_type: SectionType,
    section_id: ID,
    size: SectionSize,
) -> SectionSize:
    policy = settings.sectionSizingPolicy.byType
    entry = getattr(policy, section_type.value)
    min_width = max(0.0, float(entry.minWidth))
    min_height = max(0.0, float(entry.minHeight))
    max_width = float(entry.maxWidth)
    max_height = float(entry.maxHeight)

    width = _coerce_section_size_value(section_id, "width", size.width)
    height = _coerce_section_size_value(section_id, "height", size.height)

    width = _clamp_section_dimension(width, min_width, max_width)
    height = _clamp_section_dimension(height, min_height, max_height)

    return SectionSize(width=width, height=height)


def create_top_level_section(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    impl_type: SectionType,
    position: Position,
    impl_overrides: BaseSectionImplArgsUnion | None = None,
    core_overrides: CoreArgs | None = None,
    control_code_obj_type: CodeObjType | None = None,
):
    sectionId = create_section(
        settings,
        p,
        impl_type,
        impl_overrides,
        core_overrides,
        control_code_obj_type=control_code_obj_type,
    )
    p.projectConfig.topLevelSections[sectionId] = TopLevelSectionLayout(
        **position.model_dump()
    )
    return sectionId


def _validate_code_section_children_for_creation(
    parentId: ID,
    parentImpl: BaseParentSectionImpl,
    impl_type: SectionType,
    numChildren: int,
) -> None:
    if not isinstance(parentImpl, BaseCodeSectionImpl):
        return
    if impl_type != SectionType.Terminal:
        raise ValueError("Code sections can only create terminal children.")
    if numChildren != 1:
        raise ValueError("Code sections can only have one terminal child.")
    if parentImpl.children:
        raise ValueError(f"Code section {parentId} already has a child.")


def _validate_code_section_children_for_parent(
    p: "ProjectStateSingleConfig",
    parentId: ID,
    parentImpl: BaseParentSectionImpl,
    childIds: list[ID],
) -> None:
    if not isinstance(parentImpl, BaseCodeSectionImpl):
        return
    if len(childIds) != 1:
        raise ValueError("Code sections can only have one terminal child.")
    terminalId = childIds[0]
    get_curr_effective_section_impl_with_type_guard(p, terminalId, TerminalSectionImpl)
    if parentImpl.children and parentImpl.children != [terminalId]:
        raise ValueError(f"Code section {parentId} already has a child.")


def _set_code_section_attached_terminal(
    p: "ProjectStateSingleConfig", sectionId: ID, terminalId: ID
) -> None:
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        {"attachedTerminalSectionId": terminalId},
    )
    logger.info(
        "code_section_attached_terminal_set section=%s terminal=%s",
        sectionId,
        terminalId,
    )


def _maybe_clear_code_section_attached_terminal(
    p: "ProjectStateSingleConfig", parentId: ID | None, childId: ID
) -> None:
    if not parentId:
        return
    parent_impl = get_curr_effective_section_impl(p, parentId)
    if isinstance(parent_impl, BaseCodeSectionImpl):
        if parent_impl.attachedTerminalSectionId == childId:
            set_curr_effective_section_impl_value(
                p,
                parentId,
                {"attachedTerminalSectionId": None},
            )
            logger.info(
                "code_section_attached_terminal_cleared parent=%s child=%s",
                parentId,
                childId,
            )


def _get_terminal_default_height(settings: SettingsState) -> float:
    terminal_defaults = get_user_default_section_from_settings(
        settings, SectionType.Terminal
    )
    terminal_height = terminal_defaults.size.height
    if terminal_height == SectionSizeMode.auto:
        raise ValueError("Terminal default height must not be auto.")
    return float(terminal_height)


def ensure_code_section_embedded_terminal_size(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    terminalId: ID | None,
) -> None:
    if terminalId is None:
        return
    code_impl = get_curr_effective_section_impl_with_type_guard(
        p, sectionId, BaseCodeSectionImpl
    )
    terminal_impl = get_curr_effective_section_impl_with_type_guard(
        p, terminalId, TerminalSectionImpl
    )
    sizing_policy = settings.sectionSizingPolicy.byType
    expected_min_height = (
        float(sizing_policy.Code.minHeight)
        + float(sizing_policy.Terminal.minHeight)
        + 80.0
    )
    expected_max_height = float(sizing_policy.Code.maxHeight)
    if expected_min_height > expected_max_height:
        expected_min_height = expected_max_height

    current_height = code_impl.size.height
    if current_height != SectionSizeMode.auto:
        if float(current_height) >= expected_min_height:
            code_height = current_height
        else:
            code_height = expected_min_height
    else:
        code_height = expected_min_height

    if code_height != current_height:
        set_curr_effective_section_impl_value(
            p,
            sectionId,
            {"size": SectionSize(width=code_impl.size.width, height=code_height)},
        )

    # Keep embedded terminal dimensions in lockstep with code width and a
    # concrete terminal height so attached-first terminals can reflow text
    # correctly before/after detach.
    code_width = code_impl.size.width
    next_terminal_width = terminal_impl.size.width
    if code_width != SectionSizeMode.auto:
        next_terminal_width = code_width
    next_terminal_height = terminal_impl.size.height
    if next_terminal_height == SectionSizeMode.auto:
        next_terminal_height = _get_terminal_default_height(settings)
    if (
        next_terminal_width != terminal_impl.size.width
        or next_terminal_height != terminal_impl.size.height
    ):
        set_curr_effective_section_impl_value(
            p,
            terminalId,
            {
                "size": SectionSize(
                    width=next_terminal_width, height=next_terminal_height
                )
            },
        )


def create_child_sections(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    parentId: ID,
    impl_type: SectionType,
    numChildren: int,
    startIdx: int | None,
):
    if impl_type in {
        SectionType.StateMachineStart,
        SectionType.StateMachineGate,
        SectionType.StateMachineEnd,
    }:
        raise ValueError(f"Section type {impl_type} can only exist at the top level.")
    effectiveImpl = get_curr_effective_section_impl_with_type_guard(
        p, parentId, BaseParentSectionImpl
    )
    _validate_code_section_children_for_creation(
        parentId, effectiveImpl, impl_type, numChildren
    )
    size = SectionSize(width=effectiveImpl.size.width)
    if (
        isinstance(effectiveImpl, BaseCodeSectionImpl)
        and impl_type == SectionType.Terminal
    ):
        size = SectionSize(
            width=effectiveImpl.size.width,
            height=_get_terminal_default_height(settings),
        )
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
    if isinstance(effectiveImpl, BaseCodeSectionImpl):
        _set_code_section_attached_terminal(p, parentId, newIds[0])
        ensure_code_section_embedded_terminal_size(settings, p, parentId, newIds[0])

    return newIds


def create_child_sections_via_incrementer(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    calledBy: ID,
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
        parent_impl = get_curr_effective_section_impl_with_type_guard(
            p, parentId, BaseParentSectionImpl
        )
        startIdx = parent_impl.children.index(calledBy) + 1
    create_child_sections(settings, p, parentId, impl_type, numChildren, startIdx)


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


def create_new_code_obj_variant(
    p: "ProjectStateCore",
    codeObjId: ID,
    codeObjVariantId: ID | None,
    codeObjImpl: BaseCodeObjImplUnion | None,
):
    currBaseImpl: BaseCodeObjImplUnion | None = codeObjImpl
    if not currBaseImpl and codeObjVariantId:
        currBaseImpl = get_variant_base_code_obj_impl(p, codeObjVariantId)

    newBaseImpl: BaseCodeObjImplUnion
    if currBaseImpl:
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
    else:
        newBaseImpl = TextParamCodeObjImpl()

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


def delete_selected_params(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    paramInfoIds: list[ID],
):
    if not paramInfoIds:
        return []
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, sectionId, BaseSectionWithParamsImpl
    )
    root_id: ID | None = None
    if isinstance(section_impl, CallableSectionImpl):
        root_id = section_impl.callable
    elif isinstance(section_impl, BaseDictSectionImpl):
        root_id = section_impl.topLevelParamId
    else:
        raise TypeError

    if not root_id:
        return []

    if root_id not in section_impl.codeObjVariantMap:
        raise KeyError(
            f"Root param container {root_id} missing for section {sectionId}"
        )

    traversal = traverse_hierarchy(
        p.codeObjs,
        p.codeObjImpls,
        p.codeObjVariants,
        section_impl.codeObjVariantMap,
        top_level_ids=[],
        root_id=root_id,
        options=TraversalOptions(build_parent_map=True, collect_all_visited=True),
    )
    parent_map = traversal.parent_map

    removed_param_ids: list[ID] = []
    parent_to_removed: dict[ID, set[ID]] = {}
    for param_id in dict.fromkeys(paramInfoIds):
        if param_id not in p.codeObjs:
            raise KeyError(f"Param {param_id} not found for deletion.")
        param_impl = get_curr_effective_code_obj_impl_with_type_guard(
            p, sectionId, param_id, BaseParamCodeObjImpl
        )
        if not param_impl.coreNameEditable:
            continue
        parent_id = parent_map.get(param_id)
        if not parent_id:
            raise KeyError(f"Param {param_id} has no parent in section {sectionId}.")
        parent_to_removed.setdefault(parent_id, set()).add(param_id)
        removed_param_ids.append(param_id)

    if not removed_param_ids:
        return []

    for parent_id, removed_children in parent_to_removed.items():
        parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            p, sectionId, parent_id, BaseParentCodeObjImpl
        )
        next_children = [
            child for child in parent_impl.children if child not in removed_children
        ]
        if next_children == parent_impl.children:
            continue
        set_curr_effective_code_obj_impl_value(
            p,
            sectionId,
            parent_id,
            BaseParentCodeObjImplArgsWithCallable(children=next_children),
        )

    removed_set = set(removed_param_ids)
    next_pinned = [
        param_id
        for param_id in section_impl.pinnedParams
        if param_id not in removed_set
    ]
    next_selected = [
        param_id
        for param_id in section_impl.selectedParams
        if param_id not in removed_set
    ]
    next_ignore_params = {
        param_id: ignore
        for param_id, ignore in section_impl.ignoreTypeErrors.params.items()
        if param_id not in removed_set
    }
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        BaseSectionWithParamsImplArgsWithCallable(
            pinnedParams=next_pinned,
            selectedParams=next_selected,
            ignoreTypeErrors=TypeErrorIgnoreState(
                callable=section_impl.ignoreTypeErrors.callable,
                params=next_ignore_params,
            ),
        ),
    )

    next_edge_inputs = [
        param_id
        for param_id in section_impl.edgeInputParams
        if param_id not in removed_set
    ]
    if next_edge_inputs != section_impl.edgeInputParams:
        set_section_edge_inputs(settings, p, sectionId, next_edge_inputs)

    return removed_param_ids


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


def set_text_block_text(p: "ProjectStateSingleConfig", sectionId: ID, text: str):
    impl = get_curr_effective_section_impl_with_type_guard(
        p, sectionId, TextBlockSectionImpl
    )
    set_curr_effective_section_impl_value(
        p, sectionId, TextBlockSectionImplArgsWithCallable(text=text)
    )
    if impl.headingAsSectionName:
        first_heading = (
            get_first_markdown_heading(text)
            if impl.format == TextBlockFormat.Markdown
            else get_first_heading_or_text(text)
        )
        if first_heading:
            try:
                set_section_name(p, sectionId, first_heading)
            except InvalidSectionName:
                pass


def set_text_block_heading_as_section_name(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    headingAsSectionName: bool,
):
    impl = get_curr_effective_section_impl_with_type_guard(
        p, sectionId, TextBlockSectionImpl
    )
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        TextBlockSectionImplArgsWithCallable(headingAsSectionName=headingAsSectionName),
    )
    if headingAsSectionName:
        first_heading = (
            get_first_markdown_heading(impl.text)
            if impl.format == TextBlockFormat.Markdown
            else get_first_heading_or_text(impl.text)
        )
        if first_heading:
            try:
                set_section_name(p, sectionId, first_heading)
            except InvalidSectionName:
                pass


def set_text_block_master_font_size(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    masterFontSizePx: float,
):
    get_curr_effective_section_impl_with_type_guard(p, sectionId, TextBlockSectionImpl)
    clamped_size = max(8.0, min(48.0, float(masterFontSizePx)))
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        TextBlockSectionImplArgsWithCallable(masterFontSizePx=clamped_size),
    )


def set_parent_default_child_section_type(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    defaultChildSectionType: SectionType,
):
    if defaultChildSectionType in DISALLOWED_PARENT_DEFAULT_CHILD_SECTION_TYPES:
        raise ValueError(
            f"Section type {defaultChildSectionType} cannot be a default child type."
        )
    section_impl = get_curr_effective_section_impl(p, sectionId)
    if isinstance(section_impl, ListRootSectionImpl):
        set_curr_effective_section_impl_value(
            p,
            sectionId,
            ListRootSectionImplArgsWithCallable(
                defaultChildSectionType=defaultChildSectionType
            ),
        )
        return
    if isinstance(section_impl, GroupSectionImpl):
        set_curr_effective_section_impl_value(
            p,
            sectionId,
            GroupSectionImplArgsWithCallable(
                defaultChildSectionType=defaultChildSectionType
            ),
        )
        return
    raise TypeError(f"Section {sectionId} does not support default child section type.")


def set_list_root_view_mode(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    viewMode: ListRootViewMode,
):
    get_curr_effective_section_impl_with_type_guard(p, sectionId, ListRootSectionImpl)
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        ListRootSectionImplArgsWithCallable(viewMode=viewMode),
    )


def set_task_board_section_state(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    viewMode: TaskBoardViewMode,
    columns: list[TaskBoardColumn],
    tasks: list[TaskBoardTask],
):
    get_curr_effective_section_impl_with_type_guard(p, sectionId, TaskBoardSectionImpl)
    normalized_columns: list[TaskBoardColumn] = []
    seen_column_ids: set[ID] = set()
    for column in columns:
        if column.id in seen_column_ids:
            continue
        seen_column_ids.add(column.id)
        normalized_columns.append(column.model_copy(deep=True))
    normalized_tasks: list[TaskBoardTask] = []
    for task in tasks:
        normalized = task.model_copy(deep=True)
        if normalized.columnId not in seen_column_ids:
            normalized.columnId = None
        normalized_tasks.append(normalized)
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        {
            "viewMode": viewMode,
            "columns": normalized_columns,
            "tasks": normalized_tasks,
        },
    )


def set_spreadsheet_file_path(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    filePath: str,
    activeSheet: str | None,
):
    get_curr_effective_section_impl_with_type_guard(
        p, sectionId, SpreadsheetSectionImpl
    )
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        {
            "filePath": filePath.strip(),
            "activeSheet": activeSheet,
        },
    )


def set_spreadsheet_section_settings(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    readOnly: bool,
    showRowNumbers: bool,
    density: SpreadsheetGridDensity,
    autoReloadOnExternalChange: bool,
):
    get_curr_effective_section_impl_with_type_guard(
        p, sectionId, SpreadsheetSectionImpl
    )
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        {
            "readOnly": readOnly,
            "showRowNumbers": showRowNumbers,
            "density": density,
            "autoReloadOnExternalChange": autoReloadOnExternalChange,
        },
    )


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


def set_code_file_binding(
    p: "ProjectStateSingleConfig", sectionId: ID, binding: CodeFileBinding
):
    normalized_binding = CodeFileBinding(
        canonical_path=normalize_workspace_path(binding.canonical_path),
        access_mode=binding.access_mode,
        autoBinding=binding.autoBinding,
    )
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        BaseCodeSectionImplArgsWithCallable(codeFileBinding=normalized_binding),
    )


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


def set_section_param_filter(p: "ProjectStateSingleConfig", sectionId: ID, value: str):
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        BaseSectionWithParamsImplArgsWithCallable(paramFilter=value),
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


def set_image_area_image_path(
    p: "ProjectStateSingleConfig", sectionId: ID, imagePath: str
):
    set_curr_effective_section_impl_value(
        p, sectionId, ImageSectionImplArgsWithCallable(imagePath=imagePath)
    )


def move_section_to_pane(
    p: "ProjectStateSingleConfig", sectionId: ID, position: Position
):
    oldParentId = p.parentSectionMap[sectionId]
    if oldParentId:
        _maybe_clear_code_section_attached_terminal(p, oldParentId, sectionId)
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
        next_z_index = _get_next_top_level_z_index(p)
        p.projectConfig.topLevelSections[sectionId] = TopLevelSectionLayout(
            x=position.x, y=position.y, zIndex=next_z_index
        )
    else:
        # it's already on the pane, so just adjust its position
        p.projectConfig.topLevelSections[sectionId].x = position.x
        p.projectConfig.topLevelSections[sectionId].y = position.y


def _get_next_top_level_z_index(p: "ProjectStateSingleConfig") -> int:
    if not p.projectConfig.topLevelSections:
        return 0
    return (
        max(layout.zIndex for layout in p.projectConfig.topLevelSections.values()) + 1
    )


def move_section_to_parent_section(
    p: "ProjectStateSingleConfig",
    newParentId: ID,
    sectionId: ID,
    idx: int,
):
    new_parent_impl = get_curr_effective_section_impl_with_type_guard(
        p, newParentId, BaseParentSectionImpl
    )
    _validate_code_section_children_for_parent(
        p, newParentId, new_parent_impl, [sectionId]
    )
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
        _maybe_clear_code_section_attached_terminal(p, oldParentId, sectionId)
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
    if isinstance(new_parent_impl, BaseCodeSectionImpl):
        _set_code_section_attached_terminal(p, newParentId, sectionId)


def move_sections_to_parent_section(
    p: "ProjectStateSingleConfig",
    newParentId: ID,
    sectionIds: list[ID],
    newIndex: int,
):
    if newIndex < 0:
        raise ValueError("Expected non-negative new index.")
    if not sectionIds:
        return

    if newParentId not in p.parentSectionMap:
        raise KeyError(f"Missing parentSectionMap entry for ancestor {newParentId}.")

    new_parent_impl = get_curr_effective_section_impl_with_type_guard(
        p, newParentId, BaseParentSectionImpl
    )
    _validate_code_section_children_for_parent(
        p, newParentId, new_parent_impl, sectionIds
    )
    selected_set = set(sectionIds)
    if newParentId in selected_set:
        raise ValueError("Cannot reparent into a selected section.")
    ancestor = newParentId
    while ancestor is not None:
        if ancestor not in p.parentSectionMap:
            raise KeyError(f"Missing parentSectionMap entry for ancestor {ancestor}.")
        if ancestor in selected_set:
            raise ValueError("Cannot reparent into a descendant of selection.")
        ancestor = p.parentSectionMap[ancestor]

    curr_children = get_curr_section_children_ids(p, newParentId)
    remaining = [c for c in curr_children if c not in selected_set]
    if newIndex > len(remaining):
        raise ValueError("New index exceeds available sibling range.")

    ids_by_parent: dict[ID | None, list[ID]] = {}
    for section_id in sectionIds:
        parent_id = p.parentSectionMap[section_id]
        ids_by_parent.setdefault(parent_id, []).append(section_id)

    for parent_id, ids in ids_by_parent.items():
        if parent_id is None:
            for section_id in ids:
                if section_id in p.projectConfig.topLevelSections:
                    del p.projectConfig.topLevelSections[section_id]
            continue
        for section_id in ids:
            _maybe_clear_code_section_attached_terminal(p, parent_id, section_id)
        removal_set = set(ids)
        set_curr_effective_section_impl_value(
            p,
            parent_id,
            BaseParentSectionImplArgsWithCallable(
                children=lambda currChildren: [
                    c for c in currChildren if c not in removal_set
                ]
            ),
        )

    def insert_children(curr_children: list[ID]):
        remaining = [c for c in curr_children if c not in selected_set]
        return insert_into_array(remaining, newIndex, sectionIds)

    set_curr_effective_section_impl_value(
        p,
        newParentId,
        BaseParentSectionImplArgsWithCallable(children=insert_children),
    )
    if isinstance(new_parent_impl, BaseCodeSectionImpl):
        _set_code_section_attached_terminal(p, newParentId, sectionIds[0])


def _get_section_param_root_id(
    p: "ProjectStateSingleConfig",
    section_id: ID,
    section_impl: BaseSectionWithParamsImpl,
) -> ID:
    if isinstance(section_impl, CallableSectionImpl):
        root_id = section_impl.callable
        if root_id is None:
            raise KeyError(f"Section {section_id} missing callable root.")
        if root_id not in p.codeObjs:
            raise KeyError(f"Callable root {root_id} missing from project state.")
        return root_id
    if isinstance(section_impl, BaseDictSectionImpl):
        root_id = section_impl.topLevelParamId
        if root_id is None:
            raise KeyError(f"Section {section_id} missing top level param root.")
        if root_id not in p.codeObjs:
            raise KeyError(
                f"Top level param root {root_id} missing from project state."
            )
        return root_id
    raise TypeError(f"Section {section_id} does not support param reordering.")


def _get_section_param_parent_map(
    p: "ProjectStateSingleConfig",
    section_impl: BaseSectionWithParamsImpl,
    root_id: ID,
) -> dict[ID, ID | None]:
    if root_id not in section_impl.codeObjVariantMap:
        raise KeyError(f"Section {section_impl.id} missing root param variant mapping.")
    hierarchy = traverse_hierarchy(
        p.codeObjs,
        p.codeObjImpls,
        p.codeObjVariants,
        section_impl.codeObjVariantMap,
        top_level_ids=[],
        root_id=root_id,
        options=TraversalOptions(build_parent_map=True),
    )
    return hierarchy.parent_map


def _normalize_param_ids(param_ids: list[ID]) -> list[ID]:
    if not param_ids:
        raise ValueError("Expected at least one param id.")
    seen: set[ID] = set()
    output: list[ID] = []
    for param_id in param_ids:
        if param_id in seen:
            raise ValueError(f"Duplicate param id {param_id}.")
        seen.add(param_id)
        output.append(param_id)
    return output


def _resolve_param_move_context(
    p: "ProjectStateSingleConfig",
    section_id: ID,
    param_ids: list[ID],
):
    section_impl, root_id, parent_map, normalized = _resolve_param_selection(
        p, section_id, param_ids
    )
    parent_id = parent_map[normalized[0]]
    if parent_id is None:
        raise ValueError(
            f"Param {normalized[0]} has no parent in section {section_id}."
        )
    for param_id in normalized[1:]:
        if parent_map[param_id] != parent_id:
            raise ValueError("Param selection spans multiple parents.")
    return section_impl, root_id, parent_map, parent_id, normalized


def _resolve_param_selection(
    p: "ProjectStateSingleConfig",
    section_id: ID,
    param_ids: list[ID],
):
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, BaseSectionWithParamsImpl
    )
    if section_impl.paramFilter.strip():
        raise ValueError(
            f"Section {section_id} has an active param filter; reordering disabled."
        )
    normalized = _normalize_param_ids(param_ids)
    root_id = _get_section_param_root_id(p, section_id, section_impl)
    parent_map = _get_section_param_parent_map(p, section_impl, root_id)
    for param_id in normalized:
        if param_id not in parent_map:
            raise KeyError(f"Param {param_id} not found in section {section_id}.")
    selected_set = set(normalized)
    for param_id in normalized:
        ancestor = parent_map[param_id]
        while ancestor is not None:
            if ancestor in selected_set:
                raise ValueError(
                    "Param selection includes both ancestor and descendant."
                )
            ancestor = parent_map[ancestor]
    return section_impl, root_id, parent_map, normalized


def _ensure_valid_new_parent(
    parent_map: dict[ID, ID | None],
    param_ids: list[ID],
    new_parent_id: ID,
):
    if new_parent_id not in parent_map:
        raise KeyError(f"New parent {new_parent_id} is not in the param tree.")
    selected_set = set(param_ids)
    if new_parent_id in selected_set:
        raise ValueError("Cannot reparent into a selected param.")
    ancestor = new_parent_id
    while ancestor is not None:
        if ancestor in selected_set:
            raise ValueError("Cannot reparent into a descendant of selection.")
        ancestor = parent_map.get(ancestor)


def move_params_within_parent(
    p: "ProjectStateSingleConfig",
    section_id: ID,
    param_ids: list[ID],
    new_index: int,
):
    _, _, _, parent_id, normalized = _resolve_param_move_context(
        p, section_id, param_ids
    )
    if new_index < 0:
        raise ValueError("Expected non-negative new index.")
    parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
        p, section_id, parent_id, BaseParentCodeObjImpl
    )
    children = list(parent_impl.children)
    ordered_param_ids = [param_id for param_id in children if param_id in normalized]
    if len(ordered_param_ids) != len(normalized):
        missing = [param_id for param_id in normalized if param_id not in children]
        raise KeyError(f"Params not found under parent {parent_id}: {missing}")
    remaining = [param_id for param_id in children if param_id not in normalized]
    if new_index > len(remaining):
        raise ValueError("New index exceeds available sibling range.")
    next_children = insert_into_array(remaining, new_index, ordered_param_ids)
    set_curr_effective_code_obj_impl_value(
        p,
        section_id,
        parent_id,
        BaseParentCodeObjImplArgsWithCallable(children=next_children),
    )


def move_params_to_parent(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    section_id: ID,
    param_ids: list[ID],
    new_parent_id: ID,
    new_index: int,
):
    _, _, parent_map, old_parent_id, normalized = _resolve_param_move_context(
        p, section_id, param_ids
    )
    if new_index < 0:
        raise ValueError("Expected non-negative new index.")
    if old_parent_id == new_parent_id:
        move_params_within_parent(p, section_id, normalized, new_index)
        return
    _ensure_valid_new_parent(parent_map, normalized, new_parent_id)

    old_parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
        p, section_id, old_parent_id, BaseParentCodeObjImpl
    )
    new_parent_impl = get_curr_effective_code_obj_impl(p, section_id, new_parent_id)
    if not isinstance(new_parent_impl, BaseParentCodeObjImpl):
        change_param_impl(
            settings, p, section_id, new_parent_id, CodeObjType.NestedParam.name
        )
        new_parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            p, section_id, new_parent_id, BaseParentCodeObjImpl
        )

    old_children = list(old_parent_impl.children)
    ordered_param_ids = [
        param_id for param_id in old_children if param_id in normalized
    ]
    if len(ordered_param_ids) != len(normalized):
        missing = [param_id for param_id in normalized if param_id not in old_children]
        raise KeyError(f"Params not found under parent {old_parent_id}: {missing}")
    next_old_children = [
        param_id for param_id in old_children if param_id not in normalized
    ]
    new_children = [
        param_id for param_id in new_parent_impl.children if param_id not in normalized
    ]
    if new_index > len(new_children):
        raise ValueError("New index exceeds available sibling range.")
    next_new_children = insert_into_array(new_children, new_index, ordered_param_ids)
    set_curr_effective_code_obj_impl_value(
        p,
        section_id,
        old_parent_id,
        BaseParentCodeObjImplArgsWithCallable(children=next_old_children),
    )
    set_curr_effective_code_obj_impl_value(
        p,
        section_id,
        new_parent_id,
        BaseParentCodeObjImplArgsWithCallable(children=next_new_children),
    )


def indent_params(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    section_id: ID,
    param_ids: list[ID],
):
    _, _, _, parent_id, normalized = _resolve_param_move_context(
        p, section_id, param_ids
    )
    parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
        p, section_id, parent_id, BaseParentCodeObjImpl
    )
    children = list(parent_impl.children)
    ordered_param_ids = [param_id for param_id in children if param_id in normalized]
    if not ordered_param_ids:
        raise KeyError("No params found to indent.")
    if len(ordered_param_ids) != len(normalized):
        missing = [param_id for param_id in normalized if param_id not in children]
        raise KeyError(f"Params not found under parent {parent_id}: {missing}")
    selected_set = set(ordered_param_ids)
    groups: list[list[ID]] = []
    current_group: list[ID] = []
    for child_id in children:
        if child_id in selected_set:
            current_group.append(child_id)
        elif current_group:
            groups.append(current_group)
            current_group = []
    if current_group:
        groups.append(current_group)

    for group in groups:
        parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            p, section_id, parent_id, BaseParentCodeObjImpl
        )
        children = list(parent_impl.children)
        ordered_group = [param_id for param_id in children if param_id in group]
        if not ordered_group:
            continue
        first_id = ordered_group[0]
        first_index = children.index(first_id)
        previous_id: ID | None = None
        for idx in range(first_index - 1, -1, -1):
            candidate = children[idx]
            if candidate not in selected_set:
                previous_id = candidate
                break
        if previous_id is None:
            continue
        prev_impl = get_curr_effective_code_obj_impl_with_type_guard(
            p, section_id, previous_id, BaseParamCodeObjImpl
        )
        if not isinstance(prev_impl, BaseParentCodeObjImpl):
            change_param_impl(
                settings, p, section_id, previous_id, CodeObjType.NestedParam.name
            )
        prev_parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            p, section_id, previous_id, BaseParentCodeObjImpl
        )
        new_index = len(prev_parent_impl.children)
        move_params_to_parent(
            settings, p, section_id, ordered_group, previous_id, new_index
        )


def unindent_params(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    section_id: ID,
    param_ids: list[ID],
):
    _, _, parent_map, normalized = _resolve_param_selection(p, section_id, param_ids)
    params_by_parent: dict[ID, list[ID]] = {}
    parents_in_order: list[ID] = []
    for param_id in normalized:
        parent_id = parent_map[param_id]
        if parent_id is None:
            raise ValueError(f"Param {param_id} has no parent in section {section_id}.")
        if parent_id not in params_by_parent:
            params_by_parent[parent_id] = []
            parents_in_order.append(parent_id)
        params_by_parent[parent_id].append(param_id)

    for parent_id in parents_in_order:
        grandparent_id = parent_map[parent_id]
        if grandparent_id is None:
            continue
        grandparent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            p, section_id, grandparent_id, BaseParentCodeObjImpl
        )
        grandparent_children = list(grandparent_impl.children)
        if parent_id not in grandparent_children:
            raise KeyError(f"Parent {parent_id} missing from grandparent children.")
        new_index = grandparent_children.index(parent_id) + 1
        move_params_to_parent(
            settings,
            p,
            section_id,
            params_by_parent[parent_id],
            grandparent_id,
            new_index,
        )
        old_parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            p, section_id, parent_id, BaseParentCodeObjImpl
        )
        if (
            not old_parent_impl.children
            and old_parent_impl.type == CodeObjType.NestedParam
        ):
            change_param_impl(
                settings, p, section_id, parent_id, CodeObjType.CodeParam.name
            )
            set_curr_effective_code_obj_impl_value(
                p,
                section_id,
                parent_id,
                BaseChildlessCodeObjImplArgsWithCallable(value="{}"),
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
