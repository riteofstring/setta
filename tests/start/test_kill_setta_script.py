import os
import subprocess
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def test_kill_setta_can_kill_fake_chrome_process_when_enabled(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    sandbox_root = tmp_path / "kill_sandbox"
    scripts_dir = sandbox_root / "scripts"
    stub_dir = tmp_path / "bin"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)

    for rel_path in ("kill.sh", "scripts/kill-setta.sh"):
        src = repo_root / rel_path
        dst = sandbox_root / rel_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        dst.chmod(0o755)

    _write_executable(
        scripts_dir / "stop-browser-mcp.sh",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )
    _write_executable(
        stub_dir / "setta",
        """#!/usr/bin/env bash
set -euo pipefail
echo "No matching Setta sessions found." >&2
exit 1
""",
    )
    _write_executable(
        stub_dir / "pgrep",
        """#!/usr/bin/env bash
set -euo pipefail
exit 1
""",
    )
    _write_executable(
        stub_dir / "osascript",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )

    fake_chrome = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(60)"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        _write_executable(
            stub_dir / "ps",
            f"""#!/usr/bin/env bash
set -euo pipefail
cat <<'EOF'
 {fake_chrome.pid} /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/tmp/ralph-test
EOF
""",
        )

        env = os.environ.copy()
        env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"
        env["OSTYPE"] = "darwin23"
        env["SETTA_KILL_ALL_CHROME"] = "1"

        result = subprocess.run(
            ["bash", str(sandbox_root / "kill.sh")],
            cwd=sandbox_root,
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, result.stderr
        fake_chrome.wait(timeout=5)
        assert "Stopped all Chrome/Chromium processes." in result.stdout
    finally:
        if fake_chrome.poll() is None:
            fake_chrome.terminate()
            fake_chrome.wait(timeout=5)
