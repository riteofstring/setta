import os
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def test_activate_built_setta_sets_built_path_defaults(tmp_path: Path) -> None:
    repo_root = _repo_root()
    install_root = tmp_path / "built_venv"
    activate_file = install_root / "bin" / "activate"
    activate_file.parent.mkdir(parents=True, exist_ok=True)
    activate_file.write_text("export VIRTUAL_ENV='stub-built-venv'\n", encoding="utf-8")

    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["HOME"] = str(home_dir)
    env["SETTA_HOME"] = str(tmp_path / "dev_home")
    env["SETTA_PROFILE"] = "dev"
    env["SETTA_FILES_ROOT"] = str(tmp_path / "dev_state")
    env["SETTA_FILES_LOCATION"] = "global"
    env["SETTA_RUNTIME_ROOT"] = str(tmp_path / "dev_runtime")
    env["SETTA_PROFILE_LOOKUP_HOME"] = str(tmp_path / ".setta-development")

    result = subprocess.run(
        [
            "bash",
            "-lc",
            (
                f'source "{repo_root / "activate_built_setta.sh"}" '
                f'--install-root "{install_root}" >/dev/null && '
                'printf "SETTA_HOME=%s\\n" "${SETTA_HOME:-}" && '
                'printf "SETTA_FILES_LOCATION=%s\\n" "${SETTA_FILES_LOCATION:-}" && '
                'printf "SETTA_PROFILE=%s\\n" "${SETTA_PROFILE-__unset__}" && '
                'printf "SETTA_FILES_ROOT=%s\\n" "${SETTA_FILES_ROOT-__unset__}" && '
                'printf "SETTA_RUNTIME_ROOT=%s\\n" "${SETTA_RUNTIME_ROOT-__unset__}" && '
                'printf "SETTA_PROFILE_LOOKUP_HOME=%s\\n" "${SETTA_PROFILE_LOOKUP_HOME-__unset__}"'
            ),
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    lines = {
        key: value
        for key, value in (
            line.split("=", 1) for line in result.stdout.strip().splitlines()
        )
    }
    assert lines["SETTA_HOME"] == str(home_dir / ".setta")
    assert lines["SETTA_FILES_LOCATION"] == "local"
    assert lines["SETTA_PROFILE"] == "__unset__"
    assert lines["SETTA_FILES_ROOT"] == "__unset__"
    assert lines["SETTA_RUNTIME_ROOT"] == "__unset__"
    assert lines["SETTA_PROFILE_LOOKUP_HOME"] == "__unset__"
