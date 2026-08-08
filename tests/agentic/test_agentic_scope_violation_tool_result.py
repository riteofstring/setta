from setta.agentic.agentic_scope import (
    AgenticContext,
    AgenticScopeCheck,
    build_scope_blocked_tool_result,
)
from setta.types.id import ID


def test_build_scope_blocked_tool_result_sorts_ids_in_payload_and_message() -> None:
    scope_check = AgenticScopeCheck(
        allowed=False,
        access_type="write",
        target_section_ids={ID("b"), ID("a")},
        blocked_section_ids={ID("b"), ID("a")},
        unmapped_code_obj_ids={ID("d"), ID("c")},
        reason="out_of_scope",
    )
    result = build_scope_blocked_tool_result(
        tool_name="set_section_name",
        scope_check=scope_check,
        agentic_context=AgenticContext(
            project_config_id=ID("project-1"),
            chat_id=ID("chat-1"),
            section_id=ID("section-1"),
        ),
        missing_edges=[
            {
                "sourceSectionId": ID("section-1"),
                "targetSectionId": ID("a"),
                "kind": "chat_section",
            }
        ],
    )
    assert result.isError
    structured = result.structuredContent
    assert isinstance(structured, dict)

    assert structured["blockedSectionIds"] == [ID("a"), ID("b")]
    assert structured["targetSectionIds"] == [ID("a"), ID("b")]
    assert structured["unmappedCodeObjIds"] == [ID("c"), ID("d")]
    message = structured.get("message")
    assert isinstance(message, str)
    assert "blockedSectionIds/targetSectionIds" in message
    assert "blocked=[" not in message


def test_build_scope_blocked_tool_result_missing_context_is_actionable() -> None:
    scope_check = AgenticScopeCheck(
        allowed=False,
        access_type="structural",
        target_section_ids=set(),
        blocked_section_ids=set(),
        unmapped_code_obj_ids=set(),
        reason="missing_context",
    )
    result = build_scope_blocked_tool_result(
        tool_name="get_latest_project_state_summary",
        scope_check=scope_check,
        agentic_context=None,
        missing_edges=[],
    )
    assert result.isError
    structured = result.structuredContent
    assert isinstance(structured, dict)
    message = structured.get("message")
    assert isinstance(message, str)
    assert "missing agentic context" in message
    assert "projectConfigId" in message
    assert "set_agentic_context" in message
