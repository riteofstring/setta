import os
import socket
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import (
    parse_env_snapshot,
    repo_root,
    run_script,
    script_env,
    write_stub_executable,
)


def _copy_repo_file(*, sandbox_root: Path, relative_path: str) -> Path:
    src = repo_root() / relative_path
    dst = sandbox_root / relative_path
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    dst.chmod(0o755)
    return dst


def _build_aws_sandbox(
    tmp_path: Path, *, sandbox_name: str = "aws_script_sandbox"
) -> tuple[Path, Path, Path]:
    sandbox_root = tmp_path / sandbox_name
    bin_dir = sandbox_root / "bin"
    env_dir = sandbox_root / "infra" / "aws-devbox"
    bin_dir.mkdir(parents=True, exist_ok=True)
    env_dir.mkdir(parents=True, exist_ok=True)

    for rel_path in (
        "aws.sh",
        "aws-infra.sh",
        "remote-kill.sh",
        "remote.sh",
        "scripts/aws-devbox-common.sh",
        "scripts/aws-devbox.sh",
        "scripts/aws-devbox-kill.sh",
        "scripts/aws-devbox-remote.sh",
        "scripts/aws-devbox-remote-runtime.sh",
        "scripts/aws-devbox-terraform.sh",
    ):
        _copy_repo_file(sandbox_root=sandbox_root, relative_path=rel_path)

    activate_path = sandbox_root / "activate.sh"
    activate_path.write_text(
        "export AWS_WRAPPER_ACTIVATED=1\n",
        encoding="utf-8",
    )
    activate_path.chmod(0o755)

    return sandbox_root, bin_dir, env_dir


