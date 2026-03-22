from setta.types.code_obj_impls import BaseParentCodeObjImpl, CodeObjType
from setta.types.core import Core
from setta.types.generated.impl_args_as_typed_dicts import (
    CallableSectionImplArgsWithCallable,
)
from setta.types.generated.impl_creation_fns import create_code_obj_impl
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    set_curr_effective_section_impl_value,
)
from setta.types.helpers_lvl2 import (
    add_code_obj,
    add_kwarg,
    change_param_impl,
    create_child_sections_via_incrementer,
    create_top_level_section,
    move_params_to_parent,
    set_param_entered_value,
    set_parent_default_child_section_type,
    update_param_impl_config,
)
from setta.types.project_config import Position, ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType


TIER1_SCENE_NAME = "benchmark-tier1"
TIER1_CALLABLE_COUNT = 8
TIER1_DICT_COUNT = 12
TIER1_GLOBAL_VARIABLES_COUNT = 1
TIER1_LIST_ROOT_COUNT = 4
TIER1_LIST_ROOT_CHILDREN_PER_SECTION = 5
TIER1_GRID_COLUMNS = 4
TIER1_GRID_ORIGIN_X = 60.0
TIER1_GRID_ORIGIN_Y = 60.0
TIER1_GRID_STEP_X = 460.0
TIER1_GRID_STEP_Y = 700.0
CALLABLE_SECTION_WIDTH = 340.0
CALLABLE_SECTION_HEIGHT = 520.0
DICT_SECTION_WIDTH = 340.0
DICT_SECTION_HEIGHT = 560.0
GLOBAL_VARIABLES_SECTION_WIDTH = 360.0
GLOBAL_VARIABLES_SECTION_HEIGHT = 560.0
LIST_ROOT_SECTION_WIDTH = 420.0
LIST_ROOT_SECTION_HEIGHT = 620.0
ACCENT_COLORS = (
    "#2563eb",
    "#059669",
    "#dc2626",
    "#7c3aed",
    "#ea580c",
    "#0891b2",
)


def build_tier1_synthetic_scene() -> ProjectStateSingleConfig:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name=TIER1_SCENE_NAME)
    )

    slot_index = 0

    for idx in range(TIER1_CALLABLE_COUNT):
        section_id = _create_top_level_scene_section(
            settings,
            project_state,
            section_type=SectionType.Callable,
            name=f"callable_{idx:02d}",
            slot_index=slot_index,
            width=CALLABLE_SECTION_WIDTH,
            height=CALLABLE_SECTION_HEIGHT,
        )
        _attach_callable(project_state, settings, section_id, f"callable_{idx:02d}_fn")
        _populate_dense_param_section(
            settings,
            project_state,
            section_id,
            seed_label=f"callable_{idx:02d}",
            seed_number=idx,
        )
        slot_index += 1

    for idx in range(TIER1_DICT_COUNT):
        section_id = _create_top_level_scene_section(
            settings,
            project_state,
            section_type=SectionType.Dict,
            name=f"dict_{idx:02d}",
            slot_index=slot_index,
            width=DICT_SECTION_WIDTH,
            height=DICT_SECTION_HEIGHT,
        )
        _populate_dense_param_section(
            settings,
            project_state,
            section_id,
            seed_label=f"dict_{idx:02d}",
            seed_number=idx + 100,
        )
        slot_index += 1

    for idx in range(TIER1_GLOBAL_VARIABLES_COUNT):
        section_id = _create_top_level_scene_section(
            settings,
            project_state,
            section_type=SectionType.GlobalVariables,
            name=f"globals_{idx:02d}",
            slot_index=slot_index,
            width=GLOBAL_VARIABLES_SECTION_WIDTH,
            height=GLOBAL_VARIABLES_SECTION_HEIGHT,
        )
        _populate_dense_param_section(
            settings,
            project_state,
            section_id,
            seed_label=f"globals_{idx:02d}",
            seed_number=idx + 200,
        )
        slot_index += 1

    for idx in range(TIER1_LIST_ROOT_COUNT):
        section_id = _create_top_level_scene_section(
            settings,
            project_state,
            section_type=SectionType.ListRoot,
            name=f"list_root_{idx:02d}",
            slot_index=slot_index,
            width=LIST_ROOT_SECTION_WIDTH,
            height=LIST_ROOT_SECTION_HEIGHT,
        )
        set_parent_default_child_section_type(
            project_state, section_id, SectionType.Dict
        )
        create_child_sections_via_incrementer(
            settings,
            project_state,
            section_id,
            SectionType.Dict,
            TIER1_LIST_ROOT_CHILDREN_PER_SECTION,
        )
        list_impl = project_state.sectionImpls[
            project_state.sectionVariants[
                project_state.projectConfig.sectionVariantMap[section_id]
            ].impl
        ]
        for child_idx, child_id in enumerate(list_impl.children):
            project_state.sections[child_id].name = f"list_item_{idx:02d}_{child_idx:02d}"
            _populate_compact_list_item_section(
                settings,
                project_state,
                child_id,
                seed_label=f"list_item_{idx:02d}_{child_idx:02d}",
                seed_number=idx * TIER1_LIST_ROOT_CHILDREN_PER_SECTION + child_idx,
            )
        slot_index += 1

    return project_state


