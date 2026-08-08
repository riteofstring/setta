from pathlib import Path

import pytest

from setta.secrets.password_store import _read_password_store_unlocked


def _write_store(path: Path, contents: str) -> Path:
    path.write_text(contents, encoding="utf-8")
    return path


def test_read_password_store_unlocked_returns_empty_for_missing_or_blank_files(
    tmp_path: Path,
) -> None:
    missing_path = tmp_path / "missing.json"
    blank_path = _write_store(tmp_path / "blank.json", " \n\t ")

    assert _read_password_store_unlocked(missing_path) == {}
    assert _read_password_store_unlocked(blank_path) == {}


def test_read_password_store_unlocked_reads_string_values(tmp_path: Path) -> None:
    store_path = _write_store(
        tmp_path / "store.json",
        '{"api-key":"secret","another":"value"}',
    )

    assert _read_password_store_unlocked(store_path) == {
        "api-key": "secret",
        "another": "value",
    }


def test_read_password_store_unlocked_rejects_non_object_payloads(tmp_path: Path) -> None:
    store_path = _write_store(tmp_path / "store.json", '["secret"]')

    with pytest.raises(ValueError, match="Password store must be a JSON object."):
        _read_password_store_unlocked(store_path)


def test_read_password_store_unlocked_rejects_non_string_values(
    tmp_path: Path,
) -> None:
    store_path = _write_store(tmp_path / "store.json", '{"api-key":1}')

    with pytest.raises(
        ValueError,
        match="Password store value for api-key must be a string.",
    ):
        _read_password_store_unlocked(store_path)
