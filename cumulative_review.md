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

## 2026-03-09 11:22:25 PDT

Summary:
- Implemented the follow-up fixes from the latest top-level review consolidation: grouped drag selection now reads the UI-owned active-section store, backend no-op project-state comparison now covers the full backend-owned shape, and the dead pending-op cleanup helper was removed.
- Added focused unit, store-level, and browser-runtime regression coverage around both correctness paths.

Detailed findings addressed:
- `getDragItems(...)` in the React Flow drag pipeline still read `projectConfig.activeIds` even though that field is intentionally sanitized to `[]` on the frontend. That left visible multi-selection state, minimap selection, and right-pane state reading one source while drag grouping still read another, so grouped drags could fracture.
- `processProjectStateUpdateFromBackend(...)` used a hand-maintained comparable project-state object that omitted `artifactGroups`. Backend updates that changed only artifact groups could therefore take the no-op branch and never publish the new backend artifact state into `useProjectState`.
- `clearPendingActiveSectionBackendSyncOp(...)` in `activeSectionUI.ts` had no call sites and duplicated pending-op cleanup logic that already existed in the live failure path.

Fixes implemented:
- Switched drag grouping in `frontend/src/forks/xyflow/core/hooks/utils.ts` to `getActiveSectionUIIds()`, keeping the UI selection store as the single live source of truth for selection-dependent drag behavior.
- Reworked the backend comparison helper in `frontend/src/state/actions/sectionInfos.ts` to normalize and compare the complete backend-owned `ProjectStateSingleConfig` shape, including `artifactGroups`, while still sanitizing frontend-local `projectConfig.activeIds`.
- Removed the unreachable pending-op cleanup helper from `frontend/src/state/activeSectionUI.ts` so pending-op lifecycle cleanup has one live implementation.

Behavioral impact before vs after:
- UX before: users could see multiple sections selected yet drag only one of them because drag grouping still trusted the sanitized durable store; artifact-only backend updates could silently fail to appear until some later unrelated project-state publish.
- UX after: grouped drag behavior matches the visible UI selection state, and artifact-group-only backend updates publish immediately instead of being swallowed by the no-op optimization.
- DX before: live selection had a hidden split-brain reader in the drag path, backend comparator maintenance was brittle to schema growth, and the active-section sync coordinator carried dead cleanup surface.
- DX after: drag behavior now follows the same live selection contract as the rest of the frontend, backend comparator coverage follows the real backend-owned shape, and pending-op cleanup is easier to audit.

Automated verification completed:
- `pnpm -C frontend exec vitest run src/forks/xyflow/core/hooks/utils.test.ts src/state/actions/sectionInfos.test.ts src/state/actions/activeSections.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/multi-selection-drag.spec.ts`

New/updated automated coverage:
- `frontend/src/forks/xyflow/core/hooks/utils.test.ts`
  - covers grouped drag selection using UI-only active ids while the durable project config remains sanitized.
- `frontend/src/state/actions/sectionInfos.test.ts`
  - covers artifact-group-only backend updates publishing into `useProjectState`.
  - covers the widened no-op comparator still skipping store churn when the full normalized backend-owned state is unchanged.
- `frontend/tests/e2e/sections/multi-selection-drag.spec.ts`
  - covers grouped drag selection inside the browser runtime by seeding real sections, applying UI-only active ids, invoking the real drag grouping helper against live node internals, and asserting both selected nodes move together through the normal position update path.

Manual/CDP verification:
- Attempted Chrome DevTools MCP verification, but the MCP server could not connect to Chrome on the configured CDP port (`http://127.0.0.1:9231/json/version` fetch failure), so no new manual CDP check was completed for this entry.

## 2026-03-09 12:02:26 PDT

Summary:
- Closed the last two issues from the top-level review consolidation: selection-key blank-canvas deselect now always durably commits its final empty selection, and static project-config thumbnails no longer subscribe to the live minimap selection store.
- Added controller-level, DOM interaction, and browser persistence coverage around the selection commit path, plus a preview-level guard against reintroducing live thumbnail subscriptions.

