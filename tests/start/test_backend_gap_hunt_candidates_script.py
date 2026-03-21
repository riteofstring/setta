import os
import subprocess
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


def test_generate_report_surfaces_status_revisits_and_uncited_sources(
    tmp_path: Path,
) -> None:
    # The miner should keep unknown gap leads on top, while pushing retained
    # and already-justified divergence work into lower-priority sections.
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"
    docs_root = repo_root_path / "docs" / "reference"

    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    (tests_root / "api").mkdir(parents=True, exist_ok=True)
    docs_root.mkdir(parents=True, exist_ok=True)

    matrix_path.write_text(
        """# Backend Behavior Parity Matrix

## Audit Boundary

- Source baseline: `main@abc123`
- Target head: `deadbeef`

## Matrix

| Row | Source (`abc123`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `runner.summary.lookup` | `tests/api/test_runner.py::test_cited_lookup` | `internal/runner.go` | `TestRunnerLookup` | `backend/setta/api/runner.py::SettaRunner` | `Retained Python boundary` | retained row |
| `terminal.cli_sender` | `docs/reference/urls-and-routes.md` | `internal/terminal.go` | `` | `frontend/src/components/Terminal.tsx` | `Intentional divergence` | justified divergence |
| `view_mode.toggle` | `docs/reference/view-modes.md` | `internal/view_modes.go` | `TestToggleViewModePersists` | `frontend/src/components/Pages/MainContainerCore.tsx` | `Proved` | proved row |
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
    (docs_root / "view-modes.md").write_text("# View Modes\n", encoding="utf-8")
    (docs_root / "chat-toolkit.md").write_text("# Chat Toolkit\n", encoding="utf-8")
    (docs_root / "ui-style-consistency.md").write_text(
        "# UI Style Consistency\n",
        encoding="utf-8",
    )

    module = _load_backend_gap_hunt_candidates_module()
    report = module.generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_root,
        docs_path=docs_root,
        limit=10,
    )

    go_owned_candidate_keys = {
        candidate.key for candidate in report.go_owned_candidates
    }
    low_priority_divergence_candidate_keys = {
        candidate.key for candidate in report.low_priority_divergence_candidates
    }
    retained_candidate_keys = {
        candidate.key for candidate in report.retained_boundary_candidates
    }

    assert "matrix-status:runner.summary.lookup" in retained_candidate_keys
    assert (
        "matrix-status:terminal.cli_sender"
        in low_priority_divergence_candidate_keys
    )
    assert "matrix-status:terminal.cli_sender" not in go_owned_candidate_keys
    assert "weak-proof:view_mode.toggle" in go_owned_candidate_keys
    assert (
        "test:tests/api/test_runner.py::test_uncited_lookup_failure"
        in go_owned_candidate_keys
    )
    assert "doc:docs/reference/chat-toolkit.md" in go_owned_candidate_keys
    assert report.go_owned_candidates[0].key == (
        "test:tests/api/test_runner.py::test_uncited_lookup_failure"
    )

    uncited_tests = {
        f"{test_ref.path}::{test_ref.name}" for test_ref in report.uncited_tests
    }
    uncited_docs = {doc_ref.path for doc_ref in report.uncited_docs}

    assert "tests/api/test_runner.py::test_uncited_lookup_failure" in uncited_tests
    assert "tests/api/test_runner.py::test_cited_lookup" not in uncited_tests
    assert "docs/reference/chat-toolkit.md" in uncited_docs
    assert "docs/reference/view-modes.md" not in uncited_docs
    assert "docs/reference/ui-style-consistency.md" not in uncited_docs

    rendered = module.render_report(report)
    assert "## Unknown Go Gap Leads" in rendered
    assert "## Caller-Liveness Rechecks" in rendered
    assert "## Retained-Boundary Audits" in rendered
    assert "## Low-Priority Known Divergences" in rendered


def test_generate_report_caps_repeated_retained_families(
    tmp_path: Path,
) -> None:
    # Repeated retained families should be capped so one family does not occupy
    # the entire retained-audit section of the backlog.
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    tests_root = repo_root_path / "tests"
    docs_root = repo_root_path / "docs" / "reference"

    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    tests_root.mkdir(parents=True, exist_ok=True)
    docs_root.mkdir(parents=True, exist_ok=True)

    matrix_path.write_text(
        """# Backend Behavior Parity Matrix

## Audit Boundary

- Source baseline: `main@abc123`
- Target head: `deadbeef`

## Matrix

| Row | Source (`abc123`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `chat_toolkit.history.append` | `tests/llm/test_chat_toolkit.py::test_append` | `internal/chat.go` | `` | `backend/setta/api/chat_toolkit.py::ChatHistoryClient.append` | `Retained Python boundary` | retained row |
| `chat_toolkit.history.get` | `tests/llm/test_chat_toolkit.py::test_get` | `internal/chat.go` | `` | `backend/setta/api/chat_toolkit.py::ChatHistoryClient.get` | `Retained Python boundary` | retained row |
| `chat_toolkit.history.delete` | `tests/llm/test_chat_toolkit.py::test_delete` | `internal/chat.go` | `` | `backend/setta/api/chat_toolkit.py::ChatHistoryClient.delete` | `Retained Python boundary` | retained row |
| `chat_toolkit.history.create` | `tests/llm/test_chat_toolkit.py::test_create` | `internal/chat.go` | `` | `backend/setta/api/chat_toolkit.py::ChatHistoryClient.create` | `Retained Python boundary` | retained row |
| `listener.sdk.bootstrap` | `tests/api/test_listener.py::test_bootstrap` | `internal/listener.go` | `` | `backend/setta/api/listener.py::SettaListener` | `Retained Python boundary` | retained row |
| `listener.sdk.realtime` | `tests/api/test_listener.py::test_realtime` | `internal/listener.go` | `` | `backend/setta/api/listener.py::SettaListener` | `Retained Python boundary` | retained row |
""",
        encoding="utf-8",
    )
    (docs_root / "chat-toolkit.md").write_text("# Chat Toolkit\n", encoding="utf-8")

    module = _load_backend_gap_hunt_candidates_module()
    report = module.generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_root,
        docs_path=docs_root,
        limit=12,
    )

    retained_titles = [candidate.title for candidate in report.retained_boundary_candidates]

    assert (
        sum(title.startswith("chat_toolkit.") for title in retained_titles)
        <= module.MAX_CANDIDATES_PER_FAMILY
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
            "--limit",
            "12",
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
    assert args[3:] == ["--output", "tmp/custom-gap-hunt.md", "--limit", "12"]
    assert "GAP_HUNT_CANDIDATE_MINER_SANDBOX=1" in env_snapshot
