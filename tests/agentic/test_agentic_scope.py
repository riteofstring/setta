import pytest

from setta.agentic.agentic_scope import (
    check_agentic_scope_for_tool,
    resolve_agentic_scope,
)
from setta.database.utils import create_new_id
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
from setta.types.agentic_edges import AgenticEdge, AgenticEdgeKind
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_agentic_edge, create_top_level_section
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from setta.types.id import ID


def _build_project_state() -> tuple[ProjectStateSingleConfig, str, str, str, str]:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="agentic-scope-test")
    )
    chat_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    peer_chat_id = create_top_level_section(
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
    writable_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Dict,
        Position(),
    )
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=context_section_id,
            targetSectionId=chat_id,
            kind=AgenticEdgeKind.section_chat,
        ),
    )
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=chat_id,
            targetSectionId=writable_section_id,
            kind=AgenticEdgeKind.chat_section,
        ),
    )
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=chat_id,
            targetSectionId=peer_chat_id,
            kind=AgenticEdgeKind.chat_chat,
        ),
    )
    return (
        project_state,
        chat_id,
        peer_chat_id,
        context_section_id,
        writable_section_id,
    )


class TestAgenticScope:
    def test_resolve_agentic_scope(self) -> None:
        (
            project_state,
            chat_id,
            peer_chat_id,
            context_section_id,
            writable_section_id,
        ) = _build_project_state()

        scope = resolve_agentic_scope(project_state, chat_id)

        assert context_section_id in scope.read_section_ids
        assert writable_section_id in scope.read_section_ids
        assert writable_section_id in scope.write_section_ids
        assert context_section_id in scope.context_section_ids
        assert peer_chat_id in scope.peer_chat_section_ids
        assert not scope.structural_allowed

        project_scope = resolve_agentic_scope(project_state, None)
        assert project_scope.structural_allowed
        assert context_section_id in project_scope.read_section_ids
        assert writable_section_id in project_scope.write_section_ids

    def test_check_agentic_scope_for_tool(self) -> None:
        project_state, chat_id, _, _, writable_section_id = _build_project_state()
        scope = resolve_agentic_scope(project_state, chat_id)

        annotations = SettaToolAnnotations(
            settaToolType=SettaToolType.discoverable,
            accessType="write",
            idPathsByType={"section": ["sectionId"]},
        )
        allowed = check_agentic_scope_for_tool(
            tool_name="setta__set_code",
            tool_args={"sectionId": writable_section_id},
            annotations=annotations,
            project_state=project_state,
            scope=scope,
        )
        assert allowed.allowed

        blocked = check_agentic_scope_for_tool(
            tool_name="setta__set_code",
            tool_args={"sectionId": "temp-section"},
            annotations=annotations,
            project_state=project_state,
            scope=scope,
            temporary_to_canonical={
                ID("temp-section"): writable_section_id,
            },
        )
        assert blocked.allowed

        denied = check_agentic_scope_for_tool(
            tool_name="setta__set_code",
            tool_args={"sectionId": chat_id},
            annotations=annotations,
            project_state=project_state,
            scope=scope,
        )
        assert not denied.allowed

    def test_empty_scope_blocks_reads(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="empty-scope-test")
        )
        chat_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Chat,
            Position(),
        )
        scope = resolve_agentic_scope(project_state, chat_id)
        annotations = SettaToolAnnotations(
            settaToolType=SettaToolType.discoverable,
            accessType="read",
            idPathsByType={},
        )
        result = check_agentic_scope_for_tool(
            tool_name="setta__get_latest_project_state_summary",
            tool_args={},
            annotations=annotations,
            project_state=project_state,
            scope=scope,
        )
        assert not result.allowed
