import pytest
from setta.agentic.store import save_engine_configs
from setta.llm.config import save_llm_config
from setta.project_state.linked_chat_admission import LinkedChatAdmissionError
from setta.types.agentic import EngineConfig, EngineType
from setta.types.agentic_edges import AgenticEdge, AgenticEdgeKind
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.project_state.project_manager_types import (
    CreateWindowSpaceRequest,
    SaveAsNewProjectConfigRequest,
    SetChatSectionSettingsRequest,
    SetProjectChatWindowingStateRequest,
)
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.helpers_lvl2 import (
    create_agentic_edge,
    create_top_level_section,
    set_chat_section_chat_id,
    set_chat_section_settings,
)
from setta.types.id import ID
from setta.types.project_config import (
    Position,
    ProjectConfig,
    WindowSpaceConfig,
    WindowSpaceState,
    WindowSpaceWindow,
)
from setta.types.project_state import (
    ChatWindowBounds,
    ChatWindowMode,
    ChatWindowPlacement,
    ProjectChatWindowingState,
    ProjectChatWindowInstance,
    ProjectStateBackend,
    ProjectStateSingleConfig,
    normalize_project_state_backend_payload,
)
from setta.types.section_impls import (
    ChatDictationMode,
    ChatPermissionMode,
    ChatSectionImpl,
    SectionType,
)
from setta.types.generated.settings_state import SettingsState

from tests.utils.manager_fixture import real_project_manager


def _seed_linked_chat_runtime(manager) -> ID:
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
        manager.dbe,
    )
    engine_config_id = ID("engine-linked")
    save_engine_configs(
        manager.dbe,
        [
            EngineConfig(
                id=engine_config_id,
                name="Linked engine",
                engineType=EngineType.setta_llm,
                settaLlmConfigId=ID("primary"),
            )
        ],
    )
    return engine_config_id


def test_merge_single_config_round_trips_project_chat_windowing() -> None:
    # Persist a non-default windowing payload into backend state, then read it back.
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="windowing-round-trip"),
        projectChatWindowing=ProjectChatWindowingState(
            instancesById={
                "project-chat-window-1": ProjectChatWindowInstance(
                    instanceId="project-chat-window-1",
                    placement=ChatWindowPlacement.floating,
                    mode=ChatWindowMode.project_ai_mode,
                    chatId="chat-1",
                    zIndex=4,
                    bounds=ChatWindowBounds(
                        x=48,
                        y=64,
                        width=520,
                        height=360,
                    ),
                )
            },
            order=["project-chat-window-1"],
            nextInstanceNumber=2,
        ),
    )

    backend = merge_single_config_into_backend(ProjectStateBackend(), project_state)
    round_tripped = convert_backend_to_single_config(
        backend,
        project_state.projectConfig.id,
    )

    assert round_tripped.projectChatWindowing == project_state.projectChatWindowing


def test_merge_single_config_preserves_windowing_per_project_config() -> None:
    # Each project config should keep its own windowing state instead of sharing one default.
    first_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="windowing-first"),
        projectChatWindowing=ProjectChatWindowingState(
            instancesById={
                "project-chat-window-1": ProjectChatWindowInstance(
                    instanceId="project-chat-window-1",
                    placement=ChatWindowPlacement.bottom_docked,
                    mode=ChatWindowMode.project_ai_mode,
                    chatId="chat-first",
                )
            },
            order=["project-chat-window-1"],
            nextInstanceNumber=2,
        ),
    )
    second_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="windowing-second"),
        projectChatWindowing=ProjectChatWindowingState(
            instancesById={
                "project-chat-window-7": ProjectChatWindowInstance(
                    instanceId="project-chat-window-7",
                    placement=ChatWindowPlacement.floating,
                    mode=ChatWindowMode.section_mode,
                    sectionIdOrNull="section-7",
                    chatId="chat-second",
                )
            },
            order=["project-chat-window-7"],
            nextInstanceNumber=8,
        ),
    )

    backend = merge_single_config_into_backend(ProjectStateBackend(), first_state)
    backend = merge_single_config_into_backend(backend, second_state)

    first_round_trip = convert_backend_to_single_config(
        backend,
        first_state.projectConfig.id,
    )
    second_round_trip = convert_backend_to_single_config(
        backend,
        second_state.projectConfig.id,
    )

    assert first_round_trip.projectChatWindowing == first_state.projectChatWindowing
    assert second_round_trip.projectChatWindowing == second_state.projectChatWindowing


