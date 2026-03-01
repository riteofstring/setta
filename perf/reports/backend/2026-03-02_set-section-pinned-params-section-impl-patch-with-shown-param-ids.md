# set_section_pinned_params section-impl patch with shown param ids

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ 822b8047 (baseline emulation) -> working tree

## Goal

Eliminate full project-state snapshot transport for `set_section_pinned_params`
while preserving `shownParamIds` synchronization across clients.

Targeted route:
- `set_section_pinned_params`

## Change

Backend changes:
- Switched `set_section_pinned_params` from
  `_merge_and_broadcast_ui_only_project_state(...)` to
  `_merge_and_broadcast_ui_only_section_impl_patch(...)`.
- Extended `ProjectStateSectionImplPatch` with optional `shownParamIds`.
- Extended section-impl patch broadcast plumbing to include optional
  `shownParamIds` payload.
- Route now refreshes section `shownParamIds` and includes the refreshed value in
  its section-impl patch.

Frontend changes:
- `applySectionImplProjectStatePatch(...)` now applies `patch.shownParamIds` to
  the section variant when present.

Tests:
- Updated backend route transport assertions in
  `tests/project_state/test_ui_only_fast_path.py` to verify
  `set_section_pinned_params` emits section-impl patches and includes
  `shownParamIds`.
- Added frontend state test coverage in
  `frontend/src/state/actions/sectionInfos.test.ts` for applying
  `shownParamIds` from section-impl patches.

## Benchmark scenario

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Seed state via `build_state_for_ui_only_fast_path()`.
3. Benchmark 40 measured iterations (5 warmup).
4. Measure route latency (`route + finish_pending_operations`).
5. Capture websocket payload bytes by intercepting frontend broadcasts and
   measuring serialized bytes (`message.model_dump_json()`).
6. Alternate pinned params each iteration (`[param]` vs `[]`) to force mutating
   operations.

Baseline emulation:
- Monkeypatch `_merge_and_broadcast_ui_only_section_impl_patch(...)` to call
  `_merge_and_broadcast_ui_only_project_state(...)` (snapshot behavior).

After:
- Native section-impl patch transport with `shownParamIds`.

## Results (local)

- `set_section_pinned_params`
  - latency median: `4.5370 ms` -> `4.5716 ms` (`~0.76%` slower, `0.99x`)
  - payload median: `45,294.5 B` -> `2,103.5 B` (`~95.36%`, `21.53x` smaller)

Notes:
- Payload measurements come from serialized websocket messages in-process and do
  not include network transport variability.
- Local latency did not improve in this run, but payload reduction is large and
  materially lowers websocket transfer/parse overhead.

## Coverage

- `tests/project_state/test_ui_only_fast_path.py`
- `frontend/src/state/actions/sectionInfos.test.ts`
