import os
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def test_setta_path_flags_normalizes_location_override_to_lowercase() -> None:
    helper = _repo_root() / "scripts" / "lib" / "setta_path_flags.sh"
    script = f"""
set -euo pipefail
source "{helper}"
setta_path_flags_init "" ""
setta_path_flags_seed_from_env
setta_path_flags_try_parse --setta-files-location AUTO
setta_path_flags_validate
setta_path_flags_apply_env
printf "%s\\n" "${{SETTA_FILES_LOCATION:-}}"
"""

    # Mixed-case CLI values should be accepted and normalized at the shell boundary.
    result = subprocess.run(
        ["bash", "-lc", script],
        cwd=_repo_root(),
        env=os.environ.copy(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "auto"


def test_setta_path_flags_rejects_invalid_location_override_early() -> None:
    helper = _repo_root() / "scripts" / "lib" / "setta_path_flags.sh"
    script = f"""
set -euo pipefail
source "{helper}"
setta_path_flags_init "" ""
setta_path_flags_seed_from_env
setta_path_flags_try_parse --setta-files-location not-a-mode
setta_path_flags_validate
"""

    # Invalid values should fail before startup proceeds into Python path resolution.
    result = subprocess.run(
        ["bash", "-lc", script],
        cwd=_repo_root(),
        env=os.environ.copy(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert (
        "Invalid value for --setta-files-location: not-a-mode. Expected auto, local, or global."
        in f"{result.stdout}{result.stderr}"
    )
