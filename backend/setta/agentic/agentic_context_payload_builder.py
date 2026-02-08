from setta.agentic.agentic_context import (
    AgenticContextPayload,
    build_agentic_context_payload,
)
from setta.database.db_objs import DBE
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.types.id import ID
from setta.types.project_state import ProjectStateSingleConfig


def build_agentic_context_payload_with_temporary_ids(
    dbe: DBE,
    project_state: ProjectStateSingleConfig,
    chat_section_id: ID,
    *,
    canonical_to_temporary: dict[ID, ID],
    temporary_to_canonical: dict[ID, ID],
    summary_text_by_section_id: dict[ID, str] | None = None,
    summary_by_section: dict[ID, object] | None = None,
    persist_temp_id_map: bool = True,
) -> AgenticContextPayload:
    """Build context payload and update the temporary-id map if new IDs were introduced."""

    map_size_before = len(canonical_to_temporary)

    def _format_section_id(entry: ID) -> str:
        return str(
            convert_canonical_ids_to_temporary(
                entry,
                canonical_to_temporary,
                temporary_to_canonical,
            )
        )

    payload = build_agentic_context_payload(
        project_state,
        chat_section_id,
        format_section_id=_format_section_id,
        summary_text_by_section_id=summary_text_by_section_id,
        summary_by_section=summary_by_section,
    )
    if persist_temp_id_map and len(canonical_to_temporary) != map_size_before:
        dbe.write_temporary_id_map(canonical_to_temporary)
    return payload
