# Callable DOM First Baseline

Date: 2026-03-16
Area: frontend
Branch/Commit: frontend-performance-11 @ 26e7406b7
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/callable-performance-plan.md`

## Goal

Establish a deterministic callable baseline before any DOM-first refactor work, with:

- matched `main` vs worktree screenshots
- matched callable geometry and DOM metrics
- traced `idle`, `pan`, `zoom`, and `resize` baselines
- an automated Playwright geometry guardrail for the chosen callable scenario

## Scenario

- Entry points:
  - `main`: `http://127.0.0.1:3087/busy_tide`
  - worktree: `http://127.0.0.1:3011/late_flake`
- Deterministic callable setup:
  1. create a top-level `Callable` section
  2. call `/setCallable` with `open`
  3. call `/indentParams` for `errors`
  4. call `/setSectionPinnedParams` for `file`
  5. call `/setSectionEdgeInputs` for `buffering`
- Fixed viewport transform used for trace runs:
  - `x = 518.651`
  - `y = 547.532`
  - `zoom = 1.20289`
- Browser + OS: Chrome DevTools MCP on macOS
- Viewport: `1440x1200`
- Notes:
  - `sorted` was rejected as the Phase 0 control callable because it cannot keep nested rows, pinned params, and a still-visible edge-input row simultaneously.
  - Once a param becomes an edge input, it disappears from the visible param row list. That behavior is part of this baseline.
  - Page-side frame metrics were sampled while a DevTools Performance trace was active. Without an active trace, this CDP tab fell back to throttled frame cadence and was not comparable.

## Before (baseline)

- Measurement method:
  - Chrome DevTools MCP screenshots for `main` and worktree.
  - Chrome DevTools MCP `Performance` traces for `idle`, `pan`, `zoom`, and `resize`.
  - Page-side `requestAnimationFrame` timestamps recorded during the trace window.
  - DOM geometry and subtree counts collected from the live callable node after the scenario was fully configured.

### Geometry parity (`main` and worktree matched)

- Section node: `x=375`, `y=76`, `width=202`, `height=352`
- Search row: `x=378`, `y=103`, `width=196`, `height=26`
- Pinned header block: `x=395.59`, `y=227.59`, `width=70.85`, `height=12.8`
- First pinned row: `x=388`, `y=240.39`, `width=182`, `height=20`
- First visible unpinned row (`mode`): `x=388`, `y=281.39`, `width=176`, `height=20`
- Nested child row (`errors`): `x=400`, `y=333.39`, `width=164`, `height=20`
- Unpinned list container: `x=376`, `y=273.39`, `width=200`, `height=149.61`
- Resize handle: `x=566`, `y=417`, `width=20`, `height=20`
- Agentic source handle: `x=588`, `y=109`, `width=14`, `height=14`
- Agentic target handle: `x=350`, `y=109`, `width=14`, `height=14`

### DOM metrics (`main` and worktree matched)

- Callable subtree total nodes: `125`
- Max depth: `12`
- Elements using `display: grid`: `18`
- Elements using `subgrid`: `3`
- Text sanity:
  - pinned row: `file`
  - first visible row: `mode"r"`
  - nested child row: `errorsNone`
- Largest descendant hotspots:
  - `.react-flow__node.nopan`: `124`
  - focus wrapper under the node root: `123`
  - `.agentic-handle-scope`: `122`
  - `section ...CustomResizable`: `116`
  - `.section-row-pin-main`: `73`
  - unpinned params container: `43`

### Trace metrics

- `idle`
  - `main`: `71` frames, average `16.65ms`, max `17.6ms`, frames `>16.7ms`: `26`
  - worktree: `71` frames, average `16.66ms`, max `17.7ms`, frames `>16.7ms`: `24`
- `pan`
  - `main`: `71` frames, average `16.67ms`, max `17.7ms`, frames `>16.7ms`: `21`
  - worktree: `71` frames, average `16.65ms`, max `17.7ms`, frames `>16.7ms`: `28`
- `zoom`
  - `main`: `35` frames, average `16.64ms`, max `17.5ms`, frames `>16.7ms`: `15`
  - worktree: `35` frames, average `16.67ms`, max `17.7ms`, frames `>16.7ms`: `10`
- `resize`

  - `main`: `35` frames, average `255.71ms`, max `316.7ms`, frames `>33.3ms`: `35`
  - worktree: `35` frames, average `287.16ms`, max `432.3ms`, frames `>33.3ms`: `35`

- Observations:
  - Screenshot parity between untouched `main` and the worktree was visually identical for the callable UI. The only visible differences were project/section names outside the callable layout contract.
  - `idle`, `pan`, and `zoom` parity is effectively locked already. The small main/worktree deltas are ordinary trace noise.
  - `resize` is the clear baseline hotspot before any refactor work.
  - The analyzed worktree resize trace surfaced DevTools `ForcedReflow` and `CLSCulprits` insights. The forced-reflow analysis attributed most time to:
    - `eq` in `chunk-MB4RGFJ3.js`
    - `getHandleCenter` in `src/state/actions/edgeHandles.ts`
    - smaller contributions from `ProjectChatBottomDock` and `CodeArea`

## After

### Phase 1 checkpoint 1: leaf wrapper reduction

- Date/time: 2026-03-16
- Scope:
  - removed the JSX-only `div.contents` wrapper from `ParamNameInput`
  - removed the non-kwarg label wrapper `div.section-key.overflow-hidden` from `ParamContainer`
  - moved the non-kwarg label width/overflow contract onto `ParamTextLabel`
