import math

import pytest

from tests.helpers.settings_state import SettingsState
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionSize, SectionSizeMode, SectionType
from tests.helpers.settings_models import (
    SectionSizingPolicy,
    SectionSizingPolicyByType,
    SectionSizingPolicyTypeEntry,
)
from tests.helpers.project_state_sections import (
    create_top_level_section,
    normalize_section_size,
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


def test_default_policy_clamps_textblock_and_meta_control() -> None:
    settings = SettingsState()

    textblock = normalize_section_size(
        settings,
        SectionType.TextBlock,
        "textblock-section",
        SectionSize(width=1, height=1),
    )
    assert textblock.width == 100
    assert textblock.height == 49

    meta = normalize_section_size(
        settings,
        SectionType.MetaControl,
        "meta-section",
        SectionSize(width=1, height=1),
    )
    assert meta.width == 100
    assert meta.height == 10
