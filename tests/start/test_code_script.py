import json
import os
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _write_executable(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _build_sandbox(tmp_path: Path) -> Path:
    repo_root = _repo_root()
    sandbox_root = tmp_path / "setta"
    for rel_path in (
        "code.sh",
        "scripts/aws-devbox-common.sh",
        "scripts/aws-devbox-vscode.sh",
        "scripts/aws-devbox-worktree-picker.sh",
    ):
        src = repo_root / rel_path
        dst = sandbox_root / rel_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        dst.chmod(0o755)

    (sandbox_root / "activate.sh").write_text("#!/bin/sh\n", encoding="utf-8")
    env_file = sandbox_root / "infra" / "aws-devbox" / "aws-devbox.env"
    env_file.parent.mkdir(parents=True, exist_ok=True)
    env_file.write_text("AWS_PROFILE=setta-admin\n", encoding="utf-8")

    _write_executable(
        sandbox_root / "scripts" / "aws_devbox.py",
        """#!/usr/bin/env python3
import json
import sys

if len(sys.argv) > 1 and sys.argv[1] == "up":
    raise SystemExit(0)

if sys.argv[1:] == ["status", "--json"]:
    print(json.dumps({
        "instance_id": "i-test123",
        "region": "us-east-1",
        "repo_checkout_path": "/home/ubuntu/dev/setta.pixijs-graph",
        "state": "running",
        "ssm_ping_status": "online",
    }))
    raise SystemExit(0)

raise SystemExit(f"unexpected aws_devbox.py args: {sys.argv[1:]}")
""",
    )
    return sandbox_root


def _write_stub_bin(tmp_path: Path) -> Path:
    bin_dir = tmp_path / "bin"
    _write_executable(
        bin_dir / "ssh",
        """#!/usr/bin/env python3
import os
import sys
from pathlib import Path

capture = Path(os.environ["SSH_CAPTURE_PATH"])
capture.write_text(json_dump := "\\n".join(sys.argv[1:]), encoding="utf-8")
sys.stdout.write(os.environ.get("SSH_STDOUT", ""))
""",
    )
    _write_executable(
        bin_dir / "code",
        """#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

args = sys.argv[1:]
if "--list-extensions" in args:
    if os.environ.get("CODE_REMOTE_SSH_INSTALLED", "1") == "1":
        print("ms-vscode-remote.remote-ssh")
    raise SystemExit(0)

if "--install-extension" in args:
    Path(os.environ["CODE_INSTALL_CAPTURE"]).write_text(json.dumps(args), encoding="utf-8")
    raise SystemExit(0)

Path(os.environ["CODE_INVOCATION_CAPTURE"]).write_text(json.dumps(args), encoding="utf-8")
""",
    )
    return bin_dir


def test_code_sh_opens_selected_remote_folder_in_vscode(tmp_path: Path) -> None:
    sandbox_root = _build_sandbox(tmp_path)
    bin_dir = _write_stub_bin(tmp_path)
    home_dir = tmp_path / "home"
    ssh_capture_path = tmp_path / "ssh_capture.txt"
    code_capture_path = tmp_path / "code_capture.json"

    env = os.environ.copy()
    env["HOME"] = str(home_dir)
    env["PATH"] = f"{bin_dir}:{env['PATH']}"
    env["SETTA_AWS_DEVBOX_SELECT_INDEX"] = "2"
    env["SSH_CAPTURE_PATH"] = str(ssh_capture_path)
    env["CODE_INVOCATION_CAPTURE"] = str(code_capture_path)
    env["CODE_INSTALL_CAPTURE"] = str(tmp_path / "unused_install.json")
    env["SSH_STDOUT"] = (
        "/home/ubuntu/dev/setta.pixijs-graph\tsetta.pixijs-graph\tpixijs-graph\t1\tworktree\n"
        "/home/ubuntu/dev/setta.go-rewrite-dom-simple\tsetta.go-rewrite-dom-simple\tgo-rewrite-dom-simple\t0\tworktree\n"
    )

    result = subprocess.run(
        ["bash", str(sandbox_root / "code.sh")],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    code_args = json.loads(code_capture_path.read_text(encoding="utf-8"))
    assert code_args == [
        "--new-window",
        "--folder-uri",
        "vscode-remote://ssh-remote+setta-aws-devbox/home/ubuntu/dev/setta.go-rewrite-dom-simple",
    ]

    managed_ssh_config = home_dir / ".ssh" / "setta-aws-devbox.config"
    ssh_config = home_dir / ".ssh" / "config"
    assert managed_ssh_config.exists()
    assert ssh_config.exists()
    assert f"Include {managed_ssh_config}" in ssh_config.read_text(encoding="utf-8")
    managed_text = managed_ssh_config.read_text(encoding="utf-8")
    assert "Host setta-aws-devbox" in managed_text
    assert "HostName i-test123" in managed_text
    assert "ProxyCommand aws --profile setta-admin --region us-east-1" in managed_text


def test_code_sh_installs_remote_ssh_extension_when_missing(tmp_path: Path) -> None:
    sandbox_root = _build_sandbox(tmp_path)
    bin_dir = _write_stub_bin(tmp_path)
    home_dir = tmp_path / "home"
    install_capture_path = tmp_path / "install_capture.json"
    code_capture_path = tmp_path / "code_capture.json"

    env = os.environ.copy()
    env["HOME"] = str(home_dir)
    env["PATH"] = f"{bin_dir}:{env['PATH']}"
    env["CODE_REMOTE_SSH_INSTALLED"] = "0"
    env["SSH_CAPTURE_PATH"] = str(tmp_path / "ssh_capture.txt")
    env["CODE_INSTALL_CAPTURE"] = str(install_capture_path)
    env["CODE_INVOCATION_CAPTURE"] = str(code_capture_path)

    result = subprocess.run(
        ["bash", str(sandbox_root / "code.sh"), "local"],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    install_args = json.loads(install_capture_path.read_text(encoding="utf-8"))
    assert install_args == ["--install-extension", "ms-vscode-remote.remote-ssh", "--force"]

    code_args = json.loads(code_capture_path.read_text(encoding="utf-8"))
    assert code_args == [
        "--new-window",
        "--folder-uri",
        "vscode-remote://ssh-remote+setta-aws-devbox/home/ubuntu/dev/setta",
    ]
