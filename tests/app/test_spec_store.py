from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from setta.app.spec_store import (
    default_app_spec_path,
    normalize_app_spec_path,
    read_app_spec,
    write_app_spec,
)
from setta.database.db_objs import DBE
from setta.types.id import ID


class TestSpecStore:
    def test_default_app_spec_path(self) -> None:
        project_config_id = ID("project-1")
        path = default_app_spec_path(project_config_id)
        assert path == "app_specs/project-1.json"

    def test_write_and_read_app_spec_round_trip(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            dbe = DBE(root)
            payload = {"root": {"key": "root", "type": "Stack"}}

            write_app_spec(dbe, "app_specs/sample.json", payload)

            loaded = read_app_spec(dbe, "app_specs/sample.json")
            assert loaded == payload

    def test_normalize_app_spec_path_returns_relative_path(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            dbe = DBE(root)
            absolute_path = root / "app_specs" / "spec.json"
            absolute_path.parent.mkdir(parents=True, exist_ok=True)
            absolute_path.write_text("{}")

            normalized = normalize_app_spec_path(dbe, str(absolute_path))

            assert normalized == "app_specs/spec.json"

    def test_write_app_spec_outside_app_specs_raises(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            dbe = DBE(root)
            payload = {"root": {"key": "root", "type": "Stack"}}

            with pytest.raises(ValueError):
                write_app_spec(dbe, "outside.json", payload)
