import time
from typing import Any

from setta.agentic.agentic_context import build_agentic_section_summary_source
from setta.agentic.agentic_scope import resolve_context_edges
from setta.database.db_objs import DBE
from setta.types.agentic_edges import AgenticEdgeContextMode
from setta.types.id import ID
from setta.types.project_state import ProjectStateSingleConfig

AGENTIC_SUMMARY_CACHE_VERSION = 1


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


def get_cached_agentic_summary(
    dbe: DBE,
    *,
    cache_key: str,
) -> str | None:
    payload = read_agentic_summary_cache(dbe)
    entries = payload.get("entries")
    if not isinstance(entries, dict):
        return None
    entry = entries.get(cache_key)
    if not isinstance(entry, dict):
        return None
    summary = entry.get("summary")
    if isinstance(summary, str) and summary.strip():
        return summary.strip()
    return None


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
    payload = read_agentic_summary_cache(dbe)
    entries = payload.get("entries")
    if not isinstance(entries, dict):
        entries = {}
    entry: dict[str, Any] = {
        "summary": normalized,
        "createdAtMs": int(time.time() * 1000),
    }
    if metadata:
        entry["metadata"] = dict(metadata)
    entries = dict(entries)
    entries[cache_key] = entry
    dbe.write_json(
        dbe.agentic_summary_cache,
        {"version": AGENTIC_SUMMARY_CACHE_VERSION, "entries": entries},
    )


def load_cached_agentic_summary_texts_for_chat_section(
    dbe: DBE,
    *,
    project_state: ProjectStateSingleConfig,
    project_config_id: ID,
    chat_section_id: ID,
) -> dict[ID, str]:
    summaries: dict[ID, str] = {}
    context_edges = resolve_context_edges(project_state, chat_section_id)
    for section_id, context_mode in context_edges:
        if context_mode != AgenticEdgeContextMode.summary:
            continue
        if section_id not in project_state.projectConfig.sectionVariantMap:
            raise KeyError(f"Section {section_id} missing variant mapping.")
        variant_id = project_state.projectConfig.sectionVariantMap[section_id]
        source = build_agentic_section_summary_source(project_state, section_id)
        cache_key = build_agentic_summary_cache_key(
            project_config_id=project_config_id,
            section_id=section_id,
            variant_id=variant_id,
            content_hash=source.content_hash,
        )
        cached = get_cached_agentic_summary(dbe, cache_key=cache_key)
        if cached:
            summaries[section_id] = cached
    return summaries
