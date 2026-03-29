import hashlib
import os
import subprocess
import sys
import time
from pathlib import Path


def test_cdp_port_prefers_newest_matching_browser_process_when_tmpdir_differs(
    tmp_path: Path,
) -> None:
    sandbox_root = tmp_path / "cdp_port_sandbox"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    script_path = scripts_dir / "cdp-port.sh"
    repo_script = Path(__file__).resolve().parents[2] / "scripts" / "cdp-port.sh"
    script_path.write_text(repo_script.read_text(encoding="utf-8"), encoding="utf-8")
    script_path.chmod(0o755)

    profile_suffix = hashlib.sha256(
        str(sandbox_root).encode("utf-8")
    ).hexdigest()[:12]
    profile_dir = (
        Path("/tmp")
        / "setta-mcp"
        / f"{sandbox_root.name}-{profile_suffix}"
        / "devtools-profile"
    )
    profile_dir.mkdir(parents=True, exist_ok=True)

    older_process = subprocess.Popen(
        [
            sys.executable,
            "-c",
            "import time; time.sleep(60)",
            f"--user-data-dir={profile_dir}",
            "--remote-debugging-port=9555",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(0.05)
    newer_process = subprocess.Popen(
        [
            sys.executable,
            "-c",
            "import time; time.sleep(60)",
            f"--user-data-dir={profile_dir}",
            "--remote-debugging-port=9556",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(0.05)

    try:
        env = os.environ.copy()
        env["TMPDIR"] = str(tmp_path / "other-tmp-root")
        env.pop("MCP_BASE_DIR", None)

        result = subprocess.run(
            ["bash", str(script_path)],
            cwd=sandbox_root,
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, result.stderr
        assert result.stdout.strip() == "9556"
    finally:
        for process in (older_process, newer_process):
            if process.poll() is None:
                process.terminate()
            process.wait()
