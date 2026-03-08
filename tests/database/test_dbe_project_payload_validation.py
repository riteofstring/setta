import json

import pytest

from setta.database.db_objs import DBE
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectChatWindowingState
from setta.types.project_state import ProjectStateBackend


def test_read_project_allows_missing_project_file(tmp_path) -> None:
    dbe = DBE(tmp_path)

    # Missing project files should still load as a default empty project state.
    loaded = dbe.read_project()

    assert isinstance(loaded, ProjectStateBackend)


def test_read_project_rejects_non_object_payload(tmp_path) -> None:
    dbe = DBE(tmp_path)
    dbe.project.parent.mkdir(parents=True, exist_ok=True)
    dbe.project.write_text(json.dumps(["not-an-object"]), encoding="utf-8")

    # Non-object JSON payloads should fail fast instead of being coerced.
    with pytest.raises(TypeError, match="Project payload must be a JSON object."):
        dbe.read_project()


def test_read_project_required_backfills_missing_project_chat_windowing_entries(
    tmp_path,
) -> None:
    dbe = DBE(tmp_path)
    project_config = ProjectConfig(id="project-1", name="legacy-project")
    dbe.write_json(
        dbe.project,
        {
            "projectConfigs": {
                project_config.id: project_config.model_dump(mode="json"),
            },
            "defaultProjectConfigId": project_config.id,
        },
    )

    loaded = dbe.read_project_required()

    assert loaded.projectChatWindowingByProjectConfigId == {
        project_config.id: ProjectChatWindowingState()
    }
    assert dbe.read_json(dbe.project)["projectChatWindowingByProjectConfigId"] == {
        project_config.id: ProjectChatWindowingState().model_dump(mode="json")
    }
