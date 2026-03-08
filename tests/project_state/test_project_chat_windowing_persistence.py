import asyncio

import pytest
from setta.project_state.project_manager_types import (
    CreateWindowSpaceRequest,
    SaveAsNewProjectConfigRequest,
    SetProjectChatWindowingStateRequest,
)
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.helpers_lvl2 import create_top_level_section
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
)
from setta.types.section_impls import ChatSectionImpl, SectionType
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
        assert set(created_window_space.windowsById.keys()) == {
            "project-chat-window-1"
        }
        assert "project-chat-window-3" not in created_window_space.windowsById
        persisted_window_space = manager.get_single_config_state(
            project_config_id
        ).projectConfig.windowSpaces[created_window_space.id]
        assert persisted_window_space.order == ["project-chat-window-1"]


@pytest.mark.asyncio
async def test_reserve_linked_chat_section_chat_id_reuses_one_pending_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Concurrent first-run reservations must converge on one chat id and allocate it once.
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

        allocated_ids: list[ID] = []

        def _fake_create_new_id() -> ID:
            next_id = ID("reserved-chat-1")
            allocated_ids.append(next_id)
            return next_id

        monkeypatch.setattr(
            "setta.project_state.base_project_manager.create_new_id",
            _fake_create_new_id,
        )

        first_chat_id, second_chat_id = await asyncio.gather(
            manager.reserve_linked_chat_section_chat_id(project_config_id, section_id),
            manager.reserve_linked_chat_section_chat_id(project_config_id, section_id),
        )

        assert first_chat_id == ID("reserved-chat-1")
        assert second_chat_id == ID("reserved-chat-1")
        assert allocated_ids == [ID("reserved-chat-1")]
        current_project_state = manager.get_single_config_state(project_config_id)
        assert (
            get_curr_effective_section_impl_with_type_guard(
                current_project_state,
                section_id,
                ChatSectionImpl,
            ).chatId
            == ID("reserved-chat-1")
        )


@pytest.mark.asyncio
async def test_release_linked_chat_section_chat_start_failure_clears_only_unstarted_binding() -> (
    None
):
    # Failed admissions should clear fresh reservations, but keep the binding once another caller started a run.
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

        failed_chat_id = await manager.reserve_linked_chat_section_chat_id(
            project_config_id,
            section_id,
        )
        await manager.release_linked_chat_section_chat_start_failure(
            project_config_id,
            section_id,
            failed_chat_id,
        )
        current_project_state = manager.get_single_config_state(project_config_id)
        assert (
            get_curr_effective_section_impl_with_type_guard(
                current_project_state,
                section_id,
                ChatSectionImpl,
            ).chatId
            is None
        )

        first_pending_chat_id, second_pending_chat_id = await asyncio.gather(
            manager.reserve_linked_chat_section_chat_id(project_config_id, section_id),
            manager.reserve_linked_chat_section_chat_id(project_config_id, section_id),
        )
        assert first_pending_chat_id == second_pending_chat_id

        await manager.mark_linked_chat_section_chat_start_succeeded(
            project_config_id,
            section_id,
            first_pending_chat_id,
        )
        await manager.release_linked_chat_section_chat_start_failure(
            project_config_id,
            section_id,
            second_pending_chat_id,
        )

        current_project_state = manager.get_single_config_state(project_config_id)
        assert (
            get_curr_effective_section_impl_with_type_guard(
                current_project_state,
                section_id,
                ChatSectionImpl,
            ).chatId
            == first_pending_chat_id
        )


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
