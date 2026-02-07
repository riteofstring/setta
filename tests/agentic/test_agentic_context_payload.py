from setta.agentic.agentic_context import build_agentic_context_payload
from setta.database.utils import create_new_id
from setta.types.agentic_edges import (
    AgenticEdge,
    AgenticEdgeContextMode,
    AgenticEdgeKind,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    create_agentic_edge,
    create_top_level_section,
    set_text_block_text,
)
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


def test_build_agentic_context_payload_includes_inline_text_with_truncation() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="agentic-context-inline-test")
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
    long_text = "\n".join(f"line {idx}" for idx in range(200))
    set_text_block_text(project_state, context_section_id, long_text)
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=context_section_id,
            targetSectionId=chat_section_id,
            kind=AgenticEdgeKind.section_chat,
            contextMode=AgenticEdgeContextMode.inline_text,
        ),
    )

    payload = build_agentic_context_payload(project_state, chat_section_id)

    assert payload.section_ids == [ID(context_section_id)]
    assert "## Agentic Context" in payload.text
    assert f"[id: {context_section_id} | inline]" in payload.text
    assert "... (40 more lines)" in payload.text


def test_build_agentic_context_payload_summary_mode_uses_tighter_truncation() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="agentic-context-summary-test")
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
    long_text = "\n".join(f"line {idx}" for idx in range(200))
    set_text_block_text(project_state, context_section_id, long_text)
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=context_section_id,
            targetSectionId=chat_section_id,
            kind=AgenticEdgeKind.section_chat,
            contextMode=AgenticEdgeContextMode.summary,
        ),
    )

    payload = build_agentic_context_payload(project_state, chat_section_id)

    assert payload.section_ids == [ID(context_section_id)]
    assert f"[id: {context_section_id} | summary]" in payload.text
    assert "... (168 more lines)" in payload.text


def test_build_agentic_context_payload_reference_only_omits_section_body() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="agentic-context-reference-only-test")
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
    set_text_block_text(project_state, context_section_id, "hello")
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

    payload = build_agentic_context_payload(project_state, chat_section_id)

    assert payload.section_ids == [ID(context_section_id)]
    assert f"[id: {context_section_id}]" in payload.text
    assert "### " not in payload.text
