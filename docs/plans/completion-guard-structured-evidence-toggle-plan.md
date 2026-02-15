# Completion Guard Rewrite + Global Toggle Plan

## Context

`backend/setta/agentic/completion_guard.py` currently relies on natural-language keyword and regex matching to infer:

1. whether the assistant is claiming completion,
2. whether the user task is in-scope for guarded completion, and
3. whether checks passed/failed/missing.

This is brittle and expensive to maintain. We already have structured message and tool-result data in both internal and external runners that can support a deterministic guard.

This plan replaces keyword matching with structured evidence and adds a global on/off toggle for the feature.

## Goals

1. Remove keyword/regex matching from completion-guard decision logic.
2. Make guard decisions from structured data only.
3. Add a global toggle to enable/disable completion guard behavior.
4. Keep behavior consistent across internal runner and external adapters (Claude/Codex/OpenCode).
5. Improve debuggability with explicit guard decision metadata.

## Non-Goals

1. Backward compatibility with keyword-based guard behavior.
2. Legacy fallback paths, migration shims, or dual-mode operation.
3. Partial rollout by workspace/user/profile.

## High-Level Design

### 1) Global Guard Toggle

Add a global persisted setting `settings.backend.completionGuardEnabled` (default `true`) with a first-class UI control.

Storage decision for this branch:

1. Persist in `setta-settings.json` via `SettingsState.backend`.
2. Do not place this toggle in `llm_config.json` in this branch.
3. A future move into LLM config is intentionally deferred to ongoing LLM-config work on another branch.

1. Extend `SettingsBackend` with `completionGuardEnabled: bool = True`.
2. Surface it in the UI under Project AI settings in a dedicated guardrails section.
3. Persist updates through existing `route_save_settings` and load through `route_load_settings`.
4. Expose a helper `is_completion_guard_enabled(settings: SettingsState) -> bool`.
5. If disabled, guard is a no-op in both runners.

### Toggle UX Details

1. Location: `Overview -> Project AI Settings -> Guardrails`.
2. Control: single checkbox/switch labeled `Require verification before completion`.
3. Description text: briefly explains that completion claims are blocked when checks are missing/failing.
4. Behavior:
   1. updates local state immediately for responsiveness,
   2. persists through `route_save_settings`,
   3. applies globally across chats/runs (not per project config),
   4. disabled in share/deployment mode (consistent with other settings writes).

### 2) Structured Guard Evidence (No Keyword Parsing)

Introduce explicit models for guard evaluation:

1. `VerificationStatus = passed | failed | missing`
2. `CheckStatus = passed | failed | not_run`
3. `CheckResult`:
   1. `check_name: str`
   2. `required: bool`
   3. `status: CheckStatus`
   4. `details: str | None`
   5. `source: str` (tool/evidence source)
4. `CompletionGuardEvidence`:
   1. `task_id: str`
   2. `completion_intent: bool`
   3. `requires_verification: bool`
   4. `check_results: list[CheckResult]`

Guard decisions are derived only from this evidence:

1. `failed` if any required check is failed.
2. `passed` if required checks exist and all are passed.
3. `missing` otherwise.

### Required Checks Policy (Initial)

1. If `requires_verification` is `false`, completion can pass without check results.
2. If `requires_verification` is `true`, at least one required check must be present.
3. For required checks:
   1. any `failed` => `failed`,
   2. any `not_run` => `missing`,
   3. all `passed` => `passed`.
4. Optional checks (`required=false`) are recorded for visibility but do not block completion.

### 3) Explicit Completion Contract

Add a structured completion-report tool that agents must call before final completion:

1. New MCP tool: `setta.report_completion_status` (name finalization during implementation).
2. Tool payload includes:
   1. `task_id`
   2. `completion_intent`
   3. `requires_verification`
   4. `check_results`
3. Tool returns normalized structured status and stores it in chat/run state.

No natural-language inspection is used to infer pass/fail.

Hard contract:

1. Completion gating relies only on structured completion reports.
2. Missing report/evidence for a verification-required task resolves to `missing` and blocks completion.

### 4) Task Scope Without Keyword Matching

Replace text-derived “creation flow” scope with turn-bound task scope:

1. Assign a `task_id` at each new user message boundary.
2. Associate tool calls/tool results and completion reports with current `task_id`.
3. Evaluate guard using only the active `task_id` evidence.

This removes creation/scaffold/refactor keyword branching entirely.

### 5) Guard Evaluator

Refactor `apply_completion_guard` into deterministic evaluation:

1. Input:
   1. active `task_id`
   2. latest assistant message
   3. latest structured completion evidence for task
   4. global toggle state
2. Output:
   1. pass through assistant message, or
   2. replace with `MISSING_CHECKS_MESSAGE`, or
   3. replace with `FAILED_CHECKS_MESSAGE`.

No regexes remain in this file.

## Runner Integration

### Internal Runner (`backend/setta/llm/agent_runner.py`)

1. Track current `task_id` from user-turn boundaries.
2. Persist completion-report tool results into per-run guard state.
3. Apply guard only when:
   1. toggle is enabled, and
   2. assistant emits a final response for the active task.
4. Replace message on missing/failed verification as today.

