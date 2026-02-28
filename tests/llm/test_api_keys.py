from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

import setta.llm.api_keys as api_keys_module
from setta.database.db_objs import DBE
from setta.llm.api_keys import (
    MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
    MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE,
    MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE,
    ManagedAPIKeysStoreUnavailableError,
    read_managed_api_keys,
    read_managed_api_keys_with_status,
    write_managed_api_keys_with_expected_revision,
)

_MANAGED_KEY_NAMES_ENV_VAR = "SETTA_MANAGED_LLM_API_KEY_NAMES"


def _build_dbe(tmpdir: str) -> DBE:
    root = Path(tmpdir) / "setta_files"
    root.mkdir(parents=True, exist_ok=True)
    dbe = DBE(root)
    dbe.dot_env = Path(tmpdir) / ".env"
    return dbe


def test_write_managed_api_keys_legacy_entrypoint_removed() -> None:
    assert not hasattr(api_keys_module, "write_managed_api_keys")
    assert not hasattr(api_keys_module, "llm_api_keys_path")


def test_read_managed_api_keys_with_status_returns_empty_snapshot_when_dot_env_missing() -> (
    None
):
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)

        result = read_managed_api_keys_with_status(dbe)

        assert result.corrupt is False
        assert result.error_code is None
        assert result.revision == 0
        assert result.api_keys == {}


def test_read_managed_api_keys_with_status_reads_only_indexed_dot_env_keys() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        dbe.write_dot_env(
            {
                "OPENAI_API_KEY": "secret",
                "UNRELATED_SECRET": "do-not-expose",
                _MANAGED_KEY_NAMES_ENV_VAR: '["OPENAI_API_KEY"]',
            }
        )

        result = read_managed_api_keys_with_status(dbe)

        assert result.corrupt is False
        assert result.error_code is None
        assert result.api_keys == {"OPENAI_API_KEY": "secret"}
        assert result.revision > 0
        assert "UNRELATED_SECRET" not in result.api_keys


def test_read_managed_api_keys_with_status_reports_corrupt_index() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = dbe.dot_env
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            "OPENAI_API_KEY=secret\n"
            f"{_MANAGED_KEY_NAMES_ENV_VAR}=not-json\n",
            encoding="utf-8",
        )

        result = read_managed_api_keys_with_status(dbe)

        assert result.corrupt is True
        assert result.revision == 0
        assert result.api_keys == {}
        assert result.error_code == MANAGED_API_KEYS_CORRUPT_ERROR_CODE
        with pytest.raises(ValueError, match="not valid JSON"):
            read_managed_api_keys(dbe)


def test_write_managed_api_keys_with_expected_revision_rejects_stale_revision() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        first_write = write_managed_api_keys_with_expected_revision(
            dbe,
            {"OPENAI_API_KEY": "existing"},
            expected_revision=0,
        )
        assert first_write.status == "success"

        stale_write = write_managed_api_keys_with_expected_revision(
            dbe,
            {"OPENAI_API_KEY": "next"},
            expected_revision=0,
        )

        assert stale_write.status == "revision_conflict"
        assert stale_write.error_code == MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE
        assert stale_write.revision == first_write.revision
        assert stale_write.api_keys == {"OPENAI_API_KEY": "existing"}


def test_write_managed_api_keys_with_expected_revision_preserves_unrelated_dotenv_values() -> (
    None
):
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        dbe.write_dot_env({"UNRELATED_SECRET": "keep-me"})

        write_result = write_managed_api_keys_with_expected_revision(
            dbe,
            {"OPENAI_API_KEY": "saved-secret"},
            expected_revision=0,
        )

        assert write_result.status == "success"
        persisted_dot_env = dbe.read_dot_env()
        assert persisted_dot_env["UNRELATED_SECRET"] == "keep-me"
        assert persisted_dot_env["OPENAI_API_KEY"] == "saved-secret"
        assert (
            persisted_dot_env[_MANAGED_KEY_NAMES_ENV_VAR]
            == '["OPENAI_API_KEY"]'
        )
        assert read_managed_api_keys(dbe) == {"OPENAI_API_KEY": "saved-secret"}


def test_write_managed_api_keys_with_expected_revision_preserves_quoted_unrelated_values() -> (
    None
):
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        # Keep a quoted hash-bearing value that would break if rewritten as raw KEY=value.
        dbe.dot_env.write_text(
            'UNRELATED="a b # c"\nBASE_URL=https://api.example.com\n',
            encoding="utf-8",
        )

        write_result = write_managed_api_keys_with_expected_revision(
            dbe,
            {"OPENAI_API_KEY": "saved-secret"},
            expected_revision=0,
        )

        assert write_result.status == "success"
        persisted_raw = dbe.dot_env.read_text(encoding="utf-8")
        assert 'UNRELATED="a b # c"\n' in persisted_raw
        reparsed_dot_env = dbe.read_dot_env()
        assert reparsed_dot_env["UNRELATED"] == "a b # c"


