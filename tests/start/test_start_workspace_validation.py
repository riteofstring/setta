import subprocess
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def test_start_rejects_invalid_workspace_without_traceback(tmp_path: Path) -> None:
    missing = tmp_path / "missing-workspace"

    result = subprocess.run(
        [sys.executable, "-m", "setta", "--workspace", str(missing), "--no-open"],
        cwd=_repo_root(),
        capture_output=True,
        text=True,
        check=False,
    )
    combined_output = f"{result.stdout}{result.stderr}"

    assert result.returncode != 0
    assert "workspace root does not exist" in combined_output
    assert "Traceback" not in combined_output