def test_aws_sh_loads_repo_local_env_file_before_execing_operator_script(
    tmp_path: Path,
) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(tmp_path)
    env_capture = sandbox_root / "captured-env.txt"
    args_capture = sandbox_root / "captured-args.txt"

    (env_dir / "aws-devbox.env").write_text(
        "AWS_PROFILE=setta-admin\nSETTA_AWS_DEVBOX_NAME=setta-devbox\n",
        encoding="utf-8",
    )
    write_stub_executable(
        bin_dir / "python",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [ "${{1:-}}" = "-" ]; then
  printf '%s\n' '["sk-ssh-ed25519@openssh.com AAAATESTKEY jeff@test"]'
  exit 0
fi
env | sort > "{env_capture}"
printf '%s\n' "$@" > "{args_capture}"
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(bin_dir, home_dir)

    result = run_script(
        ["sh", "./aws.sh", "status", "--json"],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    captured_env = parse_env_snapshot(env_capture.read_text(encoding="utf-8"))
    captured_args = args_capture.read_text(encoding="utf-8").splitlines()

    assert captured_env["AWS_PROFILE"] == "setta-admin"
    assert captured_env["SETTA_AWS_DEVBOX_NAME"] == "setta-devbox"
    assert captured_env["AWS_WRAPPER_ACTIVATED"] == "1"
    assert captured_args[0].endswith("/scripts/aws_devbox.py")
    assert captured_args[1:] == ["status", "--json"]


def test_aws_sh_defaults_to_status_when_no_command_is_given(tmp_path: Path) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(tmp_path)
    args_capture = sandbox_root / "captured-args.txt"

    (env_dir / "aws-devbox.env").write_text(
        "AWS_PROFILE=setta-admin\n",
        encoding="utf-8",
    )
    write_stub_executable(
        bin_dir / "python",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "{args_capture}"
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(bin_dir, home_dir)

    result = run_script(
        ["sh", "./aws.sh"],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    captured_args = args_capture.read_text(encoding="utf-8").splitlines()

    assert captured_args[0].endswith("/scripts/aws_devbox.py")
    assert captured_args[1:] == ["status"]


def test_aws_infra_sh_defaults_to_plan_and_exports_terraform_env(tmp_path: Path) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(tmp_path)
    env_capture = sandbox_root / "captured-env.txt"
    args_capture = sandbox_root / "captured-args.txt"
    public_key_path = sandbox_root / "macgitkey.pub"
    public_key_path.write_text(
        "sk-ssh-ed25519@openssh.com AAAATESTKEY jeff@test\n",
        encoding="utf-8",
    )

    (env_dir / "aws-devbox.env").write_text(
        "\n".join(
            [
                "AWS_PROFILE=setta-admin",
                f"SETTA_AWS_DEVBOX_SSH_PUBLIC_KEY_FILE={public_key_path}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    write_stub_executable(
        bin_dir / "terraform",
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{env_capture}"
printf '%s\n' "$@" > "{args_capture}"
""",
    )
    write_stub_executable(
        bin_dir / "python",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-" ]; then
  printf '%s\n' '["sk-ssh-ed25519@openssh.com AAAATESTKEY jeff@test"]'
  exit 0
fi
exit 99
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(bin_dir, home_dir)

    result = run_script(
        ["sh", "./aws-infra.sh"],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    captured_env = parse_env_snapshot(env_capture.read_text(encoding="utf-8"))
    captured_args = args_capture.read_text(encoding="utf-8").splitlines()

    assert captured_env["TF_VAR_ssh_authorized_keys"] == '["sk-ssh-ed25519@openssh.com AAAATESTKEY jeff@test"]'
    assert captured_args[0].startswith("-chdir=")
    assert captured_args[1:] == ["plan"]


def test_aws_sh_respects_explicit_env_file_override(tmp_path: Path) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(tmp_path)
    env_capture = sandbox_root / "captured-env.txt"
    args_capture = sandbox_root / "captured-args.txt"

    (env_dir / "aws-devbox.env").write_text(
        "AWS_PROFILE=default-profile\n",
        encoding="utf-8",
    )
    custom_env = sandbox_root / "custom-devbox.env"
    custom_env.write_text(
        "AWS_PROFILE=override-profile\nSETTA_AWS_DEVBOX_REGION=us-west-2\n",
        encoding="utf-8",
    )
    write_stub_executable(
        bin_dir / "python",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [ "${{1:-}}" = "-" ]; then
  printf '%s\n' '["sk-ssh-ed25519@openssh.com AAAATESTKEY jeff@test"]'
  exit 0
fi
env | sort > "{env_capture}"
printf '%s\n' "$@" > "{args_capture}"
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(bin_dir, home_dir)
    env["SETTA_AWS_DEVBOX_ENV_FILE"] = str(custom_env)

    result = run_script(
        ["sh", "./aws.sh", "status"],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    captured_env = parse_env_snapshot(env_capture.read_text(encoding="utf-8"))
    captured_args = args_capture.read_text(encoding="utf-8").splitlines()

    assert captured_env["AWS_PROFILE"] == "override-profile"
    assert captured_env["SETTA_AWS_DEVBOX_REGION"] == "us-west-2"
    assert captured_args[1:] == ["status"]


def test_aws_sh_exports_terraform_authorized_key_from_env_file(tmp_path: Path) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(tmp_path)
    env_capture = sandbox_root / "captured-env.txt"
    args_capture = sandbox_root / "captured-args.txt"
    public_key_path = sandbox_root / "macgitkey.pub"
    public_key_path.write_text(
        "sk-ssh-ed25519@openssh.com AAAATESTKEY jeff@test\n",
        encoding="utf-8",
    )

    (env_dir / "aws-devbox.env").write_text(
        "\n".join(
            [
                "AWS_PROFILE=setta-admin",
                f"SETTA_AWS_DEVBOX_SSH_PUBLIC_KEY_FILE={public_key_path}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    write_stub_executable(
        bin_dir / "python",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [ "${{1:-}}" = "-" ]; then
  printf '%s\n' '["sk-ssh-ed25519@openssh.com AAAATESTKEY jeff@test"]'
  exit 0
fi
env | sort > "{env_capture}"
printf '%s\n' "$@" > "{args_capture}"
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(bin_dir, home_dir)

    result = run_script(
        ["sh", "./aws.sh", "status"],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    captured_env = parse_env_snapshot(env_capture.read_text(encoding="utf-8"))
    assert (
        captured_env["TF_VAR_ssh_authorized_keys"]
        == '["sk-ssh-ed25519@openssh.com AAAATESTKEY jeff@test"]'
    )


def test_remote_kill_sh_maps_to_down_command(tmp_path: Path) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(tmp_path)
    env_capture = sandbox_root / "captured-env.txt"
    args_capture = sandbox_root / "captured-args.txt"

    (env_dir / "aws-devbox.env").write_text(
        "AWS_PROFILE=setta-admin\n",
        encoding="utf-8",
    )
    write_stub_executable(
        bin_dir / "python",
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{env_capture}"
printf '%s\n' "$@" > "{args_capture}"
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(bin_dir, home_dir)

    result = run_script(
        ["sh", "./remote-kill.sh"],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    captured_env = parse_env_snapshot(env_capture.read_text(encoding="utf-8"))
    captured_args = args_capture.read_text(encoding="utf-8").splitlines()

    assert captured_env["AWS_PROFILE"] == "setta-admin"
    assert captured_args[0].endswith("/scripts/aws_devbox.py")
    assert captured_args[1:] == ["down"]


def test_remote_sh_starts_box_and_execs_ssh_over_ssm_with_local_forwards(
    tmp_path: Path,
) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(tmp_path)
    python_args_capture = sandbox_root / "python-args.txt"
    ssh_sync_args_capture = sandbox_root / "ssh-sync-args.txt"
    ssh_sync_stdin_capture = sandbox_root / "ssh-sync-stdin.txt"
    ssh_fetch_args_capture = sandbox_root / "ssh-fetch-args.txt"
    ssh_attach_args_capture = sandbox_root / "ssh-attach-args.txt"
    ssh_attach_env_capture = sandbox_root / "ssh-attach-env.txt"
    ssh_add_args_capture = sandbox_root / "ssh-add-args.txt"
    open_args_capture = sandbox_root / "open-args.txt"
    curl_args_capture = sandbox_root / "curl-args.txt"
    identity_file = sandbox_root / "setta-devbox-login"
    identity_file.write_text("private-key-placeholder\n", encoding="utf-8")
    git_identity_file = sandbox_root / "macgitkey"
    git_identity_file.write_text("git-key-placeholder\n", encoding="utf-8")
    known_hosts_file = sandbox_root / "known_hosts"

    (env_dir / "aws-devbox.env").write_text(
        "\n".join(
            [
                "AWS_PROFILE=setta-admin",
                f"SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE={identity_file}",
                f"SETTA_AWS_DEVBOX_GIT_IDENTITY_FILE={git_identity_file}",
                f"SETTA_AWS_DEVBOX_SSH_KNOWN_HOSTS_FILE={known_hosts_file}",
                "SETTA_AWS_DEVBOX_REPO_REMOTE_URL=git@github.com:riteofstring/setta.git",
                "SETTA_AWS_DEVBOX_REPO_BRANCH=pixijs-graph",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    working_dir = sandbox_root / "backend" / "setta"
    working_dir.mkdir(parents=True, exist_ok=True)
    write_stub_executable(
        bin_dir / "python",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [ "${{1:-}}" = "-" ]; then
  /usr/bin/env python3 "$@"
  exit $?
fi
printf '%s\n' "$@" >> "{python_args_capture}"
printf '%s\n' '--' >> "{python_args_capture}"
if [ "${{2:-}}" = "status" ] && [ "${{3:-}}" = "--json" ]; then
  printf '%s\n' '{{"instance_id":"i-devbox","region":"us-east-1","setta_port":8000,"cdp_port":9222,"repo_checkout_path":"/home/ubuntu/dev/setta.pixijs-graph"}}'
fi
""",
    )
    write_stub_executable(
        bin_dir / "ssh",
        f"""#!/usr/bin/env bash
set -euo pipefail
if printf '%s\n' "$@" | grep -Fq './scripts/bootstrap-url.sh'; then
  printf '%s\n' "$@" > "{ssh_fetch_args_capture}"
  printf '%s\n' 'http://127.0.0.1:8000/__setta__/bootstrap#token=abc123'
  exit 0
fi
if printf '%s\n' "$@" | grep -Fq 'cat > ~/.codex/auth.json'; then
  printf '%s\n' "$@" > "{ssh_sync_args_capture}"
  cat > "{ssh_sync_stdin_capture}"
  exit 0
fi
env | sort > "{ssh_attach_env_capture}"
printf '%s\n' "$@" > "{ssh_attach_args_capture}"
""",
    )
    write_stub_executable(
        bin_dir / "ssh-agent",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-s" ]; then
  cat <<'EOF'
SSH_AUTH_SOCK=/tmp/managed-agent; export SSH_AUTH_SOCK;
SSH_AGENT_PID=4242; export SSH_AGENT_PID;
echo Agent pid 4242;
EOF
  exit 0
fi
if [ "${1:-}" = "-k" ]; then
  exit 0
fi
exit 1
""",
    )
    write_stub_executable(
        bin_dir / "ssh-add",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" >> "{ssh_add_args_capture}"
if [ "${{1:-}}" = "{git_identity_file}" ] && [ "${{SSH_AUTH_SOCK:-}}" = "/tmp/managed-agent" ]; then
  exit 0
fi
exit 1
""",
    )
    write_stub_executable(
        bin_dir / "curl",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "{curl_args_capture}"
exit 0
""",
    )
    write_stub_executable(
        bin_dir / "open",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "{open_args_capture}"
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    codex_auth_dir = home_dir / ".codex"
    codex_auth_dir.mkdir(parents=True, exist_ok=True)
    codex_auth_dir.joinpath("auth.json").write_text(
        '{"access_token":"codex-token"}\n',
        encoding="utf-8",
    )
    env = script_env(bin_dir, home_dir)
    env["SSH_AUTH_SOCK"] = "~/.ssh/agent"
    env["TERM"] = "xterm-ghostty"

    result = run_script(
        ["sh", str(sandbox_root / "remote.sh"), "--nochrome"],
        cwd=working_dir,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    python_args = python_args_capture.read_text(encoding="utf-8").splitlines()
    ssh_fetch_args = ssh_fetch_args_capture.read_text(encoding="utf-8").splitlines()
    ssh_attach_args = ssh_attach_args_capture.read_text(encoding="utf-8").splitlines()
    ssh_attach_env = parse_env_snapshot(
        ssh_attach_env_capture.read_text(encoding="utf-8")
    )
    ssh_add_args = ssh_add_args_capture.read_text(encoding="utf-8").splitlines()
    open_args = open_args_capture.read_text(encoding="utf-8").splitlines()
    curl_args = curl_args_capture.read_text(encoding="utf-8").splitlines()

    assert python_args[0].endswith("/scripts/aws_devbox.py")
    assert python_args[1] == "up"
    assert python_args[2] == "--"
    assert python_args[3].endswith("/scripts/aws_devbox.py")
    assert python_args[4:] == ["status", "--json", "--"]

    ssh_sync_args = ssh_sync_args_capture.read_text(encoding="utf-8").splitlines()
    assert "-A" not in ssh_sync_args
    assert "ubuntu@i-devbox" in ssh_sync_args
    assert any(str(identity_file) == arg for arg in ssh_sync_args)
    assert "cat > ~/.codex/auth.json" in ssh_sync_args[-1]
    assert (
        ssh_sync_stdin_capture.read_text(encoding="utf-8")
        == '{"access_token":"codex-token"}\n'
    )

    assert "-A" not in ssh_fetch_args
    assert "./scripts/bootstrap-url.sh" in ssh_fetch_args[-1]

    assert ssh_attach_env["TERM"] == "xterm-ghostty"
    assert ssh_attach_env["SSH_AUTH_SOCK"] == "/tmp/managed-agent"
    assert "-A" in ssh_attach_args
    assert "-tt" in ssh_attach_args
    assert "LogLevel=QUIET" in ssh_attach_args
    assert "-F" in ssh_attach_args
    assert "/dev/null" in ssh_attach_args
    assert "-L" in ssh_attach_args
    assert "8000:127.0.0.1:8000" in ssh_attach_args
    assert "9222:127.0.0.1:9222" in ssh_attach_args
    assert any("AWS-StartSSHSession" in arg for arg in ssh_attach_args)
    assert any("--profile setta-admin" in arg for arg in ssh_attach_args)
    assert any(str(identity_file) == arg for arg in ssh_attach_args)
    assert any(
        f"UserKnownHostsFile={known_hosts_file}" == arg for arg in ssh_attach_args
    )
    assert "ubuntu@i-devbox" in ssh_attach_args
    assert ssh_add_args == [str(git_identity_file)]
    assert curl_args == ["-fsS", "http://127.0.0.1:8000/__setta__/bootstrap"]
    assert "-na" in open_args
    assert "Google Chrome" in open_args
    assert "--new-window" in open_args
    assert any(
        arg.startswith("--user-data-dir=") for arg in open_args
    )
    assert (
        open_args[-1]
        == "http://127.0.0.1:8000/__setta__/bootstrap#token=abc123"
    )
    assert (
        ssh_attach_args[-1]
        == "SETTA_DEVBOX_REPO_REMOTE_URL=git@github.com:riteofstring/setta.git "
        "SETTA_DEVBOX_REPO_BRANCH=pixijs-graph "
        'tmux start-server >/dev/null 2>&1 || true; tmux source-file "$HOME/.tmux.conf" >/dev/null 2>&1 || true; '
        "setta-devbox-attach /home/ubuntu/dev/setta.pixijs-graph/backend/setta reset"
    )
    assert (
        "Loading Git identity into the session ssh-agent..."
        in result.stderr
    )
    assert (
        "Git identity registered with the session ssh-agent. YubiKey touch may still be required on the first GitHub operation."
        in result.stderr
    )
    assert "Opening remote shell session..." in result.stderr


def test_remote_sh_root_flag_forces_remote_repo_root(tmp_path: Path) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(tmp_path)
    ssh_args_capture = sandbox_root / "ssh-args.txt"
    identity_file = sandbox_root / "setta-devbox-login"
    identity_file.write_text("private-key-placeholder\n", encoding="utf-8")
    git_identity_file = sandbox_root / "macgitkey"
    git_identity_file.write_text("git-key-placeholder\n", encoding="utf-8")

    (env_dir / "aws-devbox.env").write_text(
        "\n".join(
            [
                "AWS_PROFILE=setta-admin",
                f"SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE={identity_file}",
                f"SETTA_AWS_DEVBOX_GIT_IDENTITY_FILE={git_identity_file}",
                "SETTA_AWS_DEVBOX_OPEN_BROWSER=0",
                "SETTA_AWS_DEVBOX_REPO_REMOTE_URL=git@github.com:riteofstring/setta.git",
                "SETTA_AWS_DEVBOX_REPO_BRANCH=pixijs-graph",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    write_stub_executable(
        bin_dir / "python",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  printf '%s\n' '{"instance_id":"i-devbox","region":"us-east-1","setta_port":8000,"cdp_port":9222,"repo_checkout_path":"/home/ubuntu/dev/setta.pixijs-graph"}'
fi
""",
    )
    write_stub_executable(
        bin_dir / "ssh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "{ssh_args_capture}"
""",
    )
    write_stub_executable(
        bin_dir / "ssh-agent",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-s" ]; then
  cat <<'EOF'
SSH_AUTH_SOCK=/tmp/managed-agent; export SSH_AUTH_SOCK;
SSH_AGENT_PID=4242; export SSH_AGENT_PID;
echo Agent pid 4242;
EOF
  exit 0
fi
if [ "${1:-}" = "-k" ]; then
  exit 0
fi
exit 1
""",
    )
    write_stub_executable(
        bin_dir / "ssh-add",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" != "-L" ] && [ "${SSH_AUTH_SOCK:-}" = "/tmp/managed-agent" ]; then
  exit 0
fi
exit 1
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(bin_dir, home_dir)
    env["SSH_AUTH_SOCK"] = "~/.ssh/agent"

    result = run_script(
        ["sh", "./remote.sh", "--nochrome", "--root"],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    ssh_args = ssh_args_capture.read_text(encoding="utf-8").splitlines()
    assert (
        ssh_args[-1]
        == "SETTA_DEVBOX_REPO_REMOTE_URL=git@github.com:riteofstring/setta.git "
        "SETTA_DEVBOX_REPO_BRANCH=pixijs-graph "
        'tmux start-server >/dev/null 2>&1 || true; tmux source-file "$HOME/.tmux.conf" >/dev/null 2>&1 || true; '
        "setta-devbox-attach /home/ubuntu/dev/setta.pixijs-graph reset"
    )


def test_remote_sh_local_starts_remote_worktree_runtime_and_tunnels_runtime_ports(
    tmp_path: Path,
) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(tmp_path)
    python_args_capture = sandbox_root / "python-args-ai.txt"
    ssh_sync_args_capture = sandbox_root / "ssh-sync-args-ai.txt"
    ssh_sync_stdin_capture = sandbox_root / "ssh-sync-stdin-ai.txt"
    ssh_runtime_args_capture = sandbox_root / "ssh-runtime-args-ai.txt"
    ssh_attach_args_capture = sandbox_root / "ssh-attach-args-ai.txt"
    ssh_attach_env_capture = sandbox_root / "ssh-attach-env-ai.txt"
    ssh_add_args_capture = sandbox_root / "ssh-add-args-ai.txt"
    open_args_capture = sandbox_root / "open-args-ai.txt"
    curl_args_capture = sandbox_root / "curl-args-ai.txt"
    identity_file = sandbox_root / "setta-devbox-login"
    identity_file.write_text("private-key-placeholder\n", encoding="utf-8")
    git_identity_file = sandbox_root / "macgitkey"
    git_identity_file.write_text("git-key-placeholder\n", encoding="utf-8")
    known_hosts_file = sandbox_root / "known_hosts"

    (env_dir / "aws-devbox.env").write_text(
        "\n".join(
            [
                "AWS_PROFILE=setta-admin",
                f"SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE={identity_file}",
                f"SETTA_AWS_DEVBOX_GIT_IDENTITY_FILE={git_identity_file}",
                f"SETTA_AWS_DEVBOX_SSH_KNOWN_HOSTS_FILE={known_hosts_file}",
                "SETTA_AWS_DEVBOX_REPO_REMOTE_URL=git@github.com:riteofstring/setta.git",
                "SETTA_AWS_DEVBOX_REPO_BRANCH=pixijs-graph",
                "SETTA_AWS_DEVBOX_REMOTE_BROWSER_MODE=headless",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    working_dir = sandbox_root / "backend" / "setta"
    working_dir.mkdir(parents=True, exist_ok=True)
    write_stub_executable(
        bin_dir / "python",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [ "${{1:-}}" = "-" ]; then
  /usr/bin/env python3 "$@"
  exit $?
fi
printf '%s\n' "$@" >> "{python_args_capture}"
printf '%s\n' '--' >> "{python_args_capture}"
if [ "${{2:-}}" = "status" ] && [ "${{3:-}}" = "--json" ]; then
  printf '%s\n' '{{"instance_id":"i-devbox","region":"us-east-1","repo_checkout_path":"/home/ubuntu/dev/setta.pixijs-graph"}}'
fi
""",
    )
    write_stub_executable(
        bin_dir / "ssh",
        f"""#!/usr/bin/env bash
set -euo pipefail
if printf '%s\n' "$@" | grep -Fq 'cat > ~/.codex/auth.json'; then
  printf '%s\n' "$@" > "{ssh_sync_args_capture}"
  cat > "{ssh_sync_stdin_capture}"
  exit 0
fi
    if printf '%s\n' "$@" | grep -Fq 'dev-runtime-info.sh'; then
  printf '%s\n' "$@" > "{ssh_runtime_args_capture}"
  printf '%s\n' '{{"frontendUrl":"http://127.0.0.1:3045","backendUrl":"http://127.0.0.1:8045","debugPort":9267,"bootstrapUrl":"http://127.0.0.1:8045/__setta__/bootstrap#token=abc123"}}'
  exit 0
fi
env | sort > "{ssh_attach_env_capture}"
printf '%s\n' "$@" > "{ssh_attach_args_capture}"
""",
    )
    write_stub_executable(
        bin_dir / "ssh-agent",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-s" ]; then
  cat <<'EOF'
SSH_AUTH_SOCK=/tmp/managed-agent; export SSH_AUTH_SOCK;
SSH_AGENT_PID=4242; export SSH_AGENT_PID;
echo Agent pid 4242;
EOF
  exit 0
fi
if [ "${1:-}" = "-k" ]; then
  exit 0
fi
exit 1
""",
    )
    write_stub_executable(
        bin_dir / "ssh-add",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" >> "{ssh_add_args_capture}"
if [ "${{1:-}}" = "{git_identity_file}" ] && [ "${{SSH_AUTH_SOCK:-}}" = "/tmp/managed-agent" ]; then
  exit 0
fi
exit 1
""",
    )
    write_stub_executable(
        bin_dir / "curl",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "{curl_args_capture}"
exit 0
""",
    )
    write_stub_executable(
        bin_dir / "open",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "{open_args_capture}"
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    codex_auth_dir = home_dir / ".codex"
    codex_auth_dir.mkdir(parents=True, exist_ok=True)
    codex_auth_dir.joinpath("auth.json").write_text(
        '{"access_token":"codex-token"}\n',
        encoding="utf-8",
    )
    env = script_env(bin_dir, home_dir)
    env["SSH_AUTH_SOCK"] = "~/.ssh/agent"
    env["TERM"] = "xterm-ghostty"

    result = run_script(
        ["sh", str(sandbox_root / "remote.sh"), "local"],
        cwd=working_dir,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    python_args = python_args_capture.read_text(encoding="utf-8").splitlines()
    ssh_sync_args = ssh_sync_args_capture.read_text(encoding="utf-8").splitlines()
    ssh_runtime_args = ssh_runtime_args_capture.read_text(encoding="utf-8").splitlines()
    ssh_attach_args = ssh_attach_args_capture.read_text(encoding="utf-8").splitlines()
    ssh_attach_env = parse_env_snapshot(
        ssh_attach_env_capture.read_text(encoding="utf-8")
    )
    ssh_add_args = ssh_add_args_capture.read_text(encoding="utf-8").splitlines()
    open_args = open_args_capture.read_text(encoding="utf-8").splitlines()
    curl_args = curl_args_capture.read_text(encoding="utf-8").splitlines()

    assert python_args[0].endswith("/scripts/aws_devbox.py")
    assert python_args[1] == "up"
    assert python_args[2] == "--"
    assert python_args[3].endswith("/scripts/aws_devbox.py")
    assert python_args[4:] == ["status", "--json", "--"]

    assert "-A" not in ssh_sync_args
    assert "ubuntu@i-devbox" in ssh_sync_args
    assert "cat > ~/.codex/auth.json" in ssh_sync_args[-1]
    assert (
        ssh_sync_stdin_capture.read_text(encoding="utf-8")
        == '{"access_token":"codex-token"}\n'
    )

    assert "-A" not in ssh_runtime_args
    assert "ubuntu@i-devbox" in ssh_runtime_args
    assert (
        'remote_runtime_info_script="${remote_worktree_root}/scripts/dev-runtime-info.sh"'
        in ssh_runtime_args[-1]
    )
    assert "SETTA_REMOTE_LIFECYCLE_MODE=ai" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_BROWSER_MODE=headless" in ssh_runtime_args[-1]
    assert "/home/ubuntu/dev/aws_script_sandbox" in ssh_runtime_args[-1]

    assert ssh_attach_env["TERM"] == "xterm-ghostty"
    assert ssh_attach_env["SSH_AUTH_SOCK"] == "/tmp/managed-agent"
    assert "-A" in ssh_attach_args
    assert "-tt" in ssh_attach_args
    assert "LogLevel=QUIET" in ssh_attach_args
    assert "3045:127.0.0.1:3045" in ssh_attach_args
    assert "8045:127.0.0.1:8045" in ssh_attach_args
    assert "9267:127.0.0.1:9267" in ssh_attach_args
    assert "tmux attach-session" in ssh_attach_args[-1]
    assert ssh_add_args == [str(git_identity_file)]
    assert curl_args == ["-fsS", "http://127.0.0.1:3045"]
    assert "Google Chrome" in open_args
    assert open_args[-1] == "http://127.0.0.1:3045"
    assert (
        "Loading Git identity into the session ssh-agent..."
        in result.stderr
    )
    assert (
        "Git identity registered with the session ssh-agent. YubiKey touch may still be required on the first GitHub operation."
        in result.stderr
    )
    assert "Syncing Codex auth to the remote devbox..." in result.stderr
    assert (
        "Preparing remote ai runtime for /home/ubuntu/dev/aws_script_sandbox..."
        in result.stderr
    )
    assert (
        "Remote ai runtime ready: frontend http://127.0.0.1:3045, backend http://127.0.0.1:8045, cdp 9267."
        in result.stderr
    )
    assert "Opening local browser at http://127.0.0.1:3045..." in result.stderr
    assert "Opening remote ai session..." in result.stderr


def test_remote_ai_sh_opens_browser_once_forwarded_port_accepts_connections(
    tmp_path: Path,
) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(
        tmp_path, sandbox_name="aws_script_sandbox_browser_fallback"
    )
    ssh_runtime_args_capture = sandbox_root / "ssh-runtime-args-browser-fallback.txt"
    ssh_attach_args_capture = sandbox_root / "ssh-attach-args-browser-fallback.txt"
    open_args_capture = sandbox_root / "open-args-browser-fallback.txt"
    curl_args_capture = sandbox_root / "curl-args-browser-fallback.txt"
    identity_file = sandbox_root / "setta-devbox-login"
    identity_file.write_text("private-key-placeholder\n", encoding="utf-8")
    git_identity_file = sandbox_root / "macgitkey"
    git_identity_file.write_text("git-key-placeholder\n", encoding="utf-8")

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        local_frontend_port = listener.getsockname()[1]

        (env_dir / "aws-devbox.env").write_text(
            "\n".join(
                [
                    "AWS_PROFILE=setta-admin",
                    f"SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE={identity_file}",
                    f"SETTA_AWS_DEVBOX_GIT_IDENTITY_FILE={git_identity_file}",
                    "SETTA_AWS_DEVBOX_REPO_REMOTE_URL=git@github.com:riteofstring/setta.git",
                    "SETTA_AWS_DEVBOX_REPO_BRANCH=pixijs-graph",
                    "SETTA_AWS_DEVBOX_REMOTE_BROWSER_MODE=headless",
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        working_dir = sandbox_root / "backend" / "setta"
        working_dir.mkdir(parents=True, exist_ok=True)
        write_stub_executable(
            bin_dir / "python",
            """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-" ]; then
  /usr/bin/env python3 "$@"
  exit $?
fi
if [ "${2:-}" = "status" ] && [ "${3:-}" = "--json" ]; then
  printf '%s\n' '{"instance_id":"i-devbox","region":"us-east-1","repo_checkout_path":"/home/ubuntu/dev/setta.pixijs-graph"}'
fi
""",
        )
        write_stub_executable(
            bin_dir / "ssh",
            f"""#!/usr/bin/env bash
set -euo pipefail
if printf '%s\n' "$@" | grep -Fq 'dev-runtime-info.sh'; then
  printf '%s\n' "$@" > "{ssh_runtime_args_capture}"
  printf '%s\n' '{{"frontendUrl":"http://127.0.0.1:{local_frontend_port}","backendUrl":"http://127.0.0.1:8045","debugPort":9267}}'
  exit 0
fi
printf '%s\n' "$@" > "{ssh_attach_args_capture}"
sleep 1
""",
        )
        write_stub_executable(
            bin_dir / "ssh-agent",
            """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-s" ]; then
  cat <<'EOF'
SSH_AUTH_SOCK=/tmp/managed-agent; export SSH_AUTH_SOCK;
SSH_AGENT_PID=4242; export SSH_AGENT_PID;
echo Agent pid 4242;
EOF
  exit 0
fi
if [ "${1:-}" = "-k" ]; then
  exit 0
fi
exit 1
""",
        )
        write_stub_executable(
            bin_dir / "ssh-add",
            """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
        )
        write_stub_executable(
            bin_dir / "curl",
            f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "{curl_args_capture}"
exit 1
""",
        )
        write_stub_executable(
            bin_dir / "open",
            f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "{open_args_capture}"
""",
        )

        home_dir = sandbox_root / "home"
        home_dir.mkdir(parents=True, exist_ok=True)
        env = script_env(bin_dir, home_dir)

        # A listening forwarded port is sufficient to open the browser even if the
        # first frontend HTTP probe fails with a transient connection reset/error.
        result = run_script(
            ["sh", str(sandbox_root / "remote.sh"), "local"],
            cwd=working_dir,
            env=env,
        )

    assert result.returncode == 0, result.stderr
    ssh_runtime_args = ssh_runtime_args_capture.read_text(encoding="utf-8").splitlines()
    ssh_attach_args = ssh_attach_args_capture.read_text(encoding="utf-8").splitlines()
    open_args = open_args_capture.read_text(encoding="utf-8").splitlines()
    curl_args = curl_args_capture.read_text(encoding="utf-8").splitlines()

    assert "ubuntu@i-devbox" in ssh_runtime_args
    assert "ubuntu@i-devbox" in ssh_attach_args
    assert curl_args == ["-fsS", f"http://127.0.0.1:{local_frontend_port}"]
    assert "Google Chrome" in open_args
    assert open_args[-1] == f"http://127.0.0.1:{local_frontend_port}"
    assert (
        f"Opening local browser at http://127.0.0.1:{local_frontend_port}..."
        in result.stderr
    )
    assert (
        "Warning: local remote-ai tunnel did not become ready before browser launch timeout."
        not in result.stderr
    )


def test_remote_sh_reset_local_uses_remote_aireset_lifecycle(tmp_path: Path) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(tmp_path)
    ssh_runtime_args_capture = sandbox_root / "ssh-runtime-args-aireset.txt"
    ssh_attach_args_capture = sandbox_root / "ssh-attach-args-aireset.txt"
    identity_file = sandbox_root / "setta-devbox-login"
    identity_file.write_text("private-key-placeholder\n", encoding="utf-8")
    git_identity_file = sandbox_root / "macgitkey"
    git_identity_file.write_text("git-key-placeholder\n", encoding="utf-8")

    (env_dir / "aws-devbox.env").write_text(
        "\n".join(
            [
                "AWS_PROFILE=setta-admin",
                f"SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE={identity_file}",
                f"SETTA_AWS_DEVBOX_GIT_IDENTITY_FILE={git_identity_file}",
                "SETTA_AWS_DEVBOX_OPEN_BROWSER=0",
                "SETTA_AWS_DEVBOX_REPO_REMOTE_URL=git@github.com:riteofstring/setta.git",
                "SETTA_AWS_DEVBOX_REPO_BRANCH=pixijs-graph",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    write_stub_executable(
        bin_dir / "python",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-" ]; then
  /usr/bin/env python3 "$@"
  exit $?
fi
if [ "${2:-}" = "status" ] && [ "${3:-}" = "--json" ]; then
  printf '%s\n' '{"instance_id":"i-devbox","region":"us-east-1","repo_checkout_path":"/home/ubuntu/dev/setta.pixijs-graph"}'
fi
""",
    )
    write_stub_executable(
        bin_dir / "ssh",
        f"""#!/usr/bin/env bash
set -euo pipefail
    if printf '%s\n' "$@" | grep -Fq 'dev-runtime-info.sh'; then
  printf '%s\n' "$@" > "{ssh_runtime_args_capture}"
  printf '%s\n' '{{"frontendUrl":"http://127.0.0.1:3045","backendUrl":"http://127.0.0.1:8045","debugPort":9267}}'
  exit 0
fi
printf '%s\n' "$@" > "{ssh_attach_args_capture}"
""",
    )
    write_stub_executable(
        bin_dir / "ssh-agent",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-s" ]; then
  cat <<'EOF'
SSH_AUTH_SOCK=/tmp/managed-agent; export SSH_AUTH_SOCK;
SSH_AGENT_PID=4242; export SSH_AGENT_PID;
echo Agent pid 4242;
EOF
  exit 0
fi
if [ "${1:-}" = "-k" ]; then
  exit 0
fi
exit 1
""",
    )
    write_stub_executable(
        bin_dir / "ssh-add",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(bin_dir, home_dir)

    result = run_script(
        ["sh", "./remote.sh", "reset", "local"],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    ssh_runtime_args = ssh_runtime_args_capture.read_text(encoding="utf-8").splitlines()
    ssh_attach_args = ssh_attach_args_capture.read_text(encoding="utf-8").splitlines()

    assert "SETTA_REMOTE_LIFECYCLE_MODE=aireset" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_BROWSER_MODE=headless" in ssh_runtime_args[-1]
    assert (
        'remote_runtime_info_script="${remote_worktree_root}/scripts/dev-runtime-info.sh"'
        in ssh_runtime_args[-1]
    )
    assert (
        "Preparing remote aireset runtime for /home/ubuntu/dev/aws_script_sandbox..."
        in result.stderr
    )
    assert (
        "Remote aireset runtime ready: frontend http://127.0.0.1:3045, backend http://127.0.0.1:8045, cdp 9267."
        in result.stderr
    )
    assert "tmux attach-session" in ssh_attach_args[-1]


def test_remote_sh_local_sanitizes_tmux_session_name_for_dotted_worktree_names(
    tmp_path: Path,
) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(
        tmp_path, sandbox_name="aws.script.sandbox"
    )
    ssh_runtime_args_capture = sandbox_root / "ssh-runtime-args-dotted.txt"
    ssh_attach_args_capture = sandbox_root / "ssh-attach-args-dotted.txt"
    identity_file = sandbox_root / "setta-devbox-login"
    identity_file.write_text("private-key-placeholder\n", encoding="utf-8")
    git_identity_file = sandbox_root / "macgitkey"
    git_identity_file.write_text("git-key-placeholder\n", encoding="utf-8")

    (env_dir / "aws-devbox.env").write_text(
        "\n".join(
            [
                "AWS_PROFILE=setta-admin",
                f"SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE={identity_file}",
                f"SETTA_AWS_DEVBOX_GIT_IDENTITY_FILE={git_identity_file}",
                "SETTA_AWS_DEVBOX_OPEN_BROWSER=0",
                "SETTA_AWS_DEVBOX_REPO_REMOTE_URL=git@github.com:riteofstring/setta.git",
                "SETTA_AWS_DEVBOX_REPO_BRANCH=pixijs-graph",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    write_stub_executable(
        bin_dir / "python",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-" ]; then
  /usr/bin/env python3 "$@"
  exit $?
fi
if [ "${2:-}" = "status" ] && [ "${3:-}" = "--json" ]; then
  printf '%s\n' '{"instance_id":"i-devbox","region":"us-east-1","repo_checkout_path":"/home/ubuntu/dev/setta.pixijs-graph"}'
fi
""",
    )
    write_stub_executable(
        bin_dir / "ssh",
        f"""#!/usr/bin/env bash
set -euo pipefail
    if printf '%s\n' "$@" | grep -Fq 'dev-runtime-info.sh'; then
  printf '%s\n' "$@" > "{ssh_runtime_args_capture}"
  printf '%s\n' '{{"frontendUrl":"http://127.0.0.1:3045","backendUrl":"http://127.0.0.1:8045","debugPort":9267}}'
  exit 0
fi
printf '%s\n' "$@" > "{ssh_attach_args_capture}"
""",
    )
    write_stub_executable(
        bin_dir / "ssh-agent",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-s" ]; then
  cat <<'EOF'
SSH_AUTH_SOCK=/tmp/managed-agent; export SSH_AUTH_SOCK;
SSH_AGENT_PID=4242; export SSH_AGENT_PID;
echo Agent pid 4242;
EOF
  exit 0
fi
if [ "${1:-}" = "-k" ]; then
  exit 0
fi
exit 1
""",
    )
    write_stub_executable(
        bin_dir / "ssh-add",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(bin_dir, home_dir)

    result = run_script(
        ["sh", "./remote.sh", "local", "--no-open"],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    ssh_runtime_args = ssh_runtime_args_capture.read_text(encoding="utf-8").splitlines()
    ssh_attach_args = ssh_attach_args_capture.read_text(encoding="utf-8").splitlines()

    assert "SETTA_REMOTE_SESSION_NAME=setta-aws-script-sandbox" in ssh_runtime_args[-1]
    assert (
        'remote_runtime_info_script="${remote_worktree_root}/scripts/dev-runtime-info.sh"'
        in ssh_runtime_args[-1]
    )
    assert "SETTA_REMOTE_SESSION_NAME=setta-aws-script-sandbox" in ssh_attach_args[-1]


def test_remote_ai_sh_worktree_subcommand_creates_or_reuses_named_remote_worktree(
    tmp_path: Path,
) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(tmp_path)
    ssh_runtime_args_capture = sandbox_root / "ssh-runtime-args-worktree.txt"
    ssh_attach_args_capture = sandbox_root / "ssh-attach-args-worktree.txt"
    identity_file = sandbox_root / "setta-devbox-login"
    identity_file.write_text("private-key-placeholder\n", encoding="utf-8")
    git_identity_file = sandbox_root / "macgitkey"
    git_identity_file.write_text("git-key-placeholder\n", encoding="utf-8")

    (env_dir / "aws-devbox.env").write_text(
        "\n".join(
            [
                "AWS_PROFILE=setta-admin",
                f"SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE={identity_file}",
                f"SETTA_AWS_DEVBOX_GIT_IDENTITY_FILE={git_identity_file}",
                "SETTA_AWS_DEVBOX_OPEN_BROWSER=0",
                "SETTA_AWS_DEVBOX_REPO_REMOTE_URL=git@github.com:riteofstring/setta.git",
                "SETTA_AWS_DEVBOX_REPO_BRANCH=pixijs-graph",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    working_dir = sandbox_root / "backend" / "setta"
    working_dir.mkdir(parents=True, exist_ok=True)
    write_stub_executable(
        bin_dir / "python",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-" ]; then
  /usr/bin/env python3 "$@"
  exit $?
fi
if [ "${2:-}" = "status" ] && [ "${3:-}" = "--json" ]; then
  printf '%s\n' '{"instance_id":"i-devbox","region":"us-east-1","repo_checkout_path":"/home/ubuntu/dev/setta.pixijs-graph"}'
fi
""",
    )
    write_stub_executable(
        bin_dir / "ssh",
        f"""#!/usr/bin/env bash
set -euo pipefail
if printf '%s\n' "$@" | grep -Fq 'dev-runtime-info.sh'; then
  printf '%s\n' "$@" > "{ssh_runtime_args_capture}"
  printf '%s\n' '{{"frontendUrl":"http://127.0.0.1:3145","backendUrl":"http://127.0.0.1:8145","debugPort":9367,"mainReference":{{"workspaceRoot":"/home/ubuntu/dev/setta","frontendUrl":"http://127.0.0.1:3087/","backendUrl":"http://127.0.0.1:8087","debugPort":9309}}}}'
  exit 0
fi
printf '%s\n' "$@" > "{ssh_attach_args_capture}"
""",
    )
    write_stub_executable(
        bin_dir / "ssh-agent",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-s" ]; then
  cat <<'EOF'
SSH_AUTH_SOCK=/tmp/managed-agent; export SSH_AUTH_SOCK;
SSH_AGENT_PID=4242; export SSH_AGENT_PID;
echo Agent pid 4242;
EOF
  exit 0
fi
if [ "${1:-}" = "-k" ]; then
  exit 0
fi
exit 1
""",
    )
    write_stub_executable(
        bin_dir / "ssh-add",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(bin_dir, home_dir)

    result = run_script(
        [
            "sh",
            str(sandbox_root / "remote.sh"),
            "worktree",
            "feature-auth",
            "--no-open",
        ],
        cwd=working_dir,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    ssh_runtime_args = ssh_runtime_args_capture.read_text(encoding="utf-8").splitlines()
    ssh_attach_args = ssh_attach_args_capture.read_text(encoding="utf-8").splitlines()

    assert (
        "Preparing remote ai runtime for /home/ubuntu/dev/setta.feature-auth..."
        in result.stderr
    )
    assert "SETTA_REMOTE_REPO_BRANCH=feature-auth" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_WORKTREE_MODE=create_or_reuse_branch_worktree" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_WORKTREE_ROOT=/home/ubuntu/dev/setta.feature-auth" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_MAIN_REFERENCE_ROOT=/home/ubuntu/dev/setta" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_MAIN_REFERENCE_BRANCH=main" in ssh_runtime_args[-1]
    assert (
        "SETTA_REMOTE_START_DIR=/home/ubuntu/dev/setta.feature-auth/backend/setta"
        in ssh_runtime_args[-1]
    )
    assert "SETTA_REMOTE_SESSION_NAME=setta-setta-feature-auth" in ssh_runtime_args[-1]
    assert "tmux_session_target() {" in ssh_runtime_args[-1]
    assert "tmux_window_target() {" in ssh_runtime_args[-1]
    assert 'session_target="$(tmux_session_target "${session_name}")"' in ssh_runtime_args[-1]
    assert 'tmux has-session -t "${session_target}"' in ssh_runtime_args[-1]
    assert 'tmux respawn-window -k -t "${ai_target}"' in ssh_runtime_args[-1]
    assert "runtime_info_from_log_fallback() {" in ssh_runtime_args[-1]
    assert 'read_runtime_info "${runtime_info_script}" "${workspace_root}" "${runtime_log}" "${allow_missing_connect_info}"' in ssh_runtime_args[-1]
    assert "--allow-missing-connect-info" not in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_SESSION_NAME=setta-setta-feature-auth" in ssh_attach_args[-1]
    assert 'remote_session_target="=${remote_session_name}"' in ssh_attach_args[-1]
    assert 'exec tmux attach-session -t "${remote_session_target}"' in ssh_attach_args[-1]
    assert (
        "Remote main reference ai runtime ready: frontend http://127.0.0.1:3087/, backend http://127.0.0.1:8087, cdp 9309."
        in result.stderr
    )
    assert "Forwarded main reference frontend URL: http://127.0.0.1:3087/" in result.stderr
    assert "Remote selected tmux session: setta-setta-feature-auth" in result.stderr
    assert "Remote main reference tmux session: setta-setta" in result.stderr
    assert "-L" in ssh_attach_args
    assert "3087:127.0.0.1:3087" in ssh_attach_args
    assert "8087:127.0.0.1:8087" in ssh_attach_args
    assert "9309:127.0.0.1:9309" in ssh_attach_args


def test_remote_ai_sh_select_subcommand_targets_selected_remote_worktree(
    tmp_path: Path,
) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(tmp_path)
    ssh_runtime_args_capture = sandbox_root / "ssh-runtime-args-select.txt"
    ssh_attach_args_capture = sandbox_root / "ssh-attach-args-select.txt"
    identity_file = sandbox_root / "setta-devbox-login"
    identity_file.write_text("private-key-placeholder\n", encoding="utf-8")
    git_identity_file = sandbox_root / "macgitkey"
    git_identity_file.write_text("git-key-placeholder\n", encoding="utf-8")

    (env_dir / "aws-devbox.env").write_text(
        "\n".join(
            [
                "AWS_PROFILE=setta-admin",
                f"SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE={identity_file}",
                f"SETTA_AWS_DEVBOX_GIT_IDENTITY_FILE={git_identity_file}",
                "SETTA_AWS_DEVBOX_OPEN_BROWSER=0",
                "SETTA_AWS_DEVBOX_REPO_REMOTE_URL=git@github.com:riteofstring/setta.git",
                "SETTA_AWS_DEVBOX_REPO_BRANCH=pixijs-graph",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    working_dir = sandbox_root / "backend" / "setta"
    working_dir.mkdir(parents=True, exist_ok=True)
    write_stub_executable(
        bin_dir / "python",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-" ]; then
  /usr/bin/env python3 "$@"
  exit $?
fi
if [ "${2:-}" = "status" ] && [ "${3:-}" = "--json" ]; then
  printf '%s\n' '{"instance_id":"i-devbox","region":"us-east-1","repo_checkout_path":"/home/ubuntu/dev/setta.pixijs-graph"}'
fi
""",
    )
    write_stub_executable(
        bin_dir / "ssh",
        f"""#!/usr/bin/env bash
set -euo pipefail
last_arg="${{@: -1}}"
if printf '%s\n' "$last_arg" | grep -Fq 'SETTA_REMOTE_ENTRYPOINT_PARENT='; then
  cat <<'EOF'
/home/ubuntu/dev/setta.pixijs-graph	setta.pixijs-graph	pixijs-graph	1
/home/ubuntu/dev/setta.feature-b	setta.feature-b	feature-b	0
EOF
  exit 0
fi
if printf '%s\n' "$last_arg" | grep -Fq 'dev-runtime-info.sh'; then
  printf '%s\n' "$@" > "{ssh_runtime_args_capture}"
  printf '%s\n' '{{"frontendUrl":"http://127.0.0.1:3245","backendUrl":"http://127.0.0.1:8245","debugPort":9467}}'
  exit 0
fi
printf '%s\n' "$@" > "{ssh_attach_args_capture}"
""",
    )
    write_stub_executable(
        bin_dir / "ssh-agent",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-s" ]; then
  cat <<'EOF'
SSH_AUTH_SOCK=/tmp/managed-agent; export SSH_AUTH_SOCK;
SSH_AGENT_PID=4242; export SSH_AGENT_PID;
echo Agent pid 4242;
EOF
  exit 0
fi
if [ "${1:-}" = "-k" ]; then
  exit 0
fi
exit 1
""",
    )
    write_stub_executable(
        bin_dir / "ssh-add",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(bin_dir, home_dir)
    env["SETTA_AWS_DEVBOX_SELECT_INDEX"] = "2"

    result = run_script(
        ["sh", str(sandbox_root / "remote.sh"), "select", "--no-open"],
        cwd=working_dir,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    ssh_runtime_args = ssh_runtime_args_capture.read_text(encoding="utf-8").splitlines()
    ssh_attach_args = ssh_attach_args_capture.read_text(encoding="utf-8").splitlines()

    assert (
        "Preparing remote ai runtime for /home/ubuntu/dev/setta.feature-b..."
        in result.stderr
    )
    assert "SETTA_REMOTE_REPO_BRANCH=feature-b" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_WORKTREE_MODE=reuse_existing_worktree" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_WORKTREE_ROOT=/home/ubuntu/dev/setta.feature-b" in ssh_runtime_args[-1]
    assert (
        "SETTA_REMOTE_START_DIR=/home/ubuntu/dev/setta.feature-b/backend/setta"
        in ssh_runtime_args[-1]
    )
    assert "SETTA_REMOTE_SESSION_NAME=setta-setta-feature-b" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_SESSION_NAME=setta-setta-feature-b" in ssh_attach_args[-1]


def test_remote_ai_sh_select_subcommand_falls_back_to_repo_entrypoints(
    tmp_path: Path,
) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(tmp_path)
    ssh_runtime_args_capture = sandbox_root / "ssh-runtime-args-select-entrypoint.txt"
    ssh_attach_args_capture = sandbox_root / "ssh-attach-args-select-entrypoint.txt"
    identity_file = sandbox_root / "setta-devbox-login"
    identity_file.write_text("private-key-placeholder\n", encoding="utf-8")
    git_identity_file = sandbox_root / "macgitkey"
    git_identity_file.write_text("git-key-placeholder\n", encoding="utf-8")

    (env_dir / "aws-devbox.env").write_text(
        "\n".join(
            [
                "AWS_PROFILE=setta-admin",
                f"SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE={identity_file}",
                f"SETTA_AWS_DEVBOX_GIT_IDENTITY_FILE={git_identity_file}",
                "SETTA_AWS_DEVBOX_OPEN_BROWSER=0",
                "SETTA_AWS_DEVBOX_REPO_REMOTE_URL=git@github.com:riteofstring/setta.git",
                "SETTA_AWS_DEVBOX_REPO_BRANCH=pixijs-graph",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    working_dir = sandbox_root / "backend" / "setta"
    working_dir.mkdir(parents=True, exist_ok=True)
    write_stub_executable(
        bin_dir / "python",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-" ]; then
  /usr/bin/env python3 "$@"
  exit $?
fi
if [ "${2:-}" = "status" ] && [ "${3:-}" = "--json" ]; then
  printf '%s\n' '{"instance_id":"i-devbox","region":"us-east-1","repo_checkout_path":"/home/ubuntu/dev/setta.pixijs-graph"}'
fi
""",
    )
    write_stub_executable(
        bin_dir / "ssh",
        f"""#!/usr/bin/env bash
set -euo pipefail
if printf '%s\n' "$@" | grep -Fq 'SETTA_REMOTE_ENTRYPOINT_PARENT=/home/ubuntu/dev'; then
  cat <<'EOF'
/home/ubuntu/dev/setta.pixijs-graph-main	setta.pixijs-graph-main	main	0	entrypoint
/home/ubuntu/dev/setta.pixijs-graph-canary	setta.pixijs-graph-canary	pixijs-graph	0	entrypoint
EOF
  exit 0
fi
if printf '%s\n' "$@" | grep -Fq 'dev-runtime-info.sh'; then
  printf '%s\n' "$@" > "{ssh_runtime_args_capture}"
  printf '%s\n' '{{"frontendUrl":"http://127.0.0.1:3445","backendUrl":"http://127.0.0.1:8445","debugPort":9667}}'
  exit 0
fi
printf '%s\n' "$@" > "{ssh_attach_args_capture}"
""",
    )
    write_stub_executable(
        bin_dir / "ssh-agent",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-s" ]; then
  cat <<'EOF'
SSH_AUTH_SOCK=/tmp/managed-agent; export SSH_AUTH_SOCK;
SSH_AGENT_PID=4242; export SSH_AGENT_PID;
echo Agent pid 4242;
EOF
  exit 0
fi
if [ "${1:-}" = "-k" ]; then
  exit 0
fi
exit 1
""",
    )
    write_stub_executable(
        bin_dir / "ssh-add",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(bin_dir, home_dir)
    env["SETTA_AWS_DEVBOX_SELECT_INDEX"] = "2"

    result = run_script(
        ["sh", str(sandbox_root / "remote.sh"), "select", "--no-open"],
        cwd=working_dir,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    ssh_runtime_args = ssh_runtime_args_capture.read_text(encoding="utf-8").splitlines()
    ssh_attach_args = ssh_attach_args_capture.read_text(encoding="utf-8").splitlines()

    assert (
        "No remote worktrees found on the devbox; falling back to repo folders under /home/ubuntu/dev."
        in result.stderr
    )
    assert (
        "Preparing remote ai runtime for /home/ubuntu/dev/setta.pixijs-graph-canary..."
        in result.stderr
    )
    assert "SETTA_REMOTE_REPO_BRANCH=pixijs-graph" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_WORKTREE_MODE=reuse_existing_worktree" in ssh_runtime_args[-1]
    assert (
        "SETTA_REMOTE_WORKTREE_ROOT=/home/ubuntu/dev/setta.pixijs-graph-canary"
        in ssh_runtime_args[-1]
    )
    assert (
        "SETTA_REMOTE_START_DIR=/home/ubuntu/dev/setta.pixijs-graph-canary/backend/setta"
        in ssh_runtime_args[-1]
    )
    assert (
        "SETTA_REMOTE_SESSION_NAME=setta-setta-pixijs-graph-canary"
        in ssh_runtime_args[-1]
    )
    assert (
        "SETTA_REMOTE_SESSION_NAME=setta-setta-pixijs-graph-canary"
        in ssh_attach_args[-1]
    )


def test_remote_ai_sh_select_subcommand_executes_generated_worktree_catalog_command(
    tmp_path: Path,
) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(tmp_path)
    ssh_runtime_args_capture = sandbox_root / "ssh-runtime-args-select-generated.txt"
    ssh_attach_args_capture = sandbox_root / "ssh-attach-args-select-generated.txt"
    identity_file = sandbox_root / "setta-devbox-login"
    identity_file.write_text("private-key-placeholder\n", encoding="utf-8")
    git_identity_file = sandbox_root / "macgitkey"
    git_identity_file.write_text("git-key-placeholder\n", encoding="utf-8")

    remote_repo_root = tmp_path / "remote-dev" / "setta.pixijs-graph"
    remote_repo_root.mkdir(parents=True, exist_ok=True)
    git_env = {
        **os.environ,
        "GIT_AUTHOR_NAME": "Test User",
        "GIT_AUTHOR_EMAIL": "test@example.com",
        "GIT_COMMITTER_NAME": "Test User",
        "GIT_COMMITTER_EMAIL": "test@example.com",
    }
    subprocess.run(
        ["git", "init", "-b", "pixijs-graph", str(remote_repo_root)],
        check=True,
        capture_output=True,
        text=True,
    )
    (remote_repo_root / "README.md").write_text("catalog test\n", encoding="utf-8")
    subprocess.run(
        ["git", "-C", str(remote_repo_root), "add", "README.md"],
        check=True,
        capture_output=True,
        text=True,
        env=git_env,
    )
    subprocess.run(
        ["git", "-C", str(remote_repo_root), "commit", "-m", "init"],
        check=True,
        capture_output=True,
        text=True,
        env=git_env,
    )

    (env_dir / "aws-devbox.env").write_text(
        "\n".join(
            [
                "AWS_PROFILE=setta-admin",
                f"SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE={identity_file}",
                f"SETTA_AWS_DEVBOX_GIT_IDENTITY_FILE={git_identity_file}",
                "SETTA_AWS_DEVBOX_OPEN_BROWSER=0",
                "SETTA_AWS_DEVBOX_REPO_REMOTE_URL=git@github.com:riteofstring/setta.git",
                "SETTA_AWS_DEVBOX_REPO_BRANCH=pixijs-graph",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    working_dir = sandbox_root / "backend" / "setta"
    working_dir.mkdir(parents=True, exist_ok=True)
    write_stub_executable(
        bin_dir / "python",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [ "${{1:-}}" = "-" ]; then
  /usr/bin/env python3 "$@"
  exit $?
fi
if [ "${{2:-}}" = "status" ] && [ "${{3:-}}" = "--json" ]; then
  printf '%s\\n' '{{"instance_id":"i-devbox","region":"us-east-1","repo_checkout_path":"{remote_repo_root}"}}'
fi
""",
    )
    write_stub_executable(
        bin_dir / "ssh",
        f"""#!/usr/bin/env bash
set -euo pipefail
last_arg="${{@: -1}}"
if printf '%s\\n' "$last_arg" | grep -Fq 'SETTA_REMOTE_ENTRYPOINT_PARENT='; then
  bash -lc "$last_arg"
  exit 0
fi
if printf '%s\\n' "$last_arg" | grep -Fq 'dev-runtime-info.sh'; then
  printf '%s\\n' "$@" > "{ssh_runtime_args_capture}"
  printf '%s\\n' '{{"frontendUrl":"http://127.0.0.1:3545","backendUrl":"http://127.0.0.1:8545","debugPort":9767}}'
  exit 0
fi
printf '%s\\n' "$@" > "{ssh_attach_args_capture}"
""",
    )
    write_stub_executable(
        bin_dir / "ssh-agent",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-s" ]; then
  cat <<'EOF'
SSH_AUTH_SOCK=/tmp/managed-agent; export SSH_AUTH_SOCK;
SSH_AGENT_PID=4242; export SSH_AGENT_PID;
echo Agent pid 4242;
EOF
  exit 0
fi
if [ "${1:-}" = "-k" ]; then
  exit 0
fi
exit 1
""",
    )
    write_stub_executable(
        bin_dir / "ssh-add",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(bin_dir, home_dir)
    env["SETTA_AWS_DEVBOX_SELECT_INDEX"] = "1"

    result = run_script(
        ["sh", str(sandbox_root / "remote.sh"), "select", "--no-open"],
        cwd=working_dir,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    ssh_runtime_args = ssh_runtime_args_capture.read_text(encoding="utf-8").splitlines()
    ssh_attach_args = ssh_attach_args_capture.read_text(encoding="utf-8").splitlines()

    assert (
        f"Preparing remote ai runtime for {remote_repo_root}..." in result.stderr
    )
    assert (
        "falling back to repo folders under" not in result.stderr
    )
    assert f"SETTA_REMOTE_WORKTREE_ROOT={remote_repo_root}" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_REPO_BRANCH=pixijs-graph" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_WORKTREE_MODE=reuse_existing_worktree" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_SESSION_NAME=setta-setta-pixijs-graph" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_SESSION_NAME=setta-setta-pixijs-graph" in ssh_attach_args[-1]


def test_remote_ai_sh_select_subcommand_generated_catalog_includes_sibling_repo_entrypoint(
    tmp_path: Path,
) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(tmp_path)
    ssh_runtime_args_capture = sandbox_root / "ssh-runtime-args-select-sibling.txt"
    ssh_attach_args_capture = sandbox_root / "ssh-attach-args-select-sibling.txt"
    identity_file = sandbox_root / "setta-devbox-login"
    identity_file.write_text("private-key-placeholder\n", encoding="utf-8")
    git_identity_file = sandbox_root / "macgitkey"
    git_identity_file.write_text("git-key-placeholder\n", encoding="utf-8")

    remote_dev_root = tmp_path / "remote-dev"
    remote_repo_root = remote_dev_root / "setta.pixijs-graph"
    sibling_repo_root = remote_dev_root / "setta"
    other_repo_root = remote_dev_root / "other-setta"
    remote_repo_root.mkdir(parents=True, exist_ok=True)
    sibling_repo_root.mkdir(parents=True, exist_ok=True)
    other_repo_root.mkdir(parents=True, exist_ok=True)
    git_env = {
        **os.environ,
        "GIT_AUTHOR_NAME": "Test User",
        "GIT_AUTHOR_EMAIL": "test@example.com",
        "GIT_COMMITTER_NAME": "Test User",
        "GIT_COMMITTER_EMAIL": "test@example.com",
    }

    subprocess.run(
        ["git", "init", "-b", "pixijs-graph", str(remote_repo_root)],
        check=True,
        capture_output=True,
        text=True,
    )
    (remote_repo_root / "README.md").write_text("worktree repo\n", encoding="utf-8")
    subprocess.run(
        ["git", "-C", str(remote_repo_root), "add", "README.md"],
        check=True,
        capture_output=True,
        text=True,
        env=git_env,
    )
    subprocess.run(
        ["git", "-C", str(remote_repo_root), "commit", "-m", "init"],
        check=True,
        capture_output=True,
        text=True,
        env=git_env,
    )
    subprocess.run(
        [
            "git",
            "-C",
            str(remote_repo_root),
            "remote",
            "add",
            "origin",
            "git@github.com:riteofstring/setta.git",
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    subprocess.run(
        ["git", "init", "-b", "main", str(sibling_repo_root)],
        check=True,
        capture_output=True,
        text=True,
    )
    (sibling_repo_root / "README.md").write_text("main repo\n", encoding="utf-8")
    (sibling_repo_root / "ai.sh").write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    (sibling_repo_root / "scripts").mkdir(parents=True, exist_ok=True)
    (sibling_repo_root / "scripts" / "dev-runtime-info.sh").write_text(
        "#!/usr/bin/env bash\n",
        encoding="utf-8",
    )
    subprocess.run(
        ["git", "-C", str(sibling_repo_root), "add", "README.md", "ai.sh", "scripts/dev-runtime-info.sh"],
        check=True,
        capture_output=True,
        text=True,
        env=git_env,
    )
    subprocess.run(
        ["git", "-C", str(sibling_repo_root), "commit", "-m", "init"],
        check=True,
        capture_output=True,
        text=True,
        env=git_env,
    )
    subprocess.run(
        [
            "git",
            "-C",
            str(sibling_repo_root),
            "remote",
            "add",
            "origin",
            "git@github.com:riteofstring/setta.git",
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    subprocess.run(
        ["git", "init", "-b", "main", str(other_repo_root)],
        check=True,
        capture_output=True,
        text=True,
    )
    (other_repo_root / "README.md").write_text("other repo\n", encoding="utf-8")
    (other_repo_root / "ai.sh").write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    (other_repo_root / "scripts").mkdir(parents=True, exist_ok=True)
    (other_repo_root / "scripts" / "dev-runtime-info.sh").write_text(
        "#!/usr/bin/env bash\n",
        encoding="utf-8",
    )
    subprocess.run(
        ["git", "-C", str(other_repo_root), "add", "README.md", "ai.sh", "scripts/dev-runtime-info.sh"],
        check=True,
        capture_output=True,
        text=True,
        env=git_env,
    )
    subprocess.run(
        ["git", "-C", str(other_repo_root), "commit", "-m", "init"],
        check=True,
        capture_output=True,
        text=True,
        env=git_env,
    )
    subprocess.run(
        [
            "git",
            "-C",
            str(other_repo_root),
            "remote",
            "add",
            "origin",
            "git@github.com:riteofstring/other.git",
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    (env_dir / "aws-devbox.env").write_text(
        "\n".join(
            [
                "AWS_PROFILE=setta-admin",
                f"SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE={identity_file}",
                f"SETTA_AWS_DEVBOX_GIT_IDENTITY_FILE={git_identity_file}",
                "SETTA_AWS_DEVBOX_OPEN_BROWSER=0",
                "SETTA_AWS_DEVBOX_REPO_REMOTE_URL=git@github.com:riteofstring/setta.git",
                "SETTA_AWS_DEVBOX_REPO_BRANCH=pixijs-graph",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    working_dir = sandbox_root / "backend" / "setta"
    working_dir.mkdir(parents=True, exist_ok=True)
    write_stub_executable(
        bin_dir / "python",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [ "${{1:-}}" = "-" ]; then
  /usr/bin/env python3 "$@"
  exit $?
fi
if [ "${{2:-}}" = "status" ] && [ "${{3:-}}" = "--json" ]; then
  printf '%s\\n' '{{"instance_id":"i-devbox","region":"us-east-1","repo_checkout_path":"{remote_repo_root}"}}'
fi
""",
    )
    write_stub_executable(
        bin_dir / "ssh",
        f"""#!/usr/bin/env bash
set -euo pipefail
last_arg="${{@: -1}}"
if printf '%s\\n' "$last_arg" | grep -Fq 'SETTA_REMOTE_ENTRYPOINT_PARENT='; then
  bash -lc "$last_arg"
  exit 0
fi
if printf '%s\\n' "$last_arg" | grep -Fq 'dev-runtime-info.sh'; then
  printf '%s\\n' "$@" > "{ssh_runtime_args_capture}"
  printf '%s\\n' '{{"frontendUrl":"http://127.0.0.1:3645","backendUrl":"http://127.0.0.1:8645","debugPort":9867}}'
  exit 0
fi
printf '%s\\n' "$@" > "{ssh_attach_args_capture}"
""",
    )
    write_stub_executable(
        bin_dir / "ssh-agent",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-s" ]; then
  cat <<'EOF'
SSH_AUTH_SOCK=/tmp/managed-agent; export SSH_AUTH_SOCK;
SSH_AGENT_PID=4242; export SSH_AGENT_PID;
echo Agent pid 4242;
EOF
  exit 0
fi
if [ "${1:-}" = "-k" ]; then
  exit 0
fi
exit 1
""",
    )
    write_stub_executable(
        bin_dir / "ssh-add",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(bin_dir, home_dir)
    env["SETTA_AWS_DEVBOX_SELECT_INDEX"] = "2"

    result = run_script(
        ["sh", str(sandbox_root / "remote.sh"), "select", "--no-open"],
        cwd=working_dir,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    ssh_runtime_args = ssh_runtime_args_capture.read_text(encoding="utf-8").splitlines()
    ssh_attach_args = ssh_attach_args_capture.read_text(encoding="utf-8").splitlines()

    assert f"Preparing remote ai runtime for {sibling_repo_root}..." in result.stderr
    assert "falling back to repo folders under" not in result.stderr
    assert f"SETTA_REMOTE_WORKTREE_ROOT={sibling_repo_root}" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_REPO_BRANCH=main" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_WORKTREE_MODE=reuse_existing_worktree" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_SESSION_NAME=setta-setta" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_SESSION_NAME=setta-setta" in ssh_attach_args[-1]


def test_remote_sh_defaults_to_select_mode_for_runtime_sessions(
    tmp_path: Path,
) -> None:
    sandbox_root, bin_dir, env_dir = _build_aws_sandbox(tmp_path)
    ssh_runtime_args_capture = sandbox_root / "ssh-runtime-args-remote-default.txt"
    ssh_attach_args_capture = sandbox_root / "ssh-attach-args-remote-default.txt"
    identity_file = sandbox_root / "setta-devbox-login"
    identity_file.write_text("private-key-placeholder\n", encoding="utf-8")
    git_identity_file = sandbox_root / "macgitkey"
    git_identity_file.write_text("git-key-placeholder\n", encoding="utf-8")

    (env_dir / "aws-devbox.env").write_text(
        "\n".join(
            [
                "AWS_PROFILE=setta-admin",
                f"SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE={identity_file}",
                f"SETTA_AWS_DEVBOX_GIT_IDENTITY_FILE={git_identity_file}",
                "SETTA_AWS_DEVBOX_OPEN_BROWSER=0",
                "SETTA_AWS_DEVBOX_REPO_REMOTE_URL=git@github.com:riteofstring/setta.git",
                "SETTA_AWS_DEVBOX_REPO_BRANCH=pixijs-graph",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    working_dir = sandbox_root / "backend" / "setta"
    working_dir.mkdir(parents=True, exist_ok=True)
    write_stub_executable(
        bin_dir / "python",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-" ]; then
  /usr/bin/env python3 "$@"
  exit $?
fi
if [ "${2:-}" = "status" ] && [ "${3:-}" = "--json" ]; then
  printf '%s\n' '{"instance_id":"i-devbox","region":"us-east-1","repo_checkout_path":"/home/ubuntu/dev/setta.pixijs-graph"}'
fi
""",
    )
    write_stub_executable(
        bin_dir / "ssh",
        f"""#!/usr/bin/env bash
set -euo pipefail
last_arg="${{@: -1}}"
if printf '%s\n' "$last_arg" | grep -Fq 'SETTA_REMOTE_ENTRYPOINT_PARENT='; then
  cat <<'EOF'
/home/ubuntu/dev/setta.pixijs-graph	setta.pixijs-graph	pixijs-graph	1
/home/ubuntu/dev/setta.feature-b	setta.feature-b	feature-b	0
EOF
  exit 0
fi
if printf '%s\n' "$last_arg" | grep -Fq 'dev-runtime-info.sh'; then
  printf '%s\n' "$@" > "{ssh_runtime_args_capture}"
  printf '%s\n' '{{"frontendUrl":"http://127.0.0.1:3345","backendUrl":"http://127.0.0.1:8345","debugPort":9567}}'
  exit 0
fi
printf '%s\n' "$@" > "{ssh_attach_args_capture}"
""",
    )
    write_stub_executable(
        bin_dir / "ssh-agent",
        """#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-s" ]; then
  cat <<'EOF'
SSH_AUTH_SOCK=/tmp/managed-agent; export SSH_AUTH_SOCK;
SSH_AGENT_PID=4242; export SSH_AGENT_PID;
echo Agent pid 4242;
EOF
  exit 0
fi
if [ "${1:-}" = "-k" ]; then
  exit 0
fi
exit 1
""",
    )
    write_stub_executable(
        bin_dir / "ssh-add",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )

    home_dir = sandbox_root / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(bin_dir, home_dir)
    env["SETTA_AWS_DEVBOX_SELECT_INDEX"] = "2"

    result = run_script(
        ["sh", str(sandbox_root / "remote.sh"), "--no-open"],
        cwd=working_dir,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    ssh_runtime_args = ssh_runtime_args_capture.read_text(encoding="utf-8").splitlines()
    ssh_attach_args = ssh_attach_args_capture.read_text(encoding="utf-8").splitlines()

    assert (
        "Preparing remote ai runtime for /home/ubuntu/dev/setta.feature-b..."
        in result.stderr
    )
    assert "SETTA_REMOTE_WORKTREE_ROOT=/home/ubuntu/dev/setta.feature-b" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_SESSION_NAME=setta-setta-feature-b" in ssh_runtime_args[-1]
    assert "SETTA_REMOTE_SESSION_NAME=setta-setta-feature-b" in ssh_attach_args[-1]
