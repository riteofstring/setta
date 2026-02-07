import pytest

from setta.agentic.agentic_scope import (
    AgenticScope,
    build_missing_edge_hints,
    check_agentic_scope_for_tool,
    resolve_agentic_scope,
)
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.database.utils import create_new_id
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
from setta.types.agentic_edges import AgenticEdge, AgenticEdgeKind
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_agentic_edge, create_top_level_section
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import CallableSectionImpl, SectionType
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

    def test_build_missing_edge_hints_uses_correct_kind_and_direction(self) -> None:
        (
            project_state,
            chat_id,
            peer_chat_id,
            context_section_id,
            writable_section_id,
        ) = _build_project_state()

        hints_read_section = build_missing_edge_hints(
            chat_section_id=ID(chat_id),
            blocked_section_ids={ID(context_section_id)},
            access_type="read",
            project_state=project_state,
        )
        assert hints_read_section == [
            {
                "sourceSectionId": context_section_id,
                "targetSectionId": chat_id,
                "kind": "section_chat",
            }
        ]

        hints_write_section = build_missing_edge_hints(
            chat_section_id=ID(chat_id),
            blocked_section_ids={ID(writable_section_id)},
            access_type="write",
            project_state=project_state,
        )
        assert hints_write_section == [
            {
                "sourceSectionId": chat_id,
                "targetSectionId": writable_section_id,
                "kind": "chat_section",
            }
        ]

        hints_read_chat = build_missing_edge_hints(
            chat_section_id=ID(chat_id),
            blocked_section_ids={ID(peer_chat_id)},
            access_type="read",
            project_state=project_state,
        )
        assert hints_read_chat == [
            {
                "sourceSectionId": chat_id,
                "targetSectionId": peer_chat_id,
                "kind": "chat_chat",
            }
        ]

        assert (
            build_missing_edge_hints(
                chat_section_id=None,
                blocked_section_ids={ID(context_section_id)},
                access_type="read",
                project_state=project_state,
            )
            == []
        )

    def test_check_agentic_scope_for_tool(self) -> None:
        project_state, chat_id, _, _, writable_section_id = _build_project_state()
        scope = resolve_agentic_scope(project_state, chat_id)

        annotations = SettaToolAnnotations(
            settaToolType=SettaToolType.discoverable,
            accessType="write",
            idPathsByType={"section": ["sectionId"]},
        )
        allowed = check_agentic_scope_for_tool(
            tool_args={"sectionId": writable_section_id},
            annotations=annotations,
            project_state=project_state,
            scope=scope,
        )
        assert allowed.allowed

        blocked = check_agentic_scope_for_tool(
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
            tool_args={"sectionId": chat_id},
            annotations=annotations,
            project_state=project_state,
            scope=scope,
        )
        assert not denied.allowed

    def test_check_agentic_scope_for_tool_maps_code_obj_ids_to_sections(self) -> None:
        section_id = ID("callable-section")
        section_impl_id = ID("callable-section-impl")
        section_variant_id = ID("callable-section-variant")
        code_obj_id = ID("callable-code-obj")
        code_obj_variant_id = ID("callable-code-obj-variant")

        callable_section_impl = CallableSectionImpl(
            id=section_impl_id,
            callable=None,
            codeObjVariantMap={code_obj_id: code_obj_variant_id},
        )
        section_variant = Variant(
            id=section_variant_id,
            impl=callable_section_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(callable_section_impl),
        )
        section_core = Core(
            id=section_id,
            name="Callable Section",
            variants=[section_variant.id],
            defaultVariant=section_variant.id,
        )
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(
                id=ID("project-1"),
                name="code-obj-scope-test",
                sectionVariantMap={section_id: section_variant.id},
            ),
            sections={section_id: section_core},
            sectionImpls={callable_section_impl.id: callable_section_impl},
            sectionVariants={section_variant.id: section_variant},
        )

        annotations = SettaToolAnnotations(
            settaToolType=SettaToolType.discoverable,
            accessType="write",
            idPathsByType={"codeObj": ["codeObjId"]},
        )
        allowed = check_agentic_scope_for_tool(
            tool_args={"codeObjId": str(code_obj_id)},
            annotations=annotations,
            project_state=project_state,
            scope=AgenticScope(
                read_section_ids={section_id},
                write_section_ids={section_id},
                context_section_ids=set(),
                peer_chat_section_ids=set(),
                structural_allowed=False,
            ),
        )
        assert allowed.allowed
        assert allowed.target_section_ids == {section_id}

        denied = check_agentic_scope_for_tool(
            tool_args={"codeObjId": "missing-code-obj"},
            annotations=annotations,
            project_state=project_state,
            scope=AgenticScope(
                read_section_ids={section_id},
                write_section_ids={section_id},
                context_section_ids=set(),
                peer_chat_section_ids=set(),
                structural_allowed=False,
            ),
        )
        assert not denied.allowed
        assert denied.unmapped_code_obj_ids == {ID("missing-code-obj")}

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
            tool_args={},
            annotations=annotations,
            project_state=project_state,
            scope=scope,
        )
        assert not result.allowed