def test_project_state_backend_normalizes_authoritative_windowing_payloads() -> None:
    project_config = ProjectConfig(name="missing-windowing")
    backend = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        projectChatWindowingByProjectConfigId={project_config.id: {}},
    )

    assert backend.projectChatWindowingByProjectConfigId[project_config.id] == (
        ProjectChatWindowingState()
    )


def test_normalize_project_state_backend_payload_backfills_missing_windowing_entries() -> (
    None
):
    project_config = ProjectConfig(id="cfg-1", name="legacy-windowing")
    normalized_payload, did_change = normalize_project_state_backend_payload(
        {
            "projectConfigs": {
                project_config.id: project_config.model_dump(mode="json"),
            },
            "defaultProjectConfigId": project_config.id,
        }
    )

    assert did_change is True
    assert normalized_payload["projectChatWindowingByProjectConfigId"] == {
        project_config.id: ProjectChatWindowingState().model_dump(mode="json")
    }


@pytest.mark.asyncio
async def test_load_project_config_backfills_missing_authoritative_windowing() -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        project_config_id = manager.project_state_backend.defaultProjectConfigId
        if project_config_id is None:
            raise AssertionError("Expected a default project config id.")
        persisted_payload = fixture.dbe.read_json(fixture.dbe.project)
        persisted_payload.pop("projectChatWindowingByProjectConfigId", None)
        fixture.dbe.write_json(fixture.dbe.project, persisted_payload)

        manager.project_state_backend = manager.load_initial_state()
        loaded_project_state = await manager.load_project_config(project_config_id)

        assert loaded_project_state.projectChatWindowing == ProjectChatWindowingState()
        assert fixture.dbe.read_json(fixture.dbe.project)[
            "projectChatWindowingByProjectConfigId"
        ] == {project_config_id: ProjectChatWindowingState().model_dump(mode="json")}


@pytest.mark.asyncio
async def test_set_chat_section_settings_preserves_linked_chat_edges_when_target_becomes_non_executable_for_real_manager() -> (
    None
):
    async with real_project_manager() as fixture:
        manager = fixture.manager
        (
            project_config_id,
            caller_section_id,
            target_section_id,
        ) = await _create_linked_chat_sections(manager)
        expected_edge = AgenticEdge(
            id=ID("edge-linked"),
            sourceSectionId=caller_section_id,
            targetSectionId=target_section_id,
            kind=AgenticEdgeKind.chat_chat,
        )
        project_state = manager.get_single_config_state(project_config_id)
        assert project_state.projectConfig.agenticEdges == [expected_edge]

        await manager.set_chat_section_settings(
            SetChatSectionSettingsRequest(
                projectConfigId=project_config_id,
                sectionId=target_section_id,
                managed=False,
                engineConfigId=None,
                transcriptionProfileId=None,
                agentProfileId=None,
                thinking=False,
                permissionMode=ChatPermissionMode.minimal,
                searchEnabled=True,
                dictationMode=ChatDictationMode.auto,
            )
        )

        project_state = manager.get_single_config_state(project_config_id)
        assert project_state.projectConfig.agenticEdges == [expected_edge]

        with pytest.raises(LinkedChatAdmissionError) as exc_info:
            await manager.admit_linked_chat_section_invocation(
                project_config_id,
                caller_section_id,
                target_section_id,
            )
        assert exc_info.value.reason == "unsupported_scriptable_target"
        project_state = manager.get_single_config_state(project_config_id)
        assert project_state.projectConfig.agenticEdges == [expected_edge]