Detailed findings addressed:
- The selection-rect flow cleared `useActiveSectionUI.activeIds` immediately in `ui-only` mode on `mousedown`, but the no-drag `mouseup` path then delegated to `pane-click`, where the active-section controller short-circuited because the UI store was already `[]`. That left the backend durable selection unchanged and let reload/backend reconciliation resurrect stale selection.
- `MinimapSvg(...)` always mounted `MiniMapSelectionSync`, even when used as a static project-config thumbnail surface. Every live selection change therefore woke inert home-screen previews and ran guaranteed no-op DOM reconciliation work against SVGs that had no live-selection semantics.

Fixes implemented:
- Updated `applyActiveSectionChange(...)` to honor `forceDurableSync` even when `decision.nextActiveIds` already matches the current UI store, keeping “must durably commit this terminal state” separate from “UI ids changed this render”.
- Updated `Pane.tsx` so selection-key no-drag blank-canvas completion passes `forceDurableSync` through the pane-click path, and selection-rect `mouseleave` also flushes the final UI-owned selection before teardown instead of abandoning the gesture in a terminal `ui-only` state.
- Added an explicit `enableSelectionSync` switch to `MinimapSvg(...)`, enabled it only for the live interactive minimap, and left `ProjectConfigPreview` thumbnails explicitly inert.
- Added a tiny test-only React-refresh preamble shim plus `jsdom` in frontend devDependencies so DOM-backed Vitest coverage can exercise the real pane and preview components without downgrading those regressions to pure store tests.

Behavioral impact before vs after:
- UX before: clicking empty canvas while the selection key was held could appear to deselect locally, but backend state and reloads could still restore the old section; home/project thumbnails also did unnecessary work on every active-selection change.
- UX after: blank-canvas deselect converges across live UI state, backend durable state, reload state, and minimap styling, while static project thumbnails remain visually unchanged but fully inert during live selection updates.
- DX before: end-of-gesture durable commit was implicit and easy to bypass once the UI store had already been updated, and `MinimapSvg` hid live subscription behavior inside a seemingly static rendering helper.
- DX after: the selection coordinator has an explicit “force final durable publish” path, pane teardown owns the gesture-end flush, and minimap live-selection behavior is opt-in instead of ambient.

Automated verification completed:
- `pnpm -C frontend exec vitest run src/state/actions/activeSections.test.ts src/state/actions/activeSectionController.test.ts src/forks/xyflow/core/container/Pane.test.tsx src/components/ProjectConfigs/ProjectConfigPreview.test.tsx src/forks/xyflow/minimap/MiniMap.test.ts src/forks/xyflow/minimap/MiniMapNodes.test.tsx`
- `./scripts/run-playwright-e2e.sh tests/e2e/sections/pane-click-deselect-persists.spec.ts tests/e2e/sections/minimap-selection-persistence.spec.ts`

New/updated automated coverage:
- `frontend/src/state/actions/activeSectionController.test.ts`
  - covers forcing one durable empty-selection publish even when the UI store already matches the final cleared state.
- `frontend/src/forks/xyflow/core/container/Pane.test.tsx`
  - covers the no-drag selection-key blank-pane `mouseup` path publishing one durable empty selection.
  - covers the no-drag selection-key `mouseleave` path publishing the same final empty selection before gesture teardown.
- `frontend/src/components/ProjectConfigs/ProjectConfigPreview.test.tsx`
  - covers static previews not subscribing to `useActiveSectionUI`.
  - covers live `activeIds` changes leaving preview SVG markup unchanged after render.
- `frontend/tests/e2e/sections/pane-click-deselect-persists.spec.ts`
  - covers selecting a real section, deselecting via blank canvas with the configured selection key, asserting backend `activeIds` converge to `[]`, then reloading and confirming the section/minimap remain deselected.

