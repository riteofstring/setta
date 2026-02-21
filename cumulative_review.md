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

## 2026-02-18 23:45:28 PST

- Implemented completion-guard strictness and same-turn verification plumbing:
  - `backend/setta/agentic/completion_guard.py` now enforces completion checks only on actual completion-claim text and fail-closes when no valid structured report is present.
  - Added explicit inconsistent-intent blocking when latest report sets `completionIntent=false`.
  - Guard now considers same-turn tool results before finalizing assistant output, preventing false blocks when report tool returns in the same turn.
- Wired `completionGuardEnabled` consistently through internal and external runners:
  - `backend/setta/llm/agent_runner.py` now computes required completion-report tool injection conditionally on the toggle, threads toggle state through system prompt/tool payload construction, and applies completion guard using same-turn tool results.
  - `backend/setta/agentic/system_prompt.py` now removes the `## Completion Reporting Contract` section when the guard is disabled.
  - `backend/setta/agentic/external_tool_allowlist.py` and `backend/setta/agentic/external_agent_runner.py` now include `report_completion_status` only when the guard is enabled for Claude/Codex/OpenCode tool configs.
- Fixed TaskBoard explicit-empty-override behavior:
  - `backend/setta/types/helpers_lvl2.py` now preserves explicit empty TaskBoard `columns` overrides instead of re-injecting generated defaults.
- Fixed Guardrails toggle persistence UX path in settings:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx` now updates store state only after successful `route_save_settings` response and shows an error notification on failure.
- Added regression coverage:
  - Backend tests updated/added in `tests/agentic/test_completion_guard.py`, `tests/llm/test_agent_runner.py`, `tests/agentic/test_external_tool_allowlist.py`, `tests/agentic/test_external_agent_runner.py`, and `tests/types/test_section_defaults.py`.
  - Frontend E2E tests added/updated in `frontend/tests/e2e/overview/project-ai/project-ai-settings-agent-profiles.spec.ts` and `frontend/tests/e2e/editor/task-board-generated-defaults.spec.ts`.
- Validation:
  - `source activate.sh && pytest -q tests/agentic/test_completion_guard.py tests/llm/test_agent_runner.py tests/agentic/test_external_tool_allowlist.py tests/agentic/test_external_agent_runner.py tests/types/test_section_defaults.py` passed (`122 passed`).
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/Overview.test.tsx src/utils/generatedTypes.taskBoardDefaults.test.ts` passed (`2 files, 8 tests`).
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-ai-settings-agent-profiles.spec.ts frontend/tests/e2e/editor/task-board-generated-defaults.spec.ts` passed (`6 passed`).
  - Frontend eslint command remains blocked in this environment due missing package resolution for `@eslint/js` from `frontend/eslint.config.js`.

## 2026-02-19 00:12:19 PST

- Removed completion-guard keyword matching and switched to structured-only enforcement:
  - `backend/setta/agentic/completion_guard.py` no longer uses regex/keyword completion-claim detection.
  - Guard now evaluates user-visible assistant text against the latest `report_completion_status` payload only, while preserving backend `[Error] ...` messages.
  - `backend/setta/mcp/system_prompt.md` now requires `report_completion_status` before any user-visible response, with `completionIntent=false` for non-completion turns.
- Hardened completion report tool routing across multi-server MCP configurations:
  - `backend/setta/llm/agent_runner.py` now globally filters non-Setta `*__report_completion_status` tool definitions during payload construction, including when no profile allowlist is present.
- Fixed guardrails toggle save race behavior in Project AI settings:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx` now tracks save request IDs and disables the completion-guard toggle while `/saveSettings` is in flight.
- Added and updated regression coverage:
  - `tests/agentic/test_completion_guard.py` and `tests/llm/test_agent_runner.py` now codify structured-only completion-guard behavior (no keyword inference).
  - `tests/llm/test_agent_runner.py` now covers global filtering of non-Setta completion-status tools.
  - `tests/agentic/test_external_agent_runner.py` now verifies user-visible external-runner responses are blocked when no report is present.
  - `frontend/tests/e2e/overview/project-ai/project-ai-settings-agent-profiles.spec.ts` now asserts persisted toggle state relative to initial state, waits for `/api/saveSettings` success, and includes an in-flight disabled-state regression test.
- Validation:
  - `source activate.sh && pytest -q tests/agentic/test_completion_guard.py tests/llm/test_agent_runner.py tests/agentic/test_external_agent_runner.py` passed (`108 passed`).
  - `source activate.sh && ruff check backend/setta/agentic/completion_guard.py tests/agentic/test_completion_guard.py tests/llm/test_agent_runner.py tests/agentic/test_external_agent_runner.py` passed.
  - `source activate.sh && ruff check backend/setta/llm/agent_runner.py tests/llm/test_agent_runner.py` passed.
  - `pnpm -C frontend exec prettier --check src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx tests/e2e/overview/project-ai/project-ai-settings-agent-profiles.spec.ts` passed.
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-ai-settings-agent-profiles.spec.ts` passed (`5 passed`).
