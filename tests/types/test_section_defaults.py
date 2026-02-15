import pytest

from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.generated.settings_state import SettingsState
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    ChartSectionImpl,
    ChatSectionImpl,
    DrawSectionImpl,
    SectionType,
    SectionSize,
    SectionSizeMode,
)
from setta.types.settings_state import SectionSizingPolicy


def test_section_size_defaults_to_auto_width() -> None:
    size = SectionSize()
    assert size.width == SectionSizeMode.auto


@pytest.mark.parametrize(
    ("impl", "policy_entry"),
    [
        (ChartSectionImpl(), SectionSizingPolicy().byType.Chart),
        (DrawSectionImpl(), SectionSizingPolicy().byType.Draw),
        (ChatSectionImpl(), SectionSizingPolicy().byType.Chat),
    ],
)
def test_default_section_sizes_meet_policy_minimums(impl, policy_entry) -> None:
    assert isinstance(impl.size.width, (int, float))
    assert isinstance(impl.size.height, (int, float))
    assert impl.size.width >= policy_entry.minWidth
    assert impl.size.height >= policy_entry.minHeight


def test_chat_section_normalizes_deprecated_skills_setting() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="test"))
    section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    chat_impl = get_curr_effective_section_impl_with_type_guard(
        project_state,
        section_id,
        ChatSectionImpl,
    )
    chat_impl.skillsEnabled = False

    reloaded = ProjectStateSingleConfig.model_validate(
        project_state.model_dump(mode="python")
    )
    reloaded_chat_impl = get_curr_effective_section_impl_with_type_guard(
        reloaded,
        section_id,
        ChatSectionImpl,
    )
    assert reloaded_chat_impl.skillsEnabled is True
