# Semantic Cartographer Settings and Auditability Plan

- **Date:** June 15, 2026
- **Status:** Proposed
- **Scope:** Add first-class semantic cartographer configuration, persist model/reasoning/audit metadata in SQLite, and expose a settings UI that controls cartographer behavior independently from chat conversations.
- **Related docs:**
  - `docs/plans/semantic_cartographer_usefulness_plan.md`
  - `docs/plans/workspace_graph_performance_semantic_liveness_plan.md`
  - `docs/plans/setta_semantic_work_graph_implementation_plan.md`

## Position

Yes: the semantic cartographer needs its own settings page, and reasoning effort
belongs in SQLite cartographer state.

The current behavior is too implicit for a long-lived product surface:

- Automatic cartographer runs do not set their own model or reasoning effort.
- Completed run audit records persist the model reported by Codex, but not the
  requested or effective reasoning effort.
- Superseded and pre-start failed runs often have empty model fields because the
  harness was never reached.
- The failed `workflow_done` run in `~/.setta/semantic-graph.sqlite` showed an
  input-size failure before model audit was populated.
- Successful recent runs in `~/.setta` show `gpt-5.5`, confirming that the
  cartographer is using the Codex structured-task default model today.
- There is no reliable way to prove whether those runs used `xhigh`, `high`,
  or another reasoning effort.

That is both a product problem and an operations problem. The cartographer is
infrastructure, not the active user chat. It should have explicit cost/latency
settings, and every run should leave enough audit data to explain what was
requested, what was sent to the harness, what Codex reported back, and how long
each stage took.

## Principles

1. **Cartographer settings are not chat settings.**
   Per-conversation `/model` choices should not silently determine background
   semantic indexing behavior. The cartographer needs an independent settings
   surface with explicit defaults.

2. **Persist requested and observed metadata separately.**
   Store what Setta requested, what Setta effectively sent, and what the provider
   reported back. Do not pretend a provider-confirmed reasoning effort exists if
   Codex does not return one.

3. **SQLite audit is the source of truth for run reconstruction.**
   A completed or failed cartographer run should be explainable from
   `semantic-graph.sqlite` without relying on renderer recordings or transient
   console logs.

4. **Use Go-owned contracts and generated TypeScript.**
   The settings and audit types should be owned by `internal/semanticgraph` and
   exposed through `internal/httpapi`; renderer types must be generated.

5. **Separate live and final synthesis policy.**
   Incremental `workflow_window` runs need low-latency behavior. Final
   `workflow_done` synthesis can use a different model, reasoning effort, input
   budget, and queue priority.

6. **Fail loudly on invalid configuration.**
   Unsupported reasoning efforts, impossible concurrency limits, and unknown
   model-selection modes should fail validation instead of falling back silently.

7. **No backward compatibility, legacy support, migrations, or transitional code.**
   This is pre-release semantic infrastructure. If the SQLite schema shape
   changes, fail loudly on incompatible state and require a deliberate store
   reset. Do not add migrations, old-field aliases, legacy readers,
   dual-read/write paths, transitional adapters, compatibility layers, or
   silent compatibility behavior.

## Resolved Product Decisions

1. **Live reasoning defaults to low.**
   Live `workflow_window` cartography should favor fast, frequent,
   evidence-backed extraction. If measurement later proves low reasoning is too
   weak, raise it to medium in a normal settings/default change, not through a
   compatibility fallback.

2. **Final synthesis reasoning defaults to medium.**
   `workflow_done` final synthesis can spend more reasoning than live windows,
   but it should not default to high or xhigh until final input budgeting,
   latency audit, and failure handling are reliable.

3. **Provider default model is supported but explicit.**
   The default model-selection mode is `provider_default`, and every run audit
   must record that provider default was requested. Users who need predictable
   cost or latency can choose an explicit model. The UI should show the current
   reported provider model when it is known, such as `gpt-5.5`.

4. **Settings are global at first.**
   Use one global semantic cartographer settings record. Do not add workspace
   overrides in this implementation. Workspace overrides can be designed later
   as a separate feature only if real usage requires them.

5. **Old local cartographer audit data is reset, not migrated.**
   Existing cartographer rows cannot truthfully backfill requested/effective
   reasoning effort. During this schema change, reset cartographer tables or the
   whole semantic graph store. Do not preserve existing rows through migration,
   compatibility aliases, synthetic defaults, or transitional read paths.

