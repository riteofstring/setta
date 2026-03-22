from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType

from tests.start.dev_script_wiring_helpers import repo_root


def _load_lint_backend_parity_matrix_claims_module() -> ModuleType:
    root = repo_root()
    script_path = root / "scripts" / "lint_backend_parity_matrix_claims.py"
    spec = spec_from_file_location(
        "lint_backend_parity_matrix_claims_script",
        script_path,
    )
    assert spec is not None and spec.loader is not None
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_matrix(matrix_path: Path, body: str) -> None:
    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    matrix_path.write_text(
        f"""# Backend Behavior Parity Matrix

## Matrix

{body}
""",
        encoding="utf-8",
    )


def test_lint_matrix_claims_accepts_structured_live_provider_claims_backed_by_annotated_tests(
    tmp_path: Path,
) -> None:
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    go_test_path = repo_root_path / "internal" / "managedllm" / "executor_liveprovider_test.go"
    go_test_path.parent.mkdir(parents=True, exist_ok=True)
    go_test_path.write_text(
        """package managedllm

// parity-evidence: proof-mode=live-provider; evidence-tags=persisted-messages,usage
func TestManagedChatOpenAILiveProviderCompletionParity(t *testing.T) {}
""",
        encoding="utf-8",
    )
    _write_matrix(
        matrix_path,
        """| Row | Source (`deadbee`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `managed_chat.outputs` | `tests/llm/test_llm_chat_manager_openai_integration.py::test_gpt_4o_mini_chat_completion` | `internal/managedllm/executor.go::Execute` | `TestManagedChatOpenAILiveProviderCompletionParity` | `frontend/src/state/actions/ai.ts` | `Proved` | `proof-mode=live-provider`; `evidence-tags=persisted-messages,usage` |
""",
    )

    module = _load_lint_backend_parity_matrix_claims_module()
    failures = module.lint_matrix_claims(
        repo_root=repo_root_path,
        matrix_path=matrix_path,
    )

    assert failures == []


def test_lint_matrix_claims_rejects_unbacked_evidence_tags(
    tmp_path: Path,
) -> None:
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    go_test_path = repo_root_path / "internal" / "managedllm" / "executor_liveprovider_test.go"
    go_test_path.parent.mkdir(parents=True, exist_ok=True)
    go_test_path.write_text(
        """package managedllm

// parity-evidence: proof-mode=live-provider; evidence-tags=streaming-deltas,live-state-finalized
func TestManagedChatOpenAILiveProviderCompletionParity(t *testing.T) {}
""",
        encoding="utf-8",
    )
    _write_matrix(
        matrix_path,
        """| Row | Source (`deadbee`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `managed_chat.streaming` | `tests/llm/test_llm_chat_manager_openai_integration.py::test_gpt_4o_mini_chat_completion` | `internal/managedllm/executor.go::Execute` | `TestManagedChatOpenAILiveProviderCompletionParity` | `frontend/src/state/actions/ai.ts` | `Proved` | `proof-mode=live-provider`; `evidence-tags=streaming-deltas,persisted-events` |
""",
    )

    module = _load_lint_backend_parity_matrix_claims_module()
    failures = module.lint_matrix_claims(
        repo_root=repo_root_path,
        matrix_path=matrix_path,
    )

    assert len(failures) == 1
    assert failures[0].row_id == "managed_chat.streaming"
    assert "persisted-events" in failures[0].message


def test_lint_matrix_claims_rejects_proof_mode_without_evidence_tags(
    tmp_path: Path,
) -> None:
    repo_root_path = tmp_path / "workspace"
    matrix_path = (
        repo_root_path
        / "docs"
        / "plans"
        / "go-backend-rewrite"
        / "backend-behavior-parity-matrix.md"
    )
    _write_matrix(
        matrix_path,
        """| Row | Source (`deadbee`) | Go impl | Go tests | Transport / caller evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `managed_chat.outputs` | `tests/llm/test_llm_chat_manager_openai_integration.py::test_gpt_4o_mini_chat_completion` | `internal/managedllm/executor.go::Execute` | `TestManagedChatOpenAILiveProviderCompletionParity` | `frontend/src/state/actions/ai.ts` | `Proved` | `proof-mode=live-provider` |
""",
    )

    module = _load_lint_backend_parity_matrix_claims_module()
    failures = module.lint_matrix_claims(
        repo_root=repo_root_path,
        matrix_path=matrix_path,
    )

    assert len(failures) == 1
    assert failures[0].row_id == "managed_chat.outputs"
    assert "without evidence-tags" in failures[0].message
