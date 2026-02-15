## 2026-02-18 22:24:34 PST

- Fixed completion-guard correctness in `backend/setta/agentic/completion_guard.py`:
  - Guard now only rewrites completion-attempt messages, not general clarifications.
  - Preserves backend error text (for example `[Error] ...`) instead of masking it.
  - Blocks completion claims when the latest report has `completionIntent=false`.
  - Requires fresh report evidence after the latest assistant turn to prevent stale-report bypass.
  - Evaluates assistant text even when tool calls are present (if user-visible text exists).
- Fixed scoped/internal tool availability and run-scoped config handling:
  - Cached `completionGuardEnabled` once per run in managed and external runners.
  - Ensured required internal completion-report tool stays available under scoped filtering.
  - Allowed `report_completion_status` through MCP unscoped allowlist checks for scoped chat flows.
- Added regression coverage:
  - Unit tests for completion-guard edge cases and stale-report behavior.
  - Unit tests for cached run context guard toggle.
  - Integration test proving `report_completion_status` is callable in scoped chat context.
- Validation:
  - `pytest -q tests/agentic/test_completion_guard.py tests/llm/test_agent_runner.py tests/agentic/test_external_agent_runner.py tests/mcp/test_mcp_agentic_project_state_summary_filtering.py tests/agentic/test_external_tool_allowlist.py` passed (`109 passed`).
  - `ruff check` on touched backend/tests passed.
  - `./gcf.sh` failed in sandbox due `/dev/fd` restriction; equivalent sequence completed successfully: `source activate.sh && cd frontend && pnpm generate && pnpm full-cleanup && pnpm f`.

## 2026-02-18 23:06:32 PST

- Completed completion-report and allowlist hardening:
  - `backend/setta/agentic/completion_report.py` now fails soft on invalid report payloads (`ValidationError` returns `None`) instead of crashing guard evaluation.
  - Completion-report provenance is now strict: only namespaced Setta tools are accepted (`setta__report_completion_status` or `mcp__setta__report_completion_status`).
  - `backend/setta/llm/agent_runner.py` now force-allows only the fully namespaced internal Setta completion-report tool and blocks same-basename tools from other MCP servers.
  - `backend/setta/mcp/system_prompt.md` no longer requires `report_completion_status` for non-completion informational/clarifying replies.
- Made the generated-types default-array fix persistent in codegen:
  - Updated `frontend/generation/convert_pydantic_to_js.py` so list default factories emit `.default(() => [])`.
  - Regenerated `frontend/src/utils/generatedTypes.ts`, which now applies the factory-array default pattern across generated list defaults.
- Added/updated regression tests:
  - `tests/agentic/test_completion_report.py` for fail-soft coercion and strict tool-name provenance.
  - `tests/agentic/test_completion_guard.py` malformed report payload handling.
  - `tests/llm/test_agent_runner.py` allowlist scoping so `other__report_completion_status` is rejected.
  - `frontend/src/utils/generatedTypes.taskBoardDefaults.test.ts` and `frontend/tests/e2e/editor/task-board-generated-defaults.spec.ts` for shared mutable-default prevention.
- Validation:
  - `pytest -q tests/agentic/test_completion_report.py tests/agentic/test_completion_guard.py tests/llm/test_agent_runner.py tests/agentic/test_external_tool_allowlist.py` passed (`47 passed`).
  - `pytest -q tests/agentic/test_external_agent_runner.py tests/agentic/test_external_tool_allowlist.py tests/mcp/test_mcp_agentic_project_state_summary_filtering.py tests/types/test_section_defaults.py` passed (`81 passed`).
  - `pnpm -C frontend exec vitest run src/utils/generatedTypes.taskBoardDefaults.test.ts` passed (`1 file, 2 tests`).
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/editor/task-board-generated-defaults.spec.ts` passed (`1 passed`).
