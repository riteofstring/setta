import pytest

from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    create_top_level_section,
    set_project_chat_window_chat_id,
    set_project_chat_windowing_state,
)
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import (
    ChatWindowMode,
    ChatWindowPlacement,
    ProjectChatWindowingState,
    ProjectChatWindowInstance,
    ProjectStateSingleConfig,
)
from setta.types.section_impls import SectionType


def test_project_state_defaults_project_chat_windowing() -> None:
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="x"))

    assert project_state.projectChatWindowing.instancesById == {}
    assert project_state.projectChatWindowing.order == []
    assert project_state.projectChatWindowing.nextInstanceNumber == 1


def test_set_project_chat_windowing_state_replaces_runtime_state() -> None:
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="x"))
    instance = ProjectChatWindowInstance(
        instanceId="project-chat-window-1",
        placement=ChatWindowPlacement.floating,
    )
    next_state = ProjectChatWindowingState(
        instancesById={instance.instanceId: instance},
        order=[instance.instanceId],
        nextInstanceNumber=2,
    )

    set_project_chat_windowing_state(project_state, next_state)

    assert project_state.projectChatWindowing.instancesById == {
        instance.instanceId: instance
    }
    assert project_state.projectChatWindowing.order == [instance.instanceId]
    assert project_state.projectChatWindowing.nextInstanceNumber == 2


def test_set_project_chat_window_chat_id_updates_the_target_window() -> None:
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="x"))
    instance = ProjectChatWindowInstance(
        instanceId="project-chat-window-1",
        placement=ChatWindowPlacement.floating,
        chatId=None,
    )
    project_state.projectChatWindowing = ProjectChatWindowingState(
        instancesById={instance.instanceId: instance},
        order=[instance.instanceId],
        nextInstanceNumber=2,
    )

    set_project_chat_window_chat_id(
        project_state,
        instance.instanceId,
        "chat-after",
    )

    assert (
        project_state.projectChatWindowing.instancesById[instance.instanceId].chatId
        == "chat-after"
    )


def test_set_project_chat_window_chat_id_requires_an_existing_window() -> None:
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="x"))

    with pytest.raises(
        KeyError,
        match="Project chat window project-chat-window-1 not found.",
    ):
        set_project_chat_window_chat_id(
            project_state,
            "project-chat-window-1",
            "chat-after",
        )


def test_project_state_normalizes_project_chat_windowing_for_missing_sections() -> None:
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="x"))
    section_id = create_top_level_section(
        SettingsState(),
        project_state,
        SectionType.Chat,
        Position(),
    )
    valid_window = ProjectChatWindowInstance(
        instanceId="project-chat-window-1",
        placement=ChatWindowPlacement.floating,
        sectionIdOrNull=section_id,
    )
    missing_window = ProjectChatWindowInstance(
        instanceId="project-chat-window-2",
        placement=ChatWindowPlacement.bottom_docked,
        sectionIdOrNull="missing-section",
    )

    project_state.projectChatWindowing = ProjectChatWindowingState(
        instancesById={
            valid_window.instanceId: valid_window,
            missing_window.instanceId: missing_window,
        },
        order=[
            missing_window.instanceId,
            valid_window.instanceId,
            valid_window.instanceId,
            "ghost-window",
        ],
        nextInstanceNumber=7,
    )
    project_state.validate_project_chat_windowing()

    assert project_state.projectChatWindowing.instancesById == {
        valid_window.instanceId: valid_window
    }
    assert project_state.projectChatWindowing.order == [valid_window.instanceId]
    assert project_state.projectChatWindowing.nextInstanceNumber == 7


