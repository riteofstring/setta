import os
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root, write_stub_executable


def _build_codex_loop_sandbox(tmp_path: Path) -> tuple[Path, Path]:
    root = repo_root()
    sandbox_root = tmp_path / "codex_loop_sandbox"
    scripts_dir = sandbox_root / "scripts"
    bin_dir = sandbox_root / "bin"

    scripts_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)

    script_src = root / "scripts" / "run-codex-loop.sh"
    script_dst = scripts_dir / "run-codex-loop.sh"
    script_dst.write_text(script_src.read_text(encoding="utf-8"), encoding="utf-8")
    script_dst.chmod(0o755)

    calls_dir = sandbox_root / "codex-calls"
    calls_dir.mkdir(parents=True, exist_ok=True)
    write_stub_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail
calls_dir="{calls_dir}"
count_file="${{calls_dir}}/count.txt"
count=0
if [[ -f "${{count_file}}" ]]; then
  count="$(<"${{count_file}}")"
fi
count="$((count + 1))"
printf '%s' "${{count}}" > "${{count_file}}"
printf '%s\\n' "$@" > "${{calls_dir}}/args_${{count}}.txt"
cat > "${{calls_dir}}/stdin_${{count}}.txt"

if [[ "${{FAIL_FIRST_CALL:-0}}" == "1" && "${{count}}" == "1" ]]; then
  printf 'simulated failure %s\\n' "${{count}}"
  exit 7
fi

response_file=""
json_mode=0
next_is_response_file=0
for arg in "$@"; do
  if [[ "${{next_is_response_file}}" == "1" ]]; then
    response_file="${{arg}}"
    next_is_response_file=0
    continue
  fi
  if [[ "${{arg}}" == "--output-last-message" ]]; then
    next_is_response_file=1
  fi
  if [[ "${{arg}}" == "--json" ]]; then
    json_mode=1
  fi
done

if [[ -z "${{response_file}}" ]]; then
  echo "missing --output-last-message target" >&2
  exit 1
fi

printf 'final response %s\\n' "${{count}}" > "${{response_file}}"
if [[ "${{json_mode}}" == "1" ]]; then
  printf '{{"type":"thread.started","thread_id":"thread-%s"}}\\n' "${{count}}"
fi
printf 'stdout response %s\\n' "${{count}}"
""",
    )

    return sandbox_root, calls_dir


def _build_codex_loop_wrapper_sandbox(tmp_path: Path) -> tuple[Path, Path]:
    root = repo_root()
    sandbox_root = tmp_path / "codex_loop_wrapper_sandbox"
    scripts_dir = sandbox_root / "scripts"
    prompts_dir = scripts_dir / "prompts"

    scripts_dir.mkdir(parents=True, exist_ok=True)
    prompts_dir.mkdir(parents=True, exist_ok=True)

    wrapper_src = root / "scripts" / "run-backend-parity-matrix-codex-loop.sh"
    wrapper_dst = scripts_dir / "run-backend-parity-matrix-codex-loop.sh"
    wrapper_dst.write_text(wrapper_src.read_text(encoding="utf-8"), encoding="utf-8")
    wrapper_dst.chmod(0o755)

    prompt_src = (
        root
        / "scripts"
        / "prompts"
        / "backend-behavior-parity-matrix-gap-check.txt"
    )
    prompt_dst = prompts_dir / "backend-behavior-parity-matrix-gap-check.txt"
    prompt_dst.write_text(prompt_src.read_text(encoding="utf-8"), encoding="utf-8")

    followup_prompt_src = (
        root
        / "scripts"
        / "prompts"
        / "backend-behavior-parity-matrix-gap-check-followup.txt"
    )
    followup_prompt_dst = (
        prompts_dir / "backend-behavior-parity-matrix-gap-check-followup.txt"
    )
    followup_prompt_dst.write_text(
        followup_prompt_src.read_text(encoding="utf-8"), encoding="utf-8"
    )

    capture_file = sandbox_root / "wrapper_args.txt"
    prompt_capture_file = sandbox_root / "wrapper_prompt.txt"
    write_stub_executable(
        scripts_dir / "run-codex-loop.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$@" > "{capture_file}"

prompt_file=""
next_is_prompt_file=0
for arg in "$@"; do
  if [[ "${{next_is_prompt_file}}" == "1" ]]; then
    prompt_file="${{arg}}"
    next_is_prompt_file=0
    continue
  fi
  if [[ "${{arg}}" == "--prompt-file" ]]; then
    next_is_prompt_file=1
  fi
done

cat "${{prompt_file}}" > "{prompt_capture_file}"
""",
    )

    return sandbox_root, capture_file


