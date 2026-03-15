import json
from pathlib import Path

import pytest

from setta.types.code_obj_impls import CodeCallableCodeObjImpl
from setta.types.core import Core
from setta.types.generated.impl_args_as_typed_dicts import (
    CallableSectionImplArgsWithCallable,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import set_curr_effective_section_impl_value
from setta.types.helpers_lvl2 import add_code_obj, add_kwarg
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from setta.utils.name_validation import (
    get_param_name_format_error,
    get_project_name_format_error,
    get_section_name_format_error,
    get_view_mode_name_format_error,
)
from tests.helpers.project_state_sections import create_top_level_section

FIXTURE_PATH = (
    Path(__file__).resolve().parents[1]
    / "fixtures"
    / "name_validation_cases.json"
)
CASES = json.loads(FIXTURE_PATH.read_text())


@pytest.mark.parametrize("case", CASES["project"])
def test_project_name_cases_match_frontend(case) -> None:
    assert get_project_name_format_error(case["name"]) == case["error"]


@pytest.mark.parametrize("case", CASES["section"])
def test_section_name_cases_match_frontend(case) -> None:
    assert get_section_name_format_error(case["name"]) == case["error"]


@pytest.mark.parametrize("case", CASES["viewMode"])
def test_view_mode_name_cases_match_frontend(case) -> None:
    assert get_view_mode_name_format_error(case["name"]) == case["error"]


def _build_param_context() -> tuple[ProjectStateSingleConfig, str, str]:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="test-project")
    )
    section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Callable,
        Position(),
    )
    project_state.validate_parent_section_map()
    callable_impl = CodeCallableCodeObjImpl()
    callable_core = Core(name="callable")
    add_code_obj(project_state, [section_id], callable_core, callable_impl)
    set_curr_effective_section_impl_value(
        project_state,
        section_id,
        CallableSectionImplArgsWithCallable(callable=callable_core.id),
    )
    param_id = add_kwarg(settings, project_state, section_id)
    return project_state, section_id, param_id


@pytest.mark.parametrize("case", CASES["param"])
def test_param_name_cases_match_frontend(case) -> None:
    project_state, section_id, param_id = _build_param_context()
    assert (
        get_param_name_format_error(
            project_state,
            section_id,
            param_id,
            case["name"],
        )
        == case["error"]
    )