Manual/CDP verification:
- In the running headed app via Chrome DevTools MCP on `http://127.0.0.1:3009`, selected the live generated-code section, confirmed the minimap node gained `selected`, then simulated the selection-key blank-canvas deselect path and confirmed both the section outline and minimap `selected` styling cleared in the real UI.

## 2026-03-09 13:14:42 PDT

Summary:
- Implemented the remaining fixes from the consolidated top-level review set: transient UI-owned active-section flows now prune invalid ids and explicitly hand authority back to backend reconciliation, marquee hit testing no longer falsely selects unmeasured top-level nodes, and minimap rendering now invalidates on real visual inputs while exposing an explicit custom-node selection hook.
- Added targeted unit, integration, and browser regression coverage for each issue class, then re-verified the minimap repaint and unmeasured-node marquee behavior in the live headed app through Chrome DevTools MCP.

Detailed findings addressed:
- `ui-only` selection flows could preserve impossible ids after backend snapshots and reveal rollback could leave `useActiveSectionUI` stuck in a locally-owned state even after the temporary reveal mutation had finished. That let right-pane, minimap, and plugin consumers observe stale active ids that no longer existed in the backend project snapshot.
- `getNodesInside(...)` treated nodes with `width: null` / `height: null` as overlapping by default when using React Flow node internals. Newly created or recently moved top-level nodes could therefore be selected by far-away marquee gestures before they had real measured geometry.
- `MiniMapNodes` only memoized against geometry-like inputs even though minimap fill, stroke, and class output also depend on node `type`, effective section theme, and temporary style preview state. Visual-only changes could therefore leave the minimap stale until some later geometry mutation.
- The minimap custom-node path had lost its explicit selection contract. Default nodes still worked because the selection sync code queried baked-in DOM attributes, but custom nodes had no typed, documented way to participate.

Fixes implemented:
- Extended active-section reconciliation in `frontend/src/state/activeSectionUI.ts` and `frontend/src/state/actions/activeSections.ts` with an explicit restore-backend-authority path, while keeping UI-only selection responsive during local reveal flows.
- Updated backend project-state reconciliation in `frontend/src/state/actions/sectionInfos.ts` to always intersect UI active ids with the incoming live section id set, even when backend hydration is temporarily disabled for stale durable acknowledgements.
- Updated reveal rollback in `frontend/src/state/actions/uiSettingReveal.ts` so it restores backend-authoritative active-section reconciliation instead of leaving the UI store in a lingering `ui-only` state.
- Reworked `frontend/src/forks/xyflow/core/utils/graph.ts` so unmeasured node internals no longer count as automatic hits; the selector now uses measured internals when available, falls back to real section DOM bounds when possible, and otherwise excludes the node until valid bounds exist.
- Expanded minimap render inputs in `frontend/src/forks/xyflow/minimap/MiniMapNodes.tsx` to include node `type`, `style`, effective section theme, and temporary style previews, and merged those visuals into the rendered minimap node state without reintroducing selection-driven churn.
- Restored an explicit custom-node selection hook by passing `dataMinimapNodeId` through the minimap node API in `frontend/src/forks/xyflow/minimap/types.ts`, `frontend/src/forks/xyflow/minimap/MiniMapNode.tsx`, and `frontend/src/forks/xyflow/minimap/MiniMap.tsx`.

Behavioral impact before vs after:
- UX before: reveal flows could finish with stale or deleted active section ids still driving the right pane, minimap, and plugins; marqueeing empty space could select unrelated unmeasured nodes; and style-only section changes could leave minimap swatches visually stale.
- UX after: temporary reveal flows remain fast and local but converge back to valid backend-owned selection immediately after rollback or backend deletion, empty-space marquee stays local even while nodes are still unmeasured, and minimap swatches repaint as soon as section appearance changes.
- DX before: selection authority had an implicit split between “ignore stale durable acks” and “accept impossible ids”, hit-testing treated missing measurements as truthy geometry, and custom minimap node support depended on undocumented DOM conventions.
- DX after: active-section reconciliation has an explicit backend handoff path, minimap and hit-testing behavior follow stable input contracts, and custom minimap nodes have a typed, testable selection integration surface.