## Target Product Behavior

Settings should let the user control:

- Automatic cartographer processing enabled/disabled.
- Live window model and reasoning effort.
- Final synthesis model and reasoning effort.
- Automatic processing concurrency and per-source concurrency.
- Per-source queue cap.
- Lease duration.
- Observation/window limits that affect latency and input size.
- Final synthesis input budget.
- Debug/audit capture level.

The default experience should be:

- Both live and final profiles start with `provider_default` model selection
  that is recorded explicitly in audit state.
- Live windows use `low` reasoning for low-latency updates.
- Final synthesis uses `medium` reasoning after deterministic input budgeting.
- Live windows use a fast, bounded configuration suitable for frequent updates.
- Final synthesis uses a stronger configuration, but with explicit input-size
  controls so it cannot exceed Codex turn limits.
- Run details show model, reasoning, queue wait, harness duration, input size,
  close reason, trigger kind, status, and failure/no-op reason.
- Recordings include cartographer settings and recent run audit snapshots.

## Phase 0 - Audit Current State and Reset Store Version

Before implementation, capture a short appendix report under
`docs/reports/performance/` or `docs/reports/semantic-cartographer/` with:

- Recent counts from `semantic_cartographer_runs` grouped by status, trigger,
  model, and error.
- Distinct models currently recorded.
- Number of runs with empty model.
- Number of failed `workflow_done` runs caused by input length.
- Current table schema for `semantic_cartographer_runs`.
- The exact store reset command or developer action used before verification.

Decision:

- Treat schema change as a cartographer store-version change.
- Do not preserve legacy cartographer rows.
- Do not implement migrations or transitional schema readers.
- Fail loudly on incompatible state and require a fresh semantic graph store.

Implementation note:

- Phase 0 captured the baseline in
  `docs/reports/performance/semantic-cartographer-settings-audit-phase-0.md`
  and bumped the semantic graph store version to `10` as a reset gate.
- Version `10` is a Phase 0-only store shape: it still has the old
  cartographer run schema and no persisted cartographer settings table.
- The first schema-changing phase must bump the semantic graph store version
  again, from `10` to `11`, and must reject version `10` stores instead of
  silently adding missing tables or columns through `CREATE TABLE IF NOT EXISTS`.

## Phase 1 - Semantic Cartographer Settings Domain

Add a semanticgraph-owned settings model, for example:

```text
SemanticCartographerSettings
  schemaVersion
  automaticProcessingEnabled
  liveTaskConfig
  finalSynthesisTaskConfig
  processingConfig
  observationConfig
  auditConfig
  updatedAt

SemanticCartographerTaskConfig
  modelSelection
  modelId
  reasoningEffort
  inputBudget

SemanticCartographerProcessingConfig
  maxConcurrent
  perSourceConcurrent
  maxQueuedPerSource
  leaseDurationSeconds

SemanticCartographerObservationConfig
  maxWindowEvents
  maxWindowContentBytes
  assistantThresholdBytes
  outputThresholdBytes
  priorSummaryLimit
  tokenBudget
  quietCloseAfterSeconds
```

`modelSelection` should be explicit:

- `provider_default`: do not send a model id; audit that the provider default
  was requested.
- `explicit`: send the configured model id.

Reasoning effort should not have an implicit unknown path for configured runs.
The settings default is `low` for live windows and `medium` for final synthesis.
Both defaults must be validated against the available Codex model options before
they are sent.

Persist settings in `semantic-graph.sqlite`, not in appearance settings:

- The semantic graph service owns cartographer behavior.
- Settings and run audit should live in the same durable domain.
- Renderer appearance settings should not become a generic app-settings drawer.
- The settings table starts fresh with the new schema; no migration path is
  required.
- Adding the settings table is a schema change. Bump `semanticStoreVersion` to
  `11` in the same commit as the table and reject version `10` stores with the
  existing reset guidance.
- Do not rely on `CREATE TABLE IF NOT EXISTS` to upgrade a version `10`
  database in place. A version `10` database represents pre-settings state and
  must fail on open.

Recommended SQLite shape:

