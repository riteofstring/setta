import os
import subprocess
from pathlib import Path


def test_chrome_devtools_mcp_script_bootstraps_repo_pinned_node_with_nvm(
    tmp_path: Path,
) -> None:
    # Existing devboxes can have an older default Node than the repo pin. The
    # MCP launcher should silently switch to the pinned version via nvm before
    # exec'ing chrome-devtools-mcp so Codex starts cleanly on remote boxes.
    repo_root = Path(__file__).resolve().parents[2]
    sandbox_root = tmp_path / "sandbox"
    scripts_dir = sandbox_root / "scripts"
    old_bin_dir = sandbox_root / "bin-old"
    new_bin_dir = sandbox_root / "bin-new"
    nvm_dir = tmp_path / "home" / ".nvm"

    scripts_dir.mkdir(parents=True, exist_ok=True)
    old_bin_dir.mkdir(parents=True, exist_ok=True)
    new_bin_dir.mkdir(parents=True, exist_ok=True)
    nvm_dir.mkdir(parents=True, exist_ok=True)

    launcher_src = repo_root / "scripts" / "chrome-devtools-mcp.sh"
    launcher_dst = scripts_dir / "chrome-devtools-mcp.sh"
    launcher_dst.write_text(launcher_src.read_text(encoding="utf-8"), encoding="utf-8")
    launcher_dst.chmod(0o755)

    (scripts_dir / "cdp-port.sh").write_text("#!/usr/bin/env bash\nprintf '9297\\n'\n", encoding="utf-8")
    (scripts_dir / "cdp-port.sh").chmod(0o755)
    (scripts_dir / "node_version.txt").write_text("20.19.0\n", encoding="utf-8")

    (old_bin_dir / "node").write_text(
        """#!/usr/bin/env bash
if [[ "${1:-}" == "-p" ]]; then
  printf '20.11.1\\n'
  exit 0
fi
printf 'old-node\\n'
""",
        encoding="utf-8",
    )
    (old_bin_dir / "node").chmod(0o755)
    (old_bin_dir / "npx").write_text(
        """#!/usr/bin/env bash
printf 'old-npx should not run\\n' >&2
exit 99
""",
        encoding="utf-8",
    )
    (old_bin_dir / "npx").chmod(0o755)

    npx_capture_file = tmp_path / "npx-invocation.txt"
    (new_bin_dir / "node").write_text(
        """#!/usr/bin/env bash
if [[ "${1:-}" == "-p" ]]; then
  printf '20.19.0\\n'
  exit 0
fi
printf 'new-node\\n'
""",
        encoding="utf-8",
    )
    (new_bin_dir / "node").chmod(0o755)
    (new_bin_dir / "npx").write_text(
        f"""#!/usr/bin/env bash
printf '%s\\n' "$*" > "{npx_capture_file}"
exit 0
""",
        encoding="utf-8",
    )
    (new_bin_dir / "npx").chmod(0o755)

    nvm_log_file = tmp_path / "nvm-log.txt"
    (nvm_dir / "nvm.sh").write_text(
        f"""nvm() {{
  printf '%s %s\\n' "$1" "${{2:-}}" >> "{nvm_log_file}"
  if [[ "$1" == "use" || "$1" == "install" ]]; then
    export PATH="{new_bin_dir}:$PATH"
    return 0
  fi
  if [[ "$1" == "alias" ]]; then
    return 0
  fi
  return 1
}}
""",
        encoding="utf-8",
    )

    env = os.environ.copy()
    env["HOME"] = str(tmp_path / "home")
    env["PATH"] = f"{old_bin_dir}:{env.get('PATH', '')}"
    env["TMPDIR"] = str(tmp_path / "tmp")

    result = subprocess.run(
        ["bash", str(launcher_dst)],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert npx_capture_file.read_text(encoding="utf-8").strip() == (
        "-y chrome-devtools-mcp@0.17.0 --browserUrl=http://127.0.0.1:9297"
    )
    assert "use 20.19.0" in nvm_log_file.read_text(encoding="utf-8")
