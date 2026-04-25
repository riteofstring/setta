import os
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root, write_stub_executable


def _script_env(sandbox_root: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"
    return env


def _copy_script(sandbox_root: Path, relative_path: str) -> Path:
    src = repo_root() / relative_path
    dst = sandbox_root / relative_path
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    dst.chmod(0o755)
    return dst


def test_plan_loop_runner_renders_plan_sentinel_and_name(tmp_path: Path) -> None:
    sandbox_root = tmp_path / "plan_loop_runner"
    scripts_dir = sandbox_root / "scripts"
    bin_dir = sandbox_root / "bin"
    plan_path = sandbox_root / "docs" / "plans" / "demo-plan.md"
    output_dir = tmp_path / "loop-output"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    plan_path.parent.mkdir(parents=True, exist_ok=True)
    plan_path.write_text("# Demo plan\n", encoding="utf-8")

    _copy_script(sandbox_root, "scripts/run-codex-plan-loop.sh")
    write_stub_executable(
        scripts_dir / "run-codex-loop.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$@" > "{sandbox_root / 'run_codex_loop_args.txt'}"
""",
    )
    write_stub_executable(
        bin_dir / "git",
        """#!/usr/bin/env bash
set -euo pipefail
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  if [[ "${args[$i]}" == "-C" ]]; then
    unset 'args[$i]'
    unset 'args[$((i + 1))]'
    break
  fi
done
set -- "${args[@]}"
case "${1:-}" in
  diff) exit 0 ;;
  ls-files) exit 0 ;;
  rev-parse) printf 'abc123\\n'; exit 0 ;;
  *) printf 'unexpected git invocation: %s\\n' "$*" >&2; exit 1 ;;
esac
""",
    )

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-codex-plan-loop.sh"),
            "--plan",
            "docs/plans/demo-plan.md",
            "--sentinel",
            "CODEX_LOOP_STOP: DEMO_COMPLETE",
            "--name",
            "demo-plan",
            "--commit-prefix",
            "codex-demo:",
            "--output-dir",
            str(output_dir),
            "--iterations",
            "1",
            "--no-yolo",
            "--",
            "--config",
            'reasoning_effort="low"',
        ],
        cwd=sandbox_root,
        env=_script_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    prompt = (output_dir / "state" / "prompt.md").read_text(encoding="utf-8")
    assert str(sandbox_root / "docs" / "plans" / "demo-plan.md") in prompt
    assert "CODEX_LOOP_STOP: DEMO_COMPLETE" in prompt
    assert "codex-demo:" in prompt
    loop_args = (sandbox_root / "run_codex_loop_args.txt").read_text(
        encoding="utf-8"
    )
    assert "--iterations\n1\n" in loop_args
    assert "--new-session-every\n1\n" in loop_args
    assert "--yolo" not in loop_args


def test_plan_loop_wrappers_delegate_to_shared_runner(tmp_path: Path) -> None:
    sandbox_root = tmp_path / "plan_loop_wrappers"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    write_stub_executable(
        scripts_dir / "run-codex-plan-loop.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$@" > "{sandbox_root / 'runner_args.txt'}"
""",
    )
    wrapper_cases = [
        (
            "scripts/run-codex-app-subsystem-backend-externalization-loop.sh",
            "app-subsystem-backend-externalization",
            "docs/plans/app-subsystem-backend-externalization-plan.md",
            "CODEX_LOOP_STOP: APP_SUBSYSTEM_BACKEND_EXTERNALIZATION_COMPLETE",
            "codex-apppluginbackend:",
        ),
        (
            "scripts/run-codex-app-subsystem-real-plugin-loop.sh",
            "app-subsystem-real-plugin",
            "docs/plans/app-subsystem-real-plugin-plan.md",
            "CODEX_LOOP_STOP: APP_SUBSYSTEM_REAL_PLUGIN_COMPLETE",
            "codex-realplugin:",
        ),
        (
            "scripts/run-codex-first-party-plugin-standalone-loop.sh",
            "first-party-plugin-standalone",
            "docs/plans/first-party-plugin-standalone-completion-plan.md",
            "CODEX_LOOP_STOP: FIRST_PARTY_PLUGIN_STANDALONE_COMPLETE",
            "codex-pluginstandalone:",
        ),
        (
            "scripts/run-codex-third-party-plugin-generalization-loop.sh",
            "third-party-plugin-generalization",
            "docs/plans/third-party-plugin-generalization-plan.md",
            "CODEX_LOOP_STOP: THIRD_PARTY_PLUGIN_GENERALIZATION_COMPLETE",
            "codex-pluginplan:",
        ),
    ]

    for wrapper_path, name, plan, sentinel, commit_prefix in wrapper_cases:
        wrapper = _copy_script(sandbox_root, wrapper_path)
        result = subprocess.run(
            ["bash", str(wrapper), "--iterations", "3"],
            cwd=sandbox_root,
            check=False,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, f"{wrapper_path}\n{result.stderr}"
        args = (sandbox_root / "runner_args.txt").read_text(encoding="utf-8")
        assert f"--name\n{name}\n" in args
        assert f"--plan\n{plan}\n" in args
        assert f"--sentinel\n{sentinel}\n" in args
        assert f"--commit-prefix\n{commit_prefix}\n" in args
        assert "--iterations\n3\n" in args
