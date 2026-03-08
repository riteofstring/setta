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

## 2026-03-09 01:04:44 PDT

Summary:
- Closed the remaining correctness gaps from the latest multi-review pass: transient reveal selection now respects the active-section sync coordinator, viewport shell-promotion state now derives from the full live gesture set, and the minimap no longer advertises a dead `selected` prop contract.
- Extended automated coverage at the state, unit, and browser levels around those regressions, then re-verified the affected reveal/minimap flow with Chrome DevTools MCP.

Detailed findings addressed:
- Right-pane and reveal rollback flows were still writing directly to the UI active-section store. If a normal `setActiveSectionIds(...)` call had already queued a deferred `route_set_active_ids` flush, reveal could temporarily show the requested section and then be overwritten by the stale queued durable sync on the next frame/backend reconciliation.
- `viewportInteractionActive` was being cleared independently by wheel-pan timeout and non-wheel end handlers. Under overlapping wheel-pan, wheel-zoom, and drag lifecycles, one timer could drop shell promotion while another gesture source was still active.
- The minimap renderer had already moved selection styling to imperative DOM reconciliation, but `MiniMapNodeProps` and the default node component still exposed a `selected` prop. That left a misleading API surface for custom minimap node components.

Fixes implemented:
- Routed reveal activation and reveal rollback through `setActiveSectionIds(..., { syncMode: "ui-only" })` instead of calling `setActiveSectionUIIds(...)` directly. That reuses the existing scheduled-sync cancellation path, so reveal stays transient and cannot leak an older queued durable selection write.
- Replaced direct `viewportInteractionActive: false` clears in `ZoomPane` with one shared recomputation helper based on `isPanScrolling || isWheelZooming || isZoomingOrPanning`. All start, end, and timeout paths now derive from the same gesture-state owner.
- Removed `selected` from `MiniMapNodeProps` and from the default minimap node component so the imperative minimap DOM sync is the only supported source of minimap selection state.

Behavioral impact before vs after:
- UX before: a reveal launched immediately after a selection change could snap back to the old section once the deferred backend sync flushed; mixed wheel/drag viewport interaction could stutter mid-gesture when shell promotion dropped early; custom minimap node components could reasonably expect `selected` updates that never arrived.
- UX after: reveal selection remains locally stable for the full reveal lifecycle, mixed gesture interaction keeps shell promotion active until the last source settles, and minimap customization matches the real renderer contract.
- DX before: live selection writes had multiple coordination pathways, viewport interaction cleanup was split across competing timers, and minimap props implied behavior that runtime no longer supported.
- DX after: active-section mutation semantics are consolidated behind one coordinator, viewport interaction logic is easier to reason about from a single derived invariant, and minimap component typing now matches actual runtime behavior.

Automated verification completed:
- `pnpm -C frontend exec vitest run src/state/actions/activeSections.test.ts src/state/actions/uiSettingReveal.test.ts src/forks/xyflow/core/container/ZoomPane.test.ts src/forks/xyflow/minimap/MiniMapNodes.test.tsx src/forks/xyflow/minimap/MiniMap.test.ts`
- `./scripts/run-playwright-e2e.sh tests/e2e/overview/misc/right-pane-ui-settings-tools.spec.ts`

New/updated automated coverage:
- `frontend/src/state/actions/activeSections.test.ts`
  - covers queued durable sync cancellation when a different-id `ui-only` selection replaces the deferred selection.
- `frontend/src/state/actions/uiSettingReveal.test.ts`
  - covers reveal activation while a deferred durable active-id sync is still queued and asserts that reveal clears the scheduled backend sync instead of letting it flush.
- `frontend/src/forks/xyflow/core/container/ZoomPane.test.ts`
  - covers the derived viewport-interaction invariant for overlapping wheel/drag gesture states.
- `frontend/src/forks/xyflow/minimap/MiniMapNodes.test.tsx`
  - covers the custom-node contract and asserts that minimap custom components no longer receive a dead `selected` prop.
- `frontend/tests/e2e/overview/misc/right-pane-ui-settings-tools.spec.ts`
  - now reads the real UI active-section store in browser assertions and covers the queued-RAF reveal race end-to-end.