def _create_top_level_scene_section(
    settings: SettingsState,
    project_state: ProjectStateSingleConfig,
    *,
    section_type: SectionType,
    name: str,
    slot_index: int,
    width: float,
    height: float,
):
    x, y = _grid_position(slot_index)
    section_id = create_top_level_section(
        settings,
        project_state,
        section_type,
        Position(x=x, y=y),
    )
    project_state.sections[section_id].name = name
    project_state.projectConfig.topLevelSections[section_id] = TopLevelSectionLayout(
        x=x,
        y=y,
        w=width,
        h=height,
        zIndex=slot_index,
    )
    return section_id


def _grid_position(slot_index: int) -> tuple[float, float]:
    column = slot_index % TIER1_GRID_COLUMNS
    row = slot_index // TIER1_GRID_COLUMNS
    return (
        TIER1_GRID_ORIGIN_X + column * TIER1_GRID_STEP_X,
        TIER1_GRID_ORIGIN_Y + row * TIER1_GRID_STEP_Y,
    )


def _attach_callable(
    project_state: ProjectStateSingleConfig,
    settings: SettingsState,
    section_id,
    callable_name: str,
) -> None:
    callable_core = Core(name=callable_name)
    callable_impl = create_code_obj_impl(
        CodeObjType.CodeCallable,
        settings.codeCallableCodeObjDefault,
    )
    callable_variant = add_code_obj(
        project_state,
        [section_id],
        callable_core,
        callable_impl,
    )
    set_curr_effective_section_impl_value(
        project_state,
        section_id,
        CallableSectionImplArgsWithCallable(
            callable=callable_core.id,
            codeObjVariantMap=lambda curr_map: {
                **curr_map,
                callable_core.id: callable_variant.id,
            },
        ),
    )


