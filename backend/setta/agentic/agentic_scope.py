from dataclasses import dataclass, field

from setta.types.agentic_edges import AgenticEdgeKind
from setta.types.id import ID
from setta.types.project_state import ProjectStateSingleConfig


@dataclass(frozen=True)
class AgenticScope:
    read_section_ids: set[ID] = field(default_factory=set)
    write_section_ids: set[ID] = field(default_factory=set)
    context_section_ids: set[ID] = field(default_factory=set)
    peer_chat_section_ids: set[ID] = field(default_factory=set)
    structural_allowed: bool = False


def resolve_agentic_scope(
    project_state: ProjectStateSingleConfig,
    chat_section_id: ID | None,
    *,
    allow_unscoped: bool = False,
) -> AgenticScope:
    if chat_section_id is None:
        if not allow_unscoped:
            return AgenticScope()
        all_section_ids = set(project_state.sections.keys())
        return AgenticScope(
            read_section_ids=set(all_section_ids),
            write_section_ids=set(all_section_ids),
            context_section_ids=set(all_section_ids),
            peer_chat_section_ids=set(),
            structural_allowed=True,
        )
    if chat_section_id not in project_state.sections:
        raise KeyError(f"Chat section {chat_section_id} not found in project state.")

    read_section_ids: set[ID] = set()
    write_section_ids: set[ID] = set()
    context_section_ids: set[ID] = set()
    peer_chat_section_ids: set[ID] = set()

    for edge in project_state.projectConfig.agenticEdges:
        if edge.sourceSectionId != chat_section_id:
            continue
        if edge.kind == AgenticEdgeKind.chat_section:
            read_section_ids.add(edge.targetSectionId)
            write_section_ids.add(edge.targetSectionId)
            context_section_ids.add(edge.targetSectionId)
            continue
        if edge.kind == AgenticEdgeKind.chat_chat:
            peer_chat_section_ids.add(edge.targetSectionId)

    return AgenticScope(
        read_section_ids=read_section_ids,
        write_section_ids=write_section_ids,
        context_section_ids=context_section_ids,
        peer_chat_section_ids=peer_chat_section_ids,
        structural_allowed=False,
    )
