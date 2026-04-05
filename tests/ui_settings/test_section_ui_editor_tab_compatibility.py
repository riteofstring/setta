from setta.types.section_impls import SectionType
from setta.ui_settings.section_ui_editor_tab_compatibility import (
    REQUIRED_UI_EDITOR_TABS_BY_SECTION_TYPE,
)


def test_required_ui_editor_tabs_include_all_section_types() -> None:
    assert set(REQUIRED_UI_EDITOR_TABS_BY_SECTION_TYPE.keys()) == set(SectionType)


def test_required_ui_editor_tabs_match_representative_section_compatibility() -> None:
    assert REQUIRED_UI_EDITOR_TABS_BY_SECTION_TYPE[SectionType.Callable] == frozenset(
        {
            "SectionConfig",
            "UIConfig",
            "QuickInfoConfig",
            "SectionVariantsConfig",
        }
    )
    assert REQUIRED_UI_EDITOR_TABS_BY_SECTION_TYPE[SectionType.TextBlock] == frozenset(
        {
            "SectionConfig",
            "InfoConfig",
            "SectionVariantsConfig",
        }
    )
    assert REQUIRED_UI_EDITOR_TABS_BY_SECTION_TYPE[SectionType.IFrame] == frozenset()
