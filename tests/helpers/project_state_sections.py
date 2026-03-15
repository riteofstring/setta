import logging
import math
import re
from typing import TYPE_CHECKING

from setta.types.artifact import DrawAreaLayer
from setta.types.core import Core, Variant
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseParentSectionImplArgsWithCallable,
    CoreArgs,
)
from setta.types.generated.impl_creation_fns import create_section_impl
from setta.types.generated.settings_state import (
    SettingsState,
    get_user_default_section_from_settings,
)
from setta.types.generated.unions import BaseSectionImplArgsUnion
from setta.types.generated.user_defaults import UserDefaultTaskBoardSectionImpl
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl,
    get_curr_effective_section_impl_with_type_guard,
    set_curr_effective_section_impl_value,
)
from setta.types.id import ID
from setta.types.project_config import Position, TopLevelSectionLayout
from setta.types.section_impls import (
    BaseCodeSectionImpl,
    BaseParentSectionImpl,
    DrawSectionImpl,
    MetaControlSectionImpl,
    SectionSize,
    SectionSizeMode,
    SectionType,
    TaskBoardColumn,
    TaskBoardSectionImpl,
    TerminalSectionImpl,
    TextBlockFormat,
    TextBlockSectionImpl,
)
from tests.helpers.project_state_core import (
    compute_initial_nonPresetImpls,
    get_default_section_core_name,
)
from tests.helpers.project_state_mutations import add_meta_control_code_obj

if TYPE_CHECKING:
    from setta.types.project_state import ProjectStateSingleConfig


logger = logging.getLogger("setta.types.helpers_lvl2")


def _insert_into_array(arr: list[ID], index: int, new_items: list[ID]) -> list[ID]:
    return [*arr[:index], *new_items, *arr[index:]]


def _compute_initial_default_variant(variant: Variant) -> CoreArgs:
    return CoreArgs(variants=[variant.id], defaultVariant=variant.id)


def _get_first_heading_or_text(markdown: str):
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


def get_curr_section_children_ids(
    p: "ProjectStateSingleConfig",
    section_id: ID,
):
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, BaseParentSectionImpl
    )
    return section_impl.children


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


def create_section(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    impl_type: SectionType,
    impl_overrides: BaseSectionImplArgsUnion | None = None,
    core_overrides: CoreArgs | None = None,
    control_code_obj_type=None,
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
        **_compute_initial_default_variant(variant),
    }
    if isinstance(impl, TextBlockSectionImpl) and impl.headingAsSectionName:
        first_heading = (
            get_first_markdown_heading(impl.text)
            if impl.format == TextBlockFormat.Markdown
            else _get_first_heading_or_text(impl.text)
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
        control_type = control_code_obj_type if control_code_obj_type is not None else None
        if control_type is None:
            from setta.types.code_obj_impls import CodeObjType

            control_type = CodeObjType.SliderParam
        add_meta_control_code_obj(settings, p, core.id, control_type)

    return core.id


def create_top_level_section(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    impl_type: SectionType,
    position: Position,
    impl_overrides: BaseSectionImplArgsUnion | None = None,
    core_overrides: CoreArgs | None = None,
    control_code_obj_type=None,
):
    section_id = create_section(
        settings,
        p,
        impl_type,
        impl_overrides,
        core_overrides,
        control_code_obj_type=control_code_obj_type,
    )
    p.projectConfig.topLevelSections[section_id] = TopLevelSectionLayout(
        **position.model_dump()
    )
    return section_id


def _validate_code_section_children_for_creation(
    parent_id: ID,
    parent_impl: BaseParentSectionImpl,
    impl_type: SectionType,
    num_children: int,
) -> None:
    if not isinstance(parent_impl, BaseCodeSectionImpl):
        return
    if impl_type != SectionType.Terminal:
        raise ValueError("Code sections can only create terminal children.")
    if num_children != 1:
        raise ValueError("Code sections can only have one terminal child.")
    if parent_impl.children:
        raise ValueError(f"Code section {parent_id} already has a child.")


def _validate_code_section_children_for_parent(
    p: "ProjectStateSingleConfig",
    parent_id: ID,
    parent_impl: BaseParentSectionImpl,
    child_ids: list[ID],
) -> None:
    if not isinstance(parent_impl, BaseCodeSectionImpl):
        return
    if len(child_ids) != 1:
        raise ValueError("Code sections can only have one terminal child.")
    terminal_id = child_ids[0]
    get_curr_effective_section_impl_with_type_guard(p, terminal_id, TerminalSectionImpl)
    if parent_impl.children and parent_impl.children != [terminal_id]:
        raise ValueError(f"Code section {parent_id} already has a child.")


def _set_code_section_attached_terminal(
    p: "ProjectStateSingleConfig", section_id: ID, terminal_id: ID
) -> None:
    set_curr_effective_section_impl_value(
        p,
        section_id,
        {"attachedTerminalSectionId": terminal_id},
    )
    logger.info(
        "code_section_attached_terminal_set section=%s terminal=%s",
        section_id,
        terminal_id,
    )


def _maybe_clear_code_section_attached_terminal(
    p: "ProjectStateSingleConfig", parent_id: ID | None, child_id: ID
) -> None:
    if not parent_id:
        return
    parent_impl = get_curr_effective_section_impl(p, parent_id)
    if isinstance(parent_impl, BaseCodeSectionImpl):
        if parent_impl.attachedTerminalSectionId == child_id:
            set_curr_effective_section_impl_value(
                p,
                parent_id,
                {"attachedTerminalSectionId": None},
            )
            logger.info(
                "code_section_attached_terminal_cleared parent=%s child=%s",
                parent_id,
                child_id,
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
    section_id: ID,
    terminal_id: ID | None,
) -> None:
    if terminal_id is None:
        return
    code_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, BaseCodeSectionImpl
    )
    terminal_impl = get_curr_effective_section_impl_with_type_guard(
        p, terminal_id, TerminalSectionImpl
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
            section_id,
            {"size": SectionSize(width=code_impl.size.width, height=code_height)},
        )

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
            terminal_id,
            {
                "size": SectionSize(
                    width=next_terminal_width, height=next_terminal_height
                )
            },
        )


