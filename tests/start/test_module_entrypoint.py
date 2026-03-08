import subprocess
import sys


def test_python_module_entrypoint_runs() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "setta", "version"],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version" in result.stdout

