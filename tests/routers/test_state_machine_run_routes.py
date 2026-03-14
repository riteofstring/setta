import asyncio
from types import SimpleNamespace

from fastapi import HTTPException
import pytest

from setta.agentic.state_machine_signals import (
    REPORT_STATE_MACHINE_SIGNAL_NAMESPACED_TOOL_NAME,
)
from setta.agentic.chat_view import LLM_CHAT_RUN_TYPE, SCRIPTABLE_CHAT_RUN_TYPE
from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.agentic.state_machine_runner import (
    STATE_MACHINE_RUN_TYPE,
    StateMachineRunner,
)
from setta.agentic.store import (
    create_agent_run,
    save_agent_profiles,
    save_agent_run,
    save_engine_configs,
    load_agent_run,
)
from setta.llm.agent_runner import AgentRunner
from setta.mcp.client import MultiMCPClient
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.project_manager_types import (
    CreateStateMachineEdgeRequest,
    CreateTopLevelSectionRequest,
    SetChatSectionChatIdRequest,
    SetChatSectionSettingsRequest,
    SetStateMachineSectionSettingsRequest,
)
from setta.routers.agentic import (
    GetStateMachineRunRequest,
    ResetStateMachineRequest,
    StartStateMachineRunRequest,
    StopStateMachineRunRequest,
    route_get_state_machine_run,
    route_reset_state_machine,
    route_start_state_machine_run,
    route_stop_state_machine_run,
)
from setta.types.agentic import (
    AgentProfile,
    AgentRun,
    AgentRunStatus,
    EngineConfig,
    EngineType,
)
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    UserChatMessage,
)
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.types.project_config import Position
from setta.types.section_impls import (
    ChatDictationMode,
    ChatPermissionMode,
    ChatSectionImpl,
    SectionType,
    StateMachineGateType,
)
from setta.types.state_machine_edges import (
    STATE_MACHINE_EDGE_SOURCE_PORT_ID,
    STATE_MACHINE_EDGE_TARGET_PORT_ID,
    StateMachineSourceFilter,
    StateMachineSourceFilterType,
    StateMachineTargetAction,
    StateMachineTargetActionType,
    StateMachineThreadStrategy,
)

from tests.utils.manager_fixture import real_project_manager, real_settings_manager
from tests.utils.runtime_context import runtime_context


def _build_agent_runner(dbe, frontend_sender) -> AgentRunner:
    runner = AgentRunner(dbe, MultiMCPClient({}, disabled=True), frontend_sender)
    runner.update_config(
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
        )
    )
    return runner


def _build_runtime_state(project_fixture, settings_fixture):
    project_manager_switcher = ProjectManagerSwitcher(
        main_manager=project_fixture.manager,
        settings_manager=settings_fixture.manager,
    )
    agent_runner = _build_agent_runner(
        project_fixture.dbe,
        project_fixture.manager.websocket_msg_handler,
    )
    external_agent_runner = ExternalAgentRunner(
        project_fixture.dbe,
        project_fixture.manager.websocket_msg_handler,
    )
    state_machine_runner = StateMachineRunner(
        project_fixture.dbe,
        project_manager_switcher,
        agent_runner,
        external_agent_runner,
        project_fixture.manager.websocket_msg_handler,
    )
    agent_runner.set_terminal_run_listener(
        state_machine_runner.handle_terminal_child_run_update
    )
    external_agent_runner.set_terminal_run_listener(
        state_machine_runner.handle_terminal_child_run_update
    )
    state = SimpleNamespace(
        share_mode=False,
        deployment_mode=False,
        launcher_mode=False,
        wmh_frontend_sender=project_fixture.manager.websocket_msg_handler,
        project_manager_switcher=project_manager_switcher,
        state_machine_runner=state_machine_runner,
    )
    return state, state_machine_runner, agent_runner, external_agent_runner


def _seed_engine_config(dbe, engine_config_id: ID) -> None:
    save_engine_configs(
        dbe,
        [
            EngineConfig(
                id=engine_config_id,
                name="Primary Engine",
                engineType=EngineType.setta_llm,
                settaLlmConfigId="primary",
            )
        ],
    )


async def _seed_state_machine_graph(
    *,
    project_fixture,
    project_config_id,
) -> tuple[str, str, str]:
    start_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineStart,
            position=Position(x=0, y=0),
        ),
    )
    gate_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineGate,
            position=Position(x=280, y=0),
        ),
    )
    end_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineEnd,
            position=Position(x=560, y=0),
        ),
    )

    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=start_response.sectionId,
            machineGroupId="workflow-main",
            label="Review Flow",
        )
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=gate_response.sectionId,
            machineGroupId="workflow-main",
            label="Join",
            gateType=StateMachineGateType.AND,
        )
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=end_response.sectionId,
            machineGroupId="workflow-main",
            label="Done",
        )
    )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=start_response.sectionId,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=gate_response.sectionId,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
        )
    )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=gate_response.sectionId,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=end_response.sectionId,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
        )
    )
    return (
        start_response.sectionId,
        gate_response.sectionId,
        end_response.sectionId,
    )


async def _seed_state_machine_chat_graph(
    *,
    project_fixture,
    project_config_id,
    engine_config_id: ID,
    target_action: StateMachineTargetAction,
) -> tuple[str, str, str]:
    start_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineStart,
            position=Position(x=0, y=0),
        ),
    )
    chat_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.Chat,
            position=Position(x=280, y=0),
        ),
    )
    end_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineEnd,
            position=Position(x=560, y=0),
        ),
    )

    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=start_response.sectionId,
            machineGroupId="workflow-main",
            label="Review Flow",
        )
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=end_response.sectionId,
            machineGroupId="workflow-main",
            label="Done",
        )
    )
    await project_fixture.manager.set_chat_section_settings(
        SetChatSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=chat_response.sectionId,
            managed=True,
            engineConfigId=engine_config_id,
            transcriptionProfileId=None,
            agentProfileId=None,
            thinking=False,
            permissionMode=ChatPermissionMode.minimal,
            searchEnabled=True,
            dictationMode=ChatDictationMode.auto,
        )
    )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=start_response.sectionId,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=chat_response.sectionId,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
            targetAction=target_action,
        )
    )
    return (
        start_response.sectionId,
        chat_response.sectionId,
        end_response.sectionId,
    )


async def _seed_state_machine_multi_chat_graph(
    *,
    project_fixture,
    project_config_id,
    engine_config_id: ID,
) -> tuple[str, list[str]]:
    start_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineStart,
            position=Position(x=0, y=0),
        ),
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=start_response.sectionId,
            machineGroupId="workflow-main",
            label="Review Flow",
        )
    )
    end_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineEnd,
            position=Position(x=560, y=0),
        ),
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=end_response.sectionId,
            machineGroupId="workflow-main",
            label="Done",
        )
    )

    chat_section_ids: list[str] = []
    for idx, prompt_text in enumerate(
        ["Review branch A.", "Review branch B."],
        start=1,
    ):
        chat_response = await project_fixture.manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Chat,
                position=Position(x=280, y=(idx - 1) * 160),
            ),
        )
        chat_section_ids.append(chat_response.sectionId)
        await project_fixture.manager.set_chat_section_settings(
            SetChatSectionSettingsRequest(
                projectConfigId=project_config_id,
                sectionId=chat_response.sectionId,
                managed=True,
                engineConfigId=engine_config_id,
                transcriptionProfileId=None,
                agentProfileId=None,
                thinking=False,
                permissionMode=ChatPermissionMode.minimal,
                searchEnabled=True,
                dictationMode=ChatDictationMode.auto,
            )
        )
        await project_fixture.manager.create_state_machine_edge(
            CreateStateMachineEdgeRequest(
                projectConfigId=project_config_id,
                machineGroupId="workflow-main",
                sourceSectionId=start_response.sectionId,
                sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
                targetSectionId=chat_response.sectionId,
                targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
                targetAction=StateMachineTargetAction(
                    type=StateMachineTargetActionType.send_prompt,
                    inlinePrompt=prompt_text,
                    threadStrategy=StateMachineThreadStrategy.new_thread_before_send,
                ),
            )
        )
    return start_response.sectionId, chat_section_ids


