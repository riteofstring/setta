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


def _init_git_repo(repo_root_path: Path) -> None:
    repo_root_path.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["git", "init", "-b", "main"],
        cwd=repo_root_path,
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Gap Hunt Tests"],
        cwd=repo_root_path,
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        ["git", "config", "user.email", "gap-hunt-tests@example.com"],
        cwd=repo_root_path,
        check=True,
        capture_output=True,
        text=True,
    )


def _commit_current_workspace(repo_root_path: Path) -> str:
    subprocess.run(
        ["git", "add", "."],
        cwd=repo_root_path,
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        ["git", "commit", "-m", "baseline test inventory"],
        cwd=repo_root_path,
        check=True,
        capture_output=True,
        text=True,
    )
    return subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_root_path,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def _write_matrix_with_baseline(
    matrix_path: Path,
    baseline_ref: str,
    body: str,
) -> None:
    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    matrix_path.write_text(
        f"""# Backend Behavior Parity Matrix

## Audit Boundary

- Source baseline: `main@{baseline_ref}`
- Target head: `deadbeef`

{body}""",
        encoding="utf-8",
    )


def test_generate_report_returns_only_source_tests_missing_explicit_disposition(
    tmp_path: Path,
) -> None:
    # The miner should emit only source tests that still lack an explicit
    # parity disposition in the matrix and omit the old ranking/summary noise.
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"

    _init_git_repo(repo_root_path)
    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "api").mkdir(parents=True, exist_ok=True)

    (tests_root / "api" / "test_runner.py").write_text(
        """def test_cited_lookup() -> None:
    assert True


def test_uncited_lookup_failure() -> None:
    assert True
""",
        encoding="utf-8",
    )
    baseline_ref = _commit_current_workspace(repo_root_path)
    _write_matrix_with_baseline(
        matrix_path,
        baseline_ref,
        f"""## Matrix

| Row | Source (`{baseline_ref[:7]}`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `runner.lookup` | `tests/api/test_runner.py::test_cited_lookup` | `internal/runner.go` | `TestRunnerLookup` | `frontend/src/components/Runner.tsx` | `Proved` | cited row |
""",
    )

    module = _load_backend_gap_hunt_candidates_module()
    report = module.generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_root,
    )

    assert [
        f"{gap.source_test.path}::{gap.source_test.name}" for gap in report
    ] == ["tests/api/test_runner.py::test_uncited_lookup_failure"]
    assert [gap.reason for gap in report] == ["missing_matrix_row"]

    rendered = module.render_report(report)
    assert "## Source Tests Missing Explicit Parity Disposition" in rendered
    assert "tests/api/test_runner.py::test_uncited_lookup_failure" in rendered
    assert "reason=`missing_matrix_row`" in rendered
    assert "## Summary" not in rendered
    assert "Generated:" not in rendered
    assert "Matrix rows parsed" not in rendered


def test_generate_report_recognizes_class_scoped_matrix_test_citations(
    tmp_path: Path,
) -> None:
    # Matrix citations often include unittest-style class scopes, so those
    # cited methods should not remain in the missing-disposition backlog.
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"

    _init_git_repo(repo_root_path)
    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "api").mkdir(parents=True, exist_ok=True)

    (tests_root / "api" / "test_runner.py").write_text(
        """class TestRunnerCases:
    def test_class_cited(self) -> None:
        assert True

    def test_class_uncited(self) -> None:
        assert True
""",
        encoding="utf-8",
    )
    baseline_ref = _commit_current_workspace(repo_root_path)
    _write_matrix_with_baseline(
        matrix_path,
        baseline_ref,
        f"""## Matrix

| Row | Source (`{baseline_ref[:7]}`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `runner.class_scope` | `tests/api/test_runner.py::TestRunnerCases::{{test_class_cited}}` | `internal/runner.go` | `TestRunnerLookup` | `frontend/src/components/Runner.tsx` | `Proved` | class-scoped citation |
""",
    )

    module = _load_backend_gap_hunt_candidates_module()
    report = module.generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_root,
    )

    assert [
        f"{gap.source_test.path}::{gap.source_test.name}" for gap in report
    ] == ["tests/api/test_runner.py::test_class_uncited"]