- Automated verification:
  - reran the callable suite on isolated ports `3111` and `8111`
  - command:
    - `SETTA_DEV_FRONTEND_PORT=3111 SETTA_PORT=8111 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3111 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8111 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-phase0-baseline.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `3 passed`
  - the minimum regression run still captured the required `math.sqrt` resize screenshots:
    - roomy
    - bottom overflow
    - bottom-right recovery
    - right resize
    - column narrow
    - column wide
- CDP visual verification:
  - compared the matched `open` control scene again:
    - `main`: `http://127.0.0.1:3087/busy_tide`
    - worktree: `http://127.0.0.1:3011/late_flake`
  - callable screenshots remained visually identical after the wrapper removals
  - no visible drift was observed in:
    - search row
    - pinned header and first pinned row
    - first visible unpinned rows
    - nested child row
    - resize handle placement
- Live DOM delta on the callable subtree:
  - `main`: `125` nodes, `6` `.section-key.overflow-hidden` wrapper divs, `0` `p.section-key.overflow-hidden` labels
  - worktree: `119` nodes, `0` `.section-key.overflow-hidden` wrapper divs, `7` `p.section-key.overflow-hidden` labels
  - net change for this checkpoint: `-6` live DOM nodes on the callable control subtree

### Phase 1 checkpoint 2: text-value underline flattening

- Date/time: 2026-03-16
- Scope:
  - removed the dedicated underline span from `TextParamConfigured` in `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - moved the border/focus contract onto the text input root itself
- Automated verification:
  - reran the same isolated callable suite on ports `3111` and `8111`
  - result: `3 passed`
  - the minimum regression run again captured the required `math.sqrt` resize screenshots for review
- CDP visual verification:
  - reloaded the worktree control scene at `http://127.0.0.1:3011/late_flake`
  - compared against untouched `main` at `http://127.0.0.1:3087/busy_tide`
  - callable screenshots remained visually identical for the `open` control scene after the underline move
- Live DOM delta on the callable subtree:
  - `main`: `125` nodes
  - worktree after checkpoint 2: `113` nodes
  - cumulative reduction versus untouched `main`: `-12` live DOM nodes on the callable control subtree
  - incremental reduction versus checkpoint 1: `-6` live DOM nodes

### Phase 1 checkpoint 3: param resize-handle leaf flattening

- Date/time: 2026-03-16
- Scope:
  - removed the inner decorative handle-bar div from `frontend/src/components/Params/ResizeHandle.tsx`
  - moved the visible handle-bar styling onto a `before:` pseudo-element on the draggable hit-zone
- Automated verification:
  - reran the isolated callable suite on ports `3111` and `8111`
  - result: `3 passed`
  - this checkpoint is directly exercised by the minimum regression run because it covers both the outer resize flow and the param-column resize flow
- CDP visual verification:
  - reloaded the worktree control scene at `http://127.0.0.1:3011/late_flake`
  - compared against untouched `main` at `http://127.0.0.1:3087/busy_tide`
  - callable screenshots remained visually identical for the `open` control scene after the resize-handle flattening
- Live DOM delta on the callable subtree:
  - `main`: `125` nodes
  - worktree after checkpoint 3: `107` nodes
  - cumulative reduction versus untouched `main`: `-18` live DOM nodes on the callable control subtree
  - incremental reduction versus checkpoint 2: `-6` live DOM nodes
  - `data-param-resize-handle` nodes remain present: `6`
  - resize-handle inner child divs on the worktree control scene: `0`

### Phase 1 checkpoint 4 attempt: kwarg-name underline flattening

- Date/time: 2026-03-16
- Scope:
  - removed the dedicated kwarg-name underline span from `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
  - moved the kwarg-name underline, focus, and error border styling onto the `TextInputCodeMirror` root class contract
- Automated verification:
  - reran the same isolated callable suite on ports `3111` and `8111`
  - result: `3 passed`
  - the minimum regression run again captured the required `math.sqrt` resize screenshots for review
- CDP visual verification:
  - rebuilt fresh `math.sqrt` scenes on both apps for the required `a` through `k` checkpoint scenario
  - worktree scene: rendered the expected edge, pinned, and unpinned layout
  - untouched `main` control scene: did not hold the same state cleanly under multiple backend setup orders
    - `a` through `d` edge inputs appeared
    - the row body reintroduced `x`
    - the node screenshot surfaced a red validation/error row instead of the expected pinned and unpinned stacks
- Interpretation:
  - this screenshot mismatch is not accepted as a parity pass
  - the leaf DOM change remains unaccepted until the `main` control scene can be reproduced cleanly or the mismatch is explained well enough to prove it is unrelated to the current refactor checkpoint
- Status:
  - blocked on control-scene parity for the required `math.sqrt` regression capture

Pending the next Phase 1 checkpoint. Reuse the exact same callable setup, viewport transform, and artifact naming pattern for every later rerun.

## Conclusion

- What improved:
  - n/a, this report captures the baseline only
- What regressed (if any) + why it is acceptable:
  - none; this establishes the control
- Follow-ups:
  - use `open` as the fixed callable control for Phase 1 and Phase 2 reruns
  - keep screenshot comparison against untouched `main` after every completed layout checkpoint
  - treat the resize trace as the main baseline hotspot to revisit after row/tree flattening

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-callable-baseline.png`
- `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-callable-baseline.png`
- `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-idle.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-pan.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-zoom.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-resize.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-idle.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-pan.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-zoom.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-resize.trace.json`

## Automated Perf Tests

- Playwright spec(s):
  - `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
- Result:
  - passed locally via `SETTA_DEV_FRONTEND_PORT=3111 SETTA_PORT=8111 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3111 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8111 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
- Budgets/assertions added:
  - pinned/unpinned row ordering
  - nested child indentation
  - edge-input invisibility in the visible param list
  - resize-handle placement inside the callable shell
  - agentic handle alignment with the callable search row