@pytest.mark.asyncio
async def test_set_project_chat_windowing_state_returns_backend_normalized_state() -> (
    None
):
    # The authoritative sync response must reflect backend normalization, not the raw request payload.
    async with real_project_manager() as fixture:
        manager = fixture.manager
        project_config_id = manager.project_state_backend.defaultProjectConfigId
        if project_config_id is None:
            raise AssertionError("Expected a default project config id.")
        project_state = manager.get_single_config_state(project_config_id)
        section_id = create_top_level_section(
            SettingsState(),
            project_state,
            SectionType.Chat,
            Position(),
        )
        await manager.update(project_state)

        authoritative = await manager.set_project_chat_windowing_state(
            SetProjectChatWindowingStateRequest(
                projectConfigId=project_config_id,
                state=ProjectChatWindowingState(
                    instancesById={
                        "project-chat-window-1": ProjectChatWindowInstance(
                            instanceId="project-chat-window-1",
                            placement=ChatWindowPlacement.floating,
                            mode=ChatWindowMode.project_ai_mode,
                            title="Workspace Chat",
                            zIndex=1,
                            bounds=ChatWindowBounds(
                                x=48,
                                y=64,
                                width=520,
                                height=360,
                            ),
                        ),
                        "project-chat-window-2": ProjectChatWindowInstance(
                            instanceId="project-chat-window-2",
                            placement=ChatWindowPlacement.canvas_section,
                            mode=ChatWindowMode.section_mode,
                            sectionIdOrNull=section_id,
                            zIndex=2,
                        ),
                        "project-chat-window-3": ProjectChatWindowInstance(
                            instanceId="project-chat-window-3",
                            placement=ChatWindowPlacement.floating,
                            mode=ChatWindowMode.section_mode,
                            sectionIdOrNull=section_id,
                            zIndex=3,
                            bounds=ChatWindowBounds(
                                x=640,
                                y=96,
                                width=420,
                                height=300,
                            ),
                        ),
                    },
                    order=[
                        "project-chat-window-1",
                        "project-chat-window-3",
                        "project-chat-window-2",
                    ],
                    nextInstanceNumber=4,
                ),
            )
        )

        assert authoritative.order == [
            "project-chat-window-1",
            "project-chat-window-2",
        ]
        assert set(authoritative.instancesById.keys()) == {
            "project-chat-window-1",
            "project-chat-window-2",
        }
        assert "project-chat-window-3" not in authoritative.instancesById


@pytest.mark.asyncio
async def test_create_window_space_from_authoritative_windowing_excludes_stale_section_float() -> (
    None
):
    # Saving from the normalized response should not reintroduce the dropped floating section window.
    async with real_project_manager() as fixture:
        manager = fixture.manager
        project_config_id = manager.project_state_backend.defaultProjectConfigId
        if project_config_id is None:
            raise AssertionError("Expected a default project config id.")
        project_state = manager.get_single_config_state(project_config_id)
        section_id = create_top_level_section(
            SettingsState(),
            project_state,
            SectionType.Chat,
            Position(),
        )
        await manager.update(project_state)

        authoritative = await manager.set_project_chat_windowing_state(
            SetProjectChatWindowingStateRequest(
                projectConfigId=project_config_id,
                state=ProjectChatWindowingState(
                    instancesById={
                        "project-chat-window-1": ProjectChatWindowInstance(
                            instanceId="project-chat-window-1",
                            placement=ChatWindowPlacement.floating,
                            mode=ChatWindowMode.project_ai_mode,
                            title="Workspace Chat",
                            zIndex=1,
                            bounds=ChatWindowBounds(
                                x=48,
                                y=64,
                                width=520,
                                height=360,
                            ),
                        ),
                        "project-chat-window-2": ProjectChatWindowInstance(
                            instanceId="project-chat-window-2",
                            placement=ChatWindowPlacement.canvas_section,
                            mode=ChatWindowMode.section_mode,
                            sectionIdOrNull=section_id,
                            zIndex=2,
                        ),
                        "project-chat-window-3": ProjectChatWindowInstance(
                            instanceId="project-chat-window-3",
                            placement=ChatWindowPlacement.floating,
                            mode=ChatWindowMode.section_mode,
                            sectionIdOrNull=section_id,
                            zIndex=3,
                            bounds=ChatWindowBounds(
                                x=640,
                                y=96,
                                width=420,
                                height=300,
                            ),
                        ),
                    },
                    order=[
                        "project-chat-window-1",
                        "project-chat-window-3",
                        "project-chat-window-2",
                    ],
                    nextInstanceNumber=4,
                ),
            )
        )
        authoritative_snapshot = WindowSpaceState(
            windowsById={
                instance_id: WindowSpaceWindow(
                    title=instance.title,
                    sectionIdOrNull=instance.sectionIdOrNull,
                    mode=instance.mode,
                    zIndex=instance.zIndex,
                    normalizedBounds={
                        "x": 0.1,
                        "y": 0.1,
                        "width": 0.5,
                        "height": 0.5,
                    },
                )
                for instance_id, instance in authoritative.instancesById.items()
                if instance.placement == ChatWindowPlacement.floating
            },
            order=[
                instance_id
                for instance_id in authoritative.order
                if authoritative.instancesById[instance_id].placement
                == ChatWindowPlacement.floating
            ],
        )

        created_window_space = await manager.create_window_space(
            CreateWindowSpaceRequest(
                projectConfigId=project_config_id,
                state=authoritative_snapshot,
                name="Focused Layout",
            )
        )

        assert created_window_space.order == ["project-chat-window-1"]
        assert set(created_window_space.windowsById.keys()) == {"project-chat-window-1"}
        assert "project-chat-window-3" not in created_window_space.windowsById
        persisted_window_space = manager.get_single_config_state(
            project_config_id
        ).projectConfig.windowSpaces[created_window_space.id]
        assert persisted_window_space.order == ["project-chat-window-1"]


