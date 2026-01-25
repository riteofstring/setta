import logging

import pytest

from setta.logging.levels import parse_log_level, resolve_log_level


def test_parse_log_level_accepts_named_levels() -> None:
    assert parse_log_level("info") == logging.INFO
    assert parse_log_level(" WARNING ") == logging.WARNING


def test_parse_log_level_accepts_numeric_levels() -> None:
    assert parse_log_level("10") == 10
    assert parse_log_level(15) == 15


def test_parse_log_level_rejects_invalid_strings() -> None:
    with pytest.raises(ValueError):
        parse_log_level("not-a-level")


def test_resolve_log_level_prefers_override() -> None:
    assert (
        resolve_log_level(
            level_override="warning",
            env_var="SETTA_TEST_LOG_LEVEL",
            default_level="info",
        )
        == logging.WARNING
    )


def test_resolve_log_level_falls_back_to_env_then_default(monkeypatch) -> None:
    env_var = "SETTA_TEST_LOG_LEVEL"
    monkeypatch.setenv(env_var, "error")
    assert (
        resolve_log_level(
            level_override=None,
            env_var=env_var,
            default_level="info",
        )
        == logging.ERROR
    )

    monkeypatch.setenv(env_var, "not-a-level")
    assert (
        resolve_log_level(
            level_override=None,
            env_var=env_var,
            default_level="info",
        )
        == logging.INFO
    )