### Regression harness expansion: standalone route, theme variants, and keyboard parity

- Date/time: 2026-03-16
- Scope:
  - expanded `frontend/tests/e2e/params/callable-minimum-regression.spec.ts` so the required `math.sqrt` scenario now covers:
    - workspace section resize
    - param-column resize
    - live drag/reorder
    - `Tab` / `Shift + Tab` indent
    - standalone direct section routes
    - `light` and `dark` modes
  - disabled `settings.backend.autoRefetchCallableParamsOnLspMismatch` inside isolated checkpoint runs so the intentional `a` through `k` callable scene remains stable while the test is building it
- Product parity finding:
  - the first standalone-route run exposed a real gap:
    - workspace `Tab` indent passed
    - standalone `Tab` indent failed
    - standalone drag/reorder and column resize already passed
  - the mechanism was route composition rather than layout:
    - `UIPage` mounted the global key listeners
    - `StandaloneProjectSurfacePage` did not
  - fixed by extracting `useProjectSurfaceGlobalListeners` and mounting it from both route surfaces
- Automated verification:
  - reran `./scripts/run-playwright-e2e.sh tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `4 passed`
  - reran:
    - `./scripts/run-playwright-e2e.sh tests/e2e/params/callable-phase0-baseline.spec.ts tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `5 passed`
- CDP visual verification:
  - opened the standalone callable surface on the live worktree app:
    - `http://127.0.0.1:3011/fair_white/section/spark_being`
  - confirmed the standalone route rendered without workspace panes and preserved the expected edge / pinned / unpinned callable layout after the listener extraction
- Notes:
  - this checkpoint expands the verification surface and fixes a user-facing standalone interaction gap
  - it does not change the Phase 1 DOM-count measurements yet

### Phase 1 checkpoint 4: param resize-handle wrapper flattening

- Date/time: 2026-03-16
- Scope:
  - removed the remaining outer wrapper div from `frontend/src/components/Params/ResizeHandle.tsx`
  - moved the center-gutter stripe and visible handle-bar styling onto `after:` and `before:` pseudo-elements on the draggable resize target
  - preserved the existing `data-param-resize-handle="true"` selector and live drag behavior
- Automated verification:
  - reran `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `4 passed`
  - reran:
    - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-phase0-baseline.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `5 passed`
- CDP visual verification:
  - reloaded the stable `open` callable control scene on:
    - worktree: `http://127.0.0.1:3011/late_flake`
    - untouched `main`: `http://127.0.0.1:3087/busy_tide`
  - element screenshots of the callable section remained visually identical after the wrapper flattening
- Live DOM delta on the callable subtree:
  - `main`: `124` nodes
  - worktree after checkpoint 4: `100` nodes
  - cumulative reduction versus untouched `main`: `-24` live DOM nodes on the callable control subtree
  - `data-param-resize-handle` nodes remain present: `6`
  - old resize-handle wrapper parents on untouched `main`: `6`
  - old resize-handle wrapper parents on the worktree: `0`
- Interpretation:
  - this removes the last dedicated wrapper node from every visible param-column resize handle in the callable control scene
  - the live subtree reduction matches the expected direction without introducing visible drift on the stable control capture

### Phase 1 follow-up: kwarg-name checkpoint acceptance and row/tree boundary

- Date/time: 2026-03-16
- Scope:
  - resolved the old kwarg-name underline checkpoint blocker using the stable `open` callable control pair instead of the unstable `math.sqrt` `main` setup
  - reassessed the remaining callable DOM surface to decide whether another leaf-only checkpoint still exists
- Verification read:
  - the current branch, which already includes the kwarg-name underline move in `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`, remained visually aligned with untouched `main` on:
    - worktree: `http://127.0.0.1:3011/late_flake`
    - untouched `main`: `http://127.0.0.1:3087/busy_tide`
  - the expanded callable minimum regression harness still covered the required screenshot matrix, so the earlier `math.sqrt` control-scene mismatch is treated as a control issue rather than a refactor delta
- Architectural read:
  - the remaining steady-state wrappers now belong to shared row/input ownership rather than isolated callable leaves
  - strongest next cluster:
    - `frontend/src/components/Params/ParamContainer.tsx`
    - `frontend/src/components/Params/ParamSwitch.tsx`
    - `frontend/src/components/Params/GetParamSwitch.tsx`
    - `frontend/src/components/Params/ParamDndList.tsx`
  - the surviving complexity is now mostly in nested-child ownership, DnD placeholder geometry, and the recursive `grid/subgrid` row contract
- Interpretation:
  - Phase 1 leaf reductions are effectively exhausted
  - the next meaningful callable performance work should begin with Phase 2 row/tree flattening rather than additional shared-input leaf churn

### Phase 2 checkpoint 1: row-template primitive consolidation

- Date/time: 2026-03-16
- Scope:
  - added the shared `section-param-row` utility in `frontend/index.css`
  - updated `frontend/src/components/Params/ParamContainer.tsx` so the leaf row and the top-level parent row use shared row-template utilities instead of row-local inline grid-template declarations
  - updated the nested parent row to rely on `section-args-nested` directly instead of `grid-cols-subgrid`
  - updated the temporary DnD placeholder row in `frontend/src/components/Params/ParamSwitch.tsx` to use the same shared row primitive as the steady-state top-level rows
- Automated verification:
  - reran `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `4 passed`
  - reran:
    - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-phase0-baseline.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `5 passed`
- CDP visual verification:
  - reloaded the stable `open` callable control scene on:
    - worktree: `http://127.0.0.1:3011/late_flake`
    - untouched `main`: `http://127.0.0.1:3087/busy_tide`
  - callable section screenshots remained visually aligned after the row-template consolidation
