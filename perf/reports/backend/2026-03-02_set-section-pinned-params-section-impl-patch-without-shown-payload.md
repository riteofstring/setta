# set_section_pinned_params section-impl patch without shown-param payload

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ 67fbbe8b (baseline emulation) -> working tree

## Goal

Eliminate full project-state snapshot transport for `set_section_pinned_params`
while preserving `shownParamIds` synchronization across clients, without adding
large shown-param payloads to section-impl patches.

Targeted route:
- `set_section_pinned_params`

## Change

Backend changes:
- Switched `set_section_pinned_params` from
  `_merge_and_broadcast_ui_only_project_state(...)` to
  `_merge_and_broadcast_ui_only_section_impl_patch(...)`.
- Kept existing section-impl patch payload shape (no new shown-param field).
- Route still refreshes section `shownParamIds` on backend for canonical state.

Frontend changes:
- `applySectionImplProjectStatePatch(...)` now detects pinned-param changes on
  BaseSectionWithParams impl patches and recomputes shown-param partition using
  `updateShownParamIdsForPinnedParams(...)`.

Tests:
- Updated backend route transport assertions in
  `tests/project_state/test_ui_only_fast_path.py` to verify
  `set_section_pinned_params` emits section-impl patches (no snapshot fallback).
- Added frontend state test coverage in
  `frontend/src/state/actions/sectionInfos.test.ts` for applying
  shown-param recomputation when pinned params change via section-impl patches.

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
- Native section-impl patch transport with frontend derivation of shown-param
  partition from patched pinned params.

## Results (local)

- `set_section_pinned_params`
  - latency median: `4.9456 ms` -> `4.3464 ms` (`~12.12%`, `1.14x`)
  - payload median: `45,273.5 B` -> `597 B` (`~98.68%`, `75.84x` smaller)

Notes:
- Payload measurements come from serialized websocket messages in-process and do
  not include network transport variability.
- This replaces an intermediate variant that attached full `shownParamIds`
  payloads to section-impl patches.

## Coverage

- `tests/project_state/test_ui_only_fast_path.py`
- `frontend/src/state/actions/sectionInfos.test.ts`
