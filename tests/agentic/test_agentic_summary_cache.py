from pathlib import Path
from tempfile import TemporaryDirectory

import setta.agentic.agentic_summary_cache as summary_cache
from setta.agentic.agentic_context import build_agentic_section_summary_source
from setta.agentic.agentic_summary_cache import (
    build_agentic_summary_cache_key,
    get_cached_agentic_summary,
    load_cached_agentic_summary_texts_for_chat_section,
    read_agentic_summary_cache,
    write_cached_agentic_summaries,
    write_cached_agentic_summary,
)
from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.types.agentic_edges import (
    AgenticEdge,
    AgenticEdgeContextMode,
    AgenticEdgeKind,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    create_agentic_edge,
    create_top_level_section,
    set_text_block_text,
)
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType


def _build_dbe(tmpdir: str) -> DBE:
    root = Path(tmpdir) / "setta_files"
    root.mkdir(parents=True, exist_ok=True)
    return DBE(root)


def test_agentic_summary_cache_read_write_roundtrip() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        payload = read_agentic_summary_cache(dbe)
        assert payload["version"] == 1
        assert payload["entries"] == {}

        cache_key = build_agentic_summary_cache_key(
            project_config_id="project-1",
            section_id="section-1",
            variant_id="variant-1",
            content_hash="hash-1",
        )
        write_cached_agentic_summary(
            dbe,
            cache_key=cache_key,
            summary="  - hello  ",
            metadata={"x": 1},
        )
        assert get_cached_agentic_summary(dbe, cache_key=cache_key) == "- hello"

        # Blank summaries are ignored.
        write_cached_agentic_summary(dbe, cache_key=cache_key, summary="   ")
        assert get_cached_agentic_summary(dbe, cache_key=cache_key) == "- hello"


def test_load_cached_agentic_summary_texts_for_chat_section_returns_summary_entries() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="agentic-summary-cache-test")
        )
        chat_section_id = create_top_level_section(
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
        set_text_block_text(project_state, context_section_id, "hello world")
        create_agentic_edge(
            project_state,
            AgenticEdge(
                id=create_new_id(),
                sourceSectionId=context_section_id,
                targetSectionId=chat_section_id,
                kind=AgenticEdgeKind.section_chat,
                contextMode=AgenticEdgeContextMode.summary,
            ),
        )

        variant_id = project_state.projectConfig.sectionVariantMap[context_section_id]
        source = build_agentic_section_summary_source(project_state, context_section_id)
        cache_key = build_agentic_summary_cache_key(
            project_config_id=project_state.projectConfig.id,
            section_id=context_section_id,
            variant_id=variant_id,
            content_hash=source.content_hash,
        )
        write_cached_agentic_summary(dbe, cache_key=cache_key, summary="- cached")

        summaries = load_cached_agentic_summary_texts_for_chat_section(
            dbe,
            project_state=project_state,
            project_config_id=project_state.projectConfig.id,
            chat_section_id=chat_section_id,
        )
        assert summaries == {context_section_id: "- cached"}


def test_write_cached_agentic_summaries_prunes_by_project_config_limit() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        original_total = summary_cache.AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_TOTAL
        original_per_project = (
            summary_cache.AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_PER_PROJECT_CONFIG
        )
        try:
            summary_cache.AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_TOTAL = 10
            summary_cache.AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_PER_PROJECT_CONFIG = 3

            updates: dict[str, dict[str, object]] = {}
            for idx in range(5):
                cache_key = build_agentic_summary_cache_key(
                    project_config_id="project-1",
                    section_id=f"section-{idx}",
                    variant_id="variant-1",
                    content_hash=f"hash-{idx}",
                )
                updates[cache_key] = {"summary": f"- summary {idx}", "createdAtMs": idx}
            write_cached_agentic_summaries(dbe, updates=updates)

            payload = read_agentic_summary_cache(dbe)
            entries = payload["entries"]
            assert isinstance(entries, dict)
            assert len(entries) == 3
            expected = {
                build_agentic_summary_cache_key(
                    project_config_id="project-1",
                    section_id="section-2",
                    variant_id="variant-1",
                    content_hash="hash-2",
                ),
                build_agentic_summary_cache_key(
                    project_config_id="project-1",
                    section_id="section-3",
                    variant_id="variant-1",
                    content_hash="hash-3",
                ),
                build_agentic_summary_cache_key(
                    project_config_id="project-1",
                    section_id="section-4",
                    variant_id="variant-1",
                    content_hash="hash-4",
                ),
            }
            assert set(entries.keys()) == expected
        finally:
            summary_cache.AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_TOTAL = original_total
            summary_cache.AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_PER_PROJECT_CONFIG = (
                original_per_project
            )


def test_write_cached_agentic_summaries_prunes_by_total_limit() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        original_total = summary_cache.AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_TOTAL
        original_per_project = (
            summary_cache.AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_PER_PROJECT_CONFIG
        )
        try:
            summary_cache.AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_TOTAL = 4
            summary_cache.AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_PER_PROJECT_CONFIG = 10

            updates: dict[str, dict[str, object]] = {}
            timestamp = 100
            for project_idx in range(2):
                for section_idx in range(3):
                    cache_key = build_agentic_summary_cache_key(
                        project_config_id=f"project-{project_idx}",
                        section_id=f"section-{section_idx}",
                        variant_id="variant-1",
                        content_hash=f"hash-{project_idx}-{section_idx}",
                    )
                    updates[cache_key] = {
                        "summary": f"- {project_idx}:{section_idx}",
                        "createdAtMs": timestamp,
                    }
                    timestamp += 1
            write_cached_agentic_summaries(dbe, updates=updates)

            payload = read_agentic_summary_cache(dbe)
            entries = payload["entries"]
            assert isinstance(entries, dict)
            assert len(entries) == 4
            expected = {
                build_agentic_summary_cache_key(
                    project_config_id="project-0",
                    section_id="section-2",
                    variant_id="variant-1",
                    content_hash="hash-0-2",
                ),
                build_agentic_summary_cache_key(
                    project_config_id="project-1",
                    section_id="section-0",
                    variant_id="variant-1",
                    content_hash="hash-1-0",
                ),
                build_agentic_summary_cache_key(
                    project_config_id="project-1",
                    section_id="section-1",
                    variant_id="variant-1",
                    content_hash="hash-1-1",
                ),
                build_agentic_summary_cache_key(
                    project_config_id="project-1",
                    section_id="section-2",
                    variant_id="variant-1",
                    content_hash="hash-1-2",
                ),
            }
            assert set(entries.keys()) == expected
        finally:
            summary_cache.AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_TOTAL = original_total
            summary_cache.AGENTIC_SUMMARY_CACHE_MAX_ENTRIES_PER_PROJECT_CONFIG = (
                original_per_project
            )