- Live row-template delta on the callable control scene:
  - visible param rows: `7` on both `main` and the worktree
  - rows still carrying `grid-cols-subgrid`:
    - `main`: `1`
    - worktree: `0`
  - visible param rows still carrying inline `grid-template-columns`:
    - `main`: `7`
    - worktree: `0`
- Interpretation:
  - this is the first accepted Phase 2 row/tree checkpoint because it removes row-local template duplication while preserving the existing callable row geometry, DnD placeholder behavior, and screenshot parity
  - the next meaningful row/tree work should focus on nested-child wrapper ownership rather than the already-flattened row-template primitives

### Phase 2 checkpoint 2: nested-child wrapper removal

- Date/time: 2026-03-16
- Scope:
  - removed the dedicated nested-child wrapper div from `frontend/src/components/Params/ParamContainer.tsx`
  - threaded the nested-child row contract through:
    - `frontend/src/components/Params/GetParamSwitch.tsx`
    - `frontend/src/components/Params/ParamSwitch.tsx`
    - `frontend/src/components/Params/ParamContainer.tsx`
  - moved the branch-line styling onto the child row roots instead of the removed wrapper
- Development note:
  - the first attempt over-flattened the nested child geometry and caused the baseline spec to fail because the nested `errors` row lost its left offset
  - fixed by restoring the nested child row offset directly on the row root instead of reintroducing the wrapper
- Automated verification:
  - reran `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `4 passed`
  - reran:
    - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-phase0-baseline.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `5 passed`
- CDP visual verification:
  - reloaded the stable `open` callable control scene on:
    - worktree: `http://127.0.0.1:3011/late_flake`
    - untouched `main`: `http://127.0.0.1:3087/busy_tide`
  - full-viewport and callable-surface screenshots remained visually aligned after the nested-child wrapper removal
- Live row/tree delta on the callable control scene:
  - callable subtree nodes:
    - `main`: `125`
    - worktree: `100`
  - nested child wrapper count:
    - `main`: `1`
    - worktree: `0`
  - visible param rows: `7` on both `main` and the worktree
  - nested child row left edge:
    - untouched `main`: `402.57px`
    - worktree after the accepted fix: `405.46px`
- Interpretation:
  - this removes a real row/tree wrapper instead of only moving classes around
  - the accepted result keeps the nested child visibly indented, preserves the baseline geometry contract, and holds the screenshot parity gate

### Phase 2 checkpoint 3: non-nested real-row branch unification

- Date/time: 2026-03-16
- Scope:
  - removed the `useExplicitLeafGrid` branch split from `frontend/src/components/Params/ParamContainer.tsx`
  - collapsed the two non-nested real-row render paths into one shared row path
  - kept the nested-parent row path separate and applied `justify-between gap-y-1` only when nested child rows are present
- Automated verification:
  - reran `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `4 passed`
  - reran:
    - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-phase0-baseline.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `5 passed`
- CDP visual verification:
  - reloaded the stable `open` callable control scene on:
    - worktree: `http://127.0.0.1:3011/late_flake`
    - untouched `main`: `http://127.0.0.1:3087/busy_tide`
  - element screenshots of the callable surface remained visually aligned after the branch unification
- Live control-scene read:
  - callable subtree nodes:
    - `main`: `125`
    - worktree: `100`
  - visible param rows: `7` on both `main` and the worktree
- Interpretation:
  - this checkpoint does not reduce DOM count further on the stable control scene
  - it does reduce `ParamContainer` branch complexity by removing a redundant non-nested row split, which makes the row/tree ownership boundary slightly deeper before the next DnD-shell step

### Phase 2 checkpoint 4: real-row wrapper component collapse

- Date/time: 2026-03-16
- Scope:
  - removed the shallow `SortableRealParamSwitchRow` component from `frontend/src/components/Params/ParamSwitch.tsx`
  - merged the real-row DnD wiring into `RealParamSwitch` so the real-row path now owns its state derivation and sortable handoff in one component before rendering `ParamContainer`
- Automated verification:
  - reran `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `4 passed`
  - reran:
    - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-phase0-baseline.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `5 passed`
- CDP visual verification:
  - reloaded the stable `open` callable control scene on:
    - worktree: `http://127.0.0.1:3011/late_flake`
    - untouched `main`: `http://127.0.0.1:3087/busy_tide`
  - element screenshots of the callable surface remained visually aligned after the component-boundary collapse
- Live control-scene read:
  - callable subtree nodes:
    - `main`: `125`
    - worktree: `100`
  - visible param rows: `7` on both `main` and the worktree
- Interpretation:
  - this checkpoint is a React-boundary reduction, not a DOM reduction
  - the row/tree cluster is slightly deeper because `ParamSwitch` no longer exposes an extra shallow wrapper layer before steady-state rows reach `ParamContainer`

### Phase 2 checkpoint 5: DnD root-child lookup moved into `GetParamSwitch`

- Date/time: 2026-03-16
- Scope:
  - removed the shallow `ParamDndListBody` component from `frontend/src/components/Params/ParamDndList.tsx`
  - moved the provider-bound root-child lookup into `frontend/src/components/Params/GetParamSwitch.tsx` through an optional `dndParentId`
  - `ParamDndList` now hands the tree root id directly to `GetParamSwitch` instead of bridging the provider boundary through a dedicated wrapper component
- Automated verification:
  - reran `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `4 passed`
  - reran:
    - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-phase0-baseline.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `5 passed`
- CDP visual verification:
  - reloaded the stable `open` callable control scene on:
    - worktree: `http://127.0.0.1:3011/late_flake`
    - untouched `main`: `http://127.0.0.1:3087/busy_tide`
  - element screenshots of the callable surface remained visually aligned after the provider-bound lookup move
