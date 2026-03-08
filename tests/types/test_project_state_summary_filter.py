from setta.types.artifact import ArtifactType, DrawAreaLayerItem
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.helpers_lvl2 import append_draw_area_layer_item
from setta.types.helpers_lvl3 import (
    build_project_state_summary,
    filter_project_state_summary,
)
from setta.types.project_config import (
    Position,
    ProjectConfig,
    WindowSpaceConfig,
    WindowSpaceSurfaceKind,
    WindowSpaceWindow,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType


def test_filter_project_state_summary_limits_sections() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="summary-filter-test")
    )
    first_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.TextBlock,
        Position(),
    )
    second_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Dict,
        Position(),
    )
    summary = build_project_state_summary(project_state)

    filtered = filter_project_state_summary(
        summary,
        allowed_section_ids={first_section_id},
    )

    assert [entry.sectionId for entry in filtered.sections] == [first_section_id]
    assert set(filtered.projectConfig.sectionVariantMap.keys()) == {first_section_id}
    assert second_section_id not in filtered.parentSectionMap


def test_filter_project_state_summary_filters_required_decoded_images() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="summary-filter-images-test")
    )
    allowed_draw_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Draw,
        Position(),
    )
    blocked_draw_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Draw,
        Position(),
    )
    allowed_path = "artifacts/allowed.png"
    blocked_path = "artifacts/blocked.png"

    append_draw_area_layer_item(
        project_state,
        allowed_draw_section_id,
        0,
        DrawAreaLayerItem(
            type=ArtifactType.Image,
            dataPath=allowed_path,
            transformId="transform-allowed",
        ),
    )
    append_draw_area_layer_item(
        project_state,
        blocked_draw_section_id,
        0,
        DrawAreaLayerItem(
            type=ArtifactType.Image,
            dataPath=blocked_path,
            transformId="transform-blocked",
        ),
    )
    project_state.validate_required_decoded_images()

    summary = build_project_state_summary(project_state)
    assert allowed_path in set(summary.requiredDecodedImages)
    assert blocked_path in set(summary.requiredDecodedImages)

    filtered = filter_project_state_summary(
        summary,
        allowed_section_ids={allowed_draw_section_id},
    )
    assert set(filtered.requiredDecodedImages) == {allowed_path}


def test_filter_project_state_summary_trims_window_spaces_to_allowed_sections() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="summary-filter-window-spaces-test")
    )
    allowed_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.TextBlock,
        Position(),
    )
    blocked_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Dict,
        Position(),
    )
    project_state.projectConfig.windowSpaces = {
        "space-1": WindowSpaceConfig(
            id="space-1",
            name="Scoped Layout",
            sortIndex=0,
            windowsById={
                "allowed-window": WindowSpaceWindow(
                    surfaceKind=WindowSpaceSurfaceKind.section,
                    sectionIdOrNull=allowed_section_id,
                ),
                "blocked-window": WindowSpaceWindow(
                    surfaceKind=WindowSpaceSurfaceKind.section,
                    sectionIdOrNull=blocked_section_id,
                ),
            },
            order=["blocked-window", "allowed-window"],
        )
    }

    summary = build_project_state_summary(project_state)
    filtered = filter_project_state_summary(
        summary,
        allowed_section_ids={allowed_section_id},
    )

    assert set(filtered.projectConfig.windowSpaces.keys()) == {"space-1"}
    filtered_space = filtered.projectConfig.windowSpaces["space-1"]
    assert set(filtered_space.windowsById.keys()) == {"allowed-window"}
    assert filtered_space.order == ["allowed-window"]
