import os
import subprocess
import sys
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType

from tests.start.dev_script_wiring_helpers import repo_root


def _load_backend_gap_hunt_candidates_module() -> ModuleType:
    root = repo_root()
    script_path = root / "scripts" / "backend_gap_hunt_candidates.py"
    spec = spec_from_file_location("backend_gap_hunt_candidates_script", script_path)
    assert spec is not None and spec.loader is not None
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_generate_report_returns_only_uncited_source_tests(tmp_path: Path) -> None:
    # The miner should emit only uncited source tests and omit the discarded
    # ranking/summary sections from the rendered report.
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"

    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "api").mkdir(parents=True, exist_ok=True)

    matrix_path.write_text(
        """# Backend Behavior Parity Matrix

## Audit Boundary

- Source baseline: `main@abc123`
- Target head: `deadbeef`

## Matrix

| Row | Source (`abc123`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `runner.lookup` | `tests/api/test_runner.py::test_cited_lookup` | `internal/runner.go` | `TestRunnerLookup` | `frontend/src/components/Runner.tsx` | `Proved` | cited row |
""",
        encoding="utf-8",
    )
    (tests_root / "api" / "test_runner.py").write_text(
        """def test_cited_lookup() -> None:
    assert True


def test_uncited_lookup_failure() -> None:
    assert True
""",
        encoding="utf-8",
    )

    module = _load_backend_gap_hunt_candidates_module()
    report = module.generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_root,
    )

    assert [
        f"{test_ref.path}::{test_ref.name}" for test_ref in report
    ] == ["tests/api/test_runner.py::test_uncited_lookup_failure"]

    rendered = module.render_report(report)
    assert "## Uncited Source Tests" in rendered
    assert "tests/api/test_runner.py::test_uncited_lookup_failure" in rendered
    assert "## Summary" not in rendered
    assert "Generated:" not in rendered
    assert "Matrix rows parsed" not in rendered


def test_generate_report_recognizes_class_scoped_matrix_test_citations(
    tmp_path: Path,
) -> None:
    # Matrix citations often include unittest-style class scopes, so those
    # cited methods should not remain in the uncited backlog.
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"

    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "api").mkdir(parents=True, exist_ok=True)

    matrix_path.write_text(
        """# Backend Behavior Parity Matrix

## Audit Boundary

- Source baseline: `main@abc123`
- Target head: `deadbeef`

## Matrix

| Row | Source (`abc123`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `runner.class_scope` | `tests/api/test_runner.py::TestRunnerCases::{test_class_cited}` | `internal/runner.go` | `TestRunnerLookup` | `frontend/src/components/Runner.tsx` | `Proved` | class-scoped citation |
""",
        encoding="utf-8",
    )
    (tests_root / "api" / "test_runner.py").write_text(
        """class TestRunnerCases:
    def test_class_cited(self) -> None:
        assert True

    def test_class_uncited(self) -> None:
        assert True
""",
        encoding="utf-8",
    )

    module = _load_backend_gap_hunt_candidates_module()
    report = module.generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_root,
    )

    assert [
        f"{test_ref.path}::{test_ref.name}" for test_ref in report
    ] == ["tests/api/test_runner.py::test_class_uncited"]


def test_generate_report_requires_exact_code_span_test_citations(
    tmp_path: Path,
) -> None:
    # Free-text mentions should not remove a test from the uncited backlog.
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"

    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "api").mkdir(parents=True, exist_ok=True)

    matrix_path.write_text(
        """# Backend Behavior Parity Matrix

Mention tests/api/test_runner.py::test_uncited_lookup_failure in prose only.
""",
        encoding="utf-8",
    )
    (tests_root / "api" / "test_runner.py").write_text(
        """def test_uncited_lookup_failure() -> None:
    assert True
""",
        encoding="utf-8",
    )

    module = _load_backend_gap_hunt_candidates_module()
    report = module.generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_root,
    )

    assert [
        f"{test_ref.path}::{test_ref.name}" for test_ref in report
    ] == ["tests/api/test_runner.py::test_uncited_lookup_failure"]


def test_generate_report_includes_tests_start_tree(tmp_path: Path) -> None:
    # Differential parity tests under tests/start are real gap-hunt clues and
    # should remain in the uncited backlog.
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"

    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "start").mkdir(parents=True, exist_ok=True)

    matrix_path.write_text(
        """# Backend Behavior Parity Matrix

## Audit Boundary

- Source baseline: `main@abc123`
- Target head: `deadbeef`

## Matrix

| Row | Source (`abc123`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
""",
        encoding="utf-8",
    )
    (tests_root / "start" / "test_backend_differential_parity.py").write_text(
        """def test_start_tree_is_collected() -> None:
    assert True
""",
        encoding="utf-8",
    )

    module = _load_backend_gap_hunt_candidates_module()
    report = module.generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_root,
    )

    assert [
        f"{test_ref.path}::{test_ref.name}" for test_ref in report
    ] == ["tests/start/test_backend_differential_parity.py::test_start_tree_is_collected"]


