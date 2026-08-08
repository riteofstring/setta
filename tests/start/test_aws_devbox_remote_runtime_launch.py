import re
import shlex
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _extract_script_function(script_rel: str, name: str) -> str:
    script_path = _repo_root() / script_rel
    script_text = script_path.read_text(encoding="utf-8")
    match = re.search(
        rf"^{re.escape(name)}\(\) \{{\n(.*?)^\}}",
        script_text,
        re.DOTALL | re.MULTILINE,
    )
    assert match is not None
    return f"{name}() {{\n{match.group(1)}\n}}\n"


def _extract_shell_function(name: str) -> str:
    return _extract_script_function("scripts/aws-devbox-remote-runtime.sh", name)


def _write_executable(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _run_runtime_window_command(tmp_path: Path, help_text: str) -> str:
    workspace_root = tmp_path / "workspace"
    runtime_root = tmp_path / "runtime"
    runtime_log = runtime_root / "ai.log"
    runtime_state_path = runtime_root / "ai.log.runtime.json"

    _write_executable(
        workspace_root / "ai.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "${{1:-}}" == "--help" ]]; then
cat <<'EOF'
{help_text}
EOF
exit 0
fi
printf 'ARGS=%s\\n' "$*"
printf 'DEVTOOLS_HEADLESS=%s\\n' "${{DEVTOOLS_HEADLESS:-unset}}"
""",
    )
    _write_executable(
        runtime_root / "runtime-log-tee.py",
        """#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--log-path", required=True)
parser.add_argument("--state-path", required=True)
parser.add_argument("--max-bytes", required=True)
parser.add_argument("--backups", required=True)
args = parser.parse_args()

Path(args.log_path).write_text(sys.stdin.read(), encoding="utf-8")
Path(args.state_path).write_text("{}\\n", encoding="utf-8")
""",
    )

    shell_script = "\n".join(
        [
            "set -euo pipefail",
            _extract_shell_function("staged_runtime_log_tee_script_for_log"),
            _extract_shell_function("runtime_window_command"),
            "lifecycle_mode=ai",
            "remote_runtime_log_max_bytes=1024",
            "remote_runtime_log_backup_count=1",
            f"workspace_root={shlex.quote(str(workspace_root))}",
            f"runtime_log={shlex.quote(str(runtime_log))}",
            f"runtime_state_path={shlex.quote(str(runtime_state_path))}",
            'command_string=$(runtime_window_command "${workspace_root}" "${runtime_log}" "headless" "${runtime_state_path}")',
            'eval "${command_string}"',
        ]
    )

    subprocess.run(
        ["bash", "-lc", shell_script],
        cwd=_repo_root(),
        check=True,
        capture_output=True,
        text=True,
    )
    return runtime_log.read_text(encoding="utf-8")


def _run_runtime_window_command_with_fake_home(tmp_path: Path, ai_body: str) -> str:
    workspace_root = tmp_path / "workspace"
    runtime_root = tmp_path / "runtime"
    home_dir = tmp_path / "home"
    pnpm_home_bin_dir = home_dir / ".local" / "share" / "pnpm"
    nvm_dir = home_dir / ".nvm"
    node_bin_dir = nvm_dir / "versions" / "node" / "v22.0.0" / "bin"
    runtime_log = runtime_root / "ai.log"
    runtime_state_path = runtime_root / "ai.log.runtime.json"

    _write_executable(workspace_root / "ai.sh", ai_body)
    _write_executable(
        runtime_root / "runtime-log-tee.py",
        """#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--log-path", required=True)
parser.add_argument("--state-path", required=True)
parser.add_argument("--max-bytes", required=True)
parser.add_argument("--backups", required=True)
args = parser.parse_args()

Path(args.log_path).write_text(sys.stdin.read(), encoding="utf-8")
Path(args.state_path).write_text("{}\\n", encoding="utf-8")
""",
    )
    _write_executable(
        nvm_dir / "nvm.sh",
        f"""#!/usr/bin/env bash
nvm() {{
  if [[ "${{1:-}}" == "use" ]]; then
    export PATH="{node_bin_dir}:$PATH"
    return 0
  fi
  return 0
}}
""",
    )
    _write_executable(
        node_bin_dir / "corepack",
        """#!/usr/bin/env bash
if [[ "${1:-}" == "enable" ]]; then
  exit 0
fi
if [[ "${1:-}" == "pnpm" ]]; then
  shift
  printf 'PNPM_THROUGH_COREPACK=%s\\n' "$*"
  exit 0
fi
exit 1
""",
    )
    _write_executable(
        node_bin_dir / "pnpm",
        """#!/usr/bin/env bash
printf 'PNPM_FROM_NODE_BIN=%s\\n' "$*"
""",
    )
    _write_executable(
        pnpm_home_bin_dir / "pnpm",
        """#!/usr/bin/env bash
printf 'PNPM_FROM_HOME_BIN=%s\\n' "$*"
""",
    )

    shell_script = "\n".join(
        [
            "set -euo pipefail",
            _extract_shell_function("staged_runtime_log_tee_script_for_log"),
            _extract_shell_function("runtime_window_command"),
            f"export HOME={shlex.quote(str(home_dir))}",
            "lifecycle_mode=ai",
            "remote_runtime_log_max_bytes=1024",
            "remote_runtime_log_backup_count=1",
            f"workspace_root={shlex.quote(str(workspace_root))}",
            f"runtime_log={shlex.quote(str(runtime_log))}",
            f"runtime_state_path={shlex.quote(str(runtime_state_path))}",
            'command_string=$(runtime_window_command "${workspace_root}" "${runtime_log}" "headless" "${runtime_state_path}")',
            'eval "${command_string}"',
        ]
    )

    subprocess.run(
        ["bash", "-lc", shell_script],
        cwd=_repo_root(),
        check=True,
        capture_output=True,
        text=True,
    )
    return runtime_log.read_text(encoding="utf-8")


def test_runtime_window_command_omits_browser_mode_for_legacy_ai_sh(tmp_path: Path) -> None:
    runtime_log = _run_runtime_window_command(
        tmp_path,
        "Usage: ai.sh [--reload] [--profile name]",
    )

    assert "ARGS=\n" in runtime_log
    assert "--browser-mode" not in runtime_log
    assert "DEVTOOLS_HEADLESS=1" in runtime_log


def test_runtime_window_command_passes_browser_mode_when_supported(tmp_path: Path) -> None:
    runtime_log = _run_runtime_window_command(
        tmp_path,
        "Usage: ai.sh [--reload] [--browser-mode headed|headless]",
    )

    assert "ARGS=--browser-mode headless" in runtime_log
    assert "DEVTOOLS_HEADLESS=1" in runtime_log


def test_emit_runtime_info_can_return_ready_metadata_before_endpoints_are_live() -> None:
    ready_info_json = (
        '{"frontendUrl":"http://127.0.0.1:3035/",'
        '"backendUrl":"http://127.0.0.1:8035/",'
        '"debugPort":9257,'
        '"debugPortSource":"runtime_log"}'
    )
    shell_script = "\n".join(
        [
            "set -euo pipefail",
            _extract_shell_function("runtime_info_is_ready"),
            _extract_shell_function("emit_runtime_info"),
            "remote_source_kind=worktree",
            "lifecycle_mode=ai",
            f"ready_info_json={shlex.quote(ready_info_json)}",
            'read_runtime_info() { printf "%s\\n" "${ready_info_json}"; }',
            'runtime_info_is_usable() { return 1; }',
            'runtime_window_has_exited() { return 1; }',
            'print_runtime_timeout_diagnostics() { return 0; }',
            'log_runtime_progress() { return 0; }',
            'emit_runtime_info "session" "runtime-info" "/workspace" "/tmp/ai.log" "worktree" "180" "0" "1" "1"',
        ]
    )

    result = subprocess.run(
        ["bash", "-lc", shell_script],
        cwd=_repo_root(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert ready_info_json in result.stdout
    assert "metadata is ready; continuing while services finish accepting connections." in result.stderr


def test_run_remote_tunnel_session_uses_plain_ssh_tunnel_without_tmux_attach(tmp_path: Path) -> None:
    capture_path = tmp_path / "ssh_capture.txt"
    shell_script = "\n".join(
        [
            "set -euo pipefail",
            _extract_shell_function("run_remote_tunnel_session"),
            f'capture_path={shlex.quote(str(capture_path))}',
            'ssh_attach_retry_limit=5',
            'ensure_ssm_transport_ready() { return 0; }',
            'ssh() { printf "%s\\n" "$@" > "${capture_path}"; return 0; }',
            'ssh_tunnel_args=(-N -T -o LogLevel=QUIET -L 3035:127.0.0.1:3035 ubuntu@example)',
            'run_remote_tunnel_session "remote ai tunnel" "ai tunnel"',
        ]
    )

    result = subprocess.run(
        ["bash", "-lc", shell_script],
        cwd=_repo_root(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert capture_path.read_text(encoding="utf-8").splitlines() == [
        "-N",
        "-T",
        "-o",
        "LogLevel=QUIET",
        "-L",
        "3035:127.0.0.1:3035",
        "ubuntu@example",
    ]


def test_runtime_port_check_reuses_existing_foreground_ssh_tunnel() -> None:
    shell_script = "\n".join(
        [
            "set -euo pipefail",
            _extract_shell_function("reusable_ssh_listener_matches_port"),
            _extract_shell_function("ensure_local_forward_port_available"),
            'ssh_user="ubuntu"',
            'instance_id="example"',
            'auto_stop_local_browser_mcp=0',
            'local_browser_mcp_profile_dir=""',
            'last_local_forward_check_reused=0',
            'local_listener_pids_for_port() { printf "321\\n"; }',
            'process_command_for_pid() { printf "%s\\n" "ssh -N -T -L 8035:127.0.0.1:8035 ubuntu@example"; }',
            'process_tty_for_pid() { printf "ttys000\\n"; }',
            'stale_ssh_listener_matches_port() { return 1; }',
            'managed_local_browser_mcp_listener_matches_port() { return 1; }',
            'managed_wrapper_attach_listener_matches_port() { return 1; }',
            'stop_stale_local_ssh_listener() { return 0; }',
            'stop_managed_local_browser_mcp_listener() { return 0; }',
            'stop_managed_wrapper_attach_listener() { return 0; }',
            'ensure_local_forward_port_available "8035" "8035" "selected runtime backend tunnel" "" "session"',
            'printf "reused=%s\\n" "${last_local_forward_check_reused}"',
        ]
    )

    result = subprocess.run(
        ["bash", "-lc", shell_script],
        cwd=_repo_root(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "reused=1" in result.stdout
    assert "Reusing existing local SSH forward process 321 on port 8035" in result.stderr


def test_remote_shell_port_check_reuses_existing_foreground_ssh_tunnel() -> None:
    shell_script = "\n".join(
        [
            "set -euo pipefail",
            _extract_script_function("scripts/aws-devbox-remote.sh", "reusable_ssh_listener_matches_port"),
            _extract_script_function("scripts/aws-devbox-remote.sh", "ensure_local_forward_port_available"),
            'ssh_user="ubuntu"',
            'instance_id="example"',
            'last_local_forward_check_reused=0',
            'local_listener_pids_for_port() { printf "654\\n"; }',
            'process_command_for_pid() { printf "%s\\n" "ssh -N -T -L 8000:127.0.0.1:8000 ubuntu@example"; }',
            'process_tty_for_pid() { printf "ttys000\\n"; }',
            'stale_ssh_listener_matches_port() { return 1; }',
            'stop_stale_local_ssh_listener() { return 0; }',
            'ensure_local_forward_port_available "8000" "8000" "remote shell tunnel" ""',
            'printf "reused=%s\\n" "${last_local_forward_check_reused}"',
        ]
    )

    result = subprocess.run(
        ["bash", "-lc", shell_script],
        cwd=_repo_root(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "reused=1" in result.stdout
    assert "Reusing existing local SSH forward process 654 on port 8000" in result.stderr


def test_build_remote_attach_command_preserves_existing_tmux_session_state() -> None:
    shell_script = "\n".join(
        [
            "set -euo pipefail",
            _extract_shell_function("build_remote_attach_command"),
            'remote_session_name="setta-worktree"',
            'remote_start_dir="/tmp/worktree"',
            'remote_tmux_mouse="off"',
            'command_string=$(build_remote_attach_command)',
            'printf "%s\\n" "${command_string}"',
        ]
    )

    result = subprocess.run(
        ["bash", "-lc", shell_script],
        cwd=_repo_root(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "tmux attach-session" in result.stdout
    assert "tmux respawn-window" not in result.stdout
    assert "tmux new-window" not in result.stdout
    assert "tmux select-window" not in result.stdout


def test_legacy_remote_attach_command_uses_preserve_mode() -> None:
    shell_script = "\n".join(
        [
            "set -euo pipefail",
            _extract_script_function("scripts/aws-devbox-remote.sh", "build_remote_attach_command"),
            'repo_remote_url=""',
            'repo_branch=""',
            'remote_tmux_mouse="off"',
            'remote_start_dir="/tmp/worktree"',
            'command_string=$(build_remote_attach_command)',
            'printf "%s\\n" "${command_string}"',
        ]
    )

    result = subprocess.run(
        ["bash", "-lc", shell_script],
        cwd=_repo_root(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "setta-devbox-attach" in result.stdout
    assert " preserve" in result.stdout
    assert " reset" not in result.stdout


def test_runtime_window_command_bootstraps_pnpm_from_runtime_toolchain_paths_for_legacy_ai_sh(tmp_path: Path) -> None:
    runtime_log = _run_runtime_window_command_with_fake_home(
        tmp_path,
        """#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--help" ]]; then
cat <<'EOF'
Usage: ai.sh [--reload] [--profile name]
EOF
exit 0
fi
pnpm start
""",
    )

    assert "PNPM_FROM_HOME_BIN=start" in runtime_log
