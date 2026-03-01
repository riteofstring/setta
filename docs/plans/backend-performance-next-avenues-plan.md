# Backend Performance Plan: Next Avenues

## Goal
- Target the largest remaining backend latency and throughput bottlenecks with improvements that are different from the optimizations already done in this branch.
- Prioritize architecture-level changes where they produce clearly higher return than incremental micro-optimizations.

## Out Of Scope For This Plan
- More of the same UI-only route fast-path conversions.
- More read-helper micro-optimizations for name validation and dependency graph traversal.
- More small watcher refresh skips of the same type already landed.

## Investigation Snapshot
- Existing reports in `perf/reports/backend` show major wins already landed for:
- `DependencyGraph` construction, param/name validation, shown-param filtering.
- UI-only route fast paths.
- Single-config slicing cache and watcher refresh fast path.
- Broadcast serialization once per fanout.

### New measurements (this investigation)
- Environment: local dev machine, Python env via `source activate.sh`.
- Synthetic project: callable state with 500/1000/2000 params.
- Settings-manager and project-manager fixtures from `tests/utils/manager_fixture.py`.

| Area | Result |
| --- | --- |
| `convert_backend_to_single_config` | ~47.6 ms median (1000 params), ~103.9 ms (2000 params) |
| `add_new_history_entry` scoped copy | ~51.4 ms median (1000), ~109.5 ms (2000) |
| Save snapshot build (`_build_save_work_item`) | ~42.3 ms median (1000), ~81.8 ms (2000) |
| `update(..., no_watcher, no_name_rules)` | ~99.6 ms median (1000) |
| `_refresh_codegen_state` | ~69.3 ms median (1000) |
| `set_top_level_section_layout` no-op | ~43.9 ms median (1000), mostly conversion overhead |
| `_broadcast_name_validation_errors` (no sockets) | ~23.9 ms median (1000) |
| Project-state websocket payload (synthetic) | ~759 KB at 1000 params, ~1.53 MB at 2000 params |

### Real-session signal from logs
- `backend.log` captured `set_active_view_mode` broadcasts around `910 KB` payload size with route completion around `0.16s`.
- This indicates transport/snapshot cost is now a dominant factor in real interaction latency after earlier compute-path wins.

## Prioritized Roadmap

## 1) Incremental Project-State Transport (Highest ROI)
### Why
- Full project-state websocket snapshots are still large and sent on many writes.
- This creates avoidable serialization, transfer, and frontend parse/apply cost.

### Plan
1. Introduce protocol versioning for project-state sync.
2. Add a new websocket message type for deterministic state patches (typed ops or JSON Patch against revisioned state).
3. Keep full snapshot only for:
- Initial connect.
- Resync after revision mismatch.
- Explicit full-refresh requests.
4. Batch/coalesce patch messages per event loop tick for rapid edit sequences.
5. Preserve strict ordering via revision numbers and reject out-of-order patch apply.

### Success criteria
- Reduce median project-state message bytes by at least 70% on high-frequency UI edits.
- Reduce p95 route completion for UI-only writes by at least 40% in a real connected session.

## 2) Remove Deep-Copy Snapshots From Hot Write Paths
### Why
- Scoped history copy and save payload creation are each 40-110 ms on larger states.
- This cost is paid repeatedly on edit-heavy workflows.

### Plan
1. Replace deep-copy history snapshots with operation-log or structural-sharing revisions.
2. Store undo/redo as reversible mutations against revision references, not full object copies.
3. Update save worker to persist from immutable revision references without eagerly deep-copying the full backend model.
4. Keep periodic checkpoints for bounded recovery/replay time.

### Success criteria
- Reduce median history-entry overhead by at least 60%.
- Reduce median save-work-item creation overhead by at least 60%.
- Keep undo/redo semantics identical.

## 3) Split Write Commit From Heavy Refresh Work
### Why
- `update` still spends most time in validation + full codegen refresh.
- Not every mutation needs synchronous full codegen and diagnostics before ACK.

### Plan
1. Introduce two-stage writes:
- Stage A: commit canonical state mutation and broadcast immediate state delta.
- Stage B: async codegen/diagnostics refresh and follow-up updates.
2. Keep strict synchronous path only for operations that must return fully refreshed generated code before completion.
3. Add per-operation policy metadata to choose sync vs deferred refresh deterministically.

### Success criteria
- Reduce median latency of structural writes that do not require immediate run-ready code by at least 40%.
- No correctness drift in generated code or diagnostics after stage-B completion.

## 4) Remove Redundant Full-State Conversions From Hot Routes
### Why
- `convert_backend_to_single_config` is still tens of milliseconds at realistic sizes.
- Some routes do this even for no-op checks and metadata-level updates.

### Plan
1. Audit routes for direct `convert_backend_to_single_config(...)` calls.
2. Route them through revision-keyed cached single-config state where behavior permits.
3. For hot no-op layout/view metadata paths, use direct project-config data instead of full conversion when section graph traversal is not needed.
4. Add explicit benchmarks for routes like `set_top_level_section_layout` and load flows.

### Success criteria
- Reduce no-op `set_top_level_section_layout` median from ~44 ms to under 10 ms on 1000-param synthetic state.
- Reduce warm `load_project_config` median by at least 30%.

## 5) Incremental Name-Validation Error Broadcasting
### Why
- `_broadcast_name_validation_errors` still takes ~24 ms at 1000 params even before socket send.
- This runs on paths where only a small subset changed.

### Plan
1. Maintain revisioned caches for section/param/project name-validation results.
2. Recompute only affected sections/params on each mutation class.
3. Broadcast validation deltas with fallback to full validation payload when cache invalidation scope is uncertain.

### Success criteria
- Reduce median name-validation broadcast compute cost by at least 70% on single-param edits.

## 6) Queue Partitioning To Reduce Head-Of-Line Blocking
### Why
- Single serialized queue per manager can stall unrelated operations under heavy writes.

### Plan
1. Partition write queues by project config where operations are independent.
2. Keep global serialization only for cross-config or global-state operations.
3. Keep a monotonic revision model per config and a global coordinator for conflict cases.

### Success criteria
- Lower queue wait time under concurrent multi-config activity.
- Preserve deterministic ordering for operations touching the same config.

## Delivery Phases
1. Phase 0: Instrumentation and baselines
- Add per-stage timings: history copy, validate, codegen refresh, merge, serialize, send.
- Add websocket payload size histograms by message type.
- Record queue wait and execution time separately.
2. Phase 1: Incremental transport protocol + fallback full snapshot.
3. Phase 2: Deep-copy removal in history/save pathways.
4. Phase 3: Deferred refresh pipeline.
5. Phase 4: Conversion audit + route rewrites + validation delta cache.
6. Phase 5: Queue partitioning.

## Verification Strategy
- Extend backend perf reports in `perf/reports/backend/` for each phase.
- Add backend benchmark tests for:
- History/save snapshot overhead.
- Conversion cost budgets.
- Route latency budgets for selected high-frequency routes.
- Payload-size budgets for websocket project-state updates.
- Validate behavior parity with existing functional tests, especially undo/redo, autosave, and codegen correctness.

## Risks And Mitigations
- Risk: state divergence between incremental patches and canonical backend state.
- Mitigation: revision checks, deterministic patch application, forced full resync on mismatch.
- Risk: undo/redo regressions when replacing deep-copy history.
- Mitigation: exhaustive mutation replay tests and invariant checks per revision.
- Risk: deferred refresh introduces temporary stale diagnostics/codegen.
- Mitigation: explicit operation policy and visible refresh state with guaranteed eventual refresh broadcast.