Automated verification completed:
- `pnpm -C frontend exec vitest run src/state/actions/sectionInfos.test.ts src/state/actions/activeSections.test.ts src/state/actions/uiSettingReveal.test.ts src/forks/xyflow/core/utils/graph.test.ts src/forks/xyflow/minimap/MiniMapNodes.test.tsx src/forks/xyflow/minimap/MiniMap.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/nested-marquee-selection.spec.ts frontend/tests/e2e/editor/section-style-colors.spec.ts frontend/tests/e2e/overview/misc/right-pane-ui-settings-tools.spec.ts --grep "marquee selection ignores far-away unmeasured|updates the minimap swatch|right-pane reveal rollback returns backend authority"`

New/updated automated coverage:
- `frontend/src/state/actions/activeSections.test.ts`
  - covers pruning invalid UI-only active ids against backend snapshots.
- `frontend/src/state/actions/uiSettingReveal.test.ts`
  - covers reveal rollback restoring backend authority so later backend snapshots can move selection again.
- `frontend/src/state/actions/sectionInfos.test.ts`
  - covers node-map creation carrying minimap-relevant `type` and derived style theme data.
- `frontend/src/forks/xyflow/core/utils/graph.test.ts`
  - covers unmeasured nodes without fallback bounds no longer being selected.
  - covers unmeasured nodes with real DOM bounds still participating correctly.
- `frontend/src/forks/xyflow/minimap/MiniMapNodes.test.tsx`
  - covers comparator invalidation for visual-only node changes.
  - covers minimap repainting from effective project-state style changes and temporary preview changes without geometry churn.
  - covers the explicit `dataMinimapNodeId` contract for custom minimap nodes.
- `frontend/src/forks/xyflow/minimap/MiniMap.test.ts`
  - covers custom minimap nodes participating in selection-sync through the new explicit node-id prop.
- `frontend/tests/e2e/sections/nested-marquee-selection.spec.ts`
  - covers far-away marquee selection ignoring a top-level node whose internals were forced into the unmeasured state.
- `frontend/tests/e2e/editor/section-style-colors.spec.ts`
  - covers minimap swatches updating immediately after section style color changes without geometry changes.
- `frontend/tests/e2e/overview/misc/right-pane-ui-settings-tools.spec.ts`
  - covers right-pane reveal rollback returning active-section authority to later backend snapshots.

Manual/CDP verification:
- In the running headed app via Chrome DevTools MCP on `http://127.0.0.1:3009`, created a temporary project, confirmed the minimap exposed nodes through the new `data-minimap-node-id` contract, changed a text-block style color through the real right-pane appearance control, and verified the section chrome and minimap swatch repainted together in the live UI.
- In the same live app, forced a top-level node into an unmeasured `width: null` / `height: null` state, replayed the pane's marquee-selection event path across empty canvas space, and verified `useActiveSectionUI.activeIds` remained empty.

## 2026-03-09 13:46:17 PDT

Summary:
- Closed the remaining active-section reconciler race from the top-level review set: pruning invalid active ids no longer advances local selection ownership, so late durable completions and failures return authority to backend hydration instead of stranding `useActiveSectionUI` in a permanent local-only state.
- Promoted `data-section-active` from an incidental DOM detail into a tested browser contract by asserting it in the section E2E selection flows and in a new browser-level prune-recovery regression.

Detailed findings addressed:
- `getReconciledActiveSectionUIStateFromBackend(...)` incremented `selectionGeneration` when backend reconciliation pruned invalid active ids from a locally-owned selection. If the durable active-id write for that same local selection completed later, the reconciler no longer considered it the current generation and left `backendHydrationEnabled` false even after the pending op was gone.
- The same stuck-local state could be reached after a late durable sync failure: pruning removed the invalid id from the UI, but the failed op cleanup only restored backend authority when its recorded generation still exactly matched the current selection generation.
- `data-section-active` existed on section shells but did not yet have a stable automated contract in the browser suite, which made it easy to classify as dead or accidental despite being useful for selection-state verification.

