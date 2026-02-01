import math

import pytest

from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.helpers_lvl2 import (
    _resolve_new_section_dimensions,
    auto_layout_top_level_sections,
    create_top_level_section,
    normalize_section_size,
    set_section_sizes,
)
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionSize, SectionSizeMode, SectionType
from setta.types.settings_state import (
    SectionSizingPolicy,
    SectionSizingPolicyByType,
    SectionSizingPolicyTypeEntry,
)


def _build_chart_policy() -> SectionSizingPolicy:
    return SectionSizingPolicy(
        byType=SectionSizingPolicyByType(
            Chart=SectionSizingPolicyTypeEntry(
                minHeight=100,
                maxHeight=200,
                minWidth=150,
                maxWidth=250,
            )
        )
    )


def test_normalize_section_size_clamps_to_policy_bounds() -> None:
    settings = SettingsState(sectionSizingPolicy=_build_chart_policy())
    size = SectionSize(width=10, height=300)

    normalized = normalize_section_size(
        settings,
        SectionType.Chart,
        "chart-section",
        size,
    )

    assert normalized.width == 150
    assert normalized.height == 200


def test_normalize_section_size_clamps_negative_values() -> None:
    settings = SettingsState(sectionSizingPolicy=_build_chart_policy())
    size = SectionSize(width=-10, height=-5)

    normalized = normalize_section_size(
        settings,
        SectionType.Chart,
        "chart-section",
        size,
    )

    assert normalized.width == 150
    assert normalized.height == 100


def test_normalize_section_size_preserves_auto() -> None:
    settings = SettingsState(sectionSizingPolicy=_build_chart_policy())
    size = SectionSize(width=SectionSizeMode.auto, height=120)

    normalized = normalize_section_size(
        settings,
        SectionType.Chart,
        "chart-section",
        size,
    )

    assert normalized.width == SectionSizeMode.auto
    assert normalized.height == 120


def test_normalize_section_size_rejects_non_finite() -> None:
    settings = SettingsState(sectionSizingPolicy=_build_chart_policy())
    size = SectionSize(width=math.nan, height=120)

    with pytest.raises(ValueError, match="non-finite width"):
        normalize_section_size(
            settings,
            SectionType.Chart,
            "chart-section",
            size,
        )


def test_set_section_sizes_normalizes_payload() -> None:
    settings = SettingsState(sectionSizingPolicy=_build_chart_policy())
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="sizing-normalization")
    )
    section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chart,
        Position(),
    )

    set_section_sizes(
        settings,
        project_state,
        {section_id: SectionSize(width=50, height=1000)},
    )

    impl = get_curr_effective_section_impl(project_state, section_id)
    assert impl.size.width == 150
    assert impl.size.height == 200


def test_create_section_clamps_override_sizes() -> None:
    settings = SettingsState(sectionSizingPolicy=_build_chart_policy())
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="sizing-create")
    )
    section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chart,
        Position(),
        impl_overrides={"size": SectionSize(width=20, height=20)},
    )

    impl = get_curr_effective_section_impl(project_state, section_id)
    assert impl.size.width == 150
    assert impl.size.height == 100


def test_new_section_dimensions_use_normalized_size_for_layout() -> None:
    settings = SettingsState(sectionSizingPolicy=_build_chart_policy())

    width, height = _resolve_new_section_dimensions(
        settings,
        SectionType.Chart,
        {"size": SectionSize(width=20, height=20)},
    )

    assert width == 150
    assert height == 100


def test_auto_layout_falls_back_for_auto_sizes() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="layout"))
    section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.TextBlock,
        Position(),
    )

    auto_layout_top_level_sections(settings, project_state, margin=10)

    layout = project_state.projectConfig.topLevelSections[section_id]
    assert isinstance(layout.x, float)
    assert isinstance(layout.y, float)
