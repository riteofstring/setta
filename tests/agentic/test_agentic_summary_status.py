from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.agentic_context import build_agentic_section_summary_source
from setta.agentic.agentic_summary_cache import (
    build_agentic_summary_cache_key,
    write_cached_agentic_summary,
)
from setta.agentic.agentic_summary_status import (
    build_agentic_summary_cache_status_for_chat_section,
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
from setta.types.id import ID
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType


def _build_dbe(tmpdir: str) -> DBE:
    root = Path(tmpdir) / "setta_files"
    root.mkdir(parents=True, exist_ok=True)
    return DBE(root)


def _build_minimal_project() -> tuple[SettingsState, ProjectStateSingleConfig, ID]:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="s"))
    chat_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    return settings, project_state, ID(chat_section_id)


def _add_summary_edge(
    project_state: ProjectStateSingleConfig,
    *,
    source_section_id: ID,
    chat_section_id: ID,
) -> None:
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=source_section_id,
            targetSectionId=chat_section_id,
            kind=AgenticEdgeKind.section_chat,
            contextMode=AgenticEdgeContextMode.summary,
        ),
    )


def test_agentic_summary_cache_status_empty_when_no_summary_edges() -> None:
    settings, project_state, chat_section_id = _build_minimal_project()
    del settings
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        status = build_agentic_summary_cache_status_for_chat_section(
            dbe,
            project_state,
            project_config_id=project_state.projectConfig.id,
            chat_section_id=chat_section_id,
        )
        assert status.summarySectionIds == []
        assert status.cachedSectionIds == []
        assert status.missingSectionIds == []
        assert status.consideredSectionIds == []
        assert status.wouldAttemptSectionIds == []


def test_agentic_summary_cache_status_respects_generation_cap() -> None:
    settings, project_state, chat_section_id = _build_minimal_project()
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        for idx in range(8):
            section_id = create_top_level_section(
                settings,
                project_state,
                SectionType.TextBlock,
                Position(x=idx * 10, y=0),
            )
            set_text_block_text(project_state, section_id, f"hello {idx}")
            _add_summary_edge(
                project_state,
                source_section_id=ID(section_id),
                chat_section_id=chat_section_id,
            )

        status = build_agentic_summary_cache_status_for_chat_section(
            dbe,
            project_state,
            project_config_id=project_state.projectConfig.id,
            chat_section_id=chat_section_id,
        )
        assert len(status.summarySectionIds) == 8
        assert len(status.cachedSectionIds) == 0
        assert len(status.missingSectionIds) == 8
        assert status.consideredSectionIds == status.missingSectionIds[
            : status.maxSummariesPerRun
        ]
        assert len(status.consideredSectionIds) == status.maxSummariesPerRun
        assert len(status.wouldAttemptSectionIds) == status.maxSummariesPerRun


def test_agentic_summary_cache_status_reports_cached_and_empty_sources() -> None:
    settings, project_state, chat_section_id = _build_minimal_project()
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)

        cached_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.TextBlock,
            Position(),
        )
        set_text_block_text(project_state, cached_section_id, "hello cached")
        _add_summary_edge(
            project_state,
            source_section_id=ID(cached_section_id),
            chat_section_id=chat_section_id,
        )

        empty_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.TextBlock,
            Position(),
        )
        set_text_block_text(project_state, empty_section_id, "")
        _add_summary_edge(
            project_state,
            source_section_id=ID(empty_section_id),
            chat_section_id=chat_section_id,
        )

        source = build_agentic_section_summary_source(project_state, ID(cached_section_id))
        variant_id = project_state.projectConfig.sectionVariantMap[ID(cached_section_id)]
        cache_key = build_agentic_summary_cache_key(
            project_config_id=project_state.projectConfig.id,
            section_id=ID(cached_section_id),
            variant_id=variant_id,
            content_hash=source.content_hash,
        )
        write_cached_agentic_summary(
            dbe,
            cache_key=cache_key,
            summary="- cached",
            metadata=None,
        )

        status = build_agentic_summary_cache_status_for_chat_section(
            dbe,
            project_state,
            project_config_id=project_state.projectConfig.id,
            chat_section_id=chat_section_id,
        )
        assert ID(cached_section_id) in status.cachedSectionIds
        assert ID(empty_section_id) in status.emptySourceSectionIds
        assert ID(empty_section_id) in status.missingSectionIds
        assert ID(empty_section_id) not in status.wouldAttemptSectionIds