def test_project_state_normalizes_duplicate_section_bindings_to_one_authoritative_window() -> (
    None
):
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="x"))
    section_id = create_top_level_section(
        SettingsState(),
        project_state,
        SectionType.Chat,
        Position(),
    )
    canvas_window = ProjectChatWindowInstance(
        instanceId="project-chat-window-1",
        placement=ChatWindowPlacement.canvas_section,
        sectionIdOrNull=section_id,
        zIndex=1,
    )
    floating_window = ProjectChatWindowInstance(
        instanceId="project-chat-window-2",
        placement=ChatWindowPlacement.floating,
        sectionIdOrNull=section_id,
        zIndex=10,
    )

    project_state.projectChatWindowing = ProjectChatWindowingState(
        instancesById={
            canvas_window.instanceId: canvas_window,
            floating_window.instanceId: floating_window,
        },
        order=[floating_window.instanceId, canvas_window.instanceId],
        nextInstanceNumber=3,
    )
    project_state.validate_project_chat_windowing()

    assert project_state.projectChatWindowing.instancesById == {
        canvas_window.instanceId: canvas_window
    }
    assert project_state.projectChatWindowing.order == [canvas_window.instanceId]
    assert project_state.projectChatWindowing.nextInstanceNumber == 3


def test_project_state_normalizes_exact_section_binding_ties_by_instance_id() -> None:
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="x"))
    section_id = create_top_level_section(
        SettingsState(),
        project_state,
        SectionType.Chat,
        Position(),
    )
    lower_id_window = ProjectChatWindowInstance(
        instanceId="project-chat-window-1",
        placement=ChatWindowPlacement.floating,
        sectionIdOrNull=section_id,
        zIndex=9,
        lastFocusedAt=100,
    )
    higher_id_window = ProjectChatWindowInstance(
        instanceId="project-chat-window-2",
        placement=ChatWindowPlacement.floating,
        sectionIdOrNull=section_id,
        zIndex=9,
        lastFocusedAt=100,
    )

    project_state.projectChatWindowing = ProjectChatWindowingState(
        instancesById={
            lower_id_window.instanceId: lower_id_window,
            higher_id_window.instanceId: higher_id_window,
        },
        order=[lower_id_window.instanceId, higher_id_window.instanceId],
        nextInstanceNumber=3,
    )
    project_state.validate_project_chat_windowing()

    assert project_state.projectChatWindowing.instancesById == {
        higher_id_window.instanceId: higher_id_window
    }
    assert project_state.projectChatWindowing.order == [higher_id_window.instanceId]


def test_project_state_normalizes_section_window_titles_to_none() -> None:
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="x"))
    section_id = create_top_level_section(
        SettingsState(),
        project_state,
        SectionType.Chat,
        Position(),
    )
    section_window = ProjectChatWindowInstance(
        instanceId="project-chat-window-1",
        placement=ChatWindowPlacement.floating,
        sectionIdOrNull=section_id,
        title="Saved Section Chat",
    )
    project_state.projectChatWindowing = ProjectChatWindowingState(
        instancesById={section_window.instanceId: section_window},
        order=[section_window.instanceId],
        nextInstanceNumber=2,
    )

    project_state.validate_project_chat_windowing()

    assert (
        project_state.projectChatWindowing.instancesById[
            section_window.instanceId
        ].title
        is None
    )


def test_project_chat_windowing_rejects_section_mode_without_section_binding() -> None:
    # Section-mode runtime windows must always point at a concrete section owner.
    with pytest.raises(
        ValueError,
        match="Project chat section_mode windows require sectionIdOrNull",
    ):
        ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="x"),
            projectChatWindowing=ProjectChatWindowingState(
                instancesById={
                    "project-chat-window-1": ProjectChatWindowInstance(
                        instanceId="project-chat-window-1",
                        placement=ChatWindowPlacement.floating,
                        mode=ChatWindowMode.section_mode,
                        sectionIdOrNull=None,
                    )
                },
                order=["project-chat-window-1"],
            ),
        )


def test_project_chat_windowing_rejects_git_graph_section_binding() -> None:
    # Git-graph windows are project-level surfaces and cannot carry section bindings.
    with pytest.raises(
        ValueError,
        match="Project chat git_graph_mode windows cannot carry sectionIdOrNull",
    ):
        ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="x"),
            projectChatWindowing=ProjectChatWindowingState(
                instancesById={
                    "project-chat-window-1": ProjectChatWindowInstance(
                        instanceId="project-chat-window-1",
                        placement=ChatWindowPlacement.floating,
                        mode=ChatWindowMode.git_graph_mode,
                        sectionIdOrNull="section-1",
                    )
                },
                order=["project-chat-window-1"],
            ),
        )
