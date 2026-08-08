from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.helpers_lvl3 import build_project_state_summary_section_index
from setta.types.id import ID
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType


def test_build_project_state_summary_section_index_limits_to_requested_sections() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="summary-section-index-test")
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
    del blocked_section_id

    index = build_project_state_summary_section_index(
        project_state,
        {ID(allowed_section_id), ID("missing-section-id")},
    )
    assert set(index.keys()) == {ID(allowed_section_id)}
    assert index[ID(allowed_section_id)].sectionId == ID(allowed_section_id)


def test_build_project_state_summary_section_index_returns_empty_for_empty_input() -> None:
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="summary-section-index-empty-test")
    )
    assert build_project_state_summary_section_index(project_state, set()) == {}

