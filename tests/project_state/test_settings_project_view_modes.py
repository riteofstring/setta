from pathlib import Path

import pytest

from setta.project_state.settings_project import (
    SETTINGS_VIEW_GRID_COLUMNS,
    SETTINGS_VIEW_GRID_SPACING,
    SETTINGS_VIEW_MODE_GROUPS,
    create_settings_project_state,
    ensure_settings_code_objs,
    ensure_settings_view_modes,
)
from setta.types.code_obj_impls import (
    ColorPickerParamCodeObjImpl,
    NestedParamCodeObjImpl,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl_with_type_guard,
    get_variant_base_and_effective_code_obj_impl_with_type_guard,
)
from setta.types.section_impls import DictSectionImpl


def _get_settings_param_id(
    project_state,
    *,
    section_name: str,
    param_name: str,
) -> tuple[str, str]:
    section_name_to_id = {
        section.name: section_id
        for section_id, section in project_state.sections.items()
    }
    section_id = section_name_to_id[section_name]
    section_impl = get_curr_effective_section_impl_with_type_guard(
        project_state,
        section_id,
        DictSectionImpl,
    )
    if section_impl.topLevelParamId is None:
        raise KeyError(f"Settings section {section_name} has no topLevelParamId.")

    top_level_param_impl = get_curr_effective_code_obj_impl_with_type_guard(
        project_state,
        section_id,
        section_impl.topLevelParamId,
        NestedParamCodeObjImpl,
    )
    for child_id in top_level_param_impl.children:
        if child_id not in project_state.codeObjs:
            raise KeyError(f"Settings section {section_name} missing child {child_id}.")
        if project_state.codeObjs[child_id].name == param_name:
            return section_id, child_id

    raise KeyError(f"Settings section {section_name} is missing param {param_name}.")


