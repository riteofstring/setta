from types import SimpleNamespace

import pytest

from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.project_manager_types import (
    CreateAgenticEdgeRequest,
    CreateTopLevelSectionRequest,
    DeleteAgenticEdgesRequest,
    SetAgenticEdgesRequest,
    UpdateAgenticEdgeRequest,
)
from setta.routers.project_manager import (
    route_create_agentic_edge,
    route_delete_agentic_edges,
    route_set_agentic_edges,
    route_update_agentic_edge,
)
from setta.types.agentic_edges import AgenticEdge, AgenticEdgeKind
from setta.types.project_config import Position
from setta.types.section_impls import SectionType

from tests.utils.manager_fixture import real_project_manager, real_settings_manager
from tests.utils.runtime_context import runtime_context


@pytest.mark.asyncio
async def test_agentic_edge_routes_crud() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        state = SimpleNamespace(
            share_mode=False,
            wmh_frontend_sender=project_fixture.manager.websocket_msg_handler,
            project_manager_switcher=ProjectManagerSwitcher(
                main_manager=project_fixture.manager,
                settings_manager=settings_fixture.manager,
            ),
        )

        with runtime_context(state) as ctx:
            chat_response = await project_fixture.manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.Chat,
                    position=Position(x=0, y=0),
                ),
            )
            context_response = await project_fixture.manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.Dict,
                    position=Position(x=300, y=0),
                ),
            )

            await route_create_agentic_edge(
                CreateAgenticEdgeRequest(
                    projectConfigId=project_config_id,
                    sourceSectionId=chat_response.sectionId,
                    targetSectionId=context_response.sectionId,
                    kind=AgenticEdgeKind.chat_section,
                ),
                ctx,
            )

            project_state = project_fixture.manager.get_single_config_state(
                project_config_id
            )
            assert len(project_state.projectConfig.agenticEdges) == 1
            edge = project_state.projectConfig.agenticEdges[0]

            updated = edge.model_copy(update={"hidden": True, "zIndex": 4})
            await route_update_agentic_edge(
                UpdateAgenticEdgeRequest(
                    projectConfigId=project_config_id,
                    edge=updated,
                ),
                ctx,
            )

            project_state = project_fixture.manager.get_single_config_state(
                project_config_id
            )
            stored = project_state.projectConfig.agenticEdges[0]
            assert stored.hidden is True
            assert stored.zIndex == 4

            await route_delete_agentic_edges(
                DeleteAgenticEdgesRequest(
                    projectConfigId=project_config_id,
                    edgeIds=[edge.id],
                ),
                ctx,
            )

            project_state = project_fixture.manager.get_single_config_state(
                project_config_id
            )
            assert project_state.projectConfig.agenticEdges == []

            replacement = AgenticEdge(
                sourceSectionId=chat_response.sectionId,
                targetSectionId=context_response.sectionId,
                kind=AgenticEdgeKind.chat_section,
            )
            await route_set_agentic_edges(
                SetAgenticEdgesRequest(
                    projectConfigId=project_config_id,
                    edges=[replacement],
                ),
                ctx,
            )

            project_state = project_fixture.manager.get_single_config_state(
                project_config_id
            )
            assert project_state.projectConfig.agenticEdges == [replacement]