def test_generate_report_recognizes_pinned_baseline_prefix_on_matrix_test_citations(
    tmp_path: Path,
) -> None:
    # Matrix rows usually cite source tests as `main@<sha>:tests/...`, and the
    # miner should treat those as the same root `tests/...` source test.
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"

    _init_git_repo(repo_root_path)
    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "api").mkdir(parents=True, exist_ok=True)

    (tests_root / "api" / "test_runner.py").write_text(
        """def test_prefixed_cited() -> None:
    assert True


def test_prefixed_uncited() -> None:
    assert True
""",
        encoding="utf-8",
    )
    baseline_ref = _commit_current_workspace(repo_root_path)
    _write_matrix_with_baseline(
        matrix_path,
        baseline_ref,
        f"""## Matrix

| Row | Source (`{baseline_ref[:7]}`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `runner.prefixed_scope` | `main@{baseline_ref}:tests/api/test_runner.py::test_prefixed_cited` | `internal/runner.go` | `TestRunnerLookup` | `frontend/src/components/Runner.tsx` | `Proved` | prefixed baseline citation |
""",
    )

    module = _load_backend_gap_hunt_candidates_module()
    report = module.generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_root,
    )

    assert [
        f"{gap.source_test.path}::{gap.source_test.name}" for gap in report
    ] == ["tests/api/test_runner.py::test_prefixed_uncited"]


def test_generate_report_keeps_rows_with_literal_pipes_inside_code_spans(
    tmp_path: Path,
) -> None:
    # Matrix rows can include literal pipes inside backticked option lists,
    # and those rows still need to be parsed instead of being dropped.
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"

    _init_git_repo(repo_root_path)
    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "api").mkdir(parents=True, exist_ok=True)

    (tests_root / "api" / "test_runner.py").write_text(
        """def test_pipe_cited() -> None:
    assert True
""",
        encoding="utf-8",
    )
    baseline_ref = _commit_current_workspace(repo_root_path)
    _write_matrix_with_baseline(
        matrix_path,
        baseline_ref,
        f"""## Matrix

| Row | Source (`{baseline_ref[:7]}`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `runner.pipe_scope` | `tests/api/test_runner.py::test_pipe_cited`; `docs/reference/runner.md` documents mode selection with `ide|launcher` on the same caller-visible surface | `internal/runner.go` | `TestRunnerLookup` | `frontend/src/components/Runner.tsx` still accepts `--mode=ide|launcher` from the same UI surface | `Proved` | literal-pipe code spans should not break row parsing |
""",
    )

    module = _load_backend_gap_hunt_candidates_module()
    report = module.generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_root,
    )

    assert report == []


def test_generate_report_requires_exact_code_span_test_citations(
    tmp_path: Path,
) -> None:
    # Free-text mentions should not count as an explicit parity disposition.
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"

    _init_git_repo(repo_root_path)
    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "api").mkdir(parents=True, exist_ok=True)
    (tests_root / "api" / "test_runner.py").write_text(
        """def test_uncited_lookup_failure() -> None:
    assert True
""",
        encoding="utf-8",
    )
    baseline_ref = _commit_current_workspace(repo_root_path)
    _write_matrix_with_baseline(
        matrix_path,
        baseline_ref,
        "Mention tests/api/test_runner.py::test_uncited_lookup_failure in prose only.\n",
    )

    module = _load_backend_gap_hunt_candidates_module()
    report = module.generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_root,
    )

    assert [
        f"{gap.source_test.path}::{gap.source_test.name}" for gap in report
    ] == ["tests/api/test_runner.py::test_uncited_lookup_failure"]


