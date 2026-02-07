from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.helpers_lvl3 import (
    build_project_state_summary,
    filter_project_state_summary,
)
from setta.types.project_config import Position, ProjectConfig
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
