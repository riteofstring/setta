import os
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def test_install_root_helper_expands_tilde_to_home(tmp_path: Path) -> None:
    helper = _repo_root() / "scripts" / "lib" / "install_root_path.sh"
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["HOME"] = str(home_dir)

    # The shared helper should normalize ~/... so both install/activate scripts behave consistently.
    result = subprocess.run(
        [
            "bash",
            "-lc",
            f'source "{helper}" && setta_resolve_install_root "~/built_venv"',
        ],
        cwd=_repo_root(),
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == str((home_dir / "built_venv").resolve(strict=False))


def test_install_root_helper_rejects_unexpanded_tilde_user_prefix() -> None:
    helper = _repo_root() / "scripts" / "lib" / "install_root_path.sh"
    result = subprocess.run(
        [
            "bash",
            "-lc",
            f'source "{helper}" && setta_resolve_install_root "~definitely_missing_user_123/built_venv"',
        ],
        cwd=_repo_root(),
        env=os.environ.copy(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "Could not expand install root path" in f"{result.stdout}{result.stderr}"