def test_settings_view_modes_layout_and_viewport():
    project_state = create_settings_project_state(Path("/tmp/settings.json"))
    view_modes = {
        view_mode.name: view_mode
        for view_mode in project_state.projectConfig.viewModes.values()
    }
    core_view = view_modes["Core"]
    param_view = view_modes["Param Defaults"]
    structure_view = view_modes["Section Defaults Structure and Code"]
    expected_order = [name for name, _ in SETTINGS_VIEW_MODE_GROUPS] + ["All Settings"]
    for idx, name in enumerate(expected_order):
        assert view_modes[name].sortIndex == idx

    assert core_view.viewport is None
    assert core_view.viewportInitialized is False

    name_to_id = {
        section.name: section_id
        for section_id, section in project_state.sections.items()
    }

    core_order = [
        "shortcuts",
        "gui",
        "backend",
        "sectionSizingPolicy",
        "languageServer",
    ]
    for idx, section_name in enumerate(core_order):
        section_id = name_to_id[section_name]
        layout = core_view.topLevelSections[section_id]
        assert core_view.visibilityBySectionId[section_id] is True
        assert (
            layout.x == (idx % SETTINGS_VIEW_GRID_COLUMNS) * SETTINGS_VIEW_GRID_SPACING
        )
        assert (
            layout.y == (idx // SETTINGS_VIEW_GRID_COLUMNS) * SETTINGS_VIEW_GRID_SPACING
        )

    hidden_section_id = name_to_id["buttonParamCodeObjDefault"]
    assert core_view.visibilityBySectionId[hidden_section_id] is False

    param_order = [
        "buttonParamCodeObjDefault",
        "codeCallableCodeObjDefault",
        "codeParamCodeObjDefault",
    ]
    for idx, section_name in enumerate(param_order):
        section_id = name_to_id[section_name]
        layout = param_view.topLevelSections[section_id]
        assert param_view.visibilityBySectionId[section_id] is True
        assert (
            layout.x == (idx % SETTINGS_VIEW_GRID_COLUMNS) * SETTINGS_VIEW_GRID_SPACING
        )
        assert (
            layout.y == (idx // SETTINGS_VIEW_GRID_COLUMNS) * SETTINGS_VIEW_GRID_SPACING
        )

    workflow_order = [
        "stateMachineStartSectionDefault",
        "stateMachineGateSectionDefault",
        "stateMachineEndSectionDefault",
    ]
    workflow_start_idx = 9
    for idx, section_name in enumerate(workflow_order, start=workflow_start_idx):
        section_id = name_to_id[section_name]
        layout = structure_view.topLevelSections[section_id]
        assert structure_view.visibilityBySectionId[section_id] is True
        assert (
            layout.x == (idx % SETTINGS_VIEW_GRID_COLUMNS) * SETTINGS_VIEW_GRID_SPACING
        )
        assert (
            layout.y == (idx // SETTINGS_VIEW_GRID_COLUMNS) * SETTINGS_VIEW_GRID_SPACING
        )


def test_settings_view_modes_reset_when_invalid():
    project_state = create_settings_project_state(Path("/tmp/settings.json"))
    project_state.projectConfig.topLevelSections = {}
    for view_mode in project_state.projectConfig.viewModes.values():
        view_mode.topLevelSections = {}
    broken_view = next(
        view_mode
        for view_mode in project_state.projectConfig.viewModes.values()
        if view_mode.name == "Param Defaults"
    )
    broken_view.visibilityBySectionId = {
        section_id: False for section_id in broken_view.visibilityBySectionId.keys()
    }

    did_reset = ensure_settings_view_modes(project_state)

    assert did_reset is True
    view_modes = {
        view_mode.name: view_mode
        for view_mode in project_state.projectConfig.viewModes.values()
    }
    assert any(view_modes["Param Defaults"].visibilityBySectionId.values())
    assert project_state.projectConfig.topLevelSections


def test_settings_view_modes_reset_when_view_layout_missing_visible_sections():
    project_state = create_settings_project_state(Path("/tmp/settings.json"))
    view_modes = {
        view_mode.name: view_mode
        for view_mode in project_state.projectConfig.viewModes.values()
    }
    param_view = view_modes["Param Defaults"]
    visible_ids = [
        section_id
        for section_id, is_visible in param_view.visibilityBySectionId.items()
        if is_visible
    ]
    missing_id = visible_ids[0]
    del param_view.topLevelSections[missing_id]

    did_reset = ensure_settings_view_modes(project_state)

    assert did_reset is True
    refreshed_view_modes = {
        view_mode.name: view_mode
        for view_mode in project_state.projectConfig.viewModes.values()
    }
    assert missing_id in refreshed_view_modes["Param Defaults"].topLevelSections


def test_settings_view_modes_reset_when_top_level_missing_sections():
    project_state = create_settings_project_state(Path("/tmp/settings.json"))
    section_ids = list(project_state.sections.keys())
    project_state.projectConfig.topLevelSections = {
        section_ids[0]: project_state.projectConfig.topLevelSections[section_ids[0]]
    }

    did_reset = ensure_settings_view_modes(project_state)

    assert did_reset is True
    assert len(project_state.projectConfig.topLevelSections) == len(
        project_state.sections
    )


def test_settings_view_modes_skip_when_valid():
    project_state = create_settings_project_state(Path("/tmp/settings.json"))

    did_reset = ensure_settings_view_modes(project_state)

    assert did_reset is False


def test_settings_gui_color_params_start_with_palette_color_choices():
    project_state = create_settings_project_state(Path("/tmp/settings.json"))
    section_id, grid_color_id = _get_settings_param_id(
        project_state,
        section_name="gui",
        param_name="gridColor",
    )

    grid_color_impl = get_curr_effective_code_obj_impl_with_type_guard(
        project_state,
        section_id,
        grid_color_id,
        ColorPickerParamCodeObjImpl,
    )

    assert [choice.description for choice in grid_color_impl.colorChoices] == [
        "Red",
        "Orange",
        "Yellow",
        "Green",
        "Cyan",
        "Blue",
        "Purple",
        "Slate",
    ]


def test_ensure_settings_code_objs_backfills_palette_color_choices():
    project_state = create_settings_project_state(Path("/tmp/settings.json"))
    section_id, grid_color_id = _get_settings_param_id(
        project_state,
        section_name="gui",
        param_name="gridColor",
    )
    section_impl = get_curr_effective_section_impl_with_type_guard(
        project_state,
        section_id,
        DictSectionImpl,
    )
    current_variant_id = section_impl.codeObjVariantMap[grid_color_id]
    grid_color_core = project_state.codeObjs[grid_color_id]
    variant_ids = {current_variant_id, grid_color_core.defaultVariant}

    for variant_id in variant_ids:
        _variant, base_impl, _effective_impl = (
            get_variant_base_and_effective_code_obj_impl_with_type_guard(
                project_state,
                grid_color_core,
                variant_id,
                ColorPickerParamCodeObjImpl,
            )
        )
        base_impl.colorChoices = []

    did_change = ensure_settings_code_objs(project_state)
    repaired_impl = get_curr_effective_code_obj_impl_with_type_guard(
        project_state,
        section_id,
        grid_color_id,
        ColorPickerParamCodeObjImpl,
    )

    assert did_change is True
    assert [choice.description for choice in repaired_impl.colorChoices] == [
        "Red",
        "Orange",
        "Yellow",
        "Green",
        "Cyan",
        "Blue",
        "Purple",
        "Slate",
    ]


def test_settings_code_objs_fails_when_required_section_is_missing():
    project_state = create_settings_project_state(Path("/tmp/settings.json"))
    section_name_to_id = {
        section.name: section_id
        for section_id, section in project_state.sections.items()
    }
    missing_name = "spreadsheetSectionDefault"
    missing_section_id = section_name_to_id[missing_name]
    missing_variant_id = project_state.projectConfig.sectionVariantMap[
        missing_section_id
    ]
    missing_impl_id = project_state.sectionVariants[missing_variant_id].impl

    del project_state.projectConfig.sectionVariantMap[missing_section_id]
    del project_state.sections[missing_section_id]
    del project_state.sectionVariants[missing_variant_id]
    del project_state.sectionImpls[missing_impl_id]
    if missing_section_id in project_state.projectConfig.topLevelSections:
        del project_state.projectConfig.topLevelSections[missing_section_id]
    for view_mode in project_state.projectConfig.viewModes.values():
        if missing_section_id in view_mode.visibilityBySectionId:
            del view_mode.visibilityBySectionId[missing_section_id]
        if missing_section_id in view_mode.topLevelSections:
            del view_mode.topLevelSections[missing_section_id]

    with pytest.raises(
        KeyError,
        match="Missing settings section spreadsheetSectionDefault",
    ):
        ensure_settings_code_objs(project_state)