```text
semantic_cartographer_settings
  id TEXT PRIMARY KEY
  schema_version INTEGER NOT NULL
  settings_json TEXT NOT NULL
  settings_hash TEXT NOT NULL
  created_at TEXT NOT NULL
  updated_at TEXT NOT NULL
```

Keep the row count to one global app-level settings record at first. Workspace
overrides can be added later only if real usage requires them.

Phase 1 implementation boundary:

- Implement backend domain types, default construction, validation, canonical
  JSON persistence, and settings hash calculation in `internal/semanticgraph`.
- Add store methods to read the singleton settings row, create defaults for a
  fresh store, and update the row after validation.
- Keep Phase 1 backend-only. Do not add HTTP endpoints, IPC/preload surfaces,
  generated TypeScript, renderer settings UI, model catalog calls, or harness
  behavior changes until the later phases that own those surfaces.
- Keep existing constructor options useful for tests, but persisted settings
  should become the service-owned source for default cartographer configuration.
- Separate defaulting from validation. Default construction may fill omitted
  values for a fresh store, but loading or updating persisted settings must fail
  loudly on invalid enum values, impossible concurrency limits, invalid lease or
  window budgets, or inconsistent `modelSelection`/`modelId` pairs.
- Validate reasoning effort values against the shared chat/Codex
  `ReasoningEffort` enum in this phase. Model-specific compatibility validation
  belongs to the model catalog phase because it requires provider model options.
- Add focused semanticgraph tests for fresh-store default creation, persistence
  across store reopen, settings hash stability, invalid settings rejection, and
  version `10` rejection.

Implementation note:

- Phase 1 was implemented by adding `SemanticCartographerSettings` persistence,
  the singleton `semantic_cartographer_settings` row, canonical settings JSON,
  settings hash validation, service default application, and the store version
  bump to `11`.
- Version `11` is the current settings-store shape, but it still has the old
  `semantic_cartographer_runs.model` audit field and does not yet persist
  requested/effective/reported model and reasoning metadata.

## Phase 2 - Run Audit Schema

Replace the single ambiguous `model` audit field with explicit requested,
effective, and reported metadata.

Implementation boundary:

- Phase 2 is a backend run-audit schema and lifecycle phase. It may update
  existing Go HTTP contract types and regenerate existing TypeScript surfaces
  because `CartographerRun` is already exposed, but it should not add the new
  settings endpoints, settings UI, model catalog endpoint, or final-synthesis
  input budgeting.
- Do not change the cartographer harness request policy in this phase beyond
  recording what was actually sent. Sending configured model/reasoning belongs
  to Phase 3.
- Do not add migrations, transitional reads, dual writes, old-field aliases, or
  compatibility shims for the old `model` field.
- Bump `semanticStoreVersion` from `11` to `12` in the same commit as the run
  audit schema change. Version `11` stores must fail on open with reset
  guidance.

Recommended run audit fields:

```text
settings_hash
task_profile                  -- live_window | final_synthesis | manual | retry | review
requested_model_selection     -- provider_default | explicit
requested_model
effective_model
reported_model
requested_reasoning_effort
effective_reasoning_effort
reported_reasoning_effort
reasoning_effort_reported     -- boolean
queue_wait_ms
harness_duration_ms
validation_duration_ms
application_duration_ms
total_duration_ms
input_bundle_bytes
input_bundle_character_count
output_schema_bytes
raw_harness_response_bytes
close_reason
```

Semantics:

- `settings_hash` is copied from the singleton settings row at run/window
  creation time. Later settings changes must not rewrite historical run meaning.
- `requested_*` comes directly from the saved settings snapshot at
  run/window creation time and is copied onto the run. Do not depend on looking
  up a mutable settings row later to explain an old run.
- `effective_*` is what Setta actually sent to `chat.HarnessStructuredTask`.
  Until Phase 3 sends configured reasoning effort, `effective_reasoning_effort`
  should stay empty for current harness calls instead of pretending the
  configured value was sent.
- `reported_model` is what the Codex structured-task audit reports.
- `reported_reasoning_effort` is only populated if the provider returns it.
- `reasoning_effort_reported` is `false` when provider audit has no typed
  reasoning-effort signal.
- Existing `model` should be removed from the run schema and Go/TypeScript
  contract surfaces rather than retained as a compatibility alias.
