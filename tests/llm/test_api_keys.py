from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from setta.database.db_objs import DBE
from setta.llm.api_keys import (
    llm_api_keys_path,
    read_managed_api_keys,
    read_managed_api_keys_with_status,
)


def _build_dbe(tmpdir: str) -> DBE:
    root = Path(tmpdir) / "setta_files"
    root.mkdir(parents=True, exist_ok=True)
    return DBE(root)


def test_read_managed_api_keys_with_status_flags_malformed_json_text_as_corrupt() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = llm_api_keys_path(dbe)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Malformed JSON text should be reported via typed corruption status.
        path.write_text('{"OPENAI_API_KEY":"secret"', encoding="utf-8")

        result = read_managed_api_keys_with_status(dbe)

        assert result.corrupt
        assert result.api_keys == {}
        assert isinstance(result.error, str)
        if not isinstance(result.error, str):
            raise AssertionError("Expected malformed JSON error text")
        assert "not valid JSON" in result.error


def test_read_managed_api_keys_raises_value_error_for_malformed_json_text() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = llm_api_keys_path(dbe)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Strict reads should still fail loudly when the store is corrupt.
        path.write_text('{"OPENAI_API_KEY":"secret"', encoding="utf-8")

        with pytest.raises(ValueError, match="not valid JSON"):
            read_managed_api_keys(dbe)


def test_read_managed_api_keys_with_status_flags_empty_store_as_corrupt() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = llm_api_keys_path(dbe)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Empty files are treated as corruption to keep reload behavior fail-closed.
        path.write_text("", encoding="utf-8")

        result = read_managed_api_keys_with_status(dbe)

        assert result.corrupt
        assert result.api_keys == {}
        assert result.error == "Managed API key store is not valid JSON: empty payload"
