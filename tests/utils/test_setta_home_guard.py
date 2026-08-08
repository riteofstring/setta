from pathlib import Path

import pytest

from setta.utils.setta_home import resolve_setta_home


def test_resolve_setta_home_guard_rejects_non_pytest_temp_root(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    outside_path = Path.cwd().resolve(strict=False) / ".setta_home_outside_pytest_tmp"
    monkeypatch.setenv("SETTA_HOME", str(outside_path))

    with pytest.raises(AssertionError, match="outside pytest temp roots"):
        resolve_setta_home()