async def _create_linked_chat_sections(
    manager,
) -> tuple[ID, ID, ID]:
    engine_config_id = _seed_linked_chat_runtime(manager)
    project_config_id = manager.project_state_backend.defaultProjectConfigId
    if project_config_id is None:
        raise AssertionError("Expected a default project config id.")
    project_state = manager.get_single_config_state(project_config_id)
    caller_section_id = create_top_level_section(
        SettingsState(),
        project_state,
        SectionType.Chat,
        Position(),
    )
    target_section_id = create_top_level_section(
        SettingsState(),
        project_state,
        SectionType.Chat,
        Position(),
    )
    set_chat_section_settings(
        project_state,
        target_section_id,
        True,
        engine_config_id,
        None,
        None,
        False,
        ChatPermissionMode.minimal,
        True,
        ChatDictationMode.auto,
    )
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=ID("edge-linked"),
            sourceSectionId=caller_section_id,
            targetSectionId=target_section_id,
            kind=AgenticEdgeKind.chat_chat,
        ),
    )
    await manager.update(project_state)
    return project_config_id, caller_section_id, target_section_id


@pytest.mark.asyncio
async def test_linked_chat_admission_persists_fresh_binding_only_after_start_and_releases_busy_state() -> (
    None
):
    async with real_project_manager() as fixture:
        manager = fixture.manager
        (
            project_config_id,
            caller_section_id,
            target_section_id,
        ) = await _create_linked_chat_sections(manager)
        admission = await manager.admit_linked_chat_section_invocation(
            project_config_id,
            caller_section_id,
            target_section_id,
        )
        current_project_state = manager.get_single_config_state(project_config_id)
        assert (
            get_curr_effective_section_impl_with_type_guard(
                current_project_state,
                target_section_id,
                ChatSectionImpl,
            ).chatId
            is None
        )
        assert (project_config_id, target_section_id) in (
            manager._linked_chat_section_reservations
        )

        await manager.mark_linked_chat_section_chat_start_succeeded(
            project_config_id,
            target_section_id,
            admission.chat_id,
        )
        current_project_state = manager.get_single_config_state(project_config_id)
        assert (
            get_curr_effective_section_impl_with_type_guard(
                current_project_state,
                target_section_id,
                ChatSectionImpl,
            ).chatId
            == admission.chat_id
        )
        with pytest.raises(LinkedChatAdmissionError, match="already handling"):
            await manager.admit_linked_chat_section_invocation(
                project_config_id,
                caller_section_id,
                target_section_id,
            )

        await manager.complete_linked_chat_section_invocation(
            project_config_id,
            target_section_id,
            admission.chat_id,
        )
        assert manager._linked_chat_section_reservations == {}

        second_admission = await manager.admit_linked_chat_section_invocation(
            project_config_id,
            caller_section_id,
            target_section_id,
        )
        assert second_admission.chat_id == admission.chat_id
        await manager.release_linked_chat_section_chat_start_failure(
            project_config_id,
            target_section_id,
            second_admission.chat_id,
        )
        assert manager._linked_chat_section_reservations == {}


