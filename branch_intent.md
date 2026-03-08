# Branch Intent Summary

Compared against `main` using:
- `git diff --name-status main...HEAD`
- `git diff $(git merge-base main HEAD)..HEAD`

Merge base used for the branch diff: `17ed8d97c373fe1ac423d0ce902a8e2e3b5e61e6`

## Features

### 1. Active-section state is intentionally split into a fast UI store and a deferred durable backend sync path

What changed: Before this branch, frontend live selection lived in `useProjectState().projectConfig.activeIds`, so every activation updated the giant project store immediately. After this branch, live selection lives in `useActiveSectionUI`; `setActiveSectionIds(...)` updates that small store first, can defer `route_set_active_ids` to the next animation frame, and can run `syncMode: "ui-only"` for temporary interactions. Loaded/backend project state hydrates the UI store, then frontend `projectConfig.activeIds` is sanitized back to `[]`.

Why the change appears intentional: A new store was added in `frontend/src/state/activeSectionUI.ts`, many call sites were moved to it, and tests now assert that `useProjectState.getState().projectConfig.activeIds` stays empty while the UI store changes immediately. The perf report on this branch also documents the activation-latency win from removing frontend active-id duplication.

Files/endpoints/components involved: `frontend/src/state/activeSectionUI.ts`, `frontend/src/state/definitions.ts`, `frontend/src/state/actions/activeSections.ts`, `frontend/src/state/actions/activeSectionController.ts`, `frontend/src/state/actions/project/loadProject.ts`, `frontend/src/state/actions/sectionInfos.ts`, `frontend/src/plugins/runtime.ts`, `frontend/src/components/Panes/UiEditor/UiEditor.tsx`, `frontend/src/components/Panes/paneFns.tsx`, endpoint `route_set_active_ids`.

Default-value changes, moved logic, or relocated flow: The frontend copy of `projectConfig.activeIds` now defaults back to `[]` after project load/backend updates. Live active-id reads moved out of the large project store and into the dedicated UI store. Plugin `projectConfig` snapshots intentionally clone the current UI active ids back in so plugin consumers keep seeing the same contract.

Reviewer guardrail: Do not "fix" the empty `projectConfig.activeIds` field by restoring frontend writes or switching readers back to `useProjectState.projectConfig.activeIds`. That would reintroduce the large rerender fan-out this branch is explicitly removing.

### 2. Marquee selection, minimap selection, and other canvas selection flows now keep selection live in the UI without durably syncing every intermediate step

What changed: Before this branch, selection-rectangle updates could repeatedly flush `setActiveIds` through the durable project/backend path while the drag was still in progress, and minimap selection styling was tied to React rerenders of minimap nodes. After this branch, `Pane.tsx` uses `syncMode: "ui-only"` during selection-rect `mousedown` and `mousemove`, then commits one durable sync on `mouseup` and `mouseleave` with `forceDurableSync: true`. Minimap nodes render stable `data-minimap-node-id` attributes once, then `MiniMap.tsx` toggles the `selected` class imperatively on the existing SVG rects.

Why the change appears intentional: The branch added explicit sync modes, tests, and perf-report notes showing this reduced marquee `route_set_active_ids` traffic from multiple calls per drag to one final call while preserving live visual selection. The minimap changes also deliberately remove active-id-driven rerenders from the minimap node layer.

Files/endpoints/components involved: `frontend/src/forks/xyflow/core/container/Pane.tsx`, `frontend/src/state/actions/activeSections.ts`, `frontend/src/forks/xyflow/minimap/MiniMap.tsx`, `frontend/src/forks/xyflow/minimap/MiniMapNodes.tsx`, `frontend/src/forks/xyflow/minimap/MiniMapNode.tsx`, `frontend/src/components/Pages/Project/ResponsiveMiniMap.tsx`, `frontend/src/forks/xyflow/core/components/NodesSelection.tsx`, endpoint `route_set_active_ids`.

Default-value changes, moved logic, or relocated flow: Intermediate marquee updates are now intentionally UI-only. Minimap selection logic moved out of `selected={...}` React props and into the imperative `syncSelectedMiniMapNodes(...)` updater.

Reviewer guardrail: Do not reintroduce per-mousemove durable sync or reattach minimap selected-state rendering to full React node rerenders unless a new performance decision is made.

