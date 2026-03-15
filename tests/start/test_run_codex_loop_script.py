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

response_file=""
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
done

if [[ -z "${{response_file}}" ]]; then
  echo "missing --output-last-message target" >&2
  exit 1
fi

printf 'final response %s\\n' "${{count}}" > "${{response_file}}"
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
    # The wrapper should pin the shared prompt file and repo root workdir while
    # still forwarding caller-supplied loop arguments unchanged.
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
    assert args[2] == "--workdir"
    assert args[3] == str(sandbox_root)
    assert args[4:] == [
        "--iterations",
        "7",
        "--output-dir",
        str(sandbox_root / "outputs"),
    ]
    assert 'reply "No gaps remain"' in prompt_text
