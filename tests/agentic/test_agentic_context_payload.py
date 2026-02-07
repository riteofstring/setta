from setta.agentic.agentic_context import build_agentic_context_payload
from setta.database.utils import create_new_id
from setta.types.agentic_edges import (
    AgenticEdge,
    AgenticEdgeContextMode,
    AgenticEdgeKind,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_agentic_edge, create_top_level_section
from setta.types.id import ID
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType


def test_build_agentic_context_payload_uses_formatter_for_ids() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="agentic-context-payload-test")
    )
    chat_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    context_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.TextBlock,
        Position(),
    )
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=context_section_id,
            targetSectionId=chat_section_id,
            kind=AgenticEdgeKind.section_chat,
            contextMode=AgenticEdgeContextMode.reference_only,
        ),
    )

    payload = build_agentic_context_payload(
        project_state,
        chat_section_id,
        format_section_id=lambda _section_id: "TEMP-ID",
    )

    assert "TEMP-ID" in payload.text
    assert str(context_section_id) not in payload.text
    assert payload.section_ids == [ID(context_section_id)]