Manual/CDP verification:
- In the running headed app via Chrome DevTools MCP, created and selected a callable section, confirmed the corresponding minimap node carried `selected`, then triggered `reveal_ui_setting` for Quick Info and verified the right pane opened with the reveal highlight active while the same section remained selected.

## 2026-03-09 01:48:35 PDT

Summary:
- Closed the remaining blockers from the three top-level review passes: project-scoped selection publication is now atomic, stale durable selection completions no longer overwrite newer transient UI selection, and `ZoomPane` teardown now clears the global gesture flags it owns.
- Added state, integration, and browser regression coverage around those invariants, then re-verified the affected project-selection and right-pane UI in the running app through Chrome DevTools MCP.

Detailed findings addressed:
- Project load and websocket reconciliation were publishing `useActiveSectionUI.activeIds` before the matching sanitized `useProjectState` snapshot. That let synchronous consumers observe impossible mixed-store state where an active section id did not exist in the currently installed project.
- The active-section coordinator still treated “no pending op ids remain” as permission to hydrate from backend selection, even when the completing op belonged to an older durable selection that had already been superseded by a newer `ui-only` selection. Reveal and marquee flows could therefore snap back after the stale backend ack landed.
- `ZoomPane` promoted global interaction flags during wheel-pan and zoom activity, but its cleanup path only cleared local timers/refs. Unmounting during an active timeout could leave `viewportInteractionActive`, `paneDragging`, and `useMisc.isPanScrolling` latched.

Fixes implemented:
- Extended `useActiveSectionUI` with explicit selection/backend generations plus per-op generation tracking. Durable selection ops are now stamped when sent, deferred sync state also carries the generation, and backend reconciliation only rehydrates `activeIds` when the current generation is still authoritative.
- Reworked project load and backend project-state reconciliation to compute the next active-section UI patch first, then publish `useProjectState`, `useNodeInternals`, pending-op state, and active-section UI state inside the same batched transaction. This removes the intermediate mixed-project snapshot instead of weakening the fail-fast readers.
- Added a shared `ZoomPane` teardown helper that clears timers, local gesture refs, `useMisc.isPanScrolling`, `useReactFlow().paneDragging`, and `useReactFlow().viewportInteractionActive`. The unmount cleanup now routes through that helper so gesture promotion always ends deterministically.
- Removed the now-unused `hydrateActiveSectionUIIds(...)` wrapper after the atomic publication paths moved to the shared state-patch helper.

Behavioral impact before vs after:
- UX before: project switches and backend hydrations could briefly point the right pane or plugin listeners at a section that did not exist in the visible project; reveal/marquee selection could snap back to an older section after backend settlement; leaving the canvas mid-gesture could strand shell promotion and altered input behavior.
- UX after: project-scoped UI only sees valid same-project selection ids, newer transient selection remains authoritative over stale durable echoes, and gesture-scoped shell promotion reliably clears on teardown.
- DX before: the selection split had two timing-sensitive failure modes that were hard to reason about because store publication order and backend selection authority were implicit.
- DX after: selection coordination has explicit generation-based ordering, project publication has one atomic rule, and gesture cleanup has one owner. The invariants are narrower and easier to test directly.

Automated verification completed:
- `pnpm -C frontend exec vitest run src/state/actions/activeSections.test.ts src/state/actions/uiSettingReveal.test.ts src/forks/xyflow/core/container/ZoomPane.test.ts src/plugins/runtime.test.ts`
- `pnpm -C frontend exec playwright test tests/e2e/overview/misc/right-pane-ui-settings-tools.spec.ts -g 'frontend selection keeps the newer ui-only target after a stale durable ack' --reporter=line`

New/updated automated coverage:
- `frontend/src/state/actions/activeSections.test.ts`
  - covers atomic project-load publication, atomic backend reconciliation, and stale durable-op completion after a newer `ui-only` selection.
- `frontend/src/state/actions/uiSettingReveal.test.ts`
  - covers reveal selection surviving a stale backend completion from an older durable active-id op.
- `frontend/src/forks/xyflow/core/container/ZoomPane.test.ts`
  - covers teardown resetting both global gesture flags and pane-drag state.
- `frontend/tests/e2e/overview/misc/right-pane-ui-settings-tools.spec.ts`
  - adds a browser-context regression that seeds the live frontend stores, simulates a stale durable completion, and asserts the newer transient selection remains selected.

