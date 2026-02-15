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