- Live control-scene read:
  - callable subtree nodes:
    - `main`: `125`
    - worktree: `100`
  - visible param rows: `7` on both `main` and the worktree
- Interpretation:
  - this checkpoint removes another shallow React boundary rather than a DOM node
  - the DnD-aware row selection path is slightly deeper because `GetParamSwitch` now owns the provider-bound root-child expansion directly

### Phase 2 checkpoint 6: shared sortable-row wiring for temp and real param rows

- Date/time: 2026-03-16
- Scope:
  - added a shared sortable-row helper in `frontend/src/components/Params/ParamSwitch.tsx`
  - moved the duplicated `useSortable`, transform, listener, and ref wiring for temp placeholder rows and steady-state real rows into that shared helper
  - kept the temp placeholder row shell and the real row shell behavior unchanged
- Automated verification:
  - reran `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `4 passed`
  - reran:
    - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-phase0-baseline.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `5 passed`
- CDP visual verification:
  - reloaded the stable `open` callable control scene on:
    - worktree: `http://127.0.0.1:3011/late_flake`
    - untouched `main`: `http://127.0.0.1:3087/busy_tide`
  - element screenshots of the callable surface remained visually aligned after the sortable-row consolidation
- Live control-scene read:
  - callable subtree nodes:
    - `main`: `125`
    - worktree: `100`
  - visible param rows: `7` on both `main` and the worktree
- Interpretation:
  - this checkpoint deepens the row-tree implementation without changing the callable DOM shape
  - the temp and real row paths now share one sortable contract instead of maintaining duplicated DnD wiring in parallel

### Phase 2 checkpoint 7: shared non-nested row shell contract for temp and steady-state rows

- Date/time: 2026-03-16
- Scope:
  - added `frontend/src/components/Params/paramRowClassNames.ts` to centralize the shared non-nested row shell contract and nested-child branch-line classes
  - updated `frontend/src/components/Params/ParamContainer.tsx` to build its non-nested steady-state row shell from that shared utility
  - updated `frontend/src/components/Params/ParamSwitch.tsx` so the temp placeholder row now uses the same shared non-nested shell utility instead of its own literal class contract
  - added `frontend/src/components/Params/paramRowClassNames.test.ts` as a focused unit guardrail for the shared shell contract
- Automated verification:
  - reran `pnpm -C frontend exec vitest run src/components/Params/paramRowClassNames.test.ts`
  - result: `1 passed`, `3 passed`
  - reran `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `4 passed`
  - reran:
    - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-phase0-baseline.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `5 passed`
- CDP visual verification:
  - reloaded the stable `open` callable control scene on:
    - worktree: `http://127.0.0.1:3011/late_flake`
    - untouched `main`: `http://127.0.0.1:3087/busy_tide`
  - element screenshots of the callable surface remained visually aligned after the shared shell-contract move
- Live control-scene read:
  - callable subtree nodes:
    - `main`: `125`
    - worktree: `100`
  - visible param rows: `7` on both `main` and the worktree
- Interpretation:
  - this checkpoint removes the last obvious literal duplication in the temp-vs-steady-state non-nested row shell contract
  - the remaining Phase 2 opportunities now look more like phase-boundary decisions than clearly valuable row-tree reductions

### Phase 2 closeout rerun: structural win confirmed, interaction win still pending

- Date/time: 2026-03-16
- Scope:
  - reran the locked `open` callable control scene on both:
    - untouched `main`: `http://127.0.0.1:3087/busy_tide`
    - worktree: `http://127.0.0.1:3011/late_flake`
  - reused the same measurement path on both branches:
    - exact viewport reset to `translate(518.651px, 547.532px) scale(1.20289)`
    - exact section-width baseline reset to `240.578px`
    - wheel-event pan replay
    - exact zoom-target replay to `translate(470.651px, 505.532px) scale(0.90289)`
    - real `.section-resize-handle-right` drag replay to `324.780px`
- Same-method DOM read:
  - untouched `main`
    - total nodes: `125`
    - max depth: `12`
    - grid count: `18`
    - subgrid count: `0`
    - param rows: `7`
    - column handles: `6`
  - worktree
    - total nodes: `100`
    - max depth: `10`
    - grid count: `17`
    - subgrid count: `0`
    - param rows: `7`
    - column handles: `6`
- Same-method trace reruns:
  - untouched `main`
    - idle: `71` frames, `16.66ms` avg, `17.7ms` max, `24` frames `>16.7ms`, `0` frames `>33.3ms`
    - pan: `71` frames, `17.11ms` avg, `49.7ms` max, `20` frames `>16.7ms`, `1` frame `>33.3ms`
    - zoom: `35` frames, `16.71ms` avg, `18.6ms` max, `13` frames `>16.7ms`, `0` frames `>33.3ms`
    - resize: `35` frames, `19.05ms` avg, `65.1ms` max, `17` frames `>16.7ms`, `2` frames `>33.3ms`
  - worktree
    - idle: `71` frames, `16.66ms` avg, `18.6ms` max, `23` frames `>16.7ms`, `0` frames `>33.3ms`
    - pan: `71` frames, `17.35ms` avg, `66.7ms` max, `29` frames `>16.7ms`, `1` frame `>33.3ms`
    - zoom: `35` frames, `16.60ms` avg, `17.8ms` max, `12` frames `>16.7ms`, `0` frames `>33.3ms`
    - resize: `35` frames, `19.00ms` avg, `68.6ms` max, `13` frames `>16.7ms`, `2` frames `>33.3ms`
- Trace artifacts:
  - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-phase2-idle.trace.json`
  - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-phase2-pan.trace.json`
  - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-phase2-zoom.trace.json`
  - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-phase2-resize.trace.json`
  - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase2-rerun-idle.trace.json`
  - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase2-rerun-pan.trace.json`
  - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase2-rerun-zoom.trace.json`
  - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase2-rerun-resize.trace.json`
