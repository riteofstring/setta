from pathlib import Path

from setta.project_state.settings_project import create_settings_project_state
from setta.types.project_config import ProjectConfig


def test_project_config_allows_json_source_key_edits_by_default() -> None:
    config = ProjectConfig(name="json-source-defaults")
    assert config.allowJsonSourceKeyEdits


def test_settings_project_disables_json_source_key_edits() -> None:
    project_state = create_settings_project_state(Path("settings.json"))
    assert not project_state.projectConfig.allowJsonSourceKeyEdits
