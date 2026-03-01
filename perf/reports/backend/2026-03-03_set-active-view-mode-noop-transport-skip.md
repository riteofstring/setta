# set_active_view_mode no-op transport skip

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Eliminate unnecessary transport and revision churn when
`set_active_view_mode` is called with the already-active view mode id.

## Change

- Added a no-op fast path in `BaseProjectManager.set_active_view_mode`:
  - if requested view mode id equals the current active id and active view-mode
    state is already synchronized with project-config state, return immediately.
- Added a synchronization fallback for same-id requests:
  - if same-id request detects drift between active view-mode fields and project
    config fields, sync those fields and emit a project-config patch.
- Added regression coverage:
  - `tests/project_state/test_project_config_view_modes.py::test_set_active_view_mode_noop_skips_transport_and_revision_bump`

## Validation

- `source activate.sh && pytest tests/project_state/test_project_config_view_modes.py -k 'set_active_view_mode'`
- `source activate.sh && pytest tests/project_state/test_project_config_view_modes.py tests/project_state/test_ui_only_fast_path.py -k 'set_active_view_mode or skip_full_codegen_refresh'`
- `pnpm -C frontend exec vitest run src/state/actions/viewModes.test.ts src/state/actions/websocketReceive.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/view-mode-url-sync.spec.ts`

Result: all passed.

## Benchmark scenario

1. Load callable state into a real settings manager fixture.
2. Create an additional view mode so an active mode exists with full metadata.
3. Issue `60` concurrent `set_active_view_mode` requests using the currently active id.
4. Capture transport calls by wrapping sender methods:
   - `broadcast_project_state`
   - `broadcast_project_state_active_view_mode_patch`
   - `broadcast_project_state_project_config_patch`
5. Record total wall time for the burst.

## Results (local)

| Scenario | Metric | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| 60 no-op `set_active_view_mode` requests | total wall ms | 87.48 | 1.12 | -98.72% |
| 60 no-op `set_active_view_mode` requests | full snapshot broadcasts | 0 | 0 | 0.00% |
| 60 no-op `set_active_view_mode` requests | active-view-mode patch broadcasts | 60 | 0 | -100.00% |
| 60 no-op `set_active_view_mode` requests | project-config patch broadcasts | 0 | 0 | 0.00% |

## Notes

- This removes a high-frequency no-op patch stream path without changing behavior
  for real mode switches.
- Non-noop view-mode switches still emit active-view-mode patches.