def test_write_managed_api_keys_with_expected_revision_can_remove_managed_key() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        first_write = write_managed_api_keys_with_expected_revision(
            dbe,
            {
                "OPENAI_API_KEY": "openai-secret",
                "ANTHROPIC_API_KEY": "anthropic-secret",
            },
            expected_revision=0,
        )
        assert first_write.status == "success"

        second_write = write_managed_api_keys_with_expected_revision(
            dbe,
            {"OPENAI_API_KEY": "openai-secret"},
            expected_revision=first_write.revision,
        )
        assert second_write.status == "success"

        persisted_dot_env = dbe.read_dot_env()
        assert "ANTHROPIC_API_KEY" not in persisted_dot_env
        assert (
            persisted_dot_env[_MANAGED_KEY_NAMES_ENV_VAR]
            == '["OPENAI_API_KEY"]'
        )
        assert read_managed_api_keys(dbe) == {"OPENAI_API_KEY": "openai-secret"}


def test_write_managed_api_keys_with_expected_revision_repairs_corrupt_index_when_revision_is_zero() -> (
    None
):
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = dbe.dot_env
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            "UNRELATED_SECRET=keep-me\n"
            f"{_MANAGED_KEY_NAMES_ENV_VAR}=not-json\n",
            encoding="utf-8",
        )

        write_result = write_managed_api_keys_with_expected_revision(
            dbe,
            {"OPENAI_API_KEY": "repaired-secret"},
            expected_revision=0,
        )

        assert write_result.status == "success"
        persisted_dot_env = dbe.read_dot_env()
        assert persisted_dot_env["UNRELATED_SECRET"] == "keep-me"
        assert persisted_dot_env["OPENAI_API_KEY"] == "repaired-secret"
        assert (
            persisted_dot_env[_MANAGED_KEY_NAMES_ENV_VAR]
            == '["OPENAI_API_KEY"]'
        )


def test_write_managed_api_keys_with_expected_revision_repairs_corrupt_index_and_purges_configured_provider_keys() -> (
    None
):
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        dbe.dot_env.write_text(
            "UNRELATED_SECRET=keep-me\n"
            "OPENAI_API_KEY=stale-secret\n"
            f"{_MANAGED_KEY_NAMES_ENV_VAR}=not-json\n",
            encoding="utf-8",
        )

        write_result = write_managed_api_keys_with_expected_revision(
            dbe,
            {},
            expected_revision=0,
            configured_provider_key_names={"OPENAI_API_KEY"},
        )

        assert write_result.status == "success"
        persisted_raw = dbe.dot_env.read_text(encoding="utf-8")
        assert "OPENAI_API_KEY=stale-secret" not in persisted_raw
        assert dbe.read_dot_env()["UNRELATED_SECRET"] == "keep-me"
        assert read_managed_api_keys(dbe) == {}


def test_write_managed_api_keys_with_expected_revision_reports_corrupt_index() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = dbe.dot_env
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            "OPENAI_API_KEY=existing-secret\n"
            f"{_MANAGED_KEY_NAMES_ENV_VAR}=not-json\n",
            encoding="utf-8",
        )

        write_result = write_managed_api_keys_with_expected_revision(
            dbe,
            {"OPENAI_API_KEY": "next-secret"},
            expected_revision=1,
        )

        assert write_result.status == "corrupt_store"
        assert write_result.error_code == MANAGED_API_KEYS_CORRUPT_ERROR_CODE
        assert write_result.revision == 0


def test_read_managed_api_keys_with_status_reports_unavailable_store() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = dbe.dot_env
        path.parent.mkdir(parents=True, exist_ok=True)
        path.mkdir()

        result = read_managed_api_keys_with_status(dbe)

        assert result.corrupt is False
        assert result.revision == 0
        assert result.error_code == MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE
        assert result.api_keys == {}
        assert isinstance(result.error, str)


def test_write_managed_api_keys_with_expected_revision_reports_unavailable_store_when_write_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)

        def _raise_write_failure(*_args: object, **_kwargs: object) -> None:
            raise ManagedAPIKeysStoreUnavailableError("disk full")

        monkeypatch.setattr(
            api_keys_module,
            "_write_dot_env_payload_to_disk",
            _raise_write_failure,
        )

        result = write_managed_api_keys_with_expected_revision(
            dbe,
            {"OPENAI_API_KEY": "next"},
            expected_revision=0,
        )

        assert result.status == "store_unavailable"
        assert result.error_code == MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE
        assert result.revision == 0