### 3. Settings pan/zoom intentionally keeps full live content visible while moving the expensive paint work onto gesture-scoped shell compositing and a flatter row layout

What changed: Before this branch, full live Settings pan/zoom stayed on the heavy repaint path, section activation paid an extra visible settle from outline animation, and top-level leaf param rows used a deeper general row path. After this branch, the app keeps exact live Settings content visible but promotes each section shell to its own composited layer only while `viewportInteractionActive === true`; top-level leaf param rows take a flatter explicit grid path; active z-index now lives on the outer shell; the minimap panel shadow is removed; and `.transition-radius` no longer animates `outline`.

Why the change appears intentional: The added perf report documents repeated A/B measurements for the exact `All Settings` view. The branch keeps the measured winners and removes temporary scaffolding. The report explicitly calls out gesture-scoped shell promotion, outline-transition removal, and the shadowless minimap as the production choices worth keeping.

Files/endpoints/components involved: `frontend/src/forks/xyflow/core/container/ZoomPane.tsx`, `frontend/src/forks/xyflow/core/store/initialState.ts`, `frontend/src/forks/xyflow/core/types/general.ts`, `frontend/src/components/Section/Container/SectionContainerCore.tsx`, `frontend/src/components/Section/Container/SectionContainerCoreResizable.tsx`, `frontend/src/components/Utils/Resizable/CustomResizable.tsx`, `frontend/src/components/Params/ParamContainer.tsx`, `frontend/src/components/Params/ParamSwitch.tsx`, `frontend/src/components/Params/GetParamSwitch.tsx`, `frontend/src/components/Section/SectionParts/KwargsControls.tsx`, `frontend/index.css`, `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`.

Default-value changes, moved logic, or relocated flow: `viewportInteractionActive` is a new React Flow store flag. Active z-index moved from the inner resizable layer to the outer section shell. Outline animation is intentionally removed from the shared transition helper.

Reviewer guardrail: Do not add the outline transition back, move active z-index back into the inner resizable wrapper, or remove gesture-scoped shell promotion as "cleanup" without new measurements. Those are deliberate production perf decisions, not accidental styling drift.

## Bug Fixes

### 1. Save/autosave no longer leaves Settings zoom in a degraded state until refresh

What changed: Before this branch, an effectively unchanged backend `UpdateFrontendProjectState` echo after save/autosave still rewrote `useProjectState` and `useNodeInternals`, which left zoom and pan slower after the first save until the page was reloaded. After this branch, `processProjectStateUpdateFromBackend(...)` compares the incoming sanitized project state to the current comparable frontend state. If the project state is semantically unchanged, it still reconciles pending ops and UI active ids, but it skips the expensive full store rewrite.

Why the change appears intentional: The perf report explicitly isolates websocket `UpdateFrontendProjectState` as the regression source, then documents the post-fix rerun where before-save and after-save zoom stay in the same FPS band.

Files/endpoints/components involved: `frontend/src/state/actions/sectionInfos.ts`, websocket/backend project-state updates handled by `processProjectStateUpdateFromBackend(...)`.

Default-value changes, moved logic, or relocated flow: No user-facing defaults changed, but identical backend echoes no longer trigger full local state replacement.

Reviewer guardrail: Do not remove the comparable-state short-circuit just because the backend payload still arrives. The branch intentionally treats identical project-state echoes as no-ops.

### 2. Minimap selection sync no longer crashes during mount/order races

What changed: Before this branch, minimap selection syncing assumed the SVG ref existed. Route transitions or mount timing could hit selection syncing before the minimap SVG was present. After this branch, `syncSelectedMiniMapNodes(...)` is explicitly null-safe and becomes a no-op until the SVG exists.

Why the change appears intentional: A dedicated test was added for the missing-SVG case, and the null guard is part of the new imperative minimap selection strategy.

Files/endpoints/components involved: `frontend/src/forks/xyflow/minimap/MiniMap.tsx`, `frontend/src/forks/xyflow/minimap/MiniMap.test.ts`.

Default-value changes, moved logic, or relocated flow: No default-value change. The moved logic is that selection syncing now happens outside the React render path and must tolerate the SVG not being mounted yet.

