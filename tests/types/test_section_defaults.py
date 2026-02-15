import pytest

from setta.types.section_impls import (
    ChartSectionImpl,
    ChatSectionImpl,
    DrawSectionImpl,
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
