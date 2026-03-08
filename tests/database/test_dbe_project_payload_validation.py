import json

import pytest

from setta.database.db_objs import DBE
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
