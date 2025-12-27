from unittest import TestCase

from setta.types.core import Core
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig


class ParamDisplayNameTests(TestCase):
    def test_core_display_name_defaults(self) -> None:
        core = Core(name="x")
        self.assertEqual(core.displayName, "")
        self.assertEqual(core.name, "x")

    def test_project_state_persists_display_name_and_toggle(self) -> None:
        core = Core(id=ID("param-1"), name="x", displayName="height")
        project_config = ProjectConfig(
            name="param-display",
            showParamDisplayNames=True,
        )
        project_state = ProjectStateSingleConfig(
            projectConfig=project_config,
            codeObjs={core.id: core},
        )

        self.assertEqual(project_state.codeObjs[core.id].displayName, "height")
        self.assertEqual(project_state.codeObjs[core.id].name, "x")
        self.assertTrue(project_state.projectConfig.showParamDisplayNames)
