import pytest
from setta.project_state.project_manager_types import SaveAsNewProjectConfigRequest
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.project_config import (
    Position,
    ProjectConfig,
    WindowSpaceConfig,
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
)
from setta.types.section_impls import SectionType
from setta.types.generated.settings_state import SettingsState

from tests.utils.manager_fixture import real_project_manager


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


@pytest.mark.asyncio
async def test_load_project_config_requires_authoritative_windowing() -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        project_config_id = manager.project_state_backend.defaultProjectConfigId
        if project_config_id is None:
            raise AssertionError("Expected a default project config id.")
        manager.project_state_backend.projectChatWindowingByProjectConfigId.pop(
            project_config_id,
            None,
        )

        with pytest.raises(
            KeyError,
            match="Missing project chat windowing state",
        ):
            await manager.load_project_config(project_config_id)


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