async def _create_managed_chat_section(
    *,
    project_fixture,
    project_config_id: ID,
    engine_config_id: ID,
    position: Position,
) -> ID:
    chat_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.Chat,
            position=position,
        )
    )
    await project_fixture.manager.set_chat_section_settings(
        SetChatSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=chat_response.sectionId,
            managed=True,
            engineConfigId=engine_config_id,
            transcriptionProfileId=None,
            agentProfileId=None,
            thinking=False,
            permissionMode=ChatPermissionMode.minimal,
            searchEnabled=True,
            dictationMode=ChatDictationMode.auto,
        )
    )
    return chat_response.sectionId


async def _seed_state_machine_chat_chain_graph(
    *,
    project_fixture,
    project_config_id: ID,
    engine_config_id: ID,
) -> tuple[ID, ID, ID, ID]:
    start_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineStart,
            position=Position(x=0, y=0),
        ),
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=start_response.sectionId,
            machineGroupId="workflow-main",
            label="Review Flow",
        )
    )
    first_chat_id = await _create_managed_chat_section(
        project_fixture=project_fixture,
        project_config_id=project_config_id,
        engine_config_id=engine_config_id,
        position=Position(x=280, y=0),
    )
    second_chat_id = await _create_managed_chat_section(
        project_fixture=project_fixture,
        project_config_id=project_config_id,
        engine_config_id=engine_config_id,
        position=Position(x=560, y=0),
    )
    end_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineEnd,
            position=Position(x=840, y=0),
        ),
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=end_response.sectionId,
            machineGroupId="workflow-main",
            label="Done",
        )
    )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=start_response.sectionId,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=first_chat_id,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
            targetAction=StateMachineTargetAction(
                type=StateMachineTargetActionType.send_prompt,
                inlinePrompt="Review branch A.",
                threadStrategy=StateMachineThreadStrategy.new_thread_before_send,
            ),
        )
    )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=first_chat_id,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=second_chat_id,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
            sourceFilter=StateMachineSourceFilter(
                type=StateMachineSourceFilterType.run_completed,
            ),
            targetAction=StateMachineTargetAction(
                type=StateMachineTargetActionType.send_prompt,
                inlinePrompt="Review follow-up findings.",
                threadStrategy=StateMachineThreadStrategy.new_thread_before_send,
            ),
        )
    )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=second_chat_id,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=end_response.sectionId,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
            sourceFilter=StateMachineSourceFilter(
                type=StateMachineSourceFilterType.run_completed,
            ),
        )
    )
    return (
        start_response.sectionId,
        first_chat_id,
        second_chat_id,
        end_response.sectionId,
    )


async def _seed_state_machine_failed_to_end_graph(
    *,
    project_fixture,
    project_config_id: ID,
    engine_config_id: ID,
) -> tuple[ID, ID, ID]:
    start_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineStart,
            position=Position(x=0, y=0),
        ),
    )
    end_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineEnd,
            position=Position(x=560, y=0),
        ),
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=start_response.sectionId,
            machineGroupId="workflow-main",
            label="Review Flow",
        )
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=end_response.sectionId,
            machineGroupId="workflow-main",
            label="Done",
        )
    )
    chat_section_id = await _create_managed_chat_section(
        project_fixture=project_fixture,
        project_config_id=project_config_id,
        engine_config_id=engine_config_id,
        position=Position(x=280, y=0),
    )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=start_response.sectionId,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=chat_section_id,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
            targetAction=StateMachineTargetAction(
                type=StateMachineTargetActionType.send_prompt,
                inlinePrompt="Review branch A.",
                threadStrategy=StateMachineThreadStrategy.new_thread_before_send,
            ),
        )
    )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=chat_section_id,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=end_response.sectionId,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
            sourceFilter=StateMachineSourceFilter(
                type=StateMachineSourceFilterType.run_failed,
            ),
        )
    )
    return start_response.sectionId, chat_section_id, end_response.sectionId


async def _seed_state_machine_gate_chat_graph(
    *,
    project_fixture,
    project_config_id: ID,
    engine_config_id: ID,
    gate_type: StateMachineGateType,
) -> tuple[ID, list[ID], ID, ID]:
    start_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineStart,
            position=Position(x=0, y=80),
        ),
    )
    gate_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineGate,
            position=Position(x=560, y=80),
        ),
    )
    end_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineEnd,
            position=Position(x=840, y=80),
        ),
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=start_response.sectionId,
            machineGroupId="workflow-main",
            label="Review Flow",
        )
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=gate_response.sectionId,
            machineGroupId="workflow-main",
            label="Join",
            gateType=gate_type,
        )
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=end_response.sectionId,
            machineGroupId="workflow-main",
            label="Done",
        )
    )
    chat_section_ids = [
        await _create_managed_chat_section(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
            position=Position(x=280, y=0),
        ),
        await _create_managed_chat_section(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
            position=Position(x=280, y=160),
        ),
    ]
    for idx, chat_section_id in enumerate(chat_section_ids, start=1):
        await project_fixture.manager.create_state_machine_edge(
            CreateStateMachineEdgeRequest(
                projectConfigId=project_config_id,
                machineGroupId="workflow-main",
                sourceSectionId=start_response.sectionId,
                sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
                targetSectionId=chat_section_id,
                targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
                targetAction=StateMachineTargetAction(
                    type=StateMachineTargetActionType.send_prompt,
                    inlinePrompt=f"Review branch {idx}.",
                    threadStrategy=StateMachineThreadStrategy.new_thread_before_send,
                ),
            )
        )
        await project_fixture.manager.create_state_machine_edge(
            CreateStateMachineEdgeRequest(
                projectConfigId=project_config_id,
                machineGroupId="workflow-main",
                sourceSectionId=chat_section_id,
                sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
                targetSectionId=gate_response.sectionId,
                targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
                sourceFilter=StateMachineSourceFilter(
                    type=StateMachineSourceFilterType.run_completed,
                ),
            )
        )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=gate_response.sectionId,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=end_response.sectionId,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
        )
    )
    return (
        start_response.sectionId,
        chat_section_ids,
        gate_response.sectionId,
        end_response.sectionId,
    )


async def _seed_state_machine_signal_branch_graph(
    *,
    project_fixture,
    project_config_id: ID,
    engine_config_id: ID,
) -> tuple[ID, ID, ID, ID]:
    start_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineStart,
            position=Position(x=0, y=0),
        ),
    )
    end_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineEnd,
            position=Position(x=840, y=0),
        ),
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=start_response.sectionId,
            machineGroupId="workflow-main",
            label="Review Flow",
        )
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=end_response.sectionId,
            machineGroupId="workflow-main",
            label="Done",
        )
    )
    first_chat_id = await _create_managed_chat_section(
        project_fixture=project_fixture,
        project_config_id=project_config_id,
        engine_config_id=engine_config_id,
        position=Position(x=280, y=0),
    )
    second_chat_id = await _create_managed_chat_section(
        project_fixture=project_fixture,
        project_config_id=project_config_id,
        engine_config_id=engine_config_id,
        position=Position(x=560, y=0),
    )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=start_response.sectionId,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=first_chat_id,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
            targetAction=StateMachineTargetAction(
                type=StateMachineTargetActionType.send_prompt,
                inlinePrompt="Initial review.",
                threadStrategy=StateMachineThreadStrategy.new_thread_before_send,
            ),
        )
    )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=first_chat_id,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=second_chat_id,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
            sourceFilter=StateMachineSourceFilter(
                type=StateMachineSourceFilterType.signal,
                signalName="merge_decision",
                payloadField="decision",
                equals="retry",
            ),
            targetAction=StateMachineTargetAction(
                type=StateMachineTargetActionType.send_prompt,
                inlinePrompt="Apply another review pass.",
                threadStrategy=StateMachineThreadStrategy.new_thread_before_send,
            ),
        )
    )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=first_chat_id,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=end_response.sectionId,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
            sourceFilter=StateMachineSourceFilter(
                type=StateMachineSourceFilterType.signal,
                signalName="merge_decision",
                payloadField="decision",
                equals="done",
            ),
        )
    )
    return (
        start_response.sectionId,
        first_chat_id,
        second_chat_id,
        end_response.sectionId,
    )


