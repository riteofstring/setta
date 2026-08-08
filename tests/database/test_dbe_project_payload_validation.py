import json

import pytest
from pydantic import ValidationError

from setta.database.db_objs import DBE
from setta.types.project_config import ProjectConfig
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


def test_read_project_required_rejects_missing_project_chat_windowing_entries(
    tmp_path,
) -> None:
    dbe = DBE(tmp_path)
    project_config = ProjectConfig(id="project-1", name="legacy-project")
    payload = {
        "projectConfigs": {
            project_config.id: project_config.model_dump(mode="json"),
        },
        "defaultProjectConfigId": project_config.id,
    }
    dbe.write_json(dbe.project, payload)

    # Reads should surface the missing authoritative windowing entry instead of
    # fabricating one and mutating the persisted project payload.
    with pytest.raises(
        ValidationError,
        match="Missing project chat windowing state for project config ids: project-1",
    ):
        dbe.read_project_required()

    assert dbe.read_json(dbe.project) == payload