@pytest.mark.asyncio
async def test_linked_chat_start_failure_clears_fresh_reservation_without_persisting_chat_id() -> (
    None
):
    async with real_project_manager() as fixture:
        manager = fixture.manager
        (
            project_config_id,
            caller_section_id,
            target_section_id,
        ) = await _create_linked_chat_sections(manager)
        admission = await manager.admit_linked_chat_section_invocation(
            project_config_id,
            caller_section_id,
            target_section_id,
        )
        await manager.release_linked_chat_section_chat_start_failure(
            project_config_id,
            target_section_id,
            admission.chat_id,
        )
        current_project_state = manager.get_single_config_state(project_config_id)
        assert (
            get_curr_effective_section_impl_with_type_guard(
                current_project_state,
                target_section_id,
                ChatSectionImpl,
            ).chatId
            is None
        )
        assert manager._linked_chat_section_reservations == {}


@pytest.mark.asyncio
async def test_linked_chat_start_failure_preserves_existing_binding_and_releases_busy_state() -> (
    None
):
    async with real_project_manager() as fixture:
        manager = fixture.manager
        (
            project_config_id,
            caller_section_id,
            target_section_id,
        ) = await _create_linked_chat_sections(manager)
        project_state = manager.get_single_config_state(project_config_id)
        set_chat_section_chat_id(
            project_state, target_section_id, ID("linked-thread-1")
        )
        await manager.update(project_state)

        admission = await manager.admit_linked_chat_section_invocation(
            project_config_id,
            caller_section_id,
            target_section_id,
        )
        assert admission.chat_id == ID("linked-thread-1")
        with pytest.raises(LinkedChatAdmissionError, match="already handling"):
            await manager.admit_linked_chat_section_invocation(
                project_config_id,
                caller_section_id,
                target_section_id,
            )
        assert get_curr_effective_section_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            target_section_id,
            ChatSectionImpl,
        ).chatId == ID("linked-thread-1")

        await manager.release_linked_chat_section_chat_start_failure(
            project_config_id,
            target_section_id,
            admission.chat_id,
        )
        assert get_curr_effective_section_impl_with_type_guard(
            manager.get_single_config_state(project_config_id),
            target_section_id,
            ChatSectionImpl,
        ).chatId == ID("linked-thread-1")
        assert manager._linked_chat_section_reservations == {}


@pytest.mark.asyncio
async def test_save_as_new_project_config_with_refs_seeds_windowing_and_clears_chat_ids() -> (
    None
):
    async with real_project_manager() as fixture:
        manager = fixture.manager
        project_config_id = manager.project_state_backend.defaultProjectConfigId
        if project_config_id is None:
            raise AssertionError("Expected a default project config id.")
        project_state = manager.get_single_config_state(project_config_id)
        project_state.projectConfig.windowSpaces = {
            "space-1": WindowSpaceConfig(
                id="space-1",
                name="Copied Layout",
                sortIndex=0,
                windowsById={
                    "chat-window": WindowSpaceWindow(
                        title="Project Chat",
                        chatId="source-chat",
                        zIndex=1,
                        normalizedBounds={
                            "x": 0.0,
                            "y": 0.0,
                            "width": 0.5,
                            "height": 0.5,
                        },
                    )
                },
                order=["chat-window"],
            )
        }
        await manager.update(project_state)

        await manager.save_as_new_project_config(
            SaveAsNewProjectConfigRequest(
                projectConfigId=project_config_id,
                newConfigName="Copied Config",
                withRefs=True,
            )
        )

        copied_project_config = next(
            config
            for config in manager.project_state_backend.projectConfigs.values()
            if config.name == "Copied Config"
        )
        copied_window_space = copied_project_config.windowSpaces["space-1"]
        copied_window = copied_window_space.windowsById["chat-window"]

        assert copied_window.chatId is None
        assert (
            manager.project_state_backend.projectChatWindowingByProjectConfigId[
                copied_project_config.id
            ]
            == ProjectChatWindowingState()
        )