async def _seed_state_machine_signal_loop_graph(
    *,
    project_fixture,
    project_config_id: ID,
    engine_config_id: ID,
    max_iterations: int | None = None,
) -> tuple[ID, ID, ID]:
    start_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineStart,
            position=Position(x=0, y=0),
        ),
    )
    end_response = await project_fixture.manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.StateMachineEnd,
            position=Position(x=560, y=0),
        ),
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=start_response.sectionId,
            machineGroupId="workflow-main",
            label="Review Flow",
            maxIterations=max_iterations,
        )
    )
    await project_fixture.manager.set_state_machine_section_settings(
        SetStateMachineSectionSettingsRequest(
            projectConfigId=project_config_id,
            sectionId=end_response.sectionId,
            machineGroupId="workflow-main",
            label="Done",
        )
    )
    loop_chat_id = await _create_managed_chat_section(
        project_fixture=project_fixture,
        project_config_id=project_config_id,
        engine_config_id=engine_config_id,
        position=Position(x=280, y=0),
    )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=start_response.sectionId,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=loop_chat_id,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
            targetAction=StateMachineTargetAction(
                type=StateMachineTargetActionType.send_prompt,
                inlinePrompt="Initial review.",
                threadStrategy=StateMachineThreadStrategy.new_thread_before_send,
            ),
        )
    )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=loop_chat_id,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=loop_chat_id,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
            sourceFilter=StateMachineSourceFilter(
                type=StateMachineSourceFilterType.signal,
                signalName="merge_decision",
                payloadField="decision",
                equals="retry",
            ),
            targetAction=StateMachineTargetAction(
                type=StateMachineTargetActionType.send_prompt,
                inlinePrompt="Apply another review pass.",
                threadStrategy=StateMachineThreadStrategy.new_thread_before_send,
            ),
        )
    )
    await project_fixture.manager.create_state_machine_edge(
        CreateStateMachineEdgeRequest(
            projectConfigId=project_config_id,
            machineGroupId="workflow-main",
            sourceSectionId=loop_chat_id,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=end_response.sectionId,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
            sourceFilter=StateMachineSourceFilter(
                type=StateMachineSourceFilterType.signal,
                signalName="merge_decision",
                payloadField="decision",
                equals="done",
            ),
        )
    )
    return start_response.sectionId, loop_chat_id, end_response.sectionId


def _get_chat_section_impl(
    project_fixture, project_config_id: ID, section_id: ID
) -> ChatSectionImpl:
    project_state = convert_backend_to_single_config(
        project_fixture.manager.project_state_backend,
        project_config_id,
    )
    return get_curr_effective_section_impl_with_type_guard(
        project_state,
        section_id,
        ChatSectionImpl,
    )


