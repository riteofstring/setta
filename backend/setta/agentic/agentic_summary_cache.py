from typing import Any

from setta.agentic.agentic_context import build_agentic_section_summary_source
from setta.agentic.agentic_scope import resolve_context_edges
from setta.database.db_objs import DBE
from setta.types.agentic_edges import AgenticEdgeContextMode
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.helpers_lvl3 import build_project_state_summary_section_index
from setta.types.id import ID
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    BaseCodeSectionImpl,
    BrowserSectionImpl,
    CallableSectionImpl,
    ChartSectionImpl,
    DrawSectionImpl,
    ImageSectionImpl,
    PromptSectionImpl,
    SocialSectionImpl,
    TextBlockSectionImpl,
)

AGENTIC_SUMMARY_CACHE_VERSION = 1
AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_TOTAL = 5000
AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_PER_PROJECT_CONFIG = 2000


def resolve_summary_section_ids_for_chat_section(
    project_state: ProjectStateSingleConfig,
    *,
    chat_section_id: ID,
) -> list[ID]:
    context_edges = resolve_context_edges(project_state, chat_section_id)
    summary_section_ids: list[ID] = []
    seen: set[ID] = set()
    for section_id, context_mode in context_edges:
        if context_mode != AgenticEdgeContextMode.summary:
            continue
        if section_id not in project_state.sections:
            continue
        if section_id in seen:
            continue
        seen.add(section_id)
        summary_section_ids.append(section_id)
    return summary_section_ids


def _resolve_summary_section_ids_needing_project_state_summary(
    project_state: ProjectStateSingleConfig,
    *,
    section_ids: list[ID],
) -> set[ID]:
    needed: set[ID] = set()
    for section_id in section_ids:
        if section_id not in project_state.sections:
            continue
        if section_id not in project_state.projectConfig.sectionVariantMap:
            raise KeyError(f"Section {section_id} missing variant mapping.")
        section_impl = get_curr_effective_section_impl(project_state, section_id)
        if isinstance(section_impl, (CallableSectionImpl, DrawSectionImpl)):
            needed.add(section_id)
            continue
        if not isinstance(
            section_impl,
            (
                TextBlockSectionImpl,
                ImageSectionImpl,
                BaseCodeSectionImpl,
                ChartSectionImpl,
                PromptSectionImpl,
                SocialSectionImpl,
                BrowserSectionImpl,
            ),
        ):
            needed.add(section_id)
    return needed


def _load_cached_agentic_summary_texts_for_section_ids(
    *,
    entries: dict[str, Any],
    project_state: ProjectStateSingleConfig,
    project_config_id: ID,
    section_ids: list[ID],
    summary_by_section: dict[ID, object],
) -> dict[ID, str]:
    summaries: dict[ID, str] = {}
    for section_id in section_ids:
        if section_id not in project_state.sections:
            continue
        if section_id not in project_state.projectConfig.sectionVariantMap:
            raise KeyError(f"Section {section_id} missing variant mapping.")
        variant_id = project_state.projectConfig.sectionVariantMap[section_id]
        source = build_agentic_section_summary_source(
            project_state,
            section_id,
            summary_by_section=summary_by_section,
        )
        cache_key = build_agentic_summary_cache_key(
            project_config_id=project_config_id,
            section_id=section_id,
            variant_id=variant_id,
            content_hash=source.content_hash,
        )
        cached = get_cached_agentic_summary_from_entries(entries, cache_key=cache_key)
        if cached:
            summaries[section_id] = cached
    return summaries


def build_agentic_summary_cache_key(
    *,
    project_config_id: ID,
    section_id: ID,
    variant_id: ID,
    content_hash: str,
) -> str:
    return f"{project_config_id}:{section_id}:{variant_id}:{content_hash}"


def read_agentic_summary_cache(dbe: DBE) -> dict[str, Any]:
    payload = dbe.read_json(dbe.agentic_summary_cache)
    return _normalize_agentic_summary_cache_payload(payload)


def _normalize_agentic_summary_cache_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {"version": AGENTIC_SUMMARY_CACHE_VERSION, "entries": {}}
    version = payload.get("version")
    entries = payload.get("entries")
    if version != AGENTIC_SUMMARY_CACHE_VERSION or not isinstance(entries, dict):
        return {"version": AGENTIC_SUMMARY_CACHE_VERSION, "entries": {}}
    return {"version": AGENTIC_SUMMARY_CACHE_VERSION, "entries": dict(entries)}