def test_generate_report_fails_closed_when_git_inventory_is_unavailable(
    tmp_path: Path,
) -> None:
    # The miner should stop rather than silently switching back to the working
    # tree when the pinned baseline inventory cannot be loaded from git.
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

    _write_matrix_with_baseline(
        matrix_path,
        "abc123",
        """## Matrix

| Row | Source (`abc123`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
""",
    )
    (tests_root / "start" / "test_backend_differential_parity.py").write_text(
        """def test_start_tree_is_collected() -> None:
    assert True
""",
        encoding="utf-8",
    )

    module = _load_backend_gap_hunt_candidates_module()
    try:
        module.generate_report(
            repo_root_path=repo_root_path,
            matrix_path=matrix_path,
            tests_path=tests_root,
        )
    except module.SourceBaselineInventoryError as exc:
        assert "Unable to load pinned source baseline test inventory" in str(exc)
    else:
        raise AssertionError("Expected missing git baseline inventory to fail closed.")


def test_generate_report_prefers_pinned_git_baseline_inventory(
    tmp_path: Path,
) -> None:
    # The source-test backlog should be anchored to the matrix's pinned
    # baseline ref rather than head-only additions in the working tree.
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"

    _init_git_repo(repo_root_path)

    (tests_root / "api").mkdir(parents=True, exist_ok=True)
    baseline_test_path = tests_root / "api" / "test_runner.py"
    baseline_test_path.write_text(
        """def test_baseline_lookup() -> None:
    assert True
""",
        encoding="utf-8",
    )
    baseline_ref = _commit_current_workspace(repo_root_path)

    _write_matrix_with_baseline(
        matrix_path,
        baseline_ref,
        f"""## Matrix

| Row | Source (`{baseline_ref[:7]}`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `runner.lookup` | `tests/api/test_runner.py::test_baseline_lookup` | `internal/runner.go` | `TestRunnerLookup` | `frontend/src/components/Runner.tsx` | `Proved` | cited row |
""",
    )

    baseline_test_path.write_text(
        """def test_baseline_lookup() -> None:
    assert True


def test_head_only_lookup() -> None:
    assert True
""",
        encoding="utf-8",
    )
    (tests_root / "start").mkdir(parents=True, exist_ok=True)
    (tests_root / "start" / "test_backend_differential_parity.py").write_text(
        """def test_head_only_differential_gap() -> None:
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

    assert report == []


def test_generate_report_excludes_gap_hunt_script_tests(tmp_path: Path) -> None:
    # The backlog should stay focused on tests that can reveal Go
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

    _init_git_repo(repo_root_path)
    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "start").mkdir(parents=True, exist_ok=True)
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
    baseline_ref = _commit_current_workspace(repo_root_path)
    _write_matrix_with_baseline(matrix_path, baseline_ref, "")

    module = _load_backend_gap_hunt_candidates_module()
    report = module.generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_root,
    )

    assert [
        f"{gap.source_test.path}::{gap.source_test.name}" for gap in report
    ] == ["tests/start/test_backend_differential_parity.py::test_real_gap_hunt_clue"]


def test_generate_report_keeps_tests_with_non_terminal_matrix_statuses(
    tmp_path: Path,
) -> None:
    # A cited source test should stay in the backlog when any citing row is
    # still marked as Missing or proof-incomplete.
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"

    _init_git_repo(repo_root_path)
    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "api").mkdir(parents=True, exist_ok=True)
    (tests_root / "api" / "test_runner.py").write_text(
        """def test_lookup_gap() -> None:
    assert True
""",
        encoding="utf-8",
    )
    baseline_ref = _commit_current_workspace(repo_root_path)
    _write_matrix_with_baseline(
        matrix_path,
        baseline_ref,
        f"""## Matrix

| Row | Source (`{baseline_ref[:7]}`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `runner.lookup` | `tests/api/test_runner.py::test_lookup_gap` | `internal/runner.go` | `TestRunnerLookup` | `frontend/src/components/Runner.tsx` | `Missing` | gap still open |
""",
    )

    module = _load_backend_gap_hunt_candidates_module()
    report = module.generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_root,
    )

    assert len(report) == 1
    assert report[0].reason == "non_terminal_disposition"
    assert report[0].rows == ("runner.lookup:Missing",)


def test_generate_report_keeps_proved_rows_without_go_test_proof(
    tmp_path: Path,
) -> None:
    # A Proved row still needs explicit proof in the Go-tests column rather
    # than a bare citation plus a confident status.
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"

    _init_git_repo(repo_root_path)
    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "api").mkdir(parents=True, exist_ok=True)
    (tests_root / "api" / "test_runner.py").write_text(
        """def test_lookup_gap() -> None:
    assert True
""",
        encoding="utf-8",
    )
    baseline_ref = _commit_current_workspace(repo_root_path)
    _write_matrix_with_baseline(
        matrix_path,
        baseline_ref,
        f"""## Matrix

| Row | Source (`{baseline_ref[:7]}`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `runner.lookup` | `tests/api/test_runner.py::test_lookup_gap` | `internal/runner.go` | - | `frontend/src/components/Runner.tsx` | `Proved` | confidence alone is not enough |
""",
    )

    module = _load_backend_gap_hunt_candidates_module()
    report = module.generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_root,
    )

    assert len(report) == 1
    assert report[0].reason == "proved_without_go_proof"
    assert report[0].rows == ("runner.lookup:Proved",)


def test_generate_report_accepts_justified_omission_rows_with_notes(
    tmp_path: Path,
) -> None:
    # Retained-boundary and intentional-divergence rows are acceptable
    # dispositions when the matrix explicitly justifies the omission.
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"

    _init_git_repo(repo_root_path)
    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "api").mkdir(parents=True, exist_ok=True)
    (tests_root / "api" / "test_runner.py").write_text(
        """def test_lookup_gap() -> None:
    assert True
""",
        encoding="utf-8",
    )
    baseline_ref = _commit_current_workspace(repo_root_path)
    _write_matrix_with_baseline(
        matrix_path,
        baseline_ref,
        f"""## Matrix

| Row | Source (`{baseline_ref[:7]}`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `runner.lookup` | `tests/api/test_runner.py::test_lookup_gap` | `internal/runner.go` | - | `frontend/src/components/Runner.tsx` | `Intentional divergence` | source behavior intentionally replaced |
""",
    )

    module = _load_backend_gap_hunt_candidates_module()
    report = module.generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_root,
    )

    assert report == []


def test_script_returns_special_exit_code_when_source_test_backlog_is_empty(
    tmp_path: Path,
) -> None:
    # An empty source-test backlog should still write the report file and then
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

    _init_git_repo(repo_root_path)
    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "api").mkdir(parents=True, exist_ok=True)
    (tests_root / "api" / "test_runner.py").write_text(
        """def test_only_cited_case() -> None:
    assert True
""",
        encoding="utf-8",
    )
    baseline_ref = _commit_current_workspace(repo_root_path)
    _write_matrix_with_baseline(
        matrix_path,
        baseline_ref,
        f"""## Matrix

| Row | Source (`{baseline_ref[:7]}`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `runner.lookup` | `tests/api/test_runner.py::test_only_cited_case` | `internal/runner.go` | `TestRunnerLookup` | `frontend/src/components/Runner.tsx` | `Proved` | cited row |
""",
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

    assert (
        result.returncode
        == module.EMPTY_SOURCE_TEST_DISPOSITION_BACKLOG_EXIT_CODE
    )
    assert output_path.read_text(encoding="utf-8") == (
        "# Backend Gap Hunt Candidates\n\n"
        "## Source Tests Missing Explicit Parity Disposition\n\n"
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