- DevTools insight read:
  - untouched `main` resize rerun exposed only a tiny CLS cluster (`0.0013`) and no forced-reflow insight
  - worktree resize rerun still exposed `ForcedReflow` with `37ms` total reflow time, led by:
    - `eq` in `chunk-MB4RGFJ3.js`
    - `getHandleCenter` in `src/state/actions/edgeHandles.ts`
    - `ProjectChatBottomDock.tsx`
- CDP visual verification:
  - element screenshots for the callable section remained visually aligned between untouched `main` and the worktree after the closeout rerun
- Interpretation:
  - the structural result is real:
    - the callable subtree is materially flatter on this branch than on untouched `main`
    - the Phase 2 row/tree shell duplication work should be considered complete
  - the interaction result is not yet decisive:
    - idle and zoom are effectively flat
    - pan is not meaningfully better
    - resize is only marginally different in this same-method rerun
  - conclusion:
    - DOM flattening was still worth doing because it simplified the callable row/tree surface and measurably reduced DOM complexity
    - DOM flattening alone is not enough to claim the callable performance problem is solved
    - the next meaningful work belongs in Phase 3 and later Phase 4, where the store/subscription and measurement hot paths can be reduced directly

### Phase 3 checkpoint 1: `GetParamSwitch` selector narrowing

- Date/time: 2026-03-16
- Scope:
  - added `frontend/src/components/Params/getFilteredRenderableParamIds.ts`
  - updated `frontend/src/components/Params/GetParamSwitch.tsx` so it now subscribes through one derived selector returning renderable param ids directly
  - removed the old broad selector + local `useMemo` / `useProjectState.getState()` filtering seam from `GetParamSwitch`
- Automated verification:
  - reran `pnpm -C frontend exec vitest run src/components/Params/getFilteredRenderableParamIds.test.ts`
  - result: `1 passed`, `3 passed`
  - reran `pnpm -C frontend exec vitest run src/components/Params/paramRowClassNames.test.ts`
  - result: `1 passed`, `3 passed`
  - reran:
    - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-phase0-baseline.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `5 passed`
- CDP visual verification:
  - reloaded the stable `open` callable control scene on:
    - worktree: `http://127.0.0.1:3011/late_flake`
    - untouched `main`: `http://127.0.0.1:3087/busy_tide`
  - element screenshots of the callable section remained visually aligned after the selector-boundary reduction
- Measurement note:
  - no new trace numbers are recorded for this checkpoint alone
  - reason:
    - this change narrows the filter/render subscription boundary
    - the locked `open` control scene does not actively exercise param filtering
    - the next meaningful trace should cover the filter/update path once the surrounding `ParamDndList` / callable render-model seam is narrowed too
- Interpretation:
  - this is the first accepted Phase 3 checkpoint because it removes one shallow render-path seam without changing the callable shell
  - the next measurement should be tied to the relevant interaction path, not forced into the old idle shell baseline just for bookkeeping

### Phase 3 checkpoint 2: `ParamDndList` render-model narrowing

- Date/time: 2026-03-16
- Scope:
  - added `frontend/src/components/Params/getParamDndListRenderModel.ts`
  - updated `frontend/src/components/Params/ParamDndList.tsx` so duplicate-index derivation, param-filter gating, and tree availability now move together through one derived selector boundary
- Automated verification:
  - reran `pnpm -C frontend exec vitest run src/components/Params/getParamDndListRenderModel.test.ts`
  - result: `1 passed`, `2 passed`
  - reran `pnpm -C frontend exec vitest run src/components/Params/getFilteredRenderableParamIds.test.ts src/components/Params/paramRowClassNames.test.ts`
  - result: `2 passed`, `6 passed`
  - reran:
    - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-phase0-baseline.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `5 passed`
- CDP visual verification:
  - reloaded the stable `open` callable control scene on:
    - worktree: `http://127.0.0.1:3011/late_flake`
    - untouched `main`: `http://127.0.0.1:3087/busy_tide`
  - element screenshots of the callable section remained visually aligned after the `ParamDndList` render-model collapse
- Measurement note:
  - no new trace numbers are recorded for this checkpoint alone
  - reason:
    - this change narrows the reorder/filter render boundary rather than the idle callable shell
    - the next useful trace should measure filter/reorder update work after the surrounding render-path cluster is in place
- Interpretation:
  - this is the second accepted Phase 3 checkpoint because it deepens another shallow callable render seam without changing user-visible behavior
  - the next performance read should now move off the idle shell baseline and onto the active filter/reorder interaction path

### Phase 3 checkpoint 3: `GroupContainer` measurement churn narrowing after targeted filter/reorder traces

- Date/time: 2026-03-16
- Trace setup:
  - built fresh `math.sqrt` callable trace scenes on the workspace route for both branches:
    - worktree: `http://127.0.0.1:3011/quick_black`
    - untouched `main`: `http://127.0.0.1:3087/saying_glacier`
  - temporarily disabled `backend.autoRefetchCallableParamsOnLspMismatch` on both projects during trace-scene authoring so the authored `a` through `k` callable layout would remain stable
  - restored that setting to `true` on both projects after the traces were captured