@pytest.mark.asyncio
async def test_state_machine_run_routes_complete_structural_machine_and_restart() -> (
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

        start_section_id, gate_section_id, _ = await _seed_state_machine_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
        )

        state, _, _, _ = _build_runtime_state(project_fixture, settings_fixture)

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )

            # A purely structural Start -> Gate -> End graph should finish immediately.
            assert started.status == AgentRunStatus.completed
            assert started.inputs is not None
            assert started.inputs["runType"] == STATE_MACHINE_RUN_TYPE
            assert started.inputs["projectConfigId"] == str(project_config_id)
            assert started.inputs["machineGroupId"] == "workflow-main"
            assert started.inputs["startSectionId"] == str(start_section_id)
            assert started.inputs["machineName"] == "Review Flow"
            assert started.outputs is not None
            assert started.outputs["startOutgoingTargetSectionIds"] == [
                str(gate_section_id)
            ]
            assert started.outputs["dispatchedStartEdgeActions"] == []
            assert started.outputs["firedGateSectionIds"] == [str(gate_section_id)]
            assert started.outputs["gateStatusBySectionId"] == {
                str(gate_section_id): "satisfied"
            }
            assert len(started.outputs["reachedEndSectionIds"]) == 1
            assert [event.type for event in started.events] == [
                "run_started",
                "graph_resolved",
                "start_edges_activated",
                "gate_input_activated",
                "gate_satisfied",
                "end_reached",
                "run_completed",
            ]

            latest_completed = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert latest_completed.id == started.id
            assert latest_completed.status == AgentRunStatus.completed

            stopped = await route_stop_state_machine_run(
                StopStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert stopped.alreadyStopped is True
            assert stopped.stoppedRunId is None

            restarted = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert restarted.id != started.id
            assert restarted.status == AgentRunStatus.completed

            reset = await route_reset_state_machine(
                ResetStateMachineRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert reset.alreadyStopped is False
            assert reset.stoppedRunId == restarted.id

            with pytest.raises(HTTPException) as exc_info:
                await route_get_state_machine_run(
                    GetStateMachineRunRequest(
                        projectConfigId=project_config_id,
                        machineGroupId="workflow-main",
                    ),
                    ctx,
                )
            assert exc_info.value.status_code == 404
            assert "not found" in str(exc_info.value.detail)

        reset_run = load_agent_run(project_fixture.dbe, restarted.id)
        assert reset_run is not None
        assert reset_run.status == AgentRunStatus.completed
        assert reset_run.outputs is not None
        assert reset_run.outputs["machineStateCleared"] is True
        assert isinstance(reset_run.outputs["machineStateClearedAt"], str)
        assert reset_run.outputs["activatedEdgeIds"] == []
        assert reset_run.outputs["firedGateSectionIds"] == []
        assert reset_run.outputs["reachedEndSectionIds"] == []
        assert reset_run.outputs["failureSummary"] is None
        assert reset_run.events[-1].type == "run_reset"


@pytest.mark.asyncio
async def test_state_machine_runner_dispatches_send_prompt_from_start_edges(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        start_section_id, chat_section_id, _ = await _seed_state_machine_chat_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
            target_action=StateMachineTargetAction(
                type=StateMachineTargetActionType.send_prompt,
                inlinePrompt="Review this branch carefully.",
                threadStrategy=StateMachineThreadStrategy.new_thread_before_send,
            ),
        )
        await project_fixture.manager.set_chat_section_chat_id(
            SetChatSectionChatIdRequest(
                projectConfigId=project_config_id,
                sectionId=chat_section_id,
                chatId=ID("chat-existing-thread"),
            )
        )

        state, _, agent_runner, _ = _build_runtime_state(
            project_fixture,
            settings_fixture,
        )
        captured: dict[str, object] = {}

        def _capture_start_run(profile, inputs, **_kwargs):
            captured["profile"] = profile
            captured["inputs"] = inputs
            run = create_agent_run(profile_id=profile.id, inputs=inputs)
            captured["run"] = run
            return run

        monkeypatch.setattr(agent_runner, "start_run", _capture_start_run)

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )

        captured_inputs = captured.get("inputs")
        assert isinstance(captured_inputs, dict)
        dispatched_chat_id = captured_inputs.get("chatId")
        assert isinstance(dispatched_chat_id, str)
        assert dispatched_chat_id != "chat-existing-thread"
        raw_messages = captured_inputs.get("messages")
        assert isinstance(raw_messages, list)
        assert raw_messages[-1]["role"] == "user"
        assert raw_messages[-1]["content"][0]["text"] == "Review this branch carefully."
        assert captured_inputs["stateMachineRunId"] == str(started.id)
        assert captured_inputs["machineGroupId"] == "workflow-main"
        assert (
            captured_inputs["stateMachineSourceEdgeId"]
            == started.outputs["startOutgoingEdgeIds"][0]
        )
        assert captured_inputs["stateMachineTargetSectionId"] == str(chat_section_id)
        assert captured_inputs["stateMachineIteration"] == 1
        assert captured_inputs["stateMachineParentRunType"] == STATE_MACHINE_RUN_TYPE

        chat_impl = _get_chat_section_impl(
            project_fixture,
            project_config_id,
            chat_section_id,
        )
        assert chat_impl.chatId == ID(dispatched_chat_id)
        assert started.outputs is not None
        assert started.outputs["dispatchedStartEdgeActions"] == [
            {
                "edgeId": started.outputs["startOutgoingEdgeIds"][0],
                "actionType": "send_prompt",
                "targetSectionId": str(chat_section_id),
                "chatId": dispatched_chat_id,
                "runId": str(captured["run"].id),
                "threadStrategy": "new_thread_before_send",
                "engineType": "setta_llm",
                "stateMachineIteration": 1,
            }
        ]
        assert started.outputs["childRunIds"] == [str(captured["run"].id)]
        assert [event.type for event in started.events] == [
            "run_started",
            "graph_resolved",
            "start_edges_activated",
            "start_edge_action_dispatched",
            "start_edge_actions_dispatched",
        ]


@pytest.mark.asyncio
async def test_state_machine_runner_rejects_scriptable_history_on_reused_chat_id() -> (
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

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        start_section_id, chat_section_id, _ = await _seed_state_machine_chat_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
            target_action=StateMachineTargetAction(
                type=StateMachineTargetActionType.send_prompt,
                inlinePrompt="Review this branch carefully.",
                threadStrategy=StateMachineThreadStrategy.continue_current_thread,
            ),
        )
        existing_chat_id = ID("chat-scriptable-history")
        await project_fixture.manager.set_chat_section_chat_id(
            SetChatSectionChatIdRequest(
                projectConfigId=project_config_id,
                sectionId=chat_section_id,
                chatId=existing_chat_id,
            )
        )
        save_agent_run(
            project_fixture.dbe,
            AgentRun(
                status=AgentRunStatus.completed,
                inputs={
                    "runType": SCRIPTABLE_CHAT_RUN_TYPE,
                    "chatId": str(existing_chat_id),
                    "projectConfigId": str(project_config_id),
                    "engineConfigId": "engine-scriptable",
                    "messages": [],
                },
                outputs={
                    "messages": [
                        AssistantChatMessage(
                            content=[MessageTextContent(text="Scriptable reply")]
                        ).model_dump(mode="json")
                    ]
                },
            ),
        )

        state, _, _, _ = _build_runtime_state(project_fixture, settings_fixture)

        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc_info:
                await route_start_state_machine_run(
                    StartStateMachineRunRequest(
                        projectConfigId=project_config_id,
                        machineGroupId="workflow-main",
                        startSectionId=start_section_id,
                    ),
                    ctx,
                )

        assert exc_info.value.status_code == 409
        assert exc_info.value.detail == "Chat engine mismatch; start a new chat."


@pytest.mark.asyncio
async def test_state_machine_runner_fans_out_start_edges_in_parallel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        start_section_id, _ = await _seed_state_machine_multi_chat_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
        )

        state, state_machine_runner, _, _ = _build_runtime_state(
            project_fixture,
            settings_fixture,
        )
        started_edge_ids: list[str] = []
        both_edges_started = asyncio.Event()
        release_edges = asyncio.Event()

        async def _capture_edge_action(*, edge, **_kwargs):
            started_edge_ids.append(str(edge.id))
            if len(started_edge_ids) == 2:
                both_edges_started.set()
            await release_edges.wait()
            return [
                {
                    "edgeId": str(edge.id),
                    "actionType": "send_prompt",
                    "targetSectionId": str(edge.targetSectionId),
                }
            ]

        monkeypatch.setattr(
            state_machine_runner,
            "_activate_edge",
            _capture_edge_action,
        )

        with runtime_context(state) as ctx:
            started_task = asyncio.create_task(
                route_start_state_machine_run(
                    StartStateMachineRunRequest(
                        projectConfigId=project_config_id,
                        machineGroupId="workflow-main",
                        startSectionId=start_section_id,
                    ),
                    ctx,
                )
            )
            await asyncio.wait_for(both_edges_started.wait(), timeout=2.0)
            release_edges.set()
            started = await asyncio.wait_for(started_task, timeout=2.0)

        assert len(started_edge_ids) == 2
        assert started.outputs is not None
        assert len(started.outputs["dispatchedStartEdgeActions"]) == 2


@pytest.mark.asyncio
async def test_state_machine_runner_routes_completed_child_run_to_follow_up_chat(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        (
            start_section_id,
            _,
            second_chat_id,
            _,
        ) = await _seed_state_machine_chat_chain_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
        )

        state, _, agent_runner, _ = _build_runtime_state(
            project_fixture,
            settings_fixture,
        )
        dispatched_inputs: list[dict[str, object]] = []
        child_runs: list[AgentRun] = []

        def _capture_start_run(profile, inputs, **_kwargs):
            run = create_agent_run(profile_id=profile.id, inputs=inputs)
            save_agent_run(project_fixture.dbe, run)
            dispatched_inputs.append(inputs)
            child_runs.append(run)
            return run

        monkeypatch.setattr(agent_runner, "start_run", _capture_start_run)

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )

            # Completing the first child run should activate its run_completed edge
            # exactly once and dispatch the follow-up chat action.
            first_child_run = child_runs[0]
            first_child_run.status = AgentRunStatus.completed
            save_agent_run(project_fixture.dbe, first_child_run)

            latest = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            latest_again = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )

        assert started.status == AgentRunStatus.running
        assert len(dispatched_inputs) == 2
        assert latest.status == AgentRunStatus.running
        assert latest_again.id == latest.id
        assert latest.outputs is not None
        assert latest.outputs["processedChildTerminalRunIds"] == [
            str(first_child_run.id)
        ]
        assert latest.outputs["childRunIds"] == [str(run.id) for run in child_runs]
        assert latest.outputs["dispatchedEdgeActions"] == [
            {
                "edgeId": child_runs[1].inputs["stateMachineSourceEdgeId"],
                "actionType": "send_prompt",
                "targetSectionId": str(second_chat_id),
                "chatId": dispatched_inputs[1]["chatId"],
                "runId": str(child_runs[1].id),
                "threadStrategy": "new_thread_before_send",
                "engineType": "setta_llm",
                "stateMachineIteration": 1,
            }
        ]
        assert dispatched_inputs[1]["stateMachineTargetSectionId"] == str(
            second_chat_id
        )
        assert [event.type for event in latest.events[-3:]] == [
            "child_run_completed",
            "child_run_edges_activated",
            "edge_action_dispatched",
        ]


