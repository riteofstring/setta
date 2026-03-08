from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.project_config import ProjectConfig
from setta.types.project_state import (
    ChatWindowBounds,
    ChatWindowMode,
    ChatWindowPlacement,
    ProjectChatWindowInstance,
    ProjectChatWindowingState,
    ProjectStateBackend,
    ProjectStateSingleConfig,
)


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