Reviewer guardrail: Keep the null/undefined SVG guard in place. A later refactor that assumes the minimap DOM is always ready would reintroduce this race.

### 3. Marquee geometry and selection-bounds math no longer depend on repeated DOM rect scans

What changed: Before this branch, `getNodesInside(...)` and active-bounds calculations depended on walking live section DOM geometry, which created repeated `getBoundingClientRect()` scans during marquee selection and on selection mouseup. After this branch, the graph utilities prefer node-internals geometry (`position`, `width`, `height`) for marquee hit testing and active-section bounds, only falling back to DOM when needed. Unknown-dimension nodes still remain selectable to preserve old behavior.

Why the change appears intentional: New tests were added for overlap resolution, partial-overlap mode, unknown-dimension fallback, and active-bounds calculation from node internals. The perf report specifically calls this out as a kept change after measured DOM-read reductions.

Files/endpoints/components involved: `frontend/src/forks/xyflow/core/utils/graph.ts`, `frontend/src/forks/xyflow/core/utils/graph.test.ts`, `frontend/src/forks/xyflow/core/container/Pane.tsx`, `frontend/src/forks/xyflow/core/hooks/useUpdateNodePositions.ts`.

Default-value changes, moved logic, or relocated flow: Geometry lookup moved from section DOM refs to React Flow node internals for marquee and active-bounds paths. The fallback behavior for nodes with unknown dimensions is intentionally preserved.

Reviewer guardrail: Do not revert marquee hit testing or active-bounds lookup back to DOM-only geometry without a new reason. The node-internals path is a deliberate correctness-plus-performance fix.

### 4. Wheel/pinch zoom bursts now keep the viewport-motion shell promotion active for the whole gesture

What changed: Before this branch, the pan/zoom promotion state could drop between wheel events or during trackpad pinch bursts, which meant section shells could fall out of the promoted path mid-gesture. After this branch, `ZoomPane.tsx` tracks wheel/pinch burst lifetimes with timers and keeps `viewportInteractionActive` true until the gesture actually settles.

Why the change appears intentional: This branch adds timer-based burst tracking instead of a simple per-event toggle, and the perf report ties production shell promotion directly to `viewportInteractionActive`.

Files/endpoints/components involved: `frontend/src/forks/xyflow/core/container/ZoomPane.tsx`, `frontend/src/forks/xyflow/core/store/initialState.ts`, `frontend/src/forks/xyflow/core/types/general.ts`, `frontend/src/components/Section/Container/SectionContainerCore.tsx`.

Default-value changes, moved logic, or relocated flow: `viewportInteractionActive` now covers drag-pan, wheel-pan, wheel zoom, and macOS pinch zoom bursts instead of only obvious drag lifecycle moments.

Reviewer guardrail: Do not collapse this back to a naive start/stop toggle that ignores wheel burst timing. That would silently undo the production pan/zoom win during real trackpad usage.

## Intentional Behavior Changes To Preserve

### 1. The frontend project store is no longer the live source of truth for active selection

What changed: Before this branch, many components, actions, and helpers read `useProjectState().projectConfig.activeIds`. After this branch, live readers use `getActiveSectionUIIds()`, `useIsSectionUIActive()`, `useSolelyActiveSectionUIId()`, or `useActiveSectionUI(...)`.

Why the change appears intentional: The branch updates selection-dependent actions across keyboard handling, search, copy/paste, formatting, grouping, drag/drop, minimap behavior, section headers, and agentic highlights.

Files/endpoints/components involved: `frontend/src/state/actions/keyActivations.ts`, `frontend/src/state/actions/copyPaste.ts`, `frontend/src/state/actions/formatCode.ts`, `frontend/src/state/actions/sectionInfos.ts`, `frontend/src/state/actions/sections/sectionParamFilter.ts`, `frontend/src/forks/dnd-kit/useDropType.ts`, `frontend/src/forks/dnd-kit/useMoveSection.ts`, `frontend/src/components/Section/Header/SectionHeader.tsx`, `frontend/src/forks/xyflow/core/container/AgenticEdgeRenderer.tsx`.

Default-value changes, moved logic, or relocated flow: Selection-dependent logic was relocated out of the large project-state subscriptions and into the smaller UI-selection store.

