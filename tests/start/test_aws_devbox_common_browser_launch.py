import os
import re
import shlex
import subprocess
import time
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _extract_shell_function(script_rel: str, name: str) -> str:
    script_path = _repo_root() / script_rel
    script_text = script_path.read_text(encoding="utf-8")
    match = re.search(
        rf"^{re.escape(name)}\(\) \{{\n(.*?)^\}}",
        script_text,
        re.DOTALL | re.MULTILINE,
    )
    assert match is not None
    return f"{name}() {{\n{match.group(1)}\n}}\n"


def _write_executable(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _run_open_browser(tmp_path: Path, browser_app: Path, open_body: str) -> tuple[subprocess.CompletedProcess[str], Path, Path]:
    bin_dir = tmp_path / "bin"
    open_capture_path = tmp_path / "open_args.txt"
    browser_capture_path = tmp_path / "browser_args.txt"
    profile_dir = tmp_path / "chrome-profile"
    target_url = "http://127.0.0.1:3035/"

    _write_executable(bin_dir / "open", open_body)
    _write_executable(
        browser_app,
        f"""#!/usr/bin/env bash
printf '%s\\n' "$@" > {shlex.quote(str(browser_capture_path))}
""",
    )

    shell_script = "\n".join(
        [
            "set -euo pipefail",
            f'export PATH={shlex.quote(f"{bin_dir}:/usr/bin:/bin")}',
            _extract_shell_function("scripts/aws-devbox-common.sh", "setta_aws_devbox_browser_open_target"),
            _extract_shell_function("scripts/aws-devbox-common.sh", "setta_aws_devbox_browser_binary_path"),
            _extract_shell_function("scripts/aws-devbox-common.sh", "setta_aws_devbox_open_browser_url"),
            f'target_url={shlex.quote(target_url)}',
            f'browser_app={shlex.quote(str(browser_app))}',
            f'browser_profile_dir={shlex.quote(str(profile_dir))}',
            'setta_aws_devbox_open_browser_url "${target_url}" "${browser_app}" "${browser_profile_dir}"',
        ]
    )

    env = os.environ.copy()
    env["OPEN_CAPTURE_PATH"] = str(open_capture_path)

    result = subprocess.run(
        ["bash", "-lc", shell_script],
        cwd=_repo_root(),
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )
    return result, open_capture_path, browser_capture_path


def test_open_browser_uses_app_bundle_when_browser_app_is_binary_path(tmp_path: Path) -> None:
    browser_binary = tmp_path / "Fake Chrome.app" / "Contents" / "MacOS" / "Fake Chrome"
    result, open_capture_path, browser_capture_path = _run_open_browser(
        tmp_path,
        browser_binary,
        """#!/usr/bin/env bash
printf '%s\\n' "$@" > "$OPEN_CAPTURE_PATH"
""",
    )

    assert result.returncode == 0, result.stderr
    assert browser_capture_path.exists() is False

    open_args = open_capture_path.read_text(encoding="utf-8").splitlines()
    assert open_args == [
        "-na",
        str(browser_binary.parent.parent.parent),
        "--args",
        f"--user-data-dir={tmp_path / 'chrome-profile'}",
        "--no-first-run",
        "--no-default-browser-check",
        "--new-window",
        "http://127.0.0.1:3035/",
    ]


def test_open_browser_falls_back_to_browser_binary_when_open_fails(tmp_path: Path) -> None:
    browser_binary = tmp_path / "Fake Chrome.app" / "Contents" / "MacOS" / "Fake Chrome"
    result, open_capture_path, browser_capture_path = _run_open_browser(
        tmp_path,
        browser_binary,
        """#!/usr/bin/env bash
printf '%s\\n' "$@" > "$OPEN_CAPTURE_PATH"
exit 1
""",
    )

    assert result.returncode == 0, result.stderr
    assert open_capture_path.exists()

    deadline = time.time() + 5
    while not browser_capture_path.exists():
        assert time.time() < deadline, "browser binary fallback did not run"
        time.sleep(0.05)

    browser_args = browser_capture_path.read_text(encoding="utf-8").splitlines()
    assert browser_args == [
        f"--user-data-dir={tmp_path / 'chrome-profile'}",
        "--no-first-run",
        "--no-default-browser-check",
        "--new-window",
        "http://127.0.0.1:3035/",
    ]


def test_open_browser_existing_instance_uses_app_open_without_restart_flags(tmp_path: Path) -> None:
    browser_binary = tmp_path / "Fake Chrome.app" / "Contents" / "MacOS" / "Fake Chrome"
    open_capture_path = tmp_path / "open_args_existing.txt"
    bin_dir = tmp_path / "bin"
    _write_executable(
        bin_dir / "open",
        """#!/usr/bin/env bash
printf '%s\\n' "$@" > "$OPEN_CAPTURE_PATH"
""",
    )
    _write_executable(
        browser_binary,
        """#!/usr/bin/env bash
exit 0
""",
    )

    shell_script = "\n".join(
        [
            "set -euo pipefail",
            f'export PATH={shlex.quote(f"{bin_dir}:/usr/bin:/bin")}',
            _extract_shell_function("scripts/aws-devbox-common.sh", "setta_aws_devbox_browser_open_target"),
            _extract_shell_function("scripts/aws-devbox-common.sh", "setta_aws_devbox_open_browser_url_existing_instance"),
            f'browser_app={shlex.quote(str(browser_binary))}',
            'setta_aws_devbox_open_browser_url_existing_instance "http://127.0.0.1:3035/" "${browser_app}"',
        ]
    )

    env = os.environ.copy()
    env["OPEN_CAPTURE_PATH"] = str(open_capture_path)
    result = subprocess.run(
        ["bash", "-lc", shell_script],
        cwd=_repo_root(),
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert open_capture_path.read_text(encoding="utf-8").splitlines() == [
        "-a",
        str(browser_binary.parent.parent.parent),
        "http://127.0.0.1:3035/",
    ]


def test_runtime_open_local_browser_reuses_running_profile_instance(tmp_path: Path) -> None:
    capture_path = tmp_path / "browser_open_mode.txt"
    shell_script = "\n".join(
        [
            "set -euo pipefail",
            _extract_shell_function("scripts/aws-devbox-remote-runtime.sh", "open_local_browser"),
            'browser_app="Google Chrome"',
            'browser_profile_dir="/tmp/profile"',
            'browser_profile_instance_detected() { return 0; }',
            f'setta_aws_devbox_open_browser_url_existing_instance() {{ printf "existing:%s\\n" "$1" > {shlex.quote(str(capture_path))}; }}',
            f'setta_aws_devbox_open_browser_url() {{ printf "new:%s\\n" "$1" > {shlex.quote(str(capture_path))}; }}',
            'open_local_browser "http://127.0.0.1:3035/"',
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
    assert capture_path.read_text(encoding="utf-8").strip() == "existing:http://127.0.0.1:3035/"


def test_runtime_browser_watch_uses_bootstrap_token_url_only_once(tmp_path: Path) -> None:
    capture_path = tmp_path / "watch_capture_sequence.txt"
    auth_state_path = tmp_path / "watch_auth_state.txt"
    probe_state_path = tmp_path / "watch_probe_state.txt"
    auth_state_path.write_text("0", encoding="utf-8")
    probe_state_path.write_text("0", encoding="utf-8")
    capture_sh = shlex.quote(str(capture_path))
    shell_script = "\n".join(
        [
            "set -euo pipefail",
            _extract_shell_function("scripts/aws-devbox-remote-runtime.sh", "start_local_browser_watch"),
            'browser_opener_available() { return 0; }',
            f'open_local_browser() {{ printf "%s\\n" "$1" >> {capture_sh}; }}',
            'browser_profile_instance_running() { return 0; }',
            f'auth_state_path={shlex.quote(str(auth_state_path))}',
            f'probe_state_path={shlex.quote(str(probe_state_path))}',
            """local_url_is_ready() {
target="$1"
case "${target}" in
  */__setta__/bootstrap)
    count="$(cat "${auth_state_path}")"
    printf '%s' "$((count + 1))" > "${auth_state_path}"
    [ "${count}" -ge 1 ]
    return
    ;;
  *)
    count="$(cat "${probe_state_path}")"
    printf '%s' "$((count + 1))" > "${probe_state_path}"
    [ "${count}" -ge 2 ]
    return
    ;;
esac
}""",
            'sleep() { command sleep 0.01; }',
            'initial_url="http://127.0.0.1:3035/"',
            'auth_url="http://127.0.0.1:8035/__setta__/bootstrap#token=tok"',
            'reopen_url="http://127.0.0.1:3035/"',
            'probe_url="http://127.0.0.1:3035/"',
            'start_local_browser_watch "${initial_url}" "${auth_url}" "${reopen_url}" "${probe_url}"',
            "for _ in $(seq 1 100); do",
            f"  if [ -f {capture_sh} ] && "
            f"[ \"$(wc -l < {capture_sh} | tr -d ' ')\" -ge 2 ]; then break; fi",
            "  command sleep 0.01",
            "done",
            'kill "${browser_watch_pid}" >/dev/null 2>&1 || true',
            'wait "${browser_watch_pid}" 2>/dev/null || true',
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
        "http://127.0.0.1:8035/__setta__/bootstrap#token=tok",
        "http://127.0.0.1:3035/",
    ]


def test_runtime_browser_watch_opens_ready_bootstrap_before_ready_frontend(tmp_path: Path) -> None:
    capture_path = tmp_path / "watch_capture_sequence.txt"
    shell_script = "\n".join(
        [
            "set -euo pipefail",
            _extract_shell_function("scripts/aws-devbox-remote-runtime.sh", "start_local_browser_watch"),
            'browser_opener_available() { return 0; }',
            f'open_local_browser() {{ printf "%s\\n" "$1" >> {shlex.quote(str(capture_path))}; }}',
            'browser_profile_instance_running() { return 0; }',
            'local_url_is_ready() { return 0; }',
            'sleep() { command sleep 0.01; }',
            'initial_url="http://127.0.0.1:3035/"',
            'auth_url="http://127.0.0.1:8035/__setta__/bootstrap#token=tok"',
            'reopen_url="http://127.0.0.1:3035/"',
            'probe_url="http://127.0.0.1:3035/"',
            'start_local_browser_watch "${initial_url}" "${auth_url}" "${reopen_url}" "${probe_url}"',
            'command sleep 0.03',
            'kill "${browser_watch_pid}" >/dev/null 2>&1 || true',
            'wait "${browser_watch_pid}" 2>/dev/null || true',
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
        "http://127.0.0.1:8035/__setta__/bootstrap#token=tok",
    ]


def test_runtime_browser_watch_opens_immediately_before_url_is_ready(tmp_path: Path) -> None:
    capture_path = tmp_path / "watch_capture.txt"
    shell_script = "\n".join(
        [
            "set -euo pipefail",
            _extract_shell_function("scripts/aws-devbox-remote-runtime.sh", "start_local_browser_watch"),
            'browser_opener_available() { return 0; }',
            f'open_local_browser() {{ printf "%s\\n" "$1" > {shlex.quote(str(capture_path))}; }}',
            'local_url_is_ready() { return 1; }',
            'browser_profile_instance_running() { return 0; }',
            'target_url=http://127.0.0.1:3035/',
            'start_local_browser_watch "${target_url}"',
            'sleep 0.1',
            'kill "${browser_watch_pid}" >/dev/null 2>&1 || true',
            'wait "${browser_watch_pid}" 2>/dev/null || true',
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
    assert capture_path.read_text(encoding="utf-8").strip() == "http://127.0.0.1:3035/"