@pytest.mark.asyncio
async def test_state_machine_runner_broadcasts_parent_update_when_child_run_completes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        start_section_id, chat_section_id, end_section_id = (
            await _seed_state_machine_chat_graph(
                project_fixture=project_fixture,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                target_action=StateMachineTargetAction(
                    type=StateMachineTargetActionType.send_prompt,
                    inlinePrompt="Review the latest output.",
                    threadStrategy=StateMachineThreadStrategy.new_thread_before_send,
                ),
            )
        )
        await project_fixture.manager.create_state_machine_edge(
            CreateStateMachineEdgeRequest(
                projectConfigId=project_config_id,
                machineGroupId="workflow-main",
                sourceSectionId=chat_section_id,
                sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
                targetSectionId=end_section_id,
                targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
                sourceFilter=StateMachineSourceFilter(
                    type=StateMachineSourceFilterType.run_completed
                ),
            )
        )

        state, state_machine_runner, agent_runner, _ = _build_runtime_state(
            project_fixture,
            settings_fixture,
        )
        child_runs: list[AgentRun] = []
        broadcast_runs: list[AgentRun] = []

        def _capture_start_run(profile, inputs, **_kwargs):
            run = create_agent_run(profile_id=profile.id, inputs=inputs)
            save_agent_run(project_fixture.dbe, run)
            child_runs.append(run)
            return run

        async def _capture_broadcast(
            run: AgentRun,
            *,
            share_session_id: str | None = None,
        ) -> None:
            assert share_session_id is None
            broadcast_runs.append(run.model_copy(deep=True))

        monkeypatch.setattr(agent_runner, "start_run", _capture_start_run)
        monkeypatch.setattr(
            project_fixture.manager.websocket_msg_handler,
            "broadcast_agent_run_update",
            _capture_broadcast,
        )

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )

        assert started.status == AgentRunStatus.running
        assert len(child_runs) == 1

        child_run = child_runs[0]
        child_run.status = AgentRunStatus.completed
        child_run.finishedAt = child_run.startedAt
        save_agent_run(project_fixture.dbe, child_run)

        await state_machine_runner.handle_terminal_child_run_update(child_run)

        refreshed_parent = load_agent_run(project_fixture.dbe, started.id)
        assert refreshed_parent is not None
        assert refreshed_parent.status == AgentRunStatus.completed
        assert broadcast_runs[-1].id == started.id
        assert broadcast_runs[-1].status == AgentRunStatus.completed
        assert [event.type for event in refreshed_parent.events[-4:]] == [
            "child_run_completed",
            "child_run_edges_activated",
            "end_reached",
            "run_completed",
        ]


@pytest.mark.asyncio
async def test_state_machine_runner_routes_failed_child_run_to_end(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        (
            start_section_id,
            _,
            end_section_id,
        ) = await _seed_state_machine_failed_to_end_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
        )

        state, _, agent_runner, _ = _build_runtime_state(
            project_fixture,
            settings_fixture,
        )
        child_runs: list[AgentRun] = []

        def _capture_start_run(profile, inputs, **_kwargs):
            run = create_agent_run(profile_id=profile.id, inputs=inputs)
            save_agent_run(project_fixture.dbe, run)
            child_runs.append(run)
            return run

        monkeypatch.setattr(agent_runner, "start_run", _capture_start_run)

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )

            # A failed child run should satisfy a run_failed filter and drive
            # the machine to End.
            child_run = child_runs[0]
            child_run.status = AgentRunStatus.failed
            save_agent_run(project_fixture.dbe, child_run)

            latest = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )

        assert started.status == AgentRunStatus.running
        assert latest.status == AgentRunStatus.completed
        assert latest.outputs is not None
        assert latest.outputs["processedChildTerminalRunIds"] == [str(child_run.id)]
        assert latest.outputs["reachedEndSectionIds"] == [str(end_section_id)]
        assert [event.type for event in latest.events[-4:]] == [
            "child_run_failed",
            "child_run_edges_activated",
            "end_reached",
            "run_completed",
        ]


@pytest.mark.asyncio
async def test_state_machine_runner_routes_signal_filtered_edges(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        (
            start_section_id,
            first_chat_id,
            second_chat_id,
            _,
        ) = await _seed_state_machine_signal_branch_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
        )

        state, state_machine_runner, agent_runner, _ = _build_runtime_state(
            project_fixture,
            settings_fixture,
        )
        dispatched_inputs: list[dict[str, object]] = []
        child_runs: list[AgentRun] = []

        def _capture_start_run(profile, inputs, **_kwargs):
            run = create_agent_run(profile_id=profile.id, inputs=inputs)
            save_agent_run(project_fixture.dbe, run)
            dispatched_inputs.append(inputs)
            child_runs.append(run)
            return run

        monkeypatch.setattr(agent_runner, "start_run", _capture_start_run)

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )

            signal_report = await state_machine_runner.report_signal(
                project_config_id=project_config_id,
                child_run_id=child_runs[0].id,
                machine_run_id=None,
                section_id=None,
                signal_name="merge_decision",
                payload={"decision": "retry"},
            )
            latest = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )

        assert started.status == AgentRunStatus.running
        assert signal_report["status"] == "ok"
        assert len(dispatched_inputs) == 2
        assert latest.status == AgentRunStatus.running
        assert latest.outputs is not None
        assert latest.outputs["childRunIds"] == [str(run.id) for run in child_runs]
        assert latest.outputs["processedSignalEventIds"] == [
            signal_report["signalEventId"]
        ]
        assert latest.outputs["signalEvents"] == [
            {
                "signalEventId": signal_report["signalEventId"],
                "signalName": "merge_decision",
                "payload": {"decision": "retry"},
                "machineRunId": str(latest.id),
                "childRunId": str(child_runs[0].id),
                "sourceSectionId": str(first_chat_id),
                "stateMachineIteration": 1,
                "reportedAt": latest.outputs["signalEvents"][0]["reportedAt"],
            }
        ]
        assert latest.outputs["dispatchedEdgeActions"] == [
            {
                "edgeId": child_runs[1].inputs["stateMachineSourceEdgeId"],
                "actionType": "send_prompt",
                "targetSectionId": str(second_chat_id),
                "chatId": dispatched_inputs[1]["chatId"],
                "runId": str(child_runs[1].id),
                "threadStrategy": "new_thread_before_send",
                "engineType": "setta_llm",
                "stateMachineIteration": 1,
            }
        ]
        assert dispatched_inputs[1]["stateMachineIteration"] == 1
        assert dispatched_inputs[1]["stateMachineTargetSectionId"] == str(
            second_chat_id
        )
        assert [event.type for event in latest.events[-3:]] == [
            "signal_reported",
            "signal_edges_activated",
            "edge_action_dispatched",
        ]


@pytest.mark.asyncio
async def test_state_machine_runner_advances_iteration_for_signal_retry_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        (
            start_section_id,
            loop_chat_id,
            end_section_id,
        ) = await _seed_state_machine_signal_loop_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
        )

        state, state_machine_runner, agent_runner, _ = _build_runtime_state(
            project_fixture,
            settings_fixture,
        )
        dispatched_inputs: list[dict[str, object]] = []
        child_runs: list[AgentRun] = []

        def _capture_start_run(profile, inputs, **_kwargs):
            run = create_agent_run(profile_id=profile.id, inputs=inputs)
            save_agent_run(project_fixture.dbe, run)
            dispatched_inputs.append(inputs)
            child_runs.append(run)
            return run

        monkeypatch.setattr(agent_runner, "start_run", _capture_start_run)

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )

            retry_report = await state_machine_runner.report_signal(
                project_config_id=project_config_id,
                child_run_id=child_runs[0].id,
                machine_run_id=None,
                section_id=None,
                signal_name="merge_decision",
                payload={"decision": "retry"},
            )
            latest_after_retry = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )

            child_runs[0].status = AgentRunStatus.completed
            save_agent_run(project_fixture.dbe, child_runs[0])

            latest_after_first_completion = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )

            done_report = await state_machine_runner.report_signal(
                project_config_id=project_config_id,
                child_run_id=child_runs[1].id,
                machine_run_id=None,
                section_id=None,
                signal_name="merge_decision",
                payload={"decision": "done"},
            )
            latest_completed = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )

        assert started.status == AgentRunStatus.running
        assert retry_report["status"] == "ok"
        assert len(dispatched_inputs) == 2
        assert latest_after_retry.outputs is not None
        assert latest_after_retry.outputs["stateMachineIteration"] == 2
        assert latest_after_retry.outputs["processedSignalEventIds"] == [
            retry_report["signalEventId"]
        ]
        assert dispatched_inputs[1]["stateMachineTargetSectionId"] == str(loop_chat_id)
        assert dispatched_inputs[1]["stateMachineIteration"] == 2
        assert child_runs[1].inputs["stateMachineIteration"] == 2
        assert [event.type for event in latest_after_retry.events[-4:]] == [
            "signal_reported",
            "signal_edges_activated",
            "iteration_advanced",
            "edge_action_dispatched",
        ]

        assert latest_after_first_completion.status == AgentRunStatus.running
        assert latest_after_first_completion.outputs is not None
        assert (
            latest_after_first_completion.outputs["processedChildTerminalRunIds"] == []
        )
        assert latest_after_first_completion.outputs["stateMachineIteration"] == 2

        assert done_report["status"] == "ok"
        assert latest_completed.status == AgentRunStatus.completed
        assert latest_completed.outputs is not None
        assert latest_completed.outputs["stateMachineIteration"] == 2
        assert latest_completed.outputs["reachedEndSectionIds"] == [str(end_section_id)]
        assert [event.type for event in latest_completed.events[-4:]] == [
            "signal_reported",
            "signal_edges_activated",
            "end_reached",
            "run_completed",
        ]