- Pre-change targeted traces:
  - artifacts:
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase3-filter.trace.json`
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-phase3-filter.trace.json`
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase3-reorder.trace.json`
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-phase3-reorder.trace.json`
  - measured interaction timings:
    - worktree filter:
      - apply DOM settle: `93.2ms`
      - clear DOM settle: `114.9ms`
    - untouched `main` filter:
      - apply DOM settle: `100.5ms`
      - clear DOM settle: `107.9ms`
    - worktree reorder:
      - DOM settle: `118.1ms`
    - untouched `main` reorder:
      - DOM settle: `137.6ms`
  - trace read:
    - filter traces still surfaced mostly page-level work:
      - `ProjectChatBottomDock`
      - `eq` in `chunk-MB4RGFJ3.js`
      - `checkScrollable` in `sectionSizes.ts`
    - reorder traces repeatedly surfaced `GroupContainer.scheduleMeasure` in the active update window, making `GroupContainer` the next credible seam instead of another shell-only cleanup
- Scope:
  - updated `frontend/src/components/Params/GroupContainer.tsx` so the top fixed-height `MutationObserver` now observes direct child-list changes only instead of the whole subtree
  - updated `frontend/src/components/Params/paramAreaMeasurements.ts` so the param-area measure key is now order-insensitive for the visible member set
  - added focused Vitest coverage in `frontend/src/components/Params/paramAreaMeasurements.test.ts` proving reorder does not invalidate the measure key when membership is unchanged
- Automated verification:
  - reran `pnpm -C frontend exec vitest run src/components/Params/paramAreaMeasurements.test.ts`
  - result: `1 passed`, `5 passed`
  - reran:
    - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-phase0-baseline.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `5 passed`
- CDP visual verification:
  - reloaded the stable `open` callable control scene on:
    - worktree: `http://127.0.0.1:3011/late_flake`
    - untouched `main`: `http://127.0.0.1:3087/busy_tide`
  - element screenshots of the callable section remained visually aligned after the `GroupContainer` checkpoint
  - parity screenshots:
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase3-groupcontainer-control.png`
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-phase3-groupcontainer-control.png`
- Post-change targeted rerun:
  - artifact:
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase3-reorder-after-groupcontainer.trace.json`
  - measured worktree reorder timing:
    - DOM settle: `107.9ms`
    - before/after: `118.1ms -> 107.9ms`
  - trace evidence:
    - the post-change worktree reorder rerun no longer reported a `ForcedReflow` insight
    - `scheduleMeasure` references in the worktree reorder trace dropped from `7` to `3`
    - `GroupContainer.tsx` references in the worktree reorder trace dropped from `20` to `7`
- Interpretation:
  - this is the first Phase 3 checkpoint that clearly converts the filter/reorder trace read into a narrower measurement boundary with a measurable improvement on the same interaction path
  - the relevant callable seam here was not another row wrapper; it was overly broad measurement ownership inside `GroupContainer`
  - the result is still scoped:
    - it improves the measured worktree reorder path
    - it removes the worktree reorder forced-reflow insight in the rerun
    - it does not claim the whole callable performance plan is complete

### Phase 3 checkpoint 4: `KwargsControls` render-model narrowing

- Date/time: 2026-03-16
- Scope:
  - added `frontend/src/components/Section/SectionParts/getKwargsControlsRenderModel.ts`
  - updated `frontend/src/components/Section/SectionParts/KwargsControls.tsx` so:
    - the callable controls cluster now subscribes through one derived selector returning `callableMissing`, section-style state, selected/pinned/edge arrays, the current param-filter value, and the editable subset of selected args
    - the old whole-section `paramsImpl` subscription is gone
    - the extra broad `codeObjs` / `codeObjVariants` / `codeObjImpls` / `sectionVariants` subscription is gone
    - the local `useMemo` seam for deletable selected params is gone
    - `ParamFilter` now receives `paramFilterValue` as a prop instead of opening its own section-impl subscription
  - added focused Vitest coverage in `frontend/src/components/Section/SectionParts/getKwargsControlsRenderModel.test.ts`
- Automated verification:
  - reran `pnpm -C frontend exec vitest run src/components/Section/SectionParts/getKwargsControlsRenderModel.test.ts`
  - result: `1 passed`, `2 passed`
  - reran:
    - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-phase0-baseline.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - result: `5 passed`
- CDP visual verification:
  - reloaded the stable `open` callable control scene on:
    - worktree: `http://127.0.0.1:3011/late_flake`
    - untouched `main`: `http://127.0.0.1:3087/busy_tide`
  - element screenshots of the callable section remained visually aligned after the `KwargsControls` checkpoint
  - parity screenshots:
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase3-kwargs-controls-control.png`
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-phase3-kwargs-controls-control.png`
- Targeted workspace measurement:
  - scenario:
    - reused the existing `math.sqrt` trace scene on `http://127.0.0.1:3011/quick_black`
    - kept the same authored callable layout and same unpinned reorder target (`k` before `h`)
  - first trace pair:
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase3-filter-after-kwargs-controls.trace.json`
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase3-reorder-after-kwargs-controls.trace.json`
  - interpretation of the first trace pair:
    - too noisy to accept directly
    - the reorder trace picked up unrelated websocket work and inflated the first raw DOM-settle read
  - repeated same-scene DOM-settle reruns outside the noisy first trace pair:
    - filter apply:
      - `69.0ms`
      - `64.8ms`
    - filter clear:
      - `100.2ms`
      - `83.2ms`
    - reorder:
      - `117.5ms`
      - `81.0ms`
  - comparison against the earlier targeted workspace baseline:
    - before this checkpoint:
      - filter apply: `93.2ms`
      - filter clear: `114.9ms`
      - reorder: `118.1ms`
    - previous accepted reorder rerun after the `GroupContainer` checkpoint:
      - `107.9ms`
  - settled rerun trace pair used for qualitative acceptance:
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase3-filter-after-kwargs-controls-rerun.trace.json`
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase3-reorder-after-kwargs-controls-rerun.trace.json`
  - settled rerun observations:
    - latest filter rerun:
      - traced DOM settle was still noisy (`107.1ms` apply, `142.7ms` clear)
      - but the trace no longer surfaced a `ForcedReflow` insight
      - `ParamFilter` matches dropped from `2` in the earlier worktree filter trace to `1` in this settled rerun trace
    - latest reorder rerun:
      - traced DOM settle landed at `108.8ms`, effectively in line with the previous accepted `107.9ms`
      - `KwargsControls` and `ParamFilter` no longer appeared in the settled reorder rerun trace
      - `scheduleMeasure` remained at `3`, matching the post-`GroupContainer` floor
      - the remaining `ForcedReflow` insight was led by:
        - `eq` in `chunk-MB4RGFJ3.js`
        - `ProjectChatBottomDock.tsx`
        not by the callable controls cluster
