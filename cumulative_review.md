## 2026-03-09 00:25:37 PDT

Summary:
- Implemented the consolidated review fixes for selection-state correctness, plugin selector consistency, and minimap selection persistence.
- Kept the branch’s intended performance direction intact: live UI selection remains outside the heavy project store, plugin consumers now have a single live selector for selection, and minimap selection no longer depends on a stale diff cache.

Detailed findings addressed:
- Deferred active-section durable sync was previously held in module globals and could outlive the project that scheduled it. That allowed a queued selection write from project A to flush into project B after a project switch, and also left a window where backend updates could overwrite the locally selected UI state before the deferred sync ran.
- Plugin `projectConfig` snapshots were being post-processed to re-inject `activeIds`, while `subscribeProjectState({ kind: "projectConfig" })` still listened only to the sanitized project store. That meant `readProjectState` and `subscribeProjectState` disagreed about whether `projectConfig.activeIds` was live.
- Minimap selection styling relied on an incremental diff between old and new active ids. If the corresponding minimap node mounted late or rerendered with unchanged `activeIds`, the DOM could lose the `selected` class even though the underlying section selection was still active.
- `useIsAnySectionUIActive` was introduced but had no call sites. It was removed rather than leaving dead API surface in the active-section UI store module.

Fixes implemented:
- Added project-scoped scheduled sync state to `useActiveSectionUI` and moved deferred active-id bookkeeping there instead of keeping it only in module globals.
- Captured the `projectConfigId` at deferred-schedule time, flush only when that captured id still matches the current project, and clear the scheduled sync on project load/reset and on `ui-only` transitions.
- Prevented backend reconciliation from rehydrating `activeIds` while either a scheduled UI sync or an in-flight backend sync op is still outstanding for the current project.
- Removed the plugin compatibility shim that re-injected live `activeIds` into `projectConfig` snapshots. `projectConfig` is now structural, and `activeSectionIds` is the sole live selection selector exposed to plugins.
- Changed minimap selection reconciliation to inspect the currently rendered minimap DOM and toggle `selected` on all rendered minimap nodes based on the current active-id set. Added a mutation observer so delayed mount/class churn re-applies the correct selection state.

Behavioral impact before vs after:
- UX before: fast project switches could persist stale selection into the wrong project; unrelated backend updates could temporarily roll the UI selection back; the minimap could silently show an unselected node while the main canvas still had it selected.
- UX after: deferred selection sync stays project-local and deterministic; transient `ui-only` interactions no longer leak durable backend writes; backend echoes do not clobber locally scheduled selection; minimap selection remains visually aligned through mount-order changes and rerenders.
- DX before: plugin authors had an ambiguous contract where `projectConfig.activeIds` looked live on reads but not on subscriptions.
- DX after: plugin selection state now has one explicit source of truth, so read/subscribe semantics are coherent and easier to reason about.

Automated verification completed:
- `pnpm -C frontend exec vitest run src/state/actions/activeSections.test.ts src/plugins/runtime.test.ts src/forks/xyflow/minimap/MiniMap.test.ts src/forks/xyflow/minimap/MiniMapNodes.test.tsx`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/minimap-selection-persistence.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts`

New/updated automated coverage:
- `frontend/src/state/actions/activeSections.test.ts`
  - covers same-project deferred flush, `ui-only` cancellation, cross-project cancellation, backend-update race protection, and project-load cancellation.
- `frontend/src/plugins/runtime.test.ts`
  - covers the structural `projectConfig` contract and confirms `activeSectionIds` is the only live selection selector.
- `frontend/src/forks/xyflow/minimap/MiniMap.test.ts`
  - covers DOM-wide minimap reconciliation for late mount and rerender/reset cases.
- `frontend/tests/e2e/sections/minimap-selection-persistence.spec.ts`
  - covers the user-visible regression by selecting a real section, dragging it, and asserting the minimap node remains selected.

Manual/CDP verification:
- Verified in headed Chrome DevTools MCP on the live app that the minimap rendered the active section with `class="react-flow__minimap-node selected"` after the fix.