- Timings should be measured across queue, harness, validation, and application
  stages, not overwritten by the final patch application timestamp.
- Existing cartographer audit rows are not migrated into these fields.
- `task_profile` is derived deterministically from the trigger:
  `workflow_window` -> `live_window`, `workflow_done` -> `final_synthesis`,
  `manual` -> `manual`, `explicit_retry` -> `retry`, and `explicit_review` ->
  `review`.
- Until manual/retry/review get dedicated task-profile settings, they should
  record their specific `task_profile` value but use the live task config for
  requested model/reasoning defaults. `workflow_done` uses final synthesis
  settings; `workflow_window` uses live settings.

The cartographer run record should be updated at each lifecycle transition:

- Queued: settings hash, requested config, trigger, close reason, input counts.
- Running: lease metadata, started timestamp, effective model/reasoning.
- Harness completed: reported model/response id, raw response size, harness
  duration.
- Applied/no-op/rejected/failed/cancelled: terminal status, terminal timestamp,
  diagnostics, total duration.

Phase 2 must also fix the current timing bug:

- `beginCartographerWindowProcessing` should preserve the original `created_at`
  and set `started_at` only when processing starts.
- `ApplyCartographerPatchEnvelope` should update the existing run audit instead
  of rebuilding a fresh run with `created_at`, `started_at`, and `completed_at`
  all set to the application timestamp.
- Queue wait should be computed from `started_at - created_at`.
- Harness duration should measure only the structured harness call.
- Validation and application durations should measure their own stages.
- Total duration should be `completed_at - created_at`.

Recommended Phase 2 tests:

- Fresh semantic graph store opens at version `12`; version `11` stores are
  rejected with reset guidance.
- Saving and reading a cartographer run persists the new requested/effective/
  reported model and reasoning fields, settings hash, profile, close reason,
  byte counts, and durations.
- `model` is absent from the current SQLite run schema and generated
  TypeScript `CartographerRun` contract.
- Queued runs snapshot the current settings hash and requested config.
- A settings change after queueing does not rewrite the queued run's requested
  audit fields.
- Processing a run records effective fields from the actual harness task and
  reported fields from harness audit.
- Successful, no-op, rejected, failed, and cancelled terminal paths preserve
  the original `created_at`/`started_at` and record nonnegative durations.

## Phase 3 - Harness Configuration Path

Extend the cartographer harness task path so settings flow through one typed
configuration object.

Backend changes:

- Add reasoning effort to `CartographerHarnessTask`.
- Set `chat.HarnessStructuredTask.ReasoningEffort`.
- Preserve existing strict JSON output contract and no-tools/no-mutation policy.
- Resolve live versus final task profile before queuing or starting the run.
- Use the run's Phase 2 settings hash and requested config snapshot when
  building the harness task. Do not re-read current mutable settings in a way
  that changes the meaning of already queued runs.

Codex structured-task behavior:

- Send `model` only when model selection is `explicit`.
- Send `effort` whenever a configured reasoning effort is present.
- Capture the model returned by thread/turn audit.
- Capture reported reasoning effort only if Codex exposes it in a typed response
  or notification. If not exposed, leave it empty and mark
  `reasoning_effort_reported=false`.

This phase must also fix the current timing bug where successful run audit rows
can end with `started_at == completed_at`.

## Phase 4 - Model and Reasoning Option Source

The settings UI needs model and reasoning options without abusing an active chat
conversation.

Create a shared Codex model catalog path:

- Extract model listing and reasoning-effort validation out of the chat command
  flow into a reusable chat/Codex service method.
- Return `ChatModelOption` or a semanticgraph-owned equivalent through a
  settings endpoint.
- Include supported reasoning efforts per model.
- Include the provider default model/effort if Codex reports it.
- Fail if a saved explicit model no longer exists instead of silently switching
  to another model.

The renderer should not hardcode model ids or reasoning effort availability.

## Phase 5 - HTTP, IPC, and Generated Contracts

Add Go-owned endpoints:

```text
ReadSemanticCartographerSettings
UpdateSemanticCartographerSettings
ListSemanticCartographerModelOptions
ReadSemanticCartographerRunAudit
ListSemanticCartographerRunAudit
```