def create_child_sections(
    settings: SettingsState,
    p: "ProjectStateSingleConfig",
    parent_id: ID,
    impl_type: SectionType,
    num_children: int,
    start_idx: int | None,
):
    if impl_type in {
        SectionType.StateMachineStart,
        SectionType.StateMachineGate,
        SectionType.StateMachineEnd,
    }:
        raise ValueError(f"Section type {impl_type} can only exist at the top level.")
    effective_impl = get_curr_effective_section_impl_with_type_guard(
        p, parent_id, BaseParentSectionImpl
    )
    _validate_code_section_children_for_creation(
        parent_id, effective_impl, impl_type, num_children
    )
    size = SectionSize(width=effective_impl.size.width)
    if (
        isinstance(effective_impl, BaseCodeSectionImpl)
        and impl_type == SectionType.Terminal
    ):
        size = SectionSize(
            width=effective_impl.size.width,
            height=_get_terminal_default_height(settings),
        )
    new_ids = [
        create_section(settings, p, impl_type, {"size": size})
        for _ in range(num_children)
    ]
    if start_idx is None:
        start_idx = len(effective_impl.children)

    set_curr_effective_section_impl_value(
        p,
        parent_id,
        BaseParentSectionImplArgsWithCallable(
            children=lambda curr_children: _insert_into_array(
                curr_children, start_idx, new_ids
            )
        ),
    )
    if isinstance(effective_impl, BaseCodeSectionImpl):
        _set_code_section_attached_terminal(p, parent_id, new_ids[0])
        ensure_code_section_embedded_terminal_size(settings, p, parent_id, new_ids[0])

    return new_ids


def _get_next_top_level_z_index(p: "ProjectStateSingleConfig") -> int:
    if not p.projectConfig.topLevelSections:
        return 0
    return (
        max(layout.zIndex for layout in p.projectConfig.topLevelSections.values()) + 1
    )


def move_section_to_pane(
    p: "ProjectStateSingleConfig", section_id: ID, position: Position
):
    old_parent_id = p.parentSectionMap[section_id]
    if old_parent_id:
        _maybe_clear_code_section_attached_terminal(p, old_parent_id, section_id)
        set_curr_effective_section_impl_value(
            p,
            old_parent_id,
            BaseParentSectionImplArgsWithCallable(
                children=lambda curr_children: [
                    child for child in curr_children if child != section_id
                ]
            ),
        )
        next_z_index = _get_next_top_level_z_index(p)
        p.projectConfig.topLevelSections[section_id] = TopLevelSectionLayout(
            x=position.x, y=position.y, zIndex=next_z_index
        )
    else:
        p.projectConfig.topLevelSections[section_id].x = position.x
        p.projectConfig.topLevelSections[section_id].y = position.y


def move_sections_to_parent_section(
    p: "ProjectStateSingleConfig",
    new_parent_id: ID,
    section_ids: list[ID],
    new_index: int,
):
    if new_index < 0:
        raise ValueError("Expected non-negative new index.")
    if not section_ids:
        return

    if new_parent_id not in p.parentSectionMap:
        raise KeyError(f"Missing parentSectionMap entry for ancestor {new_parent_id}.")

    new_parent_impl = get_curr_effective_section_impl_with_type_guard(
        p, new_parent_id, BaseParentSectionImpl
    )
    _validate_code_section_children_for_parent(
        p, new_parent_id, new_parent_impl, section_ids
    )
    selected_set = set(section_ids)
    if new_parent_id in selected_set:
        raise ValueError("Cannot reparent into a selected section.")
    ancestor = new_parent_id
    while ancestor is not None:
        if ancestor not in p.parentSectionMap:
            raise KeyError(f"Missing parentSectionMap entry for ancestor {ancestor}.")
        if ancestor in selected_set:
            raise ValueError("Cannot reparent into a descendant of selection.")
        ancestor = p.parentSectionMap[ancestor]

    current_children = get_curr_section_children_ids(p, new_parent_id)
    remaining = [child for child in current_children if child not in selected_set]
    if new_index > len(remaining):
        raise ValueError("New index exceeds available sibling range.")

    ids_by_parent: dict[ID | None, list[ID]] = {}
    for section_id in section_ids:
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
                children=lambda curr_children: [
                    child for child in curr_children if child not in removal_set
                ]
            ),
        )

    def insert_children(curr_children: list[ID]):
        remaining_children = [
            child for child in curr_children if child not in selected_set
        ]
        return _insert_into_array(remaining_children, new_index, section_ids)

    set_curr_effective_section_impl_value(
        p,
        new_parent_id,
        BaseParentSectionImplArgsWithCallable(children=insert_children),
    )
    if isinstance(new_parent_impl, BaseCodeSectionImpl):
        _set_code_section_attached_terminal(p, new_parent_id, section_ids[0])