@pytest.mark.asyncio
async def test_state_machine_runner_fails_when_loop_exceeds_max_iterations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        start_section_id, loop_chat_id, _ = await _seed_state_machine_signal_loop_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
            max_iterations=1,
        )

        state, state_machine_runner, agent_runner, _ = _build_runtime_state(
            project_fixture,
            settings_fixture,
        )
        dispatched_inputs: list[dict[str, object]] = []
        child_runs: list[AgentRun] = []

        def _capture_start_run(profile, inputs, **_kwargs):
            run = create_agent_run(profile_id=profile.id, inputs=inputs)
            save_agent_run(project_fixture.dbe, run)
            dispatched_inputs.append(inputs)
            child_runs.append(run)
            return run

        monkeypatch.setattr(agent_runner, "start_run", _capture_start_run)

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )

            retry_report = await state_machine_runner.report_signal(
                project_config_id=project_config_id,
                child_run_id=child_runs[0].id,
                machine_run_id=None,
                section_id=None,
                signal_name="merge_decision",
                payload={"decision": "retry"},
            )
            latest_failed = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )

        assert started.status == AgentRunStatus.running
        assert retry_report["status"] == "ok"
        assert len(dispatched_inputs) == 1
        assert latest_failed.status == AgentRunStatus.failed
        assert latest_failed.outputs is not None
        assert latest_failed.outputs["stateMachineIteration"] == 1
        retry_edge_ids = latest_failed.events[-3].payload["edgeIds"]
        assert latest_failed.outputs["failureSummary"] == {
            "reason": "max_iterations_reached",
            "message": "Workflow reached the max iteration limit (1) before dispatching iteration 2.",
            "details": {
                "previousIteration": 1,
                "attemptedIteration": 2,
                "maxIterations": 1,
                "targetSectionIds": [str(loop_chat_id)],
                "edgeIds": retry_edge_ids,
            },
        }
        assert [event.type for event in latest_failed.events[-4:]] == [
            "signal_reported",
            "signal_edges_activated",
            "iteration_limit_reached",
            "run_failed",
        ]


@pytest.mark.asyncio
async def test_state_machine_runner_flushes_project_state_before_managed_child_dispatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        start_section_id, _, _ = await _seed_state_machine_chat_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
            target_action=StateMachineTargetAction(
                type=StateMachineTargetActionType.send_prompt,
                inlinePrompt="Review the latest output.",
                threadStrategy=StateMachineThreadStrategy.continue_current_thread,
            ),
        )
        state, _, agent_runner, _ = _build_runtime_state(
            project_fixture,
            settings_fixture,
        )

        async def _noop_run_agent(_context) -> None:
            return None

        monkeypatch.setattr(agent_runner, "_run_agent", _noop_run_agent)

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )

        assert started.status == AgentRunStatus.running
        assert started.outputs is not None
        assert started.outputs["childRunIds"]


@pytest.mark.asyncio
async def test_state_machine_runner_fails_closed_when_signal_tool_is_missing_from_profile() -> (
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

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        (
            start_section_id,
            first_chat_id,
            _,
            _,
        ) = await _seed_state_machine_signal_branch_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
        )
        restricted_profile = AgentProfile(
            id=ID("profile-signal-missing"),
            name="Restricted reviewer",
            engineConfigId=engine_config_id,
            toolAllowlist=["report_completion_status"],
        )
        save_agent_profiles(project_fixture.dbe, [restricted_profile])
        await project_fixture.manager.set_chat_section_settings(
            SetChatSectionSettingsRequest(
                projectConfigId=project_config_id,
                sectionId=first_chat_id,
                managed=True,
                engineConfigId=engine_config_id,
                transcriptionProfileId=None,
                agentProfileId=restricted_profile.id,
                thinking=False,
                permissionMode=ChatPermissionMode.minimal,
                searchEnabled=True,
                dictationMode=ChatDictationMode.auto,
            )
        )

        state, _, _, _ = _build_runtime_state(project_fixture, settings_fixture)

        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc_info:
                await route_start_state_machine_run(
                    StartStateMachineRunRequest(
                        projectConfigId=project_config_id,
                        machineGroupId="workflow-main",
                        startSectionId=start_section_id,
                    ),
                    ctx,
                )

        assert exc_info.value.status_code == 400
        assert REPORT_STATE_MACHINE_SIGNAL_NAMESPACED_TOOL_NAME in str(
            exc_info.value.detail
        )


@pytest.mark.asyncio
async def test_state_machine_runner_waits_for_all_completed_children_before_and_gate_fires(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        (
            start_section_id,
            _,
            gate_section_id,
            end_section_id,
        ) = await _seed_state_machine_gate_chat_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
            gate_type=StateMachineGateType.AND,
        )

        state, _, agent_runner, _ = _build_runtime_state(
            project_fixture,
            settings_fixture,
        )
        child_runs: list[AgentRun] = []

        def _capture_start_run(profile, inputs, **_kwargs):
            run = create_agent_run(profile_id=profile.id, inputs=inputs)
            save_agent_run(project_fixture.dbe, run)
            child_runs.append(run)
            return run

        monkeypatch.setattr(agent_runner, "start_run", _capture_start_run)

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )

            # An AND gate must keep waiting after the first completion and only
            # fire once every required upstream completion has arrived.
            first_child_run = child_runs[0]
            first_child_run.status = AgentRunStatus.completed
            save_agent_run(project_fixture.dbe, first_child_run)
            latest_waiting = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )

            second_child_run = child_runs[1]
            second_child_run.status = AgentRunStatus.completed
            save_agent_run(project_fixture.dbe, second_child_run)
            latest_completed = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )

        assert started.status == AgentRunStatus.running
        assert latest_waiting.status == AgentRunStatus.running
        assert latest_waiting.outputs is not None
        assert latest_waiting.outputs["gateStatusBySectionId"] == {
            str(gate_section_id): "waiting"
        }
        assert latest_waiting.outputs["firedGateSectionIds"] == []
        assert latest_waiting.outputs["reachedEndSectionIds"] == []

        assert latest_completed.status == AgentRunStatus.completed
        assert latest_completed.outputs is not None
        assert latest_completed.outputs["processedChildTerminalRunIds"] == [
            str(first_child_run.id),
            str(second_child_run.id),
        ]
        assert latest_completed.outputs["firedGateSectionIds"] == [str(gate_section_id)]
        assert latest_completed.outputs["gateStatusBySectionId"] == {
            str(gate_section_id): "satisfied"
        }
        assert latest_completed.outputs["reachedEndSectionIds"] == [str(end_section_id)]
        assert [event.type for event in latest_completed.events[-6:]] == [
            "child_run_completed",
            "child_run_edges_activated",
            "gate_input_activated",
            "gate_satisfied",
            "end_reached",
            "run_completed",
        ]


