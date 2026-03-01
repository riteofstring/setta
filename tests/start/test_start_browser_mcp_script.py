import os
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _read_nul_separated_args(path: Path) -> list[str]:
    payload = path.read_bytes()
    return [part.decode("utf-8") for part in payload.split(b"\0") if part]


def test_start_browser_mcp_uses_new_macos_instance_for_devtools_launch(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "start-browser-mcp.sh"
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)

    open_args_path = tmp_path / "open_args.bin"
    _write_executable(
        stub_dir / "open",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\0' "$@" > "{open_args_path}"
""",
    )
    _write_executable(
        stub_dir / "lsof",
        """#!/usr/bin/env bash
set -euo pipefail
exit 1
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"
    env["OSTYPE"] = "darwin23"
    env["CHROME_BIN"] = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    env["DEBUG_PORT"] = "9555"
    env["BOOTSTRAP_ENABLED"] = "0"
    env["MCP_BASE_DIR"] = str(tmp_path / "mcp")

    # Multi-worktree launches rely on a fresh app process so args are honored.
    result = subprocess.run(
        ["bash", str(script_path), "--devtools"],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    open_args = _read_nul_separated_args(open_args_path)
    assert "-g" in open_args
    assert "-n" in open_args
    assert "-a" in open_args
    assert "--remote-debugging-port=9555" in open_args