Reviewer guardrail: When follow-up work needs "the active section(s)", use the UI-selection helpers unless the new decision is to change this branch's architecture. Reading `projectConfig.activeIds` directly in frontend code is now the wrong default.

### 2. UI reveal and UI editor flows intentionally use transient UI selection instead of durable backend-backed selection

What changed: Before this branch, reveal flows and UI editor tab selection implicitly depended on durable `projectConfig.activeIds`. After this branch, UI reveal snapshots, rollback, and temporary section activation use the UI active-id store, and `UiEditor` resolves tabs from the solely active UI section id.

Why the change appears intentional: The branch updates both the reveal implementation and its tests, and it changes the UI editor to subscribe only to the single active UI section instead of the full durable array.

Files/endpoints/components involved: `frontend/src/state/actions/uiSettingReveal.ts`, `frontend/src/state/actions/uiSettingReveal.test.ts`, `frontend/src/components/Panes/UiEditor/UiEditor.tsx`, `frontend/src/components/Panes/paneFns.tsx`, `frontend/src/state/hooks/uiTypes.ts`.

Default-value changes, moved logic, or relocated flow: Temporary reveal-driven active-section changes are now intentionally UI-only unless another path chooses to durably sync them.

Reviewer guardrail: Do not push reveal or UI-editor activation back through the backend sync path just to make the state "consistent." This branch deliberately keeps those flows fast and local.

### 3. Plugin/runtime consumers must continue to see current active ids even though frontend project-state storage no longer keeps them

What changed: Before this branch, plugin `activeSectionIds` and `projectConfig` reads came from `useProjectState`. After this branch, `activeSectionIds` subscriptions and reads use `useActiveSectionUI`, while `projectConfig` snapshots are cloned with the current UI active ids injected back in.

Why the change appears intentional: The runtime changes are explicit and backed by updated tests. This preserves the plugin-facing contract while allowing the frontend to stop mirroring active ids into the large store.

Files/endpoints/components involved: `frontend/src/plugins/runtime.ts`, `frontend/src/plugins/runtime.test.ts`.

Default-value changes, moved logic, or relocated flow: `projectConfig.activeIds` is no longer stored live in frontend state, but plugin reads are intentionally normalized so plugins still receive current active ids.

Reviewer guardrail: Do not "simplify" the runtime by reading plugin active ids straight from `useProjectState.projectConfig.activeIds`. That would break the new architecture and make plugin behavior stale.

### 4. The shadowless minimap and outline-less shell transition are production behavior changes, not temporary benchmark hacks

What changed: Before this branch, the minimap panel had `shadow-md`, and the shared shell transition included `outline`. After this branch, the minimap deliberately keeps blur but drops the box shadow, and section shells deliberately stop animating outline while preserving the other transition properties.

Why the change appears intentional: The perf report documents both as measured A/B wins that the branch chose to keep in production.

Files/endpoints/components involved: `frontend/src/components/Pages/Project/ResponsiveMiniMap.tsx`, `frontend/index.css`, `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`.

Default-value changes, moved logic, or relocated flow: Default minimap chrome is now shadowless. Default shell transition properties no longer include `outline`.

Reviewer guardrail: Do not restore the shadow or outline animation in a later visual-polish pass unless a new product/performance decision explicitly reverses this branch.

### 5. Agentic edge and minimap work are intentionally decoupled from ordinary activation/z-index churn

What changed: Before this branch, ordinary activation changes could drag extra global canvas layers along for the ride. After this branch, agentic scope highlighting is split out from the edge renderer, the edge layer subscribes only to node geometry, and minimap node selection is updated without rerendering the node list.

Why the change appears intentional: The renderer split and geometry-only subscriptions are explicit code changes made to stop ordinary section activation from rerendering unrelated global layers.

Files/endpoints/components involved: `frontend/src/forks/xyflow/core/container/AgenticEdgeRenderer.tsx`, `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`, `frontend/src/forks/xyflow/minimap/MiniMap.tsx`, `frontend/src/forks/xyflow/minimap/MiniMapNodes.tsx`.

Default-value changes, moved logic, or relocated flow: Selection/highlight updates moved out of the main edge/minimap render subscriptions into smaller dedicated update paths.

Reviewer guardrail: If a follow-up refactor recombines these subscriptions for convenience, it will likely reintroduce the activation fan-out this branch is intentionally reducing.
