import pytest

from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.generated.settings_state import SettingsState
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    ChartSectionImpl,
    ChatSectionImpl,
    DrawSectionImpl,
    SectionType,
    SectionSize,
    SectionSizeMode,
    StateMachineEndSectionImpl,
    StateMachineGateSectionImpl,
    StateMachineGateType,
    StateMachineStartSectionImpl,
    TaskBoardSectionImpl,
)
from setta.types.settings_state import SectionSizingPolicy
from tests.helpers.project_state_sections import (
    create_child_sections,
    create_top_level_section,
)


def test_section_size_defaults_to_auto_width() -> None:
    size = SectionSize()
    assert size.width == SectionSizeMode.auto


@pytest.mark.parametrize(
    ("impl", "policy_entry"),
    [
        (ChartSectionImpl(), SectionSizingPolicy().byType.Chart),
        (DrawSectionImpl(), SectionSizingPolicy().byType.Draw),
        (ChatSectionImpl(), SectionSizingPolicy().byType.Chat),
        (
            StateMachineStartSectionImpl(),
            SectionSizingPolicy().byType.StateMachineStart,
        ),
        (
            StateMachineGateSectionImpl(),
            SectionSizingPolicy().byType.StateMachineGate,
        ),
        (
            StateMachineEndSectionImpl(),
            SectionSizingPolicy().byType.StateMachineEnd,
        ),
    ],
)
def test_default_section_sizes_meet_policy_minimums(impl, policy_entry) -> None:
    assert isinstance(impl.size.width, (int, float))
    assert isinstance(impl.size.height, (int, float))
    assert impl.size.width >= policy_entry.minWidth
    assert impl.size.height >= policy_entry.minHeight


def test_chat_section_settings_round_trip_without_legacy_skills_field() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="test"))
    section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    chat_impl = get_curr_effective_section_impl_with_type_guard(
        project_state,
        section_id,
        ChatSectionImpl,
    )
    assert "skillsEnabled" not in chat_impl.model_dump(mode="python")

    reloaded = ProjectStateSingleConfig.model_validate(
        project_state.model_dump(mode="python")
    )
    reloaded_chat_impl = get_curr_effective_section_impl_with_type_guard(
        reloaded,
        section_id,
        ChatSectionImpl,
    )
    assert "skillsEnabled" not in reloaded_chat_impl.model_dump(mode="python")


def test_task_board_model_defaults_to_empty_columns() -> None:
    assert TaskBoardSectionImpl().columns == []


def test_task_board_settings_defaults_use_none_columns_sentinel() -> None:
    settings = SettingsState()
    assert settings.taskBoardSectionDefault.columns is None


def test_create_top_level_task_board_populates_default_columns() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="test"))
    section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.TaskBoard,
        Position(),
    )
    task_board_impl = get_curr_effective_section_impl_with_type_guard(
        project_state,
        section_id,
        TaskBoardSectionImpl,
    )
    assert [column.name for column in task_board_impl.columns] == [
        "Todo",
        "Doing",
        "Done",
    ]
    assert [column.color for column in task_board_impl.columns] == [
        "#3b82f6",
        "#a855f7",
        "#10b981",
    ]
    assert [column.sortIndex for column in task_board_impl.columns] == [0, 1, 2]
    assert len({column.id for column in task_board_impl.columns}) == 3


def test_task_board_defaults_survive_settings_round_trip() -> None:
    settings = SettingsState.model_validate(SettingsState().model_dump(mode="json"))
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="test"))
    section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.TaskBoard,
        Position(),
    )
    task_board_impl = get_curr_effective_section_impl_with_type_guard(
        project_state,
        section_id,
        TaskBoardSectionImpl,
    )
    assert [column.name for column in task_board_impl.columns] == [
        "Todo",
        "Doing",
        "Done",
    ]
    assert [column.color for column in task_board_impl.columns] == [
        "#3b82f6",
        "#a855f7",
        "#10b981",
    ]
    assert [column.sortIndex for column in task_board_impl.columns] == [0, 1, 2]
    assert len({column.id for column in task_board_impl.columns}) == 3


def test_create_top_level_task_board_respects_explicit_empty_columns_override() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="test"))
    section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.TaskBoard,
        Position(),
        impl_overrides={"columns": []},
    )
    task_board_impl = get_curr_effective_section_impl_with_type_guard(
        project_state,
        section_id,
        TaskBoardSectionImpl,
    )
    assert task_board_impl.columns == []


def test_task_board_explicit_empty_settings_survive_round_trip() -> None:
    settings = SettingsState.model_validate(
        {"taskBoardSectionDefault": {"columns": []}}
    )
    reloaded_settings = SettingsState.model_validate(settings.model_dump(mode="json"))
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="test"))
    section_id = create_top_level_section(
        reloaded_settings,
        project_state,
        SectionType.TaskBoard,
        Position(),
    )
    task_board_impl = get_curr_effective_section_impl_with_type_guard(
        project_state,
        section_id,
        TaskBoardSectionImpl,
    )
    assert reloaded_settings.taskBoardSectionDefault.columns == []
    assert task_board_impl.columns == []


def test_state_machine_section_defaults_round_trip() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="test"))
    start_id = create_top_level_section(
        settings,
        project_state,
        SectionType.StateMachineStart,
        Position(),
    )
    gate_id = create_top_level_section(
        settings,
        project_state,
        SectionType.StateMachineGate,
        Position(x=220, y=0),
    )
    end_id = create_top_level_section(
        settings,
        project_state,
        SectionType.StateMachineEnd,
        Position(x=440, y=0),
    )

    start_impl = get_curr_effective_section_impl_with_type_guard(
        project_state,
        start_id,
        StateMachineStartSectionImpl,
    )
    gate_impl = get_curr_effective_section_impl_with_type_guard(
        project_state,
        gate_id,
        StateMachineGateSectionImpl,
    )
    end_impl = get_curr_effective_section_impl_with_type_guard(
        project_state,
        end_id,
        StateMachineEndSectionImpl,
    )

    assert start_impl.label == "Start"
    assert gate_impl.gateType == StateMachineGateType.AND
    assert end_impl.label == "End"
    assert start_impl.machineGroupId
    assert gate_impl.machineGroupId
    assert end_impl.machineGroupId

    reloaded = ProjectStateSingleConfig.model_validate(
        project_state.model_dump(mode="python")
    )
    reloaded_gate_impl = get_curr_effective_section_impl_with_type_guard(
        reloaded,
        gate_id,
        StateMachineGateSectionImpl,
    )
    assert reloaded_gate_impl.gateType == StateMachineGateType.AND


def test_state_machine_sections_cannot_be_created_as_children() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="test"))
    group_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Group,
        Position(),
    )

    with pytest.raises(ValueError):
        create_child_sections(
            settings,
            project_state,
            group_id,
            SectionType.StateMachineStart,
            1,
            None,
        )
