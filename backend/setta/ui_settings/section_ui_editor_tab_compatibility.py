import json
from pathlib import Path

from setta.types.section_impls import SectionType

_COMPATIBILITY_PATH = Path(__file__).with_name(
    "section_ui_editor_tab_compatibility.json"
)


def _load_required_ui_editor_tabs_by_section_type() -> dict[
    SectionType, frozenset[str]
]:
    raw_payload = json.loads(_COMPATIBILITY_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw_payload, dict):
        raise ValueError("UI editor tab compatibility payload root must be an object.")

    required_tabs_by_section_type: dict[SectionType, frozenset[str]] = {}
    for raw_section_type, raw_required_tabs in raw_payload.items():
        if not isinstance(raw_section_type, str):
            raise ValueError("Section type keys must be strings.")
        try:
            section_type = SectionType(raw_section_type)
        except ValueError as exc:
            raise ValueError(f"Unknown section type key: {raw_section_type}") from exc
        if not isinstance(raw_required_tabs, list):
            raise ValueError(
                f"Required UI editor tabs for {raw_section_type} must be a list."
            )
        required_tabs: set[str] = set()
        for raw_tab_name in raw_required_tabs:
            if not isinstance(raw_tab_name, str) or raw_tab_name.strip() == "":
                raise ValueError(
                    f"Invalid UI editor tab name for {raw_section_type}: {raw_tab_name}"
                )
            required_tabs.add(raw_tab_name)
        required_tabs_by_section_type[section_type] = frozenset(required_tabs)

    missing_section_types = [
        section_type.value
        for section_type in SectionType
        if section_type not in required_tabs_by_section_type
    ]
    if len(missing_section_types) > 0:
        missing = ", ".join(sorted(missing_section_types))
        raise ValueError(
            f"Missing UI editor tab compatibility mapping for section types: {missing}"
        )

    return required_tabs_by_section_type


REQUIRED_UI_EDITOR_TABS_BY_SECTION_TYPE = (
    _load_required_ui_editor_tabs_by_section_type()
)