### External Runner (`backend/setta/agentic/external_agent_runner.py`)

1. Same `task_id` handling as internal runner.
2. Same structured completion-report ingestion.
3. Same finalization-time guard evaluation.
4. Ensure behavior parity across:
   1. Claude SDK adapter,
   2. Codex app-server adapter,
   3. OpenCode SDK adapter.

## Prompt + Tooling Contract Updates

Update agent system prompts/instructions so completion requires structured reporting:

1. Before claiming completion, call `setta.report_completion_status`.
2. Include explicit check entries and statuses.
3. If checks are not run, report `not_run` (guard blocks completion).

Because we are not keeping legacy behavior, we will treat missing report/evidence as `missing`.

## File-Level Implementation Plan

### Phase 1: Toggle Foundation

1. Add `completionGuardEnabled` to backend settings model with default `True`.
2. Ensure load/save settings includes the new field end-to-end.
3. Add guard gate in completion guard entrypoint and runner call sites based on loaded settings.
4. Add UI toggle in Project AI settings guardrails section.
5. After schema updates, run `./gcf.sh` once.
6. Add tests for enabled/disabled behavior and persistence.

Target files:

1. `backend/setta/types/settings_state.py`
2. `backend/setta/routers/settings.py` (if request validation/update handling needs touchpoints)
3. `backend/setta/agentic/completion_guard.py`
4. `backend/setta/llm/agent_runner.py`
5. `backend/setta/agentic/external_agent_runner.py`
6. `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx` (or split-out guardrails component)
7. `frontend/src/state/actions/settings.ts` (if helper methods are added for save flow)

### Phase 2: Structured Models + Report Tool

1. Add models for check results and completion evidence.
2. Add new MCP/reporting tool endpoint and registry wiring.
3. Store report results in run/chat state keyed by `task_id`.

Target files:

1. `backend/setta/types/chat_messages.py` (if extensions needed)
2. `backend/setta/llm/chat_toolkit/*` (new tool wiring)
3. `backend/setta/agentic/*` runner state structures

### Phase 3: Guard Evaluator Rewrite

1. Replace regex-based evaluation with structured-evidence evaluator.
2. Remove:
   1. completion-claim regexes,
   2. creation-flow regexes,
   3. check-status regexes.
3. Keep only deterministic decision rules.

Target file:

1. `backend/setta/agentic/completion_guard.py`

### Phase 4: Prompt and Adapter Alignment

1. Update system prompt content so agents produce report tool calls.
2. Verify internal and external agent loops preserve/report tool calls reliably.
3. Confirm no adapter-specific branch is needed for guard logic.

Target files:

1. `backend/setta/mcp/system_prompt.md`
2. Adapter prompt injection points under `backend/setta/agentic/external_adapters/`

### Phase 5: Cleanup

1. Delete regex-centric unit tests and replace with structured-evidence tests.
2. Remove dead constants/helpers.
3. Update docs for new completion contract and toggle.

## Testing Plan

### Unit Tests

1. Guard decision matrix:
   1. all passed -> allow
   2. any failed -> failed message
   3. missing/not_run -> missing message
2. Toggle:
   1. enabled -> guard behavior active
   2. disabled -> never rewrite
3. Task scope isolation:
   1. evidence from old task cannot satisfy new task.

### Runner Integration Tests

1. Internal runner:
   1. completion with missing evidence is blocked
   2. completion with passed evidence is allowed
   3. toggle disabled bypasses guard
2. External runner:
   1. same checks using finalized-message path.

### Adapter Coverage

1. Claude, Codex, OpenCode:
   1. verify completion-report tool call reaches guard state
   2. verify final assistant message rewrite behavior is identical.

## Observability

Add structured guard decision logs/events:

1. `task_id`
2. `toggle_enabled`
3. `completion_intent`
4. resolved verification status
5. reason (`failed_check`, `missing_report`, `not_run_checks`, `disabled`).

This should make false positives/negatives diagnosable without transcript regex inspection.

## Risks and Mitigations

1. Risk: agent omits completion-report tool call.
   1. Mitigation: strict prompt contract + treat absence as `missing`.
2. Risk: inconsistent tool call behavior across adapters.
   1. Mitigation: adapter-level integration tests for each external framework.
3. Risk: over-blocking non-coding conversations.
   1. Mitigation: `requires_verification` in explicit report payload; only enforce when true.
4. Risk: run starts before settings are loaded in frontend.
   1. Mitigation: backend is source of truth; default `True` until persisted setting is loaded/saved.

## Acceptance Criteria

1. `completion_guard.py` has no keyword/regex status inference logic.
2. Guard decisions are based only on typed structured evidence.
3. Global toggle exists in the UI and persists via settings load/save.
4. Toggle state is honored by both internal and external runners.
5. Claude/Codex/OpenCode paths pass parity tests.
6. Missing structured completion evidence blocks completion when guard is enabled.
7. Documentation describes the report contract and toggle behavior.

## Execution Order

1. Implement global toggle foundation.
2. Add completion report tool + evidence models.
3. Rewrite guard evaluator to structured-only logic.
4. Update prompts and adapter integration.
5. Replace tests and remove regex legacy code.