def test_generate_report_excludes_gap_hunt_script_tests(tmp_path: Path) -> None:
    # The uncited backlog should stay focused on tests that can reveal Go
    # implementation gaps rather than the loop/miner wiring itself.
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"

    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "start").mkdir(parents=True, exist_ok=True)

    matrix_path.write_text("# Backend Behavior Parity Matrix\n", encoding="utf-8")
    (tests_root / "start" / "test_backend_gap_hunt_candidates_script.py").write_text(
        """def test_gap_hunt_wrapper() -> None:
    assert True
""",
        encoding="utf-8",
    )
    (tests_root / "start" / "test_run_codex_loop_script.py").write_text(
        """def test_loop_wrapper() -> None:
    assert True
""",
        encoding="utf-8",
    )
    (tests_root / "start" / "test_backend_differential_parity.py").write_text(
        """def test_real_gap_hunt_clue() -> None:
    assert True
""",
        encoding="utf-8",
    )

    module = _load_backend_gap_hunt_candidates_module()
    report = module.generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_root,
    )

    assert [
        f"{test_ref.path}::{test_ref.name}" for test_ref in report
    ] == ["tests/start/test_backend_differential_parity.py::test_real_gap_hunt_clue"]


def test_script_returns_special_exit_code_when_uncited_backlog_is_empty(
    tmp_path: Path,
) -> None:
    # An empty uncited-test backlog should still write the report file and then
    # signal the loop to stop cleanly with the dedicated exit code.
    root = repo_root()
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"
    output_path = repo_root_path / "tmp" / "backend-gap-hunt-candidates.md"

    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "api").mkdir(parents=True, exist_ok=True)

    matrix_path.write_text(
        """# Backend Behavior Parity Matrix

## Audit Boundary

- Source baseline: `main@abc123`
- Target head: `deadbeef`

## Matrix

| Row | Source (`abc123`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `runner.lookup` | `tests/api/test_runner.py::test_only_cited_case` | `internal/runner.go` | `TestRunnerLookup` | `frontend/src/components/Runner.tsx` | `Proved` | cited row |
""",
        encoding="utf-8",
    )
    (tests_root / "api" / "test_runner.py").write_text(
        """def test_only_cited_case() -> None:
    assert True
""",
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            sys.executable,
            str(root / "scripts" / "backend_gap_hunt_candidates.py"),
            "--repo-root",
            str(repo_root_path),
            "--output",
            str(output_path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    module = _load_backend_gap_hunt_candidates_module()

    assert result.returncode == module.EMPTY_UNCITED_SOURCE_TESTS_EXIT_CODE
    assert output_path.read_text(encoding="utf-8") == (
        "# Backend Gap Hunt Candidates\n\n## Uncited Source Tests\n\n"
    )


def _build_gap_hunt_candidate_wrapper_sandbox(
    tmp_path: Path,
) -> tuple[Path, Path, Path]:
    root = repo_root()
    sandbox_root = tmp_path / "gap_hunt_candidate_wrapper_sandbox"
    scripts_dir = sandbox_root / "scripts"
    venv_bin_dir = sandbox_root / ".venv" / "bin"

    scripts_dir.mkdir(parents=True, exist_ok=True)
    venv_bin_dir.mkdir(parents=True, exist_ok=True)

    wrapper_src = root / "scripts" / "run-backend-gap-hunt-candidate-miner.sh"
    wrapper_dst = scripts_dir / "run-backend-gap-hunt-candidate-miner.sh"
    wrapper_dst.write_text(wrapper_src.read_text(encoding="utf-8"), encoding="utf-8")
    wrapper_dst.chmod(0o755)

    script_src = root / "scripts" / "backend_gap_hunt_candidates.py"
    script_dst = scripts_dir / "backend_gap_hunt_candidates.py"
    script_dst.write_text(script_src.read_text(encoding="utf-8"), encoding="utf-8")

    activate_script = sandbox_root / "activate.sh"
    activate_script.write_text(
        "#!/usr/bin/env bash\nexport GAP_HUNT_CANDIDATE_MINER_SANDBOX=1\n",
        encoding="utf-8",
    )
    activate_script.chmod(0o755)

    env_capture = sandbox_root / "python_env.txt"
    args_capture = sandbox_root / "python_args.txt"
    python_stub = venv_bin_dir / "python"
    python_stub.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{env_capture}"
printf '%s\\n' "$@" > "{args_capture}"
""",
        encoding="utf-8",
    )
    python_stub.chmod(0o755)

    return sandbox_root, env_capture, args_capture


def test_gap_hunt_candidate_wrapper_sources_activate_and_forwards_repo_root(
    tmp_path: Path,
) -> None:
    # The wrapper should source activate.sh, then exec the repo-local venv
    # Python with the miner script and fixed --repo-root wiring.
    sandbox_root, env_capture, args_capture = _build_gap_hunt_candidate_wrapper_sandbox(
        tmp_path
    )

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-backend-gap-hunt-candidate-miner.sh"),
            "--output",
            "tmp/custom-gap-hunt.md",
            "--matrix-path",
            "docs/custom-matrix.md",
        ],
        cwd=sandbox_root,
        env=os.environ.copy(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr

    args = args_capture.read_text(encoding="utf-8").splitlines()
    env_snapshot = env_capture.read_text(encoding="utf-8")

    assert args[0] == str(sandbox_root / "scripts" / "backend_gap_hunt_candidates.py")
    assert args[1] == "--repo-root"
    assert args[2] == str(sandbox_root)
    assert args[3:] == [
        "--output",
        "tmp/custom-gap-hunt.md",
        "--matrix-path",
        "docs/custom-matrix.md",
    ]
    assert "GAP_HUNT_CANDIDATE_MINER_SANDBOX=1" in env_snapshot