Fixes implemented:
- Updated `frontend/src/state/activeSectionUI.ts` so invalid-id pruning only reconciles `activeIds` and does not advance `selectionGeneration`. That keeps pruning within the same local ownership epoch, allowing the eventual completion or failure of that durable sync to restore backend hydration correctly.
- Added focused store-level coverage in `frontend/src/state/activeSectionUI.test.ts` for prune ownership and prune-plus-failed-sync recovery.
- Added action-level integration coverage in `frontend/src/state/actions/activeSections.test.ts` for both prune-plus-late-completion and prune-plus-late-failure paths, with assertions on `backendHydrationEnabled`, pending op cleanup, and final backend-driven reselection.
- Added `frontend/tests/e2e/sections/active-section-prune-recovery.spec.ts` to exercise the full browser-runtime recovery path, including the live minimap and section-shell active state after backend authority returns.
- Updated the existing section selection browser tests to read `data-section-active` instead of inferring selection from styling-only outline classes.

Behavioral impact before vs after:
- UX before: a section deleted or pruned out of the backend snapshot could leave the UI in a locally-owned empty-selection state forever once the stale durable ack or failure arrived, so later backend snapshots stopped reselecting the real active section until reload. Selection-state browser checks also depended on implementation styling rather than the explicit section-shell state.
- UX after: invalid-id pruning still happens immediately, but once the old durable write resolves or fails, backend authority returns and later backend snapshots rehydrate the correct active section, including shell state and minimap selection. Browser selection checks now target an explicit section-state attribute instead of a visual side effect.
- DX before: local selection ownership and backend restoration were coupled to generation churn from pruning, which made the reconciler hard to reason about and easy to strand. The section-shell active attribute was present but undocumented by tests.
- DX after: pruning is modeled as reconciliation within the same ownership epoch, so restoration rules are simpler and easier to audit. The section-shell active attribute now has live browser coverage and is a clearer supported test/perf hook.

Automated verification completed:
- `pnpm -C frontend exec vitest run src/state/activeSectionUI.test.ts src/state/actions/activeSections.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/active-section-prune-recovery.spec.ts frontend/tests/e2e/sections/pane-click-deselect-persists.spec.ts frontend/tests/e2e/sections/escape-clear-active-section.spec.ts`

New/updated automated coverage:
- `frontend/src/state/activeSectionUI.test.ts`
  - covers invalid-id pruning preserving the current local ownership generation.
  - covers backend hydration recovery after prune plus durable-sync failure.
- `frontend/src/state/actions/activeSections.test.ts`
  - covers invalid-id prune followed by late durable completion restoring backend authority.
  - covers invalid-id prune followed by late durable failure restoring backend authority.
- `frontend/tests/e2e/sections/active-section-prune-recovery.spec.ts`
  - covers the browser-runtime path where a real section is selected, pruned out of the incoming project snapshot, later acknowledged as completed, then restored by a later backend snapshot.
  - asserts both the section shell `data-section-active` contract and minimap `selected` styling after backend authority returns.
- `frontend/tests/e2e/sections/pane-click-deselect-persists.spec.ts`
  - now asserts section activity through `data-section-active`.
- `frontend/tests/e2e/sections/escape-clear-active-section.spec.ts`
  - now asserts section activity through `data-section-active`.

Manual/CDP verification:
- In the running headed app via Chrome DevTools MCP on `http://127.0.0.1:3009`, created a temporary project and section, simulated the prune-plus-late-completion recovery path directly against the live frontend stores, and verified that `backendHydrationEnabled` flipped back to `true`, the section shell eventually reported `data-section-active="true"`, and the corresponding minimap node regained `selected`.

## 2026-03-09 14:17:54 PDT

Summary:
- Implemented the remaining two blockers from the top-level review set: project publication across `useProjectState`, `useNodeInternals`, and `useActiveSectionUI` no longer leaks mixed snapshots to synchronous readers, and zero-area node internals no longer count as authoritative geometry for marquee or active-bounds calculations.
- Added focused store, plugin-runtime, graph, and browser regressions, then re-verified the zero-width marquee path in the live headed app through Chrome DevTools MCP.

