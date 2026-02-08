from setta.database.db_objs import DBE


def test_read_deployment_manifest_optional_returns_none_for_invalid_manifest(tmp_path):
    dbe = DBE(tmp_path)
    (tmp_path / "manifest.json").write_text('{"version": 1}', encoding="utf-8")

    assert dbe.read_deployment_manifest_optional() is None

