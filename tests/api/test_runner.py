import pytest

from setta.api.runner import RunOverride, RunPlan, SettaRunner
from setta.types.dependency_key import SectionParamDependencyKey
from setta.types.id import ID
from setta.types.project_config import ProjectConfig


def test_encode_param_overrides_accepts_dependency_key() -> None:
    runner = SettaRunner(base_url="http://example.com")
    key = SectionParamDependencyKey(sectionId=ID("section"), codeObjId=ID("param"))
    overrides = runner._encode_param_overrides({key: "2"})
    assert overrides == {"section:param": "2"}


def test_random_params_empty_grid_returns_identity() -> None:
    base_override = RunOverride(tags={"kind": "base"})
    plan = RunPlan([base_override])

    expanded = plan.random_params({}, count=3)

    assert len(expanded) == 1
    overrides = list(expanded)
    assert overrides[0].tags == {"kind": "base"}


def test_resolve_project_config_id_matches_name_and_id() -> None:
    runner = SettaRunner(base_url="http://example.com")
    config = ProjectConfig(name="Alpha")
    runner._project_configs = [config]
    runner._default_project_config_id = config.id

    assert runner._resolve_project_config_id("Alpha") == config.id
    assert runner._resolve_project_config_id(str(config.id)) == config.id


def test_resolve_project_config_id_raises_on_unknown() -> None:
    runner = SettaRunner(base_url="http://example.com")
    config = ProjectConfig(name="Alpha")
    runner._project_configs = [config]
    runner._default_project_config_id = config.id

    with pytest.raises(KeyError):
        runner._resolve_project_config_id("Missing")