Detailed findings addressed:
- `loadProjectState(...)` and backend reconciliation still used sequential `setState(...)` calls across separate Zustand stores. `unstable_batchedUpdates(...)` reduced React rerenders but did not give synchronous subscribers or plugin callbacks an atomic combined snapshot, so `useProjectState` listeners could observe project B while `useActiveSectionUI` and `useNodeInternals` still belonged to project A.
- The plugin runtime exposed the same inconsistency through separate project and active-selection read/subscribe pathways, so a `{ kind: "projectConfig" }` callback could synchronously read stale `{ kind: "activeSectionIds" }`.
- `graph.ts` still treated any numeric width and height as "measured", including `0`. That let far-away marquee gestures include `0xN`, `Nx0`, or `0x0` nodes and let active-selection bounds collapse to zero-area internals instead of using real DOM bounds or excluding the node until geometry existed.

Fixes implemented:
- Added a staged atomic-publication layer in `frontend/src/state/definitions.ts` that temporarily patches the published `getState()` view for `useProjectState`, `useNodeInternals`, and `useActiveSectionUI` during coordinated project publication.
- Wrapped both `frontend/src/state/actions/project/loadProject.ts` and the project-state-changing branch of `frontend/src/state/actions/sectionInfos.ts` in that publication helper so synchronous reads inside any of the involved store subscriptions see one coherent snapshot generation.
- Tightened `frontend/src/forks/xyflow/core/utils/graph.ts` so only positive-area bounds (`width > 0 && height > 0`) count as measured internals. Zero-area internals now fall back to section DOM geometry when present and otherwise stay excluded from marquee and active-bounds math.

Behavioral impact before vs after:
- UX before: project switches and backend reconciliation could briefly expose stale selection or node geometry for the newly published project, and empty-space marquee could select far-away sections whose internals had transient zero dimensions.
- UX after: project snapshot, live active ids, and node internals become visible together to synchronous consumers, and marquee/selection-bounds logic ignores zero-area internals unless real DOM bounds exist.
- DX before: plugin/runtime/store subscribers had to reason about impossible mixed-store intermediate state, and geometry helpers treated `0` dimensions as valid measurements.
- DX after: project publication now has a single coherent visible snapshot during transitions, and the geometry contract is explicit: only positive-area internals are authoritative.

Automated verification completed:
- `pnpm -C frontend exec vitest run src/state/actions/activeSections.test.ts src/plugins/runtime.test.ts src/forks/xyflow/core/utils/graph.test.ts src/state/actions/sectionInfos.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/nested-marquee-selection.spec.ts`

New/updated automated coverage:
- `frontend/src/state/actions/activeSections.test.ts`
  - covers `useProjectState.subscribe(...)` callbacks observing coherent active ids and node internals during both load-time publication and backend reconciliation.
- `frontend/src/plugins/runtime.test.ts`
  - covers `{ kind: "projectConfig" }` subscription callbacks synchronously reading `{ kind: "activeSectionIds" }` without seeing stale previous-project data during project publication.
- `frontend/src/forks/xyflow/core/utils/graph.test.ts`
  - covers zero-width and zero-height internals being treated as unmeasured for marquee hit testing.
  - covers zero-area active-section internals falling back to DOM bounds instead of collapsing selection bounds.
- `frontend/tests/e2e/sections/nested-marquee-selection.spec.ts`
  - covers a live zero-width node-internals regression where a far-away marquee over empty pane space must leave `useActiveSectionUI.activeIds` empty.

Manual/CDP verification:
- In the running headed app via Chrome DevTools MCP on `http://127.0.0.1:3009`, opened a live project, injected a zero-width node-internals entry for the visible section, replayed the pane marquee path across empty canvas space, and verified that `useActiveSectionUI.activeIds` remained empty with no console errors.
