from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

import setta.llm.api_keys as api_keys_module
from setta.database.db_objs import DBE
from setta.llm.api_keys import (
    MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
    MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE,
    MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE,
    llm_api_keys_path,
    read_managed_api_keys,
    read_managed_api_keys_with_status,
    write_managed_api_keys_with_expected_revision,
)


def _build_dbe(tmpdir: str) -> DBE:
    root = Path(tmpdir) / "setta_files"
    root.mkdir(parents=True, exist_ok=True)
    return DBE(root)


def test_write_managed_api_keys_legacy_entrypoint_removed() -> None:
    assert not hasattr(api_keys_module, "write_managed_api_keys")


def test_read_managed_api_keys_with_status_flags_malformed_json_text_as_corrupt() -> (
    None
):
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = llm_api_keys_path(dbe)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Malformed JSON text should be reported via typed corruption status.
        path.write_text('{"OPENAI_API_KEY":"secret"', encoding="utf-8")

        result = read_managed_api_keys_with_status(dbe)

        assert result.corrupt
        assert result.revision == 0
        assert result.error_code == MANAGED_API_KEYS_CORRUPT_ERROR_CODE
        assert result.api_keys == {}
        assert isinstance(result.error, str)
        if not isinstance(result.error, str):
            raise AssertionError("Expected malformed JSON error text")
        assert "not valid JSON" in result.error


def test_read_managed_api_keys_with_status_flags_invalid_utf8_payload_as_corrupt() -> (
    None
):
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = llm_api_keys_path(dbe)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Invalid UTF-8 bytes must map to typed corruption status.
        path.write_bytes(b"\xff\xfe\xfd")

        result = read_managed_api_keys_with_status(dbe)

        assert result.corrupt
        assert result.revision == 0
        assert result.error_code == MANAGED_API_KEYS_CORRUPT_ERROR_CODE
        assert result.api_keys == {}
        assert isinstance(result.error, str)
        if not isinstance(result.error, str):
            raise AssertionError("Expected invalid UTF-8 error text")
        assert "not valid UTF-8" in result.error


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
        assert result.revision == 0
        assert result.error_code == MANAGED_API_KEYS_CORRUPT_ERROR_CODE
        assert result.api_keys == {}
        assert result.error == "Managed API key store is not valid JSON: empty payload"


def test_read_managed_api_keys_with_status_returns_revisioned_payload() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = llm_api_keys_path(dbe)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            '{"revision": 7, "apiKeys": {"OPENAI_API_KEY": "secret"}}',
            encoding="utf-8",
        )

        result = read_managed_api_keys_with_status(dbe)

        assert result.corrupt is False
        assert result.revision == 7
        assert result.api_keys == {"OPENAI_API_KEY": "secret"}


def test_read_managed_api_keys_with_status_flags_whitespace_only_values_as_corrupt() -> (
    None
):
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = llm_api_keys_path(dbe)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            '{"revision": 7, "apiKeys": {"OPENAI_API_KEY": "   "}}',
            encoding="utf-8",
        )

        result = read_managed_api_keys_with_status(dbe)

        assert result.corrupt is True
        assert result.revision == 0
        assert result.error_code == MANAGED_API_KEYS_CORRUPT_ERROR_CODE
        assert result.api_keys == {}
        assert result.error == "Managed API key values must be non-empty strings."


def test_write_managed_api_keys_with_expected_revision_rejects_stale_revision() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = llm_api_keys_path(dbe)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            '{"revision": 2, "apiKeys": {"OPENAI_API_KEY": "existing"}}',
            encoding="utf-8",
        )

        result = write_managed_api_keys_with_expected_revision(
            dbe,
            {"OPENAI_API_KEY": "next"},
            expected_revision=1,
        )
        persisted = read_managed_api_keys_with_status(dbe)

        assert result.status == "revision_conflict"
        assert result.error_code == MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE
        assert result.revision == 2
        assert persisted.corrupt is False
        assert persisted.revision == 2
        assert persisted.api_keys == {"OPENAI_API_KEY": "existing"}


def test_write_managed_api_keys_with_expected_revision_reports_corrupt_malformed_store() -> (
    None
):
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = llm_api_keys_path(dbe)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('{"revision": 2, "apiKeys": {"OPENAI_API_KEY": "secret"')

        result = write_managed_api_keys_with_expected_revision(
            dbe,
            {"OPENAI_API_KEY": "next"},
            expected_revision=1,
        )

        assert result.status == "corrupt_store"
        assert result.error_code == MANAGED_API_KEYS_CORRUPT_ERROR_CODE
        assert result.revision == 0


def test_read_managed_api_keys_with_status_reports_unavailable_store() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = llm_api_keys_path(dbe)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.mkdir()

        result = read_managed_api_keys_with_status(dbe)

        assert result.corrupt is False
        assert result.revision == 0
        assert result.error_code == MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE
        assert result.api_keys == {}
        assert isinstance(result.error, str)


def test_write_managed_api_keys_with_expected_revision_reports_unavailable_store() -> (
    None
):
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = llm_api_keys_path(dbe)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.mkdir()

        result = write_managed_api_keys_with_expected_revision(
            dbe,
            {"OPENAI_API_KEY": "next"},
            expected_revision=0,
        )

        assert result.status == "store_unavailable"
        assert result.error_code == MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE
        assert result.revision == 0
