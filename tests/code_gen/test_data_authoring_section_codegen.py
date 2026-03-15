from ast import literal_eval

from setta.code_gen.dependency_graph import DependencyGraph, SectionNode
from setta.code_gen.value_codec import PythonValueCodec
from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import LiteralDependencyValue
from tests.helpers.settings_state import SettingsState
from setta.types.helpers_lvl1 import set_curr_effective_section_impl_value
from setta.types.id import ID
from setta.types.project_config import Position, ProjectConfig, default_section_allowlist
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    SectionType,
    SpreadsheetGridDensity,
    TaskBoardColumn,
    TaskBoardRecurringMonth,
    TaskBoardRecurringWeekday,
    TaskBoardTask,
    TaskBoardTaskRecurrence,
    TaskBoardViewMode,
)
from tests.helpers.project_state_sections import create_top_level_section


def test_default_codegen_allowlist_includes_data_authoring_sections() -> None:
    # Task board and spreadsheet should emit generated Python values by default.
    allowlist = default_section_allowlist()
    assert SectionType.TaskBoard in allowlist
    assert SectionType.Spreadsheet in allowlist


def test_task_board_section_exports_structured_codegen_payload() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="task-board-project")
    )
    section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.TaskBoard,
        Position(),
    )
    columns = [
        TaskBoardColumn(
            id=ID("column-1"),
            name="Todo",
            color="#3b82f6",
            sortIndex=0,
        )
    ]
    tasks = [
        TaskBoardTask(
            id=ID("task-1"),
            title="Ship data grid",
            description="Enable spreadsheet drop",
            completed=False,
            columnId=ID("column-1"),
            dueDateIso="2026-02-15",
            recurrence=TaskBoardTaskRecurrence.specified_days,
            recurrenceDays=[TaskBoardRecurringWeekday.monday],
            recurrenceMonths=[TaskBoardRecurringMonth.january],
            recurrenceYears=[2026, 2028],
            sortIndex=0,
        )
    ]
    set_curr_effective_section_impl_value(
        project_state,
        section_id,
        {
            "viewMode": TaskBoardViewMode.kanban,
            "columns": columns,
            "tasks": tasks,
        },
    )

    graph = DependencyGraph(project_state)
    node = graph.graph[create_dep_key(sectionId=section_id)]
    assert isinstance(node, SectionNode)
    assert isinstance(node.value, LiteralDependencyValue)
    payload = literal_eval(node.value.payload)
    assert payload == {
        "viewMode": "kanban",
        "columns": [
            {
                "id": "column-1",
                "name": "Todo",
                "color": "#3b82f6",
                "sortIndex": 0,
            }
        ],
        "tasks": [
            {
                "id": "task-1",
                "title": "Ship data grid",
                "description": "Enable spreadsheet drop",
                "completed": False,
                "columnId": "column-1",
                "dueDateIso": "2026-02-15",
                "recurrence": "specified_days",
                "recurrenceDays": ["monday"],
                "recurrenceMonths": ["january"],
                "recurrenceYears": [2026, 2028],
                "sortIndex": 0,
            }
        ],
    }

    # Value codec should preserve the same structured payload in generated output.
    codec = PythonValueCodec(graph, lambda _: "")
    rendered = codec.format_section(node)
    assert rendered is not None
    assert literal_eval(rendered) == payload


def test_spreadsheet_section_exports_structured_codegen_payload() -> None:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="spreadsheet-project")
    )
    section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Spreadsheet,
        Position(),
    )
    set_curr_effective_section_impl_value(
        project_state,
        section_id,
        {
            "filePath": "/tmp/data/train-metrics.xlsx",
            "activeSheet": "Sheet1",
        },
    )
    set_curr_effective_section_impl_value(
        project_state,
        section_id,
        {
            "readOnly": True,
            "showRowNumbers": False,
            "density": SpreadsheetGridDensity.comfortable,
            "autoReloadOnExternalChange": True,
        },
    )

    graph = DependencyGraph(project_state)
    node = graph.graph[create_dep_key(sectionId=section_id)]
    assert isinstance(node, SectionNode)
    assert isinstance(node.value, LiteralDependencyValue)
    payload = literal_eval(node.value.payload)
    assert payload == {
        "filePath": "/tmp/data/train-metrics.xlsx",
        "activeSheet": "Sheet1",
        "readOnly": True,
        "showRowNumbers": False,
        "density": "comfortable",
        "autoReloadOnExternalChange": True,
    }

    codec = PythonValueCodec(graph, lambda _: "")
    rendered = codec.format_section(node)
    assert rendered is not None
    assert literal_eval(rendered) == payload
