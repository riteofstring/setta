from setta.agentic.agentic_context import build_agentic_section_summary_source
from setta.agentic.agentic_summary_cache import (
    build_agentic_summary_cache_key,
    get_cached_agentic_summary_from_entries,
    read_agentic_summary_cache,
    resolve_summary_section_ids_for_chat_section,
)
from setta.agentic.agentic_summary_limits import MAX_AGENTIC_SECTION_SUMMARIES_PER_RUN
from setta.database.db_objs import DBE
from setta.types.agentic_observability import AgenticSummaryCacheStatus
from setta.types.helpers_lvl3 import build_project_state_summary_section_index
from setta.types.id import ID
from setta.types.project_state import ProjectStateSingleConfig


def build_agentic_summary_cache_status_for_chat_section(
    dbe: DBE,
    project_state: ProjectStateSingleConfig,
    *,
    project_config_id: ID,
    chat_section_id: ID,
) -> AgenticSummaryCacheStatus:
    if chat_section_id not in project_state.sections:
        raise KeyError(f"Chat section {chat_section_id} not found in project state.")
    summary_section_ids = resolve_summary_section_ids_for_chat_section(
        project_state,
        chat_section_id=chat_section_id,
    )

    if not summary_section_ids:
        return AgenticSummaryCacheStatus(
            maxSummariesPerRun=MAX_AGENTIC_SECTION_SUMMARIES_PER_RUN
        )

    payload = read_agentic_summary_cache(dbe)
    entries = payload.get("entries") if isinstance(payload, dict) else None
    if not isinstance(entries, dict):
        entries = {}

    empty_by_section_id: dict[ID, bool] = {}
    cached_section_ids: list[ID] = []
    missing_section_ids: list[ID] = []
    empty_source_section_ids: list[ID] = []
    summary_by_section = build_project_state_summary_section_index(
        project_state, set(summary_section_ids)
    )

    for section_id in summary_section_ids:
        if section_id not in project_state.projectConfig.sectionVariantMap:
            raise KeyError(f"Section {section_id} missing variant mapping.")
        variant_id = project_state.projectConfig.sectionVariantMap[section_id]
        source = build_agentic_section_summary_source(
            project_state,
            section_id,
            summary_by_section=summary_by_section,
        )
        is_empty_source = not source.raw_text.strip()
        empty_by_section_id[section_id] = is_empty_source
        if is_empty_source:
            empty_source_section_ids.append(section_id)
        cache_key = build_agentic_summary_cache_key(
            project_config_id=project_config_id,
            section_id=section_id,
            variant_id=variant_id,
            content_hash=source.content_hash,
        )
        cached = get_cached_agentic_summary_from_entries(entries, cache_key=cache_key)
        if cached:
            cached_section_ids.append(section_id)
        else:
            missing_section_ids.append(section_id)

    considered_section_ids = missing_section_ids[:MAX_AGENTIC_SECTION_SUMMARIES_PER_RUN]
    would_attempt_section_ids = [
        section_id
        for section_id in considered_section_ids
        if not empty_by_section_id.get(section_id, False)
    ]

    return AgenticSummaryCacheStatus(
        maxSummariesPerRun=MAX_AGENTIC_SECTION_SUMMARIES_PER_RUN,
        summarySectionIds=summary_section_ids,
        cachedSectionIds=cached_section_ids,
        missingSectionIds=missing_section_ids,
        emptySourceSectionIds=empty_source_section_ids,
        consideredSectionIds=considered_section_ids,
        wouldAttemptSectionIds=would_attempt_section_ids,
    )