@pytest.mark.asyncio
async def test_state_machine_runner_blocks_and_gate_when_required_completion_becomes_impossible(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        (
            start_section_id,
            _,
            gate_section_id,
            _,
        ) = await _seed_state_machine_gate_chat_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
            gate_type=StateMachineGateType.AND,
        )

        state, _, agent_runner, _ = _build_runtime_state(
            project_fixture,
            settings_fixture,
        )
        child_runs: list[AgentRun] = []
        stopped_child_run_ids: list[ID] = []

        def _capture_start_run(profile, inputs, **_kwargs):
            run = create_agent_run(profile_id=profile.id, inputs=inputs)
            save_agent_run(project_fixture.dbe, run)
            child_runs.append(run)
            return run

        async def _capture_stop_run(run_id: ID):
            stopped_child_run_ids.append(run_id)
            child_run = next(run for run in child_runs if run.id == run_id)
            child_run.status = AgentRunStatus.cancelled
            save_agent_run(project_fixture.dbe, child_run)
            return child_run

        monkeypatch.setattr(agent_runner, "start_run", _capture_start_run)
        monkeypatch.setattr(agent_runner, "stop_run", _capture_stop_run)

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )

            # Once one required run_completed edge becomes impossible, the AND
            # gate should block immediately and cancel any remaining child runs.
            first_child_run = child_runs[0]
            first_child_run.status = AgentRunStatus.failed
            save_agent_run(project_fixture.dbe, first_child_run)
            latest = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )

        assert started.status == AgentRunStatus.running
        assert latest.status == AgentRunStatus.failed
        assert latest.outputs is not None
        assert latest.outputs["gateStatusBySectionId"] == {
            str(gate_section_id): "blocked"
        }
        assert latest.outputs["blockedGateSectionIds"] == [str(gate_section_id)]
        blocked_detail = latest.outputs["blockedGateDetailsBySectionId"][
            str(gate_section_id)
        ]
        assert blocked_detail["gateType"] == "AND"
        assert blocked_detail["gateSectionId"] == str(gate_section_id)
        assert len(blocked_detail["requiredEdgeIds"]) == 2
        assert len(blocked_detail["impossibleEdgeIds"]) == 2
        assert latest.outputs["activeChildRunIds"] == []
        assert latest.outputs["processedChildTerminalRunIds"] == [
            str(first_child_run.id)
        ]
        failure_summary = latest.outputs["failureSummary"]
        assert failure_summary["reason"] == "run_blocked"
        assert failure_summary["message"] == "Workflow blocked at gate Join."
        assert failure_summary["details"]["gateSectionIds"] == [str(gate_section_id)]
        assert stopped_child_run_ids == [child_runs[1].id]
        assert [event.type for event in latest.events[-5:]] == [
            "child_run_failed",
            "gate_blocked",
            "child_runs_cancelled",
            "run_blocked",
            "run_failed",
        ]
        assert len(latest.events[-4].payload["impossibleEdgeIds"]) == 1


@pytest.mark.parametrize(
    "gate_type", [StateMachineGateType.OR, StateMachineGateType.XOR]
)
@pytest.mark.asyncio
async def test_state_machine_runner_blocks_or_and_xor_when_all_matching_outputs_are_exhausted(
    gate_type: StateMachineGateType,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        (
            start_section_id,
            _,
            gate_section_id,
            _,
        ) = await _seed_state_machine_gate_chat_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
            gate_type=gate_type,
        )

        state, _, agent_runner, _ = _build_runtime_state(
            project_fixture,
            settings_fixture,
        )
        child_runs: list[AgentRun] = []

        def _capture_start_run(profile, inputs, **_kwargs):
            run = create_agent_run(profile_id=profile.id, inputs=inputs)
            save_agent_run(project_fixture.dbe, run)
            child_runs.append(run)
            return run

        monkeypatch.setattr(agent_runner, "start_run", _capture_start_run)

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )

            # OR and XOR stay viable while a qualifying completion is still
            # possible, but should block once every candidate run_completed edge
            # is exhausted by terminal failures.
            for child_run in child_runs:
                child_run.status = AgentRunStatus.failed
                save_agent_run(project_fixture.dbe, child_run)
            latest = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )

        assert started.status == AgentRunStatus.running
        assert latest.status == AgentRunStatus.failed
        assert latest.outputs is not None
        assert latest.outputs["gateStatusBySectionId"] == {
            str(gate_section_id): "blocked"
        }
        assert latest.outputs["blockedGateSectionIds"] == [str(gate_section_id)]
        blocked_detail = latest.outputs["blockedGateDetailsBySectionId"][
            str(gate_section_id)
        ]
        assert blocked_detail["gateType"] == gate_type.value
        assert len(blocked_detail["requiredEdgeIds"]) == 2
        assert len(blocked_detail["impossibleEdgeIds"]) == 2
        assert latest.outputs["reachedEndSectionIds"] == []
        assert latest.outputs["activeChildRunIds"] == []
        failure_summary = latest.outputs["failureSummary"]
        assert failure_summary["reason"] == "run_blocked"
        assert failure_summary["message"] == "Workflow blocked at gate Join."
        assert failure_summary["details"]["gateSectionIds"] == [str(gate_section_id)]
        assert [event.type for event in latest.events[-3:]] == [
            "gate_blocked",
            "run_blocked",
            "run_failed",
        ]


@pytest.mark.parametrize(
    "gate_type", [StateMachineGateType.OR, StateMachineGateType.XOR]
)
@pytest.mark.asyncio
async def test_state_machine_runner_gate_types_or_and_xor_fire_after_single_completion(
    gate_type: StateMachineGateType,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        (
            start_section_id,
            _,
            gate_section_id,
            end_section_id,
        ) = await _seed_state_machine_gate_chat_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
            gate_type=gate_type,
        )

        state, _, agent_runner, _ = _build_runtime_state(
            project_fixture,
            settings_fixture,
        )
        child_runs: list[AgentRun] = []

        def _capture_start_run(profile, inputs, **_kwargs):
            run = create_agent_run(profile_id=profile.id, inputs=inputs)
            save_agent_run(project_fixture.dbe, run)
            child_runs.append(run)
            return run

        monkeypatch.setattr(agent_runner, "start_run", _capture_start_run)

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )

            # OR and XOR should advance as soon as one qualifying completion arrives.
            first_child_run = child_runs[0]
            first_child_run.status = AgentRunStatus.completed
            save_agent_run(project_fixture.dbe, first_child_run)
            latest = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )

        assert started.status == AgentRunStatus.running
        assert latest.status == AgentRunStatus.completed
        assert latest.outputs is not None
        assert latest.outputs["processedChildTerminalRunIds"] == [
            str(first_child_run.id)
        ]
        assert latest.outputs["firedGateSectionIds"] == [str(gate_section_id)]
        assert latest.outputs["reachedEndSectionIds"] == [str(end_section_id)]