@pytest.mark.asyncio
async def test_save_as_new_project_config_without_refs_copies_windowing_layout_and_remaps_sections() -> (
    None
):
    async with real_project_manager() as fixture:
        manager = fixture.manager
        project_config_id = manager.project_state_backend.defaultProjectConfigId
        if project_config_id is None:
            raise AssertionError("Expected a default project config id.")
        project_state = manager.get_single_config_state(project_config_id)
        source_section_id = create_top_level_section(
            SettingsState(),
            project_state,
            SectionType.Chat,
            Position(),
        )
        project_state.sections[source_section_id].displayName = "Copied Chat Section"
        project_state.projectChatWindowing = ProjectChatWindowingState(
            instancesById={
                "project-chat-window-1": ProjectChatWindowInstance(
                    instanceId="project-chat-window-1",
                    placement=ChatWindowPlacement.floating,
                    mode=ChatWindowMode.project_ai_mode,
                    title="Project Chat",
                    chatId="project-chat-1",
                    zIndex=4,
                    bounds=ChatWindowBounds(
                        x=48,
                        y=64,
                        width=520,
                        height=360,
                    ),
                ),
                "project-chat-window-2": ProjectChatWindowInstance(
                    instanceId="project-chat-window-2",
                    placement=ChatWindowPlacement.floating,
                    mode=ChatWindowMode.section_mode,
                    sectionIdOrNull=source_section_id,
                    title="Section Chat",
                    chatId="section-chat-1",
                    zIndex=5,
                    bounds=ChatWindowBounds(
                        x=640,
                        y=96,
                        width=420,
                        height=320,
                    ),
                ),
            },
            order=["project-chat-window-1", "project-chat-window-2"],
            nextInstanceNumber=3,
        )
        await manager.update(project_state)

        await manager.save_as_new_project_config(
            SaveAsNewProjectConfigRequest(
                projectConfigId=project_config_id,
                newConfigName="Copied Config Without Refs",
                withRefs=False,
            )
        )

        copied_project_config = next(
            config
            for config in manager.project_state_backend.projectConfigs.values()
            if config.name == "Copied Config Without Refs"
        )
        copied_state = convert_backend_to_single_config(
            manager.project_state_backend,
            copied_project_config.id,
        )
        copied_section_ids = list(copied_state.projectConfig.sectionVariantMap.keys())
        if len(copied_section_ids) != 1:
            raise AssertionError("Expected exactly one copied section.")
        copied_section_id = copied_section_ids[0]
        copied_windowing = copied_state.projectChatWindowing

        assert copied_section_id != source_section_id
        assert copied_windowing.order == [
            "project-chat-window-1",
            "project-chat-window-2",
        ]
        assert copied_windowing.nextInstanceNumber == 3
        assert copied_windowing.instancesById["project-chat-window-1"].chatId is None
        assert copied_windowing.instancesById["project-chat-window-1"].bounds == (
            ChatWindowBounds(
                x=48,
                y=64,
                width=520,
                height=360,
            )
        )
        assert copied_windowing.instancesById["project-chat-window-2"].chatId is None
        assert (
            copied_windowing.instancesById["project-chat-window-2"].sectionIdOrNull
            == copied_section_id
        )
        assert copied_windowing.instancesById["project-chat-window-2"].bounds == (
            ChatWindowBounds(
                x=640,
                y=96,
                width=420,
                height=320,
            )
        )
