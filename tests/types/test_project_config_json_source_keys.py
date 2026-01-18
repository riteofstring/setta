import unittest
from pathlib import Path

from setta.project_state.settings_project import create_settings_project_state
from setta.types.project_config import ProjectConfig


class ProjectConfigJsonSourceKeyTests(unittest.TestCase):
    def test_project_config_allows_json_source_key_edits_by_default(self) -> None:
        config = ProjectConfig(name="json-source-defaults")
        self.assertTrue(config.allowJsonSourceKeyEdits)

    def test_settings_project_disables_json_source_key_edits(self) -> None:
        project_state = create_settings_project_state(Path("settings.json"))
        self.assertFalse(project_state.projectConfig.allowJsonSourceKeyEdits)
