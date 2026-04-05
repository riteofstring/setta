import pytest

from setta.utils.format_code import ruff_format_with_error


def test_ruff_format_with_error_uses_utf8_encoding(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LC_ALL", "C")
    monkeypatch.setenv("LANG", "C")
    monkeypatch.setenv("PYTHONUTF8", "0")

    code = "def greet():\n    return '🍕'\n"
    formatted, error = ruff_format_with_error(code, include_lint=False)

    assert error is None
    assert formatted is not None
    assert "🍕" in formatted
