from types import SimpleNamespace

from fastapi import HTTPException
import pytest

from setta.agentic.store import save_engine_configs
from setta.llm.config import save_llm_config
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.project_manager_types import (
    CreateAgenticEdgeRequest,
    CreateTopLevelSectionRequest,
    DeleteAgenticEdgesRequest,
    SetChatSectionSettingsRequest,
    SetAgenticEdgesRequest,
    UpdateAgenticEdgeRequest,
)
from setta.routers.project_manager import (
    route_create_agentic_edge,
    route_delete_agentic_edges,
    route_set_agentic_edges,
    route_update_agentic_edge,
)
from setta.types.agentic import EngineConfig, EngineType
from setta.types.agentic_edges import AgenticEdge, AgenticEdgeKind
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.types.project_config import Position
from setta.types.section_impls import (
    ChatDictationMode,
    ChatPermissionMode,
    SectionType,
)

from tests.utils.manager_fixture import real_project_manager, real_settings_manager
from tests.utils.runtime_context import runtime_context


def _seed_linked_chat_runtime(dbe) -> None:
    save_llm_config(
        AllLLMConfigs(
            configs={
                "primary": LLMConfig(
                    id="primary",
                    model="gpt-4o-mini",
                    provider="openai",
                    api_key_env="OPENAI_API_KEY",
                    mcpServerIds=[],
                )
            },
            mcpServers={},
            default_config_id="primary",
        ),
        dbe,
    )
    save_engine_configs(
        dbe,
        [
            EngineConfig(
                id="engine-linked",
                name="Linked engine",
                engineType=EngineType.setta_llm,
                settaLlmConfigId="primary",
            )
        ],
    )


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
            deployment_mode=False,
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


@pytest.mark.asyncio
async def test_agentic_edge_routes_reject_workflow_nodes() -> None:
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
            deployment_mode=False,
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
            gate_response = await project_fixture.manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.StateMachineGate,
                    position=Position(x=300, y=0),
                ),
            )

            with pytest.raises(HTTPException) as exc_info:
                await route_create_agentic_edge(
                    CreateAgenticEdgeRequest(
                        projectConfigId=project_config_id,
                        sourceSectionId=chat_response.sectionId,
                        targetSectionId=gate_response.sectionId,
                        kind=AgenticEdgeKind.chat_section,
                    ),
                    ctx,
                )

        assert exc_info.value.status_code == 400
        assert "state machine nodes" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_agentic_edge_routes_accept_real_manager_linked_chat_targets() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        _seed_linked_chat_runtime(project_fixture.dbe)
        await project_fixture.manager.finish_pending_operations()

        state = SimpleNamespace(
            share_mode=False,
            deployment_mode=False,
            wmh_frontend_sender=project_fixture.manager.websocket_msg_handler,
            project_manager_switcher=ProjectManagerSwitcher(
                main_manager=project_fixture.manager,
                settings_manager=settings_fixture.manager,
            ),
        )

        with runtime_context(state) as ctx:
            caller_response = await project_fixture.manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.Chat,
                    position=Position(x=0, y=0),
                ),
            )
            target_response = await project_fixture.manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.Chat,
                    position=Position(x=300, y=0),
                ),
            )
            await project_fixture.manager.set_chat_section_settings(
                SetChatSectionSettingsRequest(
                    projectConfigId=project_config_id,
                    sectionId=target_response.sectionId,
                    managed=True,
                    engineConfigId="engine-linked",
                    transcriptionProfileId=None,
                    agentProfileId=None,
                    thinking=False,
                    permissionMode=ChatPermissionMode.minimal,
                    searchEnabled=True,
                    dictationMode=ChatDictationMode.auto,
                )
            )

            await route_create_agentic_edge(
                CreateAgenticEdgeRequest(
                    projectConfigId=project_config_id,
                    sourceSectionId=caller_response.sectionId,
                    targetSectionId=target_response.sectionId,
                    kind=AgenticEdgeKind.chat_chat,
                ),
                ctx,
            )

            project_state = project_fixture.manager.get_single_config_state(
                project_config_id
            )
            created_edge = project_state.projectConfig.agenticEdges[0]
            assert created_edge.kind == AgenticEdgeKind.chat_chat

            await route_update_agentic_edge(
                UpdateAgenticEdgeRequest(
                    projectConfigId=project_config_id,
                    edge=created_edge.model_copy(update={"hidden": True}),
                ),
                ctx,
            )

            project_state = project_fixture.manager.get_single_config_state(
                project_config_id
            )
            assert project_state.projectConfig.agenticEdges[0].hidden is True

            replacement_edge = AgenticEdge(
                id="edge-linked-replacement",
                sourceSectionId=caller_response.sectionId,
                targetSectionId=target_response.sectionId,
                kind=AgenticEdgeKind.chat_chat,
            )
            await route_set_agentic_edges(
                SetAgenticEdgesRequest(
                    projectConfigId=project_config_id,
                    edges=[replacement_edge],
                ),
                ctx,
            )

            project_state = project_fixture.manager.get_single_config_state(
                project_config_id
            )
            assert project_state.projectConfig.agenticEdges == [replacement_edge]


@pytest.mark.asyncio
async def test_agentic_edge_routes_ignore_invalid_persisted_llm_config_for_non_linked_edges() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()
        project_fixture.dbe.write_llm_config(
            {
                "configs": {
                    "broken": [],
                }
            }
        )

        state = SimpleNamespace(
            share_mode=False,
            deployment_mode=False,
            wmh_frontend_sender=project_fixture.manager.websocket_msg_handler,
            project_manager_switcher=ProjectManagerSwitcher(
                main_manager=project_fixture.manager,
                settings_manager=settings_fixture.manager,
            ),
        )

        with runtime_context(state) as ctx:
            caller_response = await project_fixture.manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.Chat,
                    position=Position(x=0, y=0),
                ),
            )
            target_response = await project_fixture.manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.Dict,
                    position=Position(x=300, y=0),
                ),
            )

            await route_create_agentic_edge(
                CreateAgenticEdgeRequest(
                    projectConfigId=project_config_id,
                    sourceSectionId=caller_response.sectionId,
                    targetSectionId=target_response.sectionId,
                    kind=AgenticEdgeKind.chat_section,
                ),
                ctx,
            )

            project_state = project_fixture.manager.get_single_config_state(
                project_config_id
            )
            created_edge = project_state.projectConfig.agenticEdges[0]
            assert created_edge.kind == AgenticEdgeKind.chat_section

            await route_update_agentic_edge(
                UpdateAgenticEdgeRequest(
                    projectConfigId=project_config_id,
                    edge=created_edge.model_copy(update={"hidden": True}),
                ),
                ctx,
            )

            replacement_edge = AgenticEdge(
                id="edge-chat-section-replacement",
                sourceSectionId=caller_response.sectionId,
                targetSectionId=target_response.sectionId,
                kind=AgenticEdgeKind.chat_section,
            )
            await route_set_agentic_edges(
                SetAgenticEdgesRequest(
                    projectConfigId=project_config_id,
                    edges=[replacement_edge],
                ),
                ctx,
            )

            project_state = project_fixture.manager.get_single_config_state(
                project_config_id
            )
            assert project_state.projectConfig.agenticEdges == [replacement_edge]