def _populate_dense_param_section(
    settings: SettingsState,
    project_state: ProjectStateSingleConfig,
    section_id,
    *,
    seed_label: str,
    seed_number: int,
) -> None:
    _create_param(
        settings,
        project_state,
        section_id,
        name="script",
        param_type=CodeObjType.CodeParam,
        value=f"{seed_label}_script_{seed_number}",
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="notes",
        param_type=CodeObjType.TextAreaParam,
        value=(
            f"{seed_label} line 1\n"
            f"{seed_label} line 2\n"
            f"{seed_label} line 3"
        ),
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="title",
        param_type=CodeObjType.TextParam,
        value=f"{seed_label} title",
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="enabled",
        param_type=CodeObjType.SwitchParam,
        value="true" if seed_number % 2 == 0 else "false",
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="temperature",
        param_type=CodeObjType.SliderParam,
        value=str(10 + (seed_number % 30)),
        impl_updates={"min": 0, "max": 100, "step": 1},
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="accent",
        param_type=CodeObjType.ColorPickerParam,
        value=ACCENT_COLORS[seed_number % len(ACCENT_COLORS)],
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="run_date",
        param_type=CodeObjType.DateParam,
        value="2026-03-20",
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="run_time",
        param_type=CodeObjType.TimeParam,
        value="09:30",
    )

    credentials_id = _create_param(
        settings,
        project_state,
        section_id,
        name="credentials",
        param_type=CodeObjType.NestedParam,
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="endpoint",
        param_type=CodeObjType.TextParam,
        value=f"https://example.com/{seed_label}",
        parent_id=credentials_id,
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="token",
        param_type=CodeObjType.CodeParam,
        value=f"token_{seed_number:04d}",
        parent_id=credentials_id,
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="retries",
        param_type=CodeObjType.SliderParam,
        value=str(1 + (seed_number % 5)),
        impl_updates={"min": 0, "max": 10, "step": 1},
        parent_id=credentials_id,
    )

    advanced_id = _create_param(
        settings,
        project_state,
        section_id,
        name="advanced",
        param_type=CodeObjType.NestedParam,
        parent_id=credentials_id,
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="seed",
        param_type=CodeObjType.CodeParam,
        value=f"{seed_number * 17}",
        parent_id=advanced_id,
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="template",
        param_type=CodeObjType.TextAreaParam,
        value=(
            f"Hello {seed_label}\n"
            f"{{ value_{seed_number} }}\n"
            "Render me on overview pan."
        ),
        parent_id=advanced_id,
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="strict",
        param_type=CodeObjType.SwitchParam,
        value="true",
        parent_id=advanced_id,
    )

    mapping_id = _create_param(
        settings,
        project_state,
        section_id,
        name="mapping",
        param_type=CodeObjType.NestedParam,
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="source",
        param_type=CodeObjType.TextParam,
        value=f"source_{seed_number}",
        parent_id=mapping_id,
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="target",
        param_type=CodeObjType.TextParam,
        value=f"target_{seed_number}",
        parent_id=mapping_id,
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="formatter",
        param_type=CodeObjType.CodeParam,
        value=f"lambda value: value_{seed_number}",
        parent_id=mapping_id,
    )


def _populate_compact_list_item_section(
    settings: SettingsState,
    project_state: ProjectStateSingleConfig,
    section_id,
    *,
    seed_label: str,
    seed_number: int,
) -> None:
    _create_param(
        settings,
        project_state,
        section_id,
        name="name",
        param_type=CodeObjType.TextParam,
        value=f"{seed_label}_name",
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="prompt",
        param_type=CodeObjType.TextAreaParam,
        value=f"{seed_label}\ncompact prompt\nrow {seed_number}",
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="enabled",
        param_type=CodeObjType.SwitchParam,
        value="true" if seed_number % 2 == 0 else "false",
    )
    metadata_id = _create_param(
        settings,
        project_state,
        section_id,
        name="metadata",
        param_type=CodeObjType.NestedParam,
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="index",
        param_type=CodeObjType.CodeParam,
        value=str(seed_number),
        parent_id=metadata_id,
    )
    _create_param(
        settings,
        project_state,
        section_id,
        name="color",
        param_type=CodeObjType.ColorPickerParam,
        value=ACCENT_COLORS[seed_number % len(ACCENT_COLORS)],
        parent_id=metadata_id,
    )


def _create_param(
    settings: SettingsState,
    project_state: ProjectStateSingleConfig,
    section_id,
    *,
    name: str,
    param_type: CodeObjType,
    value: str | None = None,
    impl_updates: dict | None = None,
    parent_id=None,
):
    param_id = add_kwarg(settings, project_state, section_id)
    project_state.codeObjs[param_id].name = name
    if param_type != CodeObjType.CodeParam:
        change_param_impl(settings, project_state, section_id, param_id, param_type.name)
    if impl_updates:
        update_param_impl_config(project_state, section_id, param_id, impl_updates)
    if parent_id is not None:
        parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            project_state,
            section_id,
            parent_id,
            BaseParentCodeObjImpl,
        )
        move_params_to_parent(
            settings,
            project_state,
            section_id,
            [param_id],
            parent_id,
            len(parent_impl.children),
        )
    if value is not None and param_type != CodeObjType.NestedParam:
        set_param_entered_value(project_state, section_id, param_id, value)
    return param_id
