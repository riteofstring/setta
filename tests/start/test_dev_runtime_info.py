import base64
import json
import os
import subprocess
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _status_payload(session_id: str, port: int) -> str:
    payload = {
        "bootstrapUrlFragment": f"http://127.0.0.1:{port}/__setta__/bootstrap#token=test-token",
        "bootstrapUrlPlain": f"http://127.0.0.1:{port}/__setta__/bootstrap",
        "runtimeRoot": "/tmp/runtime",
        "session": {
            "host": "127.0.0.1",
            "id": session_id,
            "pid": 12345,
            "port": port,
            "serverMode": "ide",
            "startedAt": "2026-04-07T21:32:21.307001+00:00",
            "workspacePath": "/tmp/worktree",
            "workspacePathCanonical": "/tmp/worktree",
        },
        "settaFilesRoot": "/tmp/setta-files",
        "settaHome": "/tmp/setta-home",
    }
    encoded = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
    return f"__SETTA_JSON_B64__{encoded}"


def _run_dev_runtime_info(
    tmp_path: Path,
    runtime_log_body: str,
    session_id: str,
    backend_port: int,
) -> dict[str, object]:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "dev-runtime-info.sh"
    workspace_root = tmp_path / "worktree"
    stub_dir = tmp_path / "bin"
    runtime_log_path = tmp_path / "runtime.log"
    workspace_root.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)
    runtime_log_path.write_text(runtime_log_body, encoding="utf-8")

    # Resolve every rev-parse request back to the disposable workspace so the
    # helper never inspects the real repo when deriving runtime metadata.
    _write_executable(
        stub_dir / "git",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"rev-parse --show-toplevel"* ]]; then
  printf '%s\\n' "{workspace_root}"
  exit 0
fi
echo "unsupported git args: $*" >&2
exit 1
""",
    )

    _write_executable(
        stub_dir / "setta",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' '{_status_payload(session_id, backend_port)}'
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"

    result = subprocess.run(
        [
            "bash",
            str(script_path),
            "--workspace",
            str(workspace_root),
            "--runtime-log",
            str(runtime_log_path),
        ],
        cwd=repo_root,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_dev_runtime_info_omits_stale_frontend_url_when_log_session_is_stale(
    tmp_path: Path,
) -> None:
    # The helper should not mix a stale frontend URL from an old lifecycle log
    # block with the current backend/session reported by `setta status`.
    payload = _run_dev_runtime_info(
        tmp_path=tmp_path,
        runtime_log_body="""
Starting Chrome with remote debugging on port 9297
Local: http://127.0.0.1:3076/
Ready: http://127.0.0.1:8076
Setta running (session old-session)
""".strip(),
        session_id="current-session",
        backend_port=8075,
    )

    assert payload["frontendUrl"] is None
    assert payload["frontendUrlSource"] is None
    assert payload["backendUrl"] == "http://127.0.0.1:8075"


def test_dev_runtime_info_uses_frontend_url_from_current_session_block(
    tmp_path: Path,
) -> None:
    # When the runtime log contains multiple restarts, the helper should bind
    # the frontend URL to the current Setta session instead of the first block.
    payload = _run_dev_runtime_info(
        tmp_path=tmp_path,
        runtime_log_body="""
Starting Chrome with remote debugging on port 9297
Local: http://127.0.0.1:3076/
Ready: http://127.0.0.1:8076
Setta running (session old-session)
Stopped session old-session.
Starting Chrome with remote debugging on port 9297
Local: http://127.0.0.1:3075/
Ready: http://127.0.0.1:8075
Setta running (session current-session)
""".strip(),
        session_id="current-session",
        backend_port=8075,
    )

    assert payload["frontendUrl"] == "http://127.0.0.1:3075/"
    assert payload["frontendUrlSource"] == "runtime_log_current_session"
    assert payload["backendUrl"] == "http://127.0.0.1:8075"


def test_dev_runtime_info_uses_frontend_url_when_local_line_follows_session_line(
    tmp_path: Path,
) -> None:
    # Vite and Setta start concurrently, so the backend session line can land
    # before Vite prints "Local:". The helper should still bind that later
    # frontend URL to the current runtime block instead of timing out forever.
    payload = _run_dev_runtime_info(
        tmp_path=tmp_path,
        runtime_log_body="""
Starting Chrome with remote debugging on port 9297
Setta running (session current-session)
Ready: http://127.0.0.1:8075
Local: http://127.0.0.1:3075/
""".strip(),
        session_id="current-session",
        backend_port=8075,
    )

    assert payload["frontendUrl"] == "http://127.0.0.1:3075/"
    assert payload["frontendUrlSource"] == "runtime_log_current_session"
    assert payload["backendUrl"] == "http://127.0.0.1:8075"


def test_dev_runtime_info_sources_workspace_venv_without_repo_root_cwd(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "dev-runtime-info.sh"
    workspace_root = tmp_path / "worktree"
    stub_dir = tmp_path / "bin"
    runtime_log_path = tmp_path / "runtime.log"
    workspace_root.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)
    runtime_log_path.write_text(
        "\n".join(
            [
                "Starting Chrome with remote debugging on port 9297",
                "Setta running (session current-session)",
                "Ready: http://127.0.0.1:8075",
                "Local: http://127.0.0.1:3075/",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    venv_bin_dir = workspace_root / ".venv" / "bin"
    venv_bin_dir.mkdir(parents=True, exist_ok=True)
    _write_executable(
        venv_bin_dir / "activate",
        f"""#!/usr/bin/env bash
export PATH="{stub_dir}:$PATH"
""",
    )

    _write_executable(
        stub_dir / "git",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"rev-parse --show-toplevel"* ]]; then
  printf '%s\\n' "{workspace_root}"
  exit 0
fi
echo "unsupported git args: $*" >&2
exit 1
""",
    )
    _write_executable(
        stub_dir / "setta",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' '{_status_payload("current-session", 8075)}'
""",
    )
    _write_executable(
        stub_dir / "jq",
        """#!/usr/bin/env bash
set -euo pipefail
cat
""",
    )
    _write_executable(
        stub_dir / "python",
        f"""#!/usr/bin/env bash
exec {sys.executable} "$@"
""",
    )

    env = os.environ.copy()
    env["PATH"] = "/usr/bin:/bin"

    result = subprocess.run(
        [
            "bash",
            str(script_path),
            "--workspace",
            str(workspace_root),
            "--runtime-log",
            str(runtime_log_path),
        ],
        cwd=repo_root,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    payload = json.loads(result.stdout)
    assert payload["frontendUrl"] == "http://127.0.0.1:3075/"
    assert payload["backendUrl"] == "http://127.0.0.1:8075"
