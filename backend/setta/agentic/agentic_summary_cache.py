import time
from typing import Any

from setta.agentic.agentic_context import build_agentic_section_summary_source
from setta.agentic.agentic_scope import resolve_context_edges
from setta.database.db_objs import DBE
from setta.types.agentic_edges import AgenticEdgeContextMode
from setta.types.helpers_lvl3 import build_project_state_summary
from setta.types.id import ID
from setta.types.project_state import ProjectStateSingleConfig

AGENTIC_SUMMARY_CACHE_VERSION = 1
AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_TOTAL = 5000
AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_PER_PROJECT_CONFIG = 2000


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


def get_cached_agentic_summary(
    dbe: DBE,
    *,
    cache_key: str,
) -> str | None:
    payload = read_agentic_summary_cache(dbe)
    entries = payload.get("entries")
    if not isinstance(entries, dict):
        return None
    return get_cached_agentic_summary_from_entries(entries, cache_key=cache_key)


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
    payload = read_agentic_summary_cache(dbe)
    entries = payload.get("entries")
    if not isinstance(entries, dict):
        entries = {}
    merged = dict(entries)
    merged.update(updates)
    pruned = _prune_agentic_summary_cache_entries(merged)
    dbe.write_json(
        dbe.agentic_summary_cache,
        {"version": AGENTIC_SUMMARY_CACHE_VERSION, "entries": pruned},
    )


def write_cached_agentic_summary(
    dbe: DBE,
    *,
    cache_key: str,
    summary: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    normalized = summary.strip()
    if not normalized:
        return
    entry: dict[str, Any] = {
        "summary": normalized,
        "createdAtMs": int(time.time() * 1000),
    }
    if metadata:
        entry["metadata"] = dict(metadata)
    write_cached_agentic_summaries(dbe, updates={cache_key: entry})


def load_cached_agentic_summary_texts_for_chat_section(
    dbe: DBE,
    *,
    project_state: ProjectStateSingleConfig,
    project_config_id: ID,
    chat_section_id: ID,
) -> dict[ID, str]:
    summaries: dict[ID, str] = {}
    payload = read_agentic_summary_cache(dbe)
    entries = payload.get("entries")
    if not isinstance(entries, dict):
        entries = {}
    context_edges = resolve_context_edges(project_state, chat_section_id)
    if not any(
        context_mode == AgenticEdgeContextMode.summary
        for _, context_mode in context_edges
    ):
        return summaries

    summary = build_project_state_summary(project_state)
    summary_by_section = {entry.sectionId: entry for entry in summary.sections}
    for section_id, context_mode in context_edges:
        if context_mode != AgenticEdgeContextMode.summary:
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
