import hashlib
import os
import subprocess
import sys
import time
from pathlib import Path


def test_stop_browser_mcp_stops_matching_devtools_process_when_tmpdir_changes(
    tmp_path: Path,
) -> None:
    sandbox_root = tmp_path / "browser_mcp_sandbox"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    script_path = scripts_dir / "stop-browser-mcp.sh"
    repo_script = (
        Path(__file__).resolve().parents[2]
        / "scripts"
        / "stop-browser-mcp.sh"
    )
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

    process = subprocess.Popen(
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

    try:
        env = os.environ.copy()
        env["TMPDIR"] = str(tmp_path / "other-tmp-root")
        env.pop("MCP_BASE_DIR", None)

        result = subprocess.run(
            ["bash", str(script_path), "--devtools"],
            cwd=sandbox_root,
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, result.stderr
        process.wait(timeout=5)
        assert process.poll() is not None
        assert "Stopped devtools Chrome" in result.stdout
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait()