def get_cached_agentic_summary_from_entries(
    entries: dict[str, Any],
    *,
    cache_key: str,
) -> str | None:
    entry = entries.get(cache_key)
    if not isinstance(entry, dict):
        return None
    summary = entry.get("summary")
    if isinstance(summary, str) and summary.strip():
        return summary.strip()
    return None


def _agentic_summary_entry_timestamp_ms(entry: Any) -> int:
    if not isinstance(entry, dict):
        return 0
    raw = entry.get("createdAtMs")
    if isinstance(raw, int):
        return raw
    if isinstance(raw, float):
        return int(raw)
    return 0


def _agentic_summary_cache_project_id(cache_key: str) -> str | None:
    head, sep, _ = cache_key.partition(":")
    if not sep:
        return None
    return head or None


def _prune_agentic_summary_cache_entries(entries: dict[str, Any]) -> dict[str, Any]:
    if not entries:
        return {}
    pruned = dict(entries)

    by_project: dict[str, list[tuple[str, int]]] = {}
    for cache_key, entry in pruned.items():
        project_id = _agentic_summary_cache_project_id(cache_key)
        if project_id is None:
            continue
        by_project.setdefault(project_id, []).append(
            (cache_key, _agentic_summary_entry_timestamp_ms(entry))
        )
    for cache_key_entries in by_project.values():
        if (
            len(cache_key_entries)
            <= AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_PER_PROJECT_CONFIG
        ):
            continue
        cache_key_entries.sort(key=lambda item: item[1], reverse=True)
        for cache_key, _ in cache_key_entries[
            AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_PER_PROJECT_CONFIG:
        ]:
            pruned.pop(cache_key, None)

    if len(pruned) > AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_TOTAL:
        ranked = [
            (cache_key, _agentic_summary_entry_timestamp_ms(entry))
            for cache_key, entry in pruned.items()
        ]
        ranked.sort(key=lambda item: item[1], reverse=True)
        keep = {
            cache_key
            for cache_key, _ in ranked[:AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_TOTAL]
        }
        pruned = {cache_key: pruned[cache_key] for cache_key in keep}

    return pruned


def write_cached_agentic_summaries(
    dbe: DBE,
    *,
    updates: dict[str, dict[str, Any]],
) -> None:
    if not updates:
        return

    def _update(payload: Any) -> dict[str, Any]:
        normalized = _normalize_agentic_summary_cache_payload(payload)
        entries = normalized.get("entries")
        if not isinstance(entries, dict):
            entries = {}
        merged = dict(entries)
        merged.update(updates)
        pruned = _prune_agentic_summary_cache_entries(merged)
        return {"version": AGENTIC_SUMMARY_CACHE_VERSION, "entries": pruned}

    dbe.update_json(dbe.agentic_summary_cache, _update)


def resolve_cached_agentic_summaries_for_chat_section(
    dbe: DBE,
    *,
    project_state: ProjectStateSingleConfig,
    project_config_id: ID,
    chat_section_id: ID,
) -> tuple[dict[ID, str], dict[ID, object] | None, list[ID]]:
    """Return cached summaries and missing section ids for a chat section.

    This helper is shared between managed LLM runs and external-agent runs to
    keep cache-key computation (and project summary derivation) consistent.
    """
    summary_section_ids = resolve_summary_section_ids_for_chat_section(
        project_state,
        chat_section_id=chat_section_id,
    )
    if not summary_section_ids:
        return {}, None, []

    payload = read_agentic_summary_cache(dbe)
    entries = payload.get("entries")
    if not isinstance(entries, dict):
        entries = {}
    needed_section_ids = _resolve_summary_section_ids_needing_project_state_summary(
        project_state,
        section_ids=summary_section_ids,
    )
    summary_by_section = build_project_state_summary_section_index(
        project_state, needed_section_ids
    )
    cached = _load_cached_agentic_summary_texts_for_section_ids(
        entries=entries,
        project_state=project_state,
        project_config_id=project_config_id,
        section_ids=summary_section_ids,
        summary_by_section=summary_by_section,
    )
    missing_section_ids: list[ID] = []
    for section_id in summary_section_ids:
        if section_id not in cached:
            missing_section_ids.append(section_id)
    return cached, summary_by_section, missing_section_ids
