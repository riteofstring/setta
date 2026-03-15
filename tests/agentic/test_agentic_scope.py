from setta.agentic.agentic_scope import resolve_agentic_scope
from setta.database.utils import create_new_id
from setta.types.agentic_edges import AgenticEdge, AgenticEdgeKind
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    create_agentic_edge,
    create_top_level_section,
    delete_agentic_edges,
    update_agentic_edge,
)
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

        assert context_section_id not in scope.read_section_ids
        assert writable_section_id in scope.read_section_ids
        assert writable_section_id in scope.write_section_ids
        assert context_section_id not in scope.context_section_ids
        assert writable_section_id in scope.context_section_ids
        assert peer_chat_id in scope.peer_chat_section_ids
        assert not scope.structural_allowed

        project_scope = resolve_agentic_scope(project_state, None, allow_unscoped=True)
        assert project_scope.structural_allowed
        assert context_section_id in project_scope.read_section_ids
        assert writable_section_id in project_scope.write_section_ids
        assert project_scope.peer_chat_section_ids == set()

        denied_project_scope = resolve_agentic_scope(project_state, None)
        assert not denied_project_scope.structural_allowed
        assert denied_project_scope.read_section_ids == set()
        assert denied_project_scope.write_section_ids == set()

    def test_incoming_only_edges_do_not_grant_scope(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="incoming-only-scope-test")
        )
        chat_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Chat,
            Position(),
        )
        incoming_chat_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Chat,
            Position(),
        )
        incoming_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.TextBlock,
            Position(),
        )
        create_agentic_edge(
            project_state,
            AgenticEdge(
                id=create_new_id(),
                sourceSectionId=incoming_section_id,
                targetSectionId=chat_id,
                kind=AgenticEdgeKind.section_chat,
            ),
        )
        create_agentic_edge(
            project_state,
            AgenticEdge(
                id=create_new_id(),
                sourceSectionId=incoming_chat_id,
                targetSectionId=chat_id,
                kind=AgenticEdgeKind.chat_chat,
            ),
        )

        scope = resolve_agentic_scope(project_state, chat_id)
        assert scope.read_section_ids == set()
        assert scope.write_section_ids == set()
        assert scope.context_section_ids == set()
        assert scope.peer_chat_section_ids == set()

    def test_scope_recomputes_after_edge_edits(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="live-scope-recompute-test")
        )
        chat_id = ID(
            create_top_level_section(
                settings,
                project_state,
                SectionType.Chat,
                Position(),
            )
        )
        first_target = ID(
            create_top_level_section(
                settings,
                project_state,
                SectionType.TextBlock,
                Position(),
            )
        )
        second_target = ID(
            create_top_level_section(
                settings,
                project_state,
                SectionType.Dict,
                Position(),
            )
        )
        peer_chat_id = ID(
            create_top_level_section(
                settings,
                project_state,
                SectionType.Chat,
                Position(),
            )
        )
        scoped_edge = AgenticEdge(
            id=create_new_id(),
            sourceSectionId=chat_id,
            targetSectionId=first_target,
            kind=AgenticEdgeKind.chat_section,
        )
        create_agentic_edge(project_state, scoped_edge)

        initial_scope = resolve_agentic_scope(project_state, chat_id)
        assert initial_scope.read_section_ids == {first_target}
        assert initial_scope.write_section_ids == {first_target}
        assert initial_scope.context_section_ids == {first_target}
        assert initial_scope.peer_chat_section_ids == set()

        update_agentic_edge(
            project_state,
            AgenticEdge(
                id=scoped_edge.id,
                sourceSectionId=chat_id,
                targetSectionId=second_target,
                kind=AgenticEdgeKind.chat_section,
            ),
        )
        updated_scope = resolve_agentic_scope(project_state, chat_id)
        assert updated_scope.read_section_ids == {second_target}
        assert updated_scope.write_section_ids == {second_target}
        assert updated_scope.context_section_ids == {second_target}

        peer_edge = AgenticEdge(
            id=create_new_id(),
            sourceSectionId=chat_id,
            targetSectionId=peer_chat_id,
            kind=AgenticEdgeKind.chat_chat,
        )
        create_agentic_edge(project_state, peer_edge)
        peer_scope = resolve_agentic_scope(project_state, chat_id)
        assert peer_scope.peer_chat_section_ids == {peer_chat_id}

        delete_agentic_edges(project_state, [scoped_edge.id, peer_edge.id])
        cleared_scope = resolve_agentic_scope(project_state, chat_id)
        assert cleared_scope.read_section_ids == set()
        assert cleared_scope.write_section_ids == set()
        assert cleared_scope.context_section_ids == set()
        assert cleared_scope.peer_chat_section_ids == set()