- Interpretation:
  - this is an accepted Phase 3 checkpoint because it removes another shallow callable subscription seam and the follow-up settled trace reruns no longer point at `KwargsControls` or `ParamFilter` as the next dominant reorder hotspot
  - the strongest measurable improvement is on the callable filter path in the repeated same-scene DOM-settle reruns
  - reorder is effectively flat to slightly improved after the checkpoint:
    - the settled trace rerun stayed close to the previous accepted result
    - the repeated reruns included one materially faster `81.0ms` pass
  - the remaining forced reflow signal is now in page chrome rather than the callable controls cluster, which is the key architectural outcome of this checkpoint

### Phase 3 boundary assessment: no next trace-backed callable-owned seam

- Date/time: 2026-03-16
- Scope:
  - re-read the latest accepted Phase 3 traces and the remaining broad callable shell in `frontend/src/components/Section/SectionParts/Search.tsx`
  - captured one more live reorder trace on the existing worktree workspace-route `math.sqrt` scene:
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase3-reorder-boundary.trace.json`
- Measurement read:
  - DevTools summary for the longest interaction on that rerun:
    - event: `pointerdown`
    - INP: `184ms`
    - input delay: `9ms`
    - processing duration: `131ms`
    - presentation delay: `44ms`
  - Used a coarse module-name scan on the same trace file as a secondary ownership check:
    - `Search`: `0`
    - `SectionSearch`: `0`
    - `ProjectChatBottomDock`: `55`
    - `CodeMirror`: `7`
    - `TextInputCodeMirror`: `2`
    - `GroupContainer`: `24`
    - `scheduleMeasure`: `8`
    - `KwargsControls`: `1`
    - `ParamFilter`: `1`
- Interpretation:
  - `Search` is still broad in code, but the accepted trace evidence does not make it the next credible callable-specific checkpoint.
  - The boundary rerun is consistent with the earlier accepted Phase 3 result:
    - the strongest remaining signal is shared page chrome / editor work
    - not a newly isolated callable shell or selector seam
  - `GroupContainer` still appears in the trace artifact, but the accepted post-checkpoint reruns already removed its earlier broad measurement signature as the dominant reorder issue, and this boundary rerun did not produce a clearer callable-owned successor seam.
  - Treat this as the end of justified callable-specific Phase 3 work for now.
  - Any Phase 4 callable work should require a fresh trace that proves the next dominant hotspot is actually inside the callable subtree.

### Callable track closeout against the original done condition

- Date/time: 2026-03-16
- Closeout read:
  - The callable-specific track clearly achieved:
    - a materially flatter callable subtree than untouched `main`
    - maintained visual parity on the accepted checkpoints
    - broader automated coverage, including the `math.sqrt` minimum regression matrix
    - narrower callable render-path ownership on the filter/reorder path
  - The callable-specific track did not fully achieve the original top-line performance condition:
    - the locked pan/zoom/resize scenario did not become a clear callable-owned win
    - the accepted Phase 2 closeout already showed:
      - pan within noise
      - zoom effectively flat
      - resize only marginally different
    - the later accepted Phase 3 work improved filter/reorder behavior instead, while the next dominant signal moved into shared page chrome / editor work
- Result:
  - Treat this report as a successful callable structural refactor record, not as proof that the original pan/zoom/resize performance objective was fully completed.
  - The callable track is therefore stopped short of the original definition of done.
  - Any follow-up work should either:
    - prove a new callable-owned hotspot on the locked scenario, or
    - explicitly expand scope beyond the callable subtree into the shared page chrome / editor path.

### Fresh locked resize reopen check: still not a callable-owned hotspot

- Date/time: 2026-03-16
- Scope:
  - re-ran the locked `open` control resize delta on both branches using deterministic width updates on the callable section itself
  - artifacts:
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-phase4-reopen-resize-state.trace.json`
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase4-reopen-resize-state.trace.json`
- Replay details:
  - width reset to `200` (`240.578px` on screen at the current zoom)
  - width updated to `270` (`324.780px` on screen)
  - width restored to `200` after the trace
- DevTools read:
  - untouched `main`:
    - no `ForcedReflow` insight on this rerun
    - only `CLSCulprits`
  - worktree:
    - `ForcedReflow` remained present
    - total reflow time: `29ms`
    - top contributors called out by DevTools:
      - `24ms` in `eq` from `chunk-MB4RGFJ3.js`
      - `4ms` in `ProjectChatBottomDock.tsx`
      - `1ms` in `getHandleCenter` from `src/state/actions/edgeHandles.ts`
      - `1ms` in `KwargsControls.tsx` `updateHeight`
- Interpretation:
  - This was the explicit reopen test requested by the callable plan’s stop condition.
  - It still does not support more callable-specific implementation work:
    - the dominant unresolved resize work is still shared page chrome / editor work
    - callable-owned contributions remain present but minor
  - Treat this as confirmation that the callable track remains incomplete rather than as evidence for a new callable Phase 4 checkpoint.
