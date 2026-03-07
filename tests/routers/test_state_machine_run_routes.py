import asyncio
from types import SimpleNamespace

from fastapi import HTTPException
import pytest

from setta.agentic.chat_view import LLM_CHAT_RUN_TYPE
from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.agentic.state_machine_runner import STATE_MACHINE_RUN_TYPE, StateMachineRunner
from setta.agentic.store import create_agent_run, save_agent_run, save_engine_configs
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
from setta.types.agentic import AgentRunStatus, EngineConfig, EngineType
from setta.types.chat_messages import MessageTextContent, UserChatMessage
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


def _get_chat_section_impl(project_fixture, project_config_id: ID, section_id: ID) -> ChatSectionImpl:
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
async def test_state_machine_run_routes_start_stop_reset_cycle() -> None:
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

            assert started.status == AgentRunStatus.running
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
            assert [event.type for event in started.events] == [
                "run_started",
                "graph_resolved",
                "start_edges_activated",
            ]

            # Starting the same machine while it is already running must reuse
            # the active parent run instead of creating a duplicate.
            restarted_while_running = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert restarted_while_running.id == started.id

            latest_running = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert latest_running.id == started.id
            assert latest_running.status == AgentRunStatus.running

            stopped = await route_stop_state_machine_run(
                StopStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert stopped.alreadyStopped is False
            assert stopped.stoppedRunId == started.id

            latest_stopped = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert latest_stopped.id == started.id
            assert latest_stopped.status == AgentRunStatus.cancelled
            assert latest_stopped.finishedAt is not None
            assert latest_stopped.events[-1].type == "run_cancelled"

            already_stopped = await route_stop_state_machine_run(
                StopStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert already_stopped.alreadyStopped is True
            assert already_stopped.stoppedRunId is None

            restarted = await route_start_state_machine_run(
                StartStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert restarted.id != started.id
            assert restarted.status == AgentRunStatus.running

            reset = await route_reset_state_machine(
                ResetStateMachineRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert reset.alreadyStopped is False
            assert reset.stoppedRunId == restarted.id

            latest_reset = await route_get_state_machine_run(
                GetStateMachineRunRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                ),
                ctx,
            )
            assert latest_reset.id == restarted.id
            assert latest_reset.status == AgentRunStatus.cancelled


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
            return {
                "edgeId": str(edge.id),
                "actionType": "send_prompt",
                "targetSectionId": str(edge.targetSectionId),
            }

        monkeypatch.setattr(
            state_machine_runner,
            "_activate_edge_action",
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