@pytest.mark.asyncio
async def test_state_machine_runner_reset_thread_clears_chat_and_stops_running_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        start_section_id, chat_section_id, _ = await _seed_state_machine_chat_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
            target_action=StateMachineTargetAction(
                type=StateMachineTargetActionType.reset_thread,
                stopIfRunning=True,
            ),
        )
        existing_chat_id = ID("chat-reset-target")
        await project_fixture.manager.set_chat_section_chat_id(
            SetChatSectionChatIdRequest(
                projectConfigId=project_config_id,
                sectionId=chat_section_id,
                chatId=existing_chat_id,
            )
        )
        running_run = create_agent_run(
            profile_id=None,
            inputs={
                "runType": LLM_CHAT_RUN_TYPE,
                "chatId": str(existing_chat_id),
                "projectConfigId": str(project_config_id),
                "engineConfigId": str(engine_config_id),
                "messages": [
                    UserChatMessage(
                        content=[MessageTextContent(text="Existing review thread")],
                    ).model_dump(mode="json")
                ],
            },
        )
        save_agent_run(project_fixture.dbe, running_run)

        state, _, agent_runner, _ = _build_runtime_state(
            project_fixture,
            settings_fixture,
        )
        stopped_run_ids: list[ID] = []

        async def _capture_stop_run(run_id: ID):
            stopped_run_ids.append(run_id)
            running_run.status = AgentRunStatus.cancelled
            return running_run

        monkeypatch.setattr(agent_runner, "stop_run", _capture_stop_run)

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )

        assert stopped_run_ids == [running_run.id]
        chat_impl = _get_chat_section_impl(
            project_fixture,
            project_config_id,
            chat_section_id,
        )
        assert chat_impl.chatId is None
        assert started.outputs is not None
        assert started.outputs["dispatchedStartEdgeActions"] == [
            {
                "edgeId": started.outputs["startOutgoingEdgeIds"][0],
                "actionType": "reset_thread",
                "targetSectionId": str(chat_section_id),
                "clearedChatId": str(existing_chat_id),
                "stoppedRunId": str(running_run.id),
            }
        ]
        assert [event.type for event in started.events] == [
            "run_started",
            "graph_resolved",
            "start_edges_activated",
            "start_edge_action_reset",
            "start_edge_actions_dispatched",
        ]


@pytest.mark.asyncio
async def test_state_machine_runner_stop_cancels_running_child_runs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        start_section_id, _, _ = await _seed_state_machine_chat_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
            target_action=StateMachineTargetAction(
                type=StateMachineTargetActionType.send_prompt,
                inlinePrompt="Review this branch carefully.",
                threadStrategy=StateMachineThreadStrategy.new_thread_before_send,
            ),
        )

        state, _, agent_runner, _ = _build_runtime_state(
            project_fixture,
            settings_fixture,
        )
        child_runs: list[AgentRun] = []
        stopped_child_run_ids: list[ID] = []

        def _capture_start_run(profile, inputs, **_kwargs):
            run = create_agent_run(profile_id=profile.id, inputs=inputs)
            save_agent_run(project_fixture.dbe, run)
            child_runs.append(run)
            return run

        async def _capture_stop_run(run_id: ID):
            stopped_child_run_ids.append(run_id)
            child_run = child_runs[0]
            child_run.status = AgentRunStatus.cancelled
            save_agent_run(project_fixture.dbe, child_run)
            return child_run

        monkeypatch.setattr(agent_runner, "start_run", _capture_start_run)
        monkeypatch.setattr(agent_runner, "stop_run", _capture_stop_run)

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )
            stopped = await route_stop_state_machine_run(
                StopStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            latest = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )

        assert child_runs
        assert stopped.alreadyStopped is False
        assert stopped.stoppedRunId == started.id
        assert stopped_child_run_ids == [child_runs[0].id]
        assert latest.status == AgentRunStatus.cancelled
        assert latest.events[-2].type == "child_runs_cancelled"
        assert latest.events[-2].payload == {"childRunIds": [str(child_runs[0].id)]}
        assert latest.events[-1].type == "run_cancelled"


@pytest.mark.asyncio
async def test_state_machine_runner_reset_clears_latest_running_machine_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        engine_config_id = ID("engine-primary")
        _seed_engine_config(project_fixture.dbe, engine_config_id)
        start_section_id, _, _ = await _seed_state_machine_chat_graph(
            project_fixture=project_fixture,
            project_config_id=project_config_id,
            engine_config_id=engine_config_id,
            target_action=StateMachineTargetAction(
                type=StateMachineTargetActionType.send_prompt,
                inlinePrompt="Review this branch carefully.",
                threadStrategy=StateMachineThreadStrategy.new_thread_before_send,
            ),
        )

        state, _, agent_runner, _ = _build_runtime_state(
            project_fixture,
            settings_fixture,
        )
        child_runs: list[AgentRun] = []
        stopped_child_run_ids: list[ID] = []

        def _capture_start_run(profile, inputs, **_kwargs):
            run = create_agent_run(profile_id=profile.id, inputs=inputs)
            save_agent_run(project_fixture.dbe, run)
            child_runs.append(run)
            return run

        async def _capture_stop_run(run_id: ID):
            stopped_child_run_ids.append(run_id)
            child_run = child_runs[0]
            child_run.status = AgentRunStatus.cancelled
            save_agent_run(project_fixture.dbe, child_run)
            return child_run

        monkeypatch.setattr(agent_runner, "start_run", _capture_start_run)
        monkeypatch.setattr(agent_runner, "stop_run", _capture_stop_run)

        with runtime_context(state) as ctx:
            started = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    startSectionId=start_section_id,
                ),
                ctx,
            )
            reset = await route_reset_state_machine(
                ResetStateMachineRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            with pytest.raises(HTTPException) as exc_info:
                await route_get_state_machine_run(
                    GetStateMachineRunRequest(
                        projectConfigId=project_config_id,
                        machineGroupId="workflow-main",
                    ),
                    ctx,
                )

        assert exc_info.value.status_code == 404
        assert child_runs
        assert reset.alreadyStopped is False
        assert reset.stoppedRunId == started.id
        assert stopped_child_run_ids == [child_runs[0].id]

        reset_run = load_agent_run(project_fixture.dbe, started.id)
        assert reset_run is not None
        assert reset_run.status == AgentRunStatus.cancelled
        assert reset_run.outputs is not None
        assert reset_run.outputs["machineStateCleared"] is True
        assert isinstance(reset_run.outputs["machineStateClearedAt"], str)
        assert reset_run.outputs["childRunIds"] == []
        assert reset_run.outputs["activeChildRunIds"] == []
        assert reset_run.events[-3].type == "child_runs_cancelled"
        assert reset_run.events[-2].type == "run_cancelled"
        assert reset_run.events[-1].type == "run_reset"


@pytest.mark.asyncio
async def test_state_machine_run_routes_reject_draft_machine_groups_without_end_sections() -> (
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

        start_response = await project_fixture.manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.StateMachineStart,
                position=Position(x=0, y=0),
            ),
        )
        await project_fixture.manager.set_state_machine_section_settings(
            SetStateMachineSectionSettingsRequest(
                projectConfigId=project_config_id,
                sectionId=start_response.sectionId,
                machineGroupId="workflow-main",
                label="Draft Start",
            )
        )

        state, _, _, _ = _build_runtime_state(project_fixture, settings_fixture)

        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc_info:
                await route_start_state_machine_run(
                    StartStateMachineRunRequest(
                        projectConfigId=project_config_id,
                        machineGroupId="workflow-main",
                        startSectionId=start_response.sectionId,
                    ),
                    ctx,
                )

        assert exc_info.value.status_code == 400
        assert "at least one End" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_state_machine_run_routes_reject_missing_machine_group() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None
        await project_fixture.manager.finish_pending_operations()

        state, _, _, _ = _build_runtime_state(project_fixture, settings_fixture)

        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc_info:
                await route_start_state_machine_run(
                    StartStateMachineRunRequest(
                        projectConfigId=project_config_id,
                        machineGroupId="missing-machine",
                    ),
                    ctx,
                )

        assert exc_info.value.status_code == 404
        assert "missing-machine" in str(exc_info.value.detail)
