from types import SimpleNamespace

import pytest

from setta.agentic.agentic_context import build_agentic_section_summary_source
from setta.agentic.agentic_summary_cache import (
    build_agentic_summary_cache_key,
    write_cached_agentic_summaries,
)
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.project_manager_types import (
    CreateAgenticEdgeRequest,
    CreateTopLevelSectionRequest,
    SetTextBlockTextRequest,
)
from setta.routers.agentic import (
    GetAgenticSummaryCacheStatusRequest,
    route_get_agentic_summary_cache_status,
)
from setta.types.agentic_edges import (
    AgenticEdgeContextMode,
    AgenticEdgeKind,
)
from setta.types.project_config import Position
from setta.types.section_impls import SectionType

from tests.utils.manager_fixture import real_project_manager, real_settings_manager
from tests.utils.runtime_context import runtime_context


@pytest.mark.asyncio
async def test_route_get_agentic_summary_cache_status() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        chat = await project_fixture.manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Chat,
                position=Position(x=0, y=0),
            )
        )
        source = await project_fixture.manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.TextBlock,
                position=Position(x=300, y=0),
            )
        )
        await project_fixture.manager.set_text_block_text(
            SetTextBlockTextRequest(
                projectConfigId=project_config_id,
                sectionId=source.sectionId,
                text="hello",
            )
        )
        await project_fixture.manager.create_agentic_edge(
            CreateAgenticEdgeRequest(
                projectConfigId=project_config_id,
                sourceSectionId=source.sectionId,
                targetSectionId=chat.sectionId,
                kind=AgenticEdgeKind.section_chat,
                contextMode=AgenticEdgeContextMode.summary,
            )
        )
        await project_fixture.manager.finish_pending_operations()

        switcher = ProjectManagerSwitcher(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
        )
        state = SimpleNamespace(
            share_mode=False,
            deployment_mode=False,
            wmh_frontend_sender=project_fixture.manager.websocket_msg_handler,
            project_manager_switcher=switcher,
            dbe=project_fixture.dbe,
        )
        with runtime_context(state) as ctx:
            status = await route_get_agentic_summary_cache_status(
                GetAgenticSummaryCacheStatusRequest(
                    projectConfigId=project_config_id,
                    chatSectionId=chat.sectionId,
                ),
                ctx,
            )
            assert status.summarySectionIds == [source.sectionId]
            assert status.cachedSectionIds == []
            assert status.missingSectionIds == [source.sectionId]
            assert status.wouldAttemptSectionIds == [source.sectionId]

            project_state = project_fixture.manager.get_single_config_state(
                project_config_id
            )
            summary_source = build_agentic_section_summary_source(
                project_state,
                source.sectionId,
            )
            variant_id = project_state.projectConfig.sectionVariantMap[source.sectionId]
            cache_key = build_agentic_summary_cache_key(
                project_config_id=project_config_id,
                section_id=source.sectionId,
                variant_id=variant_id,
                content_hash=summary_source.content_hash,
            )
            write_cached_agentic_summaries(
                project_fixture.dbe,
                updates={cache_key: {"summary": "- cached", "createdAtMs": 0}},
            )
            cached_status = await route_get_agentic_summary_cache_status(
                GetAgenticSummaryCacheStatusRequest(
                    projectConfigId=project_config_id,
                    chatSectionId=chat.sectionId,
                ),
                ctx,
            )
            assert cached_status.cachedSectionIds == [source.sectionId]
            assert cached_status.missingSectionIds == []
