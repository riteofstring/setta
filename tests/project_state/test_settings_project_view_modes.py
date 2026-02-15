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


def test_settings_view_modes_layout_and_viewport():
    project_state = create_settings_project_state(Path("/tmp/settings.json"))
    view_modes = {
        view_mode.name: view_mode
        for view_mode in project_state.projectConfig.viewModes.values()
    }
    core_view = view_modes["Core"]
    param_view = view_modes["Param Defaults"]
    expected_order = [name for name, _ in SETTINGS_VIEW_MODE_GROUPS] + [
        "All Settings"
    ]
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
        assert layout.x == (idx % SETTINGS_VIEW_GRID_COLUMNS) * SETTINGS_VIEW_GRID_SPACING
        assert layout.y == (idx // SETTINGS_VIEW_GRID_COLUMNS) * SETTINGS_VIEW_GRID_SPACING

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
        assert layout.x == (idx % SETTINGS_VIEW_GRID_COLUMNS) * SETTINGS_VIEW_GRID_SPACING
        assert layout.y == (idx // SETTINGS_VIEW_GRID_COLUMNS) * SETTINGS_VIEW_GRID_SPACING


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
        section_id: False
        for section_id in broken_view.visibilityBySectionId.keys()
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


def test_settings_code_objs_fails_when_required_section_is_missing():
    project_state = create_settings_project_state(Path("/tmp/settings.json"))
    section_name_to_id = {
        section.name: section_id for section_id, section in project_state.sections.items()
    }
    missing_name = "spreadsheetSectionDefault"
    missing_section_id = section_name_to_id[missing_name]
    missing_variant_id = project_state.projectConfig.sectionVariantMap[missing_section_id]
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
