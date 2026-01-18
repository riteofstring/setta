import unittest

from setta.api.runner import RunOverride, RunPlan, SettaRunner
from setta.types.dependency_key import SectionParamDependencyKey
from setta.types.id import ID
from setta.types.project_config import ProjectConfig


class RunnerParamOverrideTests(unittest.TestCase):
    def test_encode_param_overrides_accepts_dependency_key(self) -> None:
        runner = SettaRunner(base_url="http://example.com")
        key = SectionParamDependencyKey(sectionId=ID("section"), codeObjId=ID("param"))
        overrides = runner._encode_param_overrides({key: "2"})
        self.assertEqual(overrides, {"section:param": "2"})


class RunnerPlanTests(unittest.TestCase):
    def test_random_params_empty_grid_returns_identity(self) -> None:
        base_override = RunOverride(tags={"kind": "base"})
        plan = RunPlan([base_override])

        expanded = plan.random_params({}, count=3)

        self.assertEqual(len(expanded), 1)
        overrides = list(expanded)
        self.assertEqual(overrides[0].tags, {"kind": "base"})


class RunnerProjectConfigResolutionTests(unittest.TestCase):
    def test_resolve_project_config_id_matches_name_and_id(self) -> None:
        runner = SettaRunner(base_url="http://example.com")
        config = ProjectConfig(name="Alpha")
        runner._project_configs = [config]
        runner._default_project_config_id = config.id

        self.assertEqual(runner._resolve_project_config_id("Alpha"), config.id)
        self.assertEqual(runner._resolve_project_config_id(str(config.id)), config.id)

    def test_resolve_project_config_id_raises_on_unknown(self) -> None:
        runner = SettaRunner(base_url="http://example.com")
        config = ProjectConfig(name="Alpha")
        runner._project_configs = [config]
        runner._default_project_config_id = config.id

        with self.assertRaises(KeyError):
            runner._resolve_project_config_id("Missing")