def _build_gap_hunt_wrapper_sandbox(tmp_path: Path) -> tuple[Path, Path]:
    root = repo_root()
    sandbox_root = tmp_path / "codex_gap_hunt_wrapper_sandbox"
    scripts_dir = sandbox_root / "scripts"
    prompts_dir = scripts_dir / "prompts"

    scripts_dir.mkdir(parents=True, exist_ok=True)
    prompts_dir.mkdir(parents=True, exist_ok=True)

    wrapper_src = root / "scripts" / "run-backend-gap-hunt-codex-loop.sh"
    wrapper_dst = scripts_dir / "run-backend-gap-hunt-codex-loop.sh"
    wrapper_dst.write_text(wrapper_src.read_text(encoding="utf-8"), encoding="utf-8")
    wrapper_dst.chmod(0o755)

    prompt_src = root / "scripts" / "prompts" / "backend-behavior-gap-hunt.txt"
    prompt_dst = prompts_dir / "backend-behavior-gap-hunt.txt"
    prompt_dst.write_text(prompt_src.read_text(encoding="utf-8"), encoding="utf-8")

    followup_prompt_src = (
        root / "scripts" / "prompts" / "backend-behavior-gap-hunt-followup.txt"
    )
    followup_prompt_dst = prompts_dir / "backend-behavior-gap-hunt-followup.txt"
    followup_prompt_dst.write_text(
        followup_prompt_src.read_text(encoding="utf-8"), encoding="utf-8"
    )

    capture_file = sandbox_root / "wrapper_args.txt"
    prompt_capture_file = sandbox_root / "wrapper_prompt.txt"
    write_stub_executable(
        scripts_dir / "run-codex-loop.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$@" > "{capture_file}"

prompt_file=""
next_is_prompt_file=0
for arg in "$@"; do
  if [[ "${{next_is_prompt_file}}" == "1" ]]; then
    prompt_file="${{arg}}"
    next_is_prompt_file=0
    continue
  fi
  if [[ "${{arg}}" == "--prompt-file" ]]; then
    next_is_prompt_file=1
  fi
done

cat "${{prompt_file}}" > "{prompt_capture_file}"
""",
    )

    return sandbox_root, capture_file


def test_run_codex_loop_script_runs_requested_iterations_and_captures_responses(
    tmp_path: Path,
) -> None:
    # Each iteration should invoke a fresh `codex exec`, feed the same prompt
    # over stdin, and persist both the transcript and last assistant message.
    sandbox_root, calls_dir = _build_codex_loop_sandbox(tmp_path)
    prompt_file = sandbox_root / "prompt.txt"
    output_dir = sandbox_root / "outputs"
    workdir = sandbox_root / "workspace"
    prompt_text = "Explain the result in one sentence.\n"

    workdir.mkdir(parents=True, exist_ok=True)
    prompt_file.write_text(prompt_text, encoding="utf-8")

    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-codex-loop.sh"),
            "--prompt-file",
            str(prompt_file),
            "--iterations",
            "2",
            "--output-dir",
            str(output_dir),
            "--workdir",
            str(workdir),
            "--model",
            "gpt-5.4",
            "--",
            "--skip-git-repo-check",
        ],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert (output_dir / "prompt.txt").read_text(encoding="utf-8") == prompt_text

    for index in (1, 2):
        run_dir = output_dir / f"run-{index:03d}"
        args = (calls_dir / f"args_{index}.txt").read_text(encoding="utf-8").splitlines()
        stdin_text = (calls_dir / f"stdin_{index}.txt").read_text(encoding="utf-8")

        assert args[0] == "exec"
        assert "--ephemeral" in args
        assert "--color" in args
        assert "never" in args
        assert "--cd" in args
        assert str(workdir) in args
        assert "--output-last-message" in args
        assert str(run_dir / "last-message.txt") in args
        assert "--model" in args
        assert "gpt-5.4" in args
        assert "--skip-git-repo-check" in args
        assert args[-1] == "-"
        assert stdin_text == prompt_text
        assert (run_dir / "status.txt").read_text(encoding="utf-8").strip() == "success"
        assert (
            run_dir / "last-message.txt"
        ).read_text(encoding="utf-8") == f"final response {index}\n"
        assert (
            run_dir / "transcript.log"
        ).read_text(encoding="utf-8") == f"stdout response {index}\n"


def test_run_codex_loop_script_uses_followup_prompt_within_a_session_batch(
    tmp_path: Path,
) -> None:
    # When the batch size is greater than 1, the first iteration should start
    # a persistent session and the next iteration should resume it with the
    # follow-up prompt.
    sandbox_root, calls_dir = _build_codex_loop_sandbox(tmp_path)
    prompt_file = sandbox_root / "prompt.txt"
    followup_prompt_file = sandbox_root / "followup.txt"
    output_dir = sandbox_root / "outputs"
    workdir = sandbox_root / "workspace"
    prompt_text = "Initial instructions.\n"
    followup_prompt_text = "Continue incrementally.\n"

    workdir.mkdir(parents=True, exist_ok=True)
    prompt_file.write_text(prompt_text, encoding="utf-8")
    followup_prompt_file.write_text(followup_prompt_text, encoding="utf-8")

    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-codex-loop.sh"),
            "--prompt-file",
            str(prompt_file),
            "--followup-prompt-file",
            str(followup_prompt_file),
            "--new-session-every",
            "2",
            "--iterations",
            "2",
            "--output-dir",
            str(output_dir),
            "--workdir",
            str(workdir),
        ],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert (output_dir / "session-001-id.txt").read_text(encoding="utf-8") == "thread-1\n"

    first_args = (calls_dir / "args_1.txt").read_text(encoding="utf-8").splitlines()
    second_args = (calls_dir / "args_2.txt").read_text(encoding="utf-8").splitlines()
    first_stdin = (calls_dir / "stdin_1.txt").read_text(encoding="utf-8")
    second_stdin = (calls_dir / "stdin_2.txt").read_text(encoding="utf-8")

    assert first_args[0] == "exec"
    assert "--json" in first_args
    assert "--ephemeral" not in first_args
    assert "--cd" in first_args
    assert str(workdir) in first_args
    assert first_args[-1] == "-"
    assert first_stdin == prompt_text

    assert second_args[0] == "exec"
    assert second_args[1] == "resume"
    assert "--cd" not in second_args
    assert "--json" not in second_args
    assert "--ephemeral" not in second_args
    assert "thread-1" in second_args
    assert second_args[-1] == "-"
    assert second_stdin == followup_prompt_text


def test_run_codex_loop_script_rotates_to_a_fresh_session_after_batch_limit(
    tmp_path: Path,
) -> None:
    # A batch limit should restart the Codex session on the next batch while
    # keeping the follow-up prompt only for in-batch resume turns.
    sandbox_root, calls_dir = _build_codex_loop_sandbox(tmp_path)
    prompt_file = sandbox_root / "prompt.txt"
    followup_prompt_file = sandbox_root / "followup.txt"
    output_dir = sandbox_root / "outputs"
    workdir = sandbox_root / "workspace"
    prompt_text = "Fresh session review.\n"
    followup_prompt_text = "Resume the current session.\n"

    workdir.mkdir(parents=True, exist_ok=True)
    prompt_file.write_text(prompt_text, encoding="utf-8")
    followup_prompt_file.write_text(followup_prompt_text, encoding="utf-8")

    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-codex-loop.sh"),
            "--prompt-file",
            str(prompt_file),
            "--followup-prompt-file",
            str(followup_prompt_file),
            "--new-session-every",
            "2",
            "--iterations",
            "3",
            "--output-dir",
            str(output_dir),
            "--workdir",
            str(workdir),
        ],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert (output_dir / "session-001-id.txt").read_text(encoding="utf-8") == "thread-1\n"
    assert (output_dir / "session-002-id.txt").read_text(encoding="utf-8") == "thread-3\n"

    first_args = (calls_dir / "args_1.txt").read_text(encoding="utf-8").splitlines()
    second_args = (calls_dir / "args_2.txt").read_text(encoding="utf-8").splitlines()
    third_args = (calls_dir / "args_3.txt").read_text(encoding="utf-8").splitlines()
    first_stdin = (calls_dir / "stdin_1.txt").read_text(encoding="utf-8")
    second_stdin = (calls_dir / "stdin_2.txt").read_text(encoding="utf-8")
    third_stdin = (calls_dir / "stdin_3.txt").read_text(encoding="utf-8")

    assert first_args[0] == "exec"
    assert "--json" in first_args
    assert first_stdin == prompt_text

    assert second_args[0] == "exec"
    assert second_args[1] == "resume"
    assert "thread-1" in second_args
    assert second_stdin == followup_prompt_text

    assert third_args[0] == "exec"
    assert "--json" in third_args
    assert "resume" not in third_args
    assert third_stdin == prompt_text


def test_run_codex_loop_script_runs_pre_session_command_only_for_fresh_batches(
    tmp_path: Path,
) -> None:
    # The optional pre-session hook should run before fresh session batches,
    # not before in-batch resume turns.
    sandbox_root, calls_dir = _build_codex_loop_sandbox(tmp_path)
    prompt_file = sandbox_root / "prompt.txt"
    followup_prompt_file = sandbox_root / "followup.txt"
    output_dir = sandbox_root / "outputs"
    workdir = sandbox_root / "workspace"
    pre_session_script = workdir / "refresh-backlog.sh"
    pre_session_log = workdir / "pre-session.log"

    workdir.mkdir(parents=True, exist_ok=True)
    prompt_file.write_text("Fresh session review.\n", encoding="utf-8")
    followup_prompt_file.write_text("Resume the current session.\n", encoding="utf-8")
    pre_session_script.write_text(
        "#!/usr/bin/env bash\nset -euo pipefail\necho refreshed >> pre-session.log\n",
        encoding="utf-8",
    )
    pre_session_script.chmod(0o755)

    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-codex-loop.sh"),
            "--prompt-file",
            str(prompt_file),
            "--followup-prompt-file",
            str(followup_prompt_file),
            "--pre-session-command",
            "./refresh-backlog.sh",
            "--new-session-every",
            "2",
            "--iterations",
            "3",
            "--output-dir",
            str(output_dir),
            "--workdir",
            str(workdir),
        ],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert pre_session_log.read_text(encoding="utf-8").splitlines() == [
        "refreshed",
        "refreshed",
    ]
    assert (calls_dir / "args_1.txt").exists()
    assert (calls_dir / "args_2.txt").exists()
    assert (calls_dir / "args_3.txt").exists()


def test_run_codex_loop_script_stops_cleanly_on_pre_session_exit_code(
    tmp_path: Path,
) -> None:
    # A configured pre-session exit code should stop the loop without treating
    # the empty-backlog signal as an error.
    sandbox_root, calls_dir = _build_codex_loop_sandbox(tmp_path)
    prompt_file = sandbox_root / "prompt.txt"
    output_dir = sandbox_root / "outputs"
    workdir = sandbox_root / "workspace"
    pre_session_script = workdir / "refresh-backlog.sh"

    workdir.mkdir(parents=True, exist_ok=True)
    prompt_file.write_text("Stop when the backlog is empty.\n", encoding="utf-8")
    pre_session_script.write_text(
        "#!/usr/bin/env bash\nset -euo pipefail\nexit 10\n",
        encoding="utf-8",
    )
    pre_session_script.chmod(0o755)

    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-codex-loop.sh"),
            "--prompt-file",
            str(prompt_file),
            "--pre-session-command",
            "./refresh-backlog.sh",
            "--stop-on-pre-session-exit-code",
            "10",
            "--iterations",
            "3",
            "--output-dir",
            str(output_dir),
            "--workdir",
            str(workdir),
        ],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert (output_dir / "run-001" / "status.txt").read_text(encoding="utf-8").strip() == (
        "stopped:pre-session-exit:10"
    )
    assert not (calls_dir / "args_1.txt").exists()


def test_run_codex_loop_script_continues_on_error_by_default(tmp_path: Path) -> None:
    # The loop should keep running after a failed iteration even without an
    # explicit --continue-on-error flag.
    sandbox_root, calls_dir = _build_codex_loop_sandbox(tmp_path)
    prompt_file = sandbox_root / "prompt.txt"
    output_dir = sandbox_root / "outputs"
    workdir = sandbox_root / "workspace"

    workdir.mkdir(parents=True, exist_ok=True)
    prompt_file.write_text("Retry on failure.\n", encoding="utf-8")

    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"
    env["FAIL_FIRST_CALL"] = "1"

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-codex-loop.sh"),
            "--prompt-file",
            str(prompt_file),
            "--iterations",
            "2",
            "--output-dir",
            str(output_dir),
            "--workdir",
            str(workdir),
        ],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert (output_dir / "run-001" / "status.txt").read_text(encoding="utf-8").strip() == "failure:7"
    assert (output_dir / "run-002" / "status.txt").read_text(encoding="utf-8").strip() == "success"
    assert (calls_dir / "args_2.txt").exists()


def test_run_codex_loop_script_yolo_mode_passes_exec_equivalent_flag(
    tmp_path: Path,
) -> None:
    # `--yolo` on the wrapper script should map to the documented exec-mode
    # equivalent rather than relying on implicit Codex CLI behavior.
    sandbox_root, calls_dir = _build_codex_loop_sandbox(tmp_path)
    prompt_file = sandbox_root / "prompt.txt"
    output_dir = sandbox_root / "outputs"
    workdir = sandbox_root / "workspace"

    workdir.mkdir(parents=True, exist_ok=True)
    prompt_file.write_text("Reply briefly.\n", encoding="utf-8")

    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-codex-loop.sh"),
            "--prompt-file",
            str(prompt_file),
            "--output-dir",
            str(output_dir),
            "--workdir",
            str(workdir),
            "--yolo",
        ],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr

    args = (calls_dir / "args_1.txt").read_text(encoding="utf-8").splitlines()

    assert args[0] == "exec"
    assert "--dangerously-bypass-approvals-and-sandbox" in args


def test_run_codex_loop_script_requires_prompt_file(tmp_path: Path) -> None:
    sandbox_root, _ = _build_codex_loop_sandbox(tmp_path)

    result = subprocess.run(
        ["bash", str(sandbox_root / "scripts" / "run-codex-loop.sh")],
        cwd=sandbox_root,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "--prompt-file is required" in result.stderr


def test_backend_parity_wrapper_uses_checked_in_prompt_file(tmp_path: Path) -> None:
    # The wrapper should pin the shared start/follow-up prompt files, force the
    # fixed 10-iteration batch size, and still forward caller-supplied loop
    # arguments unchanged after forcing the yolo-equivalent exec policy.
    sandbox_root, capture_file = _build_codex_loop_wrapper_sandbox(tmp_path)

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-backend-parity-matrix-codex-loop.sh"),
            "--iterations",
            "7",
            "--output-dir",
            str(sandbox_root / "outputs"),
        ],
        cwd=sandbox_root,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr

    args = capture_file.read_text(encoding="utf-8").splitlines()
    prompt_text = (sandbox_root / "wrapper_prompt.txt").read_text(encoding="utf-8")

    assert args[0] == "--prompt-file"
    assert (
        args[1]
        == str(
            sandbox_root
            / "scripts"
            / "prompts"
            / "backend-behavior-parity-matrix-gap-check.txt"
        )
    )
    assert args[2] == "--followup-prompt-file"
    assert (
        args[3]
        == str(
            sandbox_root
            / "scripts"
            / "prompts"
            / "backend-behavior-parity-matrix-gap-check-followup.txt"
        )
    )
    assert args[4] == "--workdir"
    assert args[5] == str(sandbox_root)
    assert args[6] == "--iterations"
    assert args[7] == "1000"
    assert args[8] == "--new-session-every"
    assert args[9] == "10"
    assert args[10] == "--yolo"
    assert args[11:] == [
        "--iterations",
        "7",
        "--output-dir",
        str(sandbox_root / "outputs"),
    ]
    assert "Run `./scripts/run-backend-differential-parity.sh --baseline-ref main`" in prompt_text


def test_backend_gap_hunt_wrapper_uses_checked_in_prompt_file(tmp_path: Path) -> None:
    # The proactive gap-hunt wrapper should pin the dedicated prompt files,
    # refresh the backlog before each fresh session batch, stop cleanly when
    # that backlog is empty, keep the longer default session cadence, and
    # still forward caller-supplied loop
    # arguments unchanged after forcing the yolo-equivalent exec policy.
    sandbox_root, capture_file = _build_gap_hunt_wrapper_sandbox(tmp_path)

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-backend-gap-hunt-codex-loop.sh"),
            "--iterations",
            "9",
            "--output-dir",
            str(sandbox_root / "outputs"),
        ],
        cwd=sandbox_root,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr

    args = capture_file.read_text(encoding="utf-8").splitlines()
    prompt_text = (sandbox_root / "wrapper_prompt.txt").read_text(encoding="utf-8")

    assert args[0] == "--prompt-file"
    assert (
        args[1]
        == str(
            sandbox_root / "scripts" / "prompts" / "backend-behavior-gap-hunt.txt"
        )
    )
    assert args[2] == "--followup-prompt-file"
    assert (
        args[3]
        == str(
            sandbox_root
            / "scripts"
            / "prompts"
            / "backend-behavior-gap-hunt-followup.txt"
        )
    )
    assert args[4] == "--pre-session-command"
    assert args[5] == "./scripts/run-backend-gap-hunt-preflight.sh"
    assert args[6] == "--stop-on-pre-session-exit-code"
    assert args[7] == "10"
    assert args[8] == "--workdir"
    assert args[9] == str(sandbox_root)
    assert args[10] == "--iterations"
    assert args[11] == "100000"
    assert args[12] == "--new-session-every"
    assert args[13] == "10"
    assert args[14] == "--yolo"
    assert args[15:] == [
        "--iterations",
        "9",
        "--output-dir",
        str(sandbox_root / "outputs"),
    ]
    assert "tmp/backend-gap-hunt-candidates.md" in prompt_text
    assert "Commit frequently." in prompt_text
    assert "Source Tests Missing Explicit Parity Disposition" in prompt_text
    assert "Critical Differential Parity Failures" in prompt_text
    assert "pinned source baseline" in prompt_text
    assert "do not remove it with a bare citation" in prompt_text
    assert (
        "explicit Go/executable proof in the `Go tests` column" in prompt_text
    )
    assert "proof-mode=live-provider" in prompt_text
    assert "proof-mode=launcher-unmocked-transport" in prompt_text