Manual/CDP verification:
- In the running app on `http://127.0.0.1:3009`, opened a real project through Chrome DevTools MCP and verified the selected section rendered normally with the Quick Info pane intact after the publication/order fixes. No new console errors appeared beyond pre-existing accessibility issues about unnamed form fields.

## 2026-03-09 10:24:28 PDT

Summary:
- Implemented the remaining correctness fixes from the consolidated top-level reviews: failed durable active-section writes now return authority to backend reconciliation, and marquee hit testing again covers nested selectable sections that do not exist in React Flow node internals.
- Added targeted unit, integration, and browser regression coverage around both issue classes, then re-verified the nested selection flow in the live headed app through Chrome DevTools MCP.

Detailed findings addressed:
- A rejected or non-`200` `route_set_active_ids(...)` response previously cleared pending-op bookkeeping without changing selection authority. That left `useActiveSectionUI` permanently ahead of backend truth until another successful durable selection or a full reload, even though the backend remained canonical.
- `getNodesInside(...)` had narrowed its geometry source to `useNodeInternals` only. Since node internals intentionally contain top-level React Flow nodes rather than nested selectable group/list children, marquee selection silently lost coverage for nested sections that still participate in normal click selection.

Fixes implemented:
- Extended `useActiveSectionUI` with an explicit `backendHydrationEnabled` authority bit and added a failed-op path that clears the pending op while marking the current selection generation as backend-reconcilable when no newer scheduled/in-flight sync still owns that generation.
- Updated `setActiveSectionIds(...)` durable and `ui-only` paths to disable backend hydration while local UI state is intentionally ahead, and updated backend reconciliation to re-enable hydration only when a durable generation is acknowledged or a failed generation is explicitly released back to backend authority.
- Reworked marquee hit testing so `getNodesInside(...)` still uses node-internals geometry for top-level nodes, but then scans the full selectable section set and falls back to DOM section geometry for ids that are absent from node internals.
- Reused the existing section-rect overlap helper for the fallback path instead of leaving nested-section geometry as an unhandled special case.

Behavioral impact before vs after:
- UX before: a transient `/setActiveIds` failure could leave the canvas, minimap, right pane, keyboard actions, and plugin `activeSectionIds` targeting a selection the backend never accepted; dragging a marquee over a nested child section could miss it entirely unless the user clicked it directly.
- UX after: failed durable selection writes now converge back to backend truth on the next backend snapshot, and marquee selection once again includes nested selectable children in real grouped layouts.
- DX before: selection authority depended on implicit generation equality and failure had no explicit handoff back to backend state; marquee geometry had a hidden mismatch between the selectable-section model and the top-level node-internals model.
- DX after: failure handling is explicit in the active-section coordinator, plugin/live-selection behavior stays coherent after backend errors, and marquee geometry now has one deterministic rule for top-level and nested sections.

Automated verification completed:
- `pnpm -C frontend exec vitest run src/state/actions/activeSections.test.ts src/state/actions/uiSettingReveal.test.ts src/forks/xyflow/core/utils/graph.test.ts src/plugins/runtime.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/nested-marquee-selection.spec.ts`

New/updated automated coverage:
- `frontend/src/state/actions/activeSections.test.ts`
  - covers non-`200` and rejected durable active-id writes and asserts the next backend project-state snapshot can restore backend-authoritative selection.
- `frontend/src/plugins/runtime.test.ts`
  - covers plugin `activeSectionIds` subscriptions observing rollback to backend truth after a failed durable selection publish.
- `frontend/src/forks/xyflow/core/utils/graph.test.ts`
  - covers nested marquee fallback geometry for a selectable child section that is absent from `useNodeInternals` but present in `useSectionRefs`.
- `frontend/tests/e2e/sections/nested-marquee-selection.spec.ts`
  - covers the browser-level regression by creating a real group with a nested child, dragging a marquee across the child, and asserting the nested child appears in the live active-section UI store.

Manual/CDP verification:
- In the running headed app via Chrome DevTools MCP on `http://127.0.0.1:3009`, created a temporary project, seeded a group plus nested child through the live backend, verified the nested child rendered and could be selected in the real UI, then deleted the temporary project after verification.