The existing processing state endpoint should include:

- Current settings hash.
- Effective processing config.
- Last processed run model/reasoning summary.
- Last failure input-size and model/reasoning summary.

After editing contracts:

- Regenerate generated TypeScript surfaces.
- Update preload/main IPC wrappers.
- Keep endpoint request/response contracts owned by `internal/httpapi`.

## Phase 6 - Settings UI

Add a `Cartographer` subtab to the existing Settings panel.

Controls:

- Toggle automatic processing.
- Segmented control for task profile: `Live` and `Final`.
- Model select for each profile.
- Reasoning effort select for each profile.
- Numeric inputs or steppers for concurrency, per-source concurrency, queue cap,
  lease duration, and input budgets.
- Reset-to-default and save/revert actions.
- Read-only audit summary for the last few runs: status, profile, model,
  reasoning effort, duration, input size, and error/no-op reason.

UI requirements:

- Keep the settings screen operational and compact, not a marketing surface.
- Do not put settings cards inside other cards.
- Do not expose unsupported model/reasoning combinations as selectable.
- Show validation errors next to the relevant control.
- Keep advanced processing/window-size controls grouped separately from common
  model/reasoning controls.

The settings UI should remain a client of backend contracts. It should not
derive Codex model support from local constants.

## Phase 7 - Final Synthesis Input Budgeting

The failed `workflow_done` run in local state shows that final synthesis can
exceed the Codex maximum input length.

Fix final synthesis before increasing reasoning effort or concurrency:

- Measure serialized input size before calling Codex.
- Apply deterministic truncation/summarization before the harness call.
- Record `input_bundle_bytes`, truncation reasons, and dropped/folded window
  counts in run audit.
- Add a hard validation error when the input still exceeds the provider limit.
- Keep the final synthesis budget configurable but bounded.

This phase should make failed final synthesis explainable and prevent an
expensive high-reasoning task from being started with impossible input.

## Phase 8 - Recording and Debug Integration

Extend recording capture so future reports answer the model/reasoning question
without manual SQLite queries.

Record:

- Current cartographer settings.
- Cartographer processing state.
- Recent run audit list.
- Recent failed/no-op/applied runs.
- Run model/reasoning fields.
- Queue wait and harness duration.
- Input size and close reason.
- Last failure message and diagnostics.

Renderer graph debug mode should include the same compact cartographer runtime
summary that the Settings page shows.

## Phase 9 - Verification

Focused backend checks:

```text
./scripts/go.sh test -count=1 ./internal/semanticgraph
./scripts/go.sh test -count=1 ./internal/httpapi
./scripts/go.sh test -count=1 ./internal/chat
```

Renderer checks:

```text
pnpm -C desktop exec vitest run src/components/settings-panel.test.tsx
pnpm -C desktop exec vitest run src/features/workspace-graph/semantic-graph-state.test.ts
pnpm -C desktop build
```

Required E2E coverage:

- Fake Codex structured cartographer receives configured model and reasoning
  effort.
- Run audit persists requested/effective/reported model fields.
- Run audit persists requested/effective reasoning effort.
- Settings persist across restart.
- Invalid settings fail loudly.
- Final synthesis input over budget is truncated or fails before harness start
  with a clear audit diagnostic.
- Recording output includes settings and recent run audit.

If local ChatGPT auth is available, run the live Codex E2E flow that exercises
semantic cartographer configuration. Do not use `OPENAI_API_KEY` for live Codex
verification.

Before any implementation commit that changes executable code, contracts,
generated outputs, or tests:

```text
./scripts/format.sh
./check_quality.sh --all
```

## Open Decisions

None. The product decisions above are resolved for this implementation pass.

## Success Criteria

- The Settings panel has a Cartographer tab with explicit model and reasoning
  controls.
- Automatic cartographer runs no longer inherit chat defaults accidentally.
- SQLite run audit can answer: what model and reasoning effort did this run
  request, what did Setta send, what did Codex report, how long did it take, and
  why did it no-op/fail/apply?
- Recordings include enough cartographer audit data to diagnose slow or missing
  semantic updates.
- Final synthesis cannot fail invisibly due to oversized input.
- The implementation keeps cartographer settings independent from chat
  conversation settings and uses generated frontend contracts.
