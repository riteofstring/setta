# Settings Pan/Zoom Rendering Rewrite Log

Date started: 2026-03-25
Imported to this worktree: 2026-03-26
Worktree: `setta.pixijs-rewrite`
Related plan: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-plan.md`
Imported source worktree: `setta.frontend-performance-11`
Imported source commit: `42696484b`

## Usage

Append-only execution log for the rendering rewrite effort.

Every log item should record:

- `Item`
- `Status`
- `Details`
- `Next action`

Recommended status values:

- `todo`
- `in_progress`
- `done`
- `blocked`
- `deferred`

Record:

- architecture decisions
- renderer spike results
- benchmark evidence
- visual parity checks
- `xyflow` keep/fork/replace decisions
- handoff and interaction regressions
- rollout gates for dense scenes

## 2026-03-25 001

- Item: Archive the old hybrid-rendering workstream and initialize the rendering rewrite plan.
- Status: `done`
- Details:
  - Archived the old plan in place:
    - `docs/plans/worktrees/setta.frontend-performance-11/settings-pan-zoom-hybrid-rendering-plan.md`
  - Archived the old execution log in place:
    - `docs/plans/worktrees/setta.frontend-performance-11/settings-pan-zoom-hybrid-rendering-log.md`
  - Created the new rewrite plan:
    - `docs/plans/worktrees/setta.frontend-performance-11/settings-pan-zoom-rendering-rewrite-plan.md`
  - Locked the new direction:
    - stop tuning the current image-overlay/locality path as the primary perf strategy
    - keep `xyflow` as coordinator by default
    - rewrite or bypass the dense section-body rendering path during overview and motion
    - escalate to a forked/replaced `xyflow` rendering slice if the parallel-renderer spike still cannot move `Paint`
  - Locked the new benchmark rule:
    - no keep without materially beating the retained queued-image checkpoint on both `settings` and `tier1Synthetic`
- Next action:
  - Write the renderer-spike RFC and choose the first implementation path for the dense scene parallel renderer.

## 2026-03-26 002

- Item: Tighten the rewrite plan around strict scene ownership, cleanup-first implementation, and append-only branch handoff discipline.
- Status: `in_progress`
- Details:
  - Revised the rewrite plan to encode the stricter graph-surface rule:
    - visible graph pixels should stay scene-owned by default
    - DOM should be limited to popups, heavyweight editors, and thin interaction adapters unless a whole-node overlay is explicitly justified
  - Added the immediate editor interaction rule:
    - CodeMirror-backed fields and code blocks must begin editing on the first click
    - no activation-click model is acceptable
  - Added the graph-widget scope rule:
    - graph-surface drag/reorder paths such as dict/list/kanban interactions should be expected to move scene-native over time
    - preserve behavior semantics even when the DOM drag plumbing changes
  - Added the cleanup-first workflow rule for the future branch:
    - before modifying a messy target file, use the relevant architecture/cleanup skill guidance first
    - clean up the file or cluster before landing Pixi/scene work in it
  - Added the TDD execution rule for each work item:
    - read baseline/context
    - clean up target file or cluster
    - write tests for the new behavior
    - implement
    - run tests/verification
    - append the log with status and next action
  - Added the branch-transfer note:
    - these plan/log files are being prepared in the current worktree so they can be copied into the new branch after it is created from `main`
- Next action:
  - Create the new branch from `main`, transfer the revised plan/log files, and start the vertical slice with a cleanup-first, test-first pass on the first target file cluster.

## 2026-03-26 003

- Item: Transfer the rendering rewrite docs into the `pixijs-rewrite` worktree created from `main`.
- Status: `done`
- Details:
  - Copied these files into `docs/plans/worktrees/setta.pixijs-rewrite/`:
    - `settings-pan-zoom-rendering-rewrite-plan.md`
    - `settings-pan-zoom-rendering-rewrite-log.md`
    - `settings-pan-zoom-rendering-rewrite-architecture-summary.md`
  - Updated the copied plan/log metadata to reference:
    - worktree `setta.pixijs-rewrite`
    - branch `pixijs-rewrite`
    - worktree start commit `26e7406b7`
  - Preserved the earlier entries as the imported research history from the previous worktree.
- Next action:
  - Start the branch-local vertical slice from `main` with the cleanup-first, test-first workflow on the first selected file cluster.

## 2026-03-26 004

- Item: Clarify the pre-Pixi gate in the rewrite docs.
- Status: `done`
- Details:
  - Updated the rewrite plan to make the workflow requirement explicit:
    - cleanup/refactor is its own stage with a clear boundary
    - the refactored non-Pixi path for a slice must be working and verified before any Pixi/scene rewrite begins for that slice
    - Pixi implementation should start only after that working baseline is restored
  - Tightened the handoff language so later implementation does not skip directly from cleanup into Pixi work.
- Next action:
  - When the first vertical slice starts, treat the restored non-Pixi refactor as a hard gate before any scene migration code lands.

## 2026-03-26 005

- Item: Lock the first branch-local vertical slice scope and carry-forward prerequisites.
- Status: `done`
- Details:
  - Updated the rewrite plan to name the first branch-local proving ground:
    - Settings project `All Settings`
  - Locked the first parity canary path to the dict/param stack instead of the whole graph generically:
    - `frontend/src/components/Section/Layouts/DictArea.tsx`
    - `frontend/src/components/Params/GroupContainer.tsx`
    - `frontend/src/components/Params/GetParamSwitch.tsx`
    - `frontend/src/components/Params/ParamContainer.tsx`
    - `frontend/src/components/Params/ParamItems/ParamInput.tsx`
    - `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
    - `frontend/src/components/Utils/Combobox/IdNameCombobox.tsx`
    - `frontend/src/forks/dnd-kit/ParamDndContext.tsx`
    - `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
    - `frontend/src/forks/xyflow/core/container/FlowRenderer.tsx`
    - `frontend/src/forks/xyflow/core/container/NodeRenderer.tsx`
    - `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`
  - Recorded the slice interaction requirements explicitly:
    - first-click CodeMirror editing
    - popup combobox overlay
    - param-row drag/reorder inside the graph surface
    - retained-scene edges in the same slice
  - Updated the architecture summary to mirror the same branch-local slice choice and to keep the current `xyflow` container shell on probation rather than assuming it survives unchanged.
  - Recorded the benchmark carry-forward gap:
    - this worktree has the `2026-03-07` settings benchmark report locally
    - the later tier1 section-benchmark reports referenced by the plan still live only in `setta.frontend-performance-11`
    - the earlier settings benchmark entrypoint/spec referenced by the report are not present in this worktree and must be re-established locally before the first Pixi slice can be benchmarked in-branch
- Next action:
  - Re-establish a branch-local `All Settings` benchmark harness, then start the cleanup-first non-Pixi pass on the dict/param cluster before any Pixi renderer code lands.

## 2026-03-26 006

- Item: Re-establish the branch-local `All Settings` benchmark harness in the `pixijs-rewrite` worktree.
- Status: `done`
- Details:
  - Restored the historical benchmark harness files that the local `2026-03-07` report referenced but this worktree did not yet contain:
    - `frontend/src/components/Pages/Project/settingsAllSettingsBenchmark.tsx`
    - `frontend/src/components/Section/Layouts/SettingsAllSettingsBenchmarkDictArea.tsx`
    - `frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
  - Wired the harness into the live Settings surface so the branch-local app can step through the benchmark ladder via `settingsBenchmarkStage`:
    - wrapped `UIPage` with `SettingsAllSettingsBenchmarkProvider`
    - exposed the active benchmark stage on `.react-flow`
    - gated section handles, section headers, section bodies, and dict-area rendering for the benchmark stages
  - Verification:
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3043/settings`)
      - verified `frame-only`, `static-param-list`, and `full`
      - confirmed `.react-flow[data-settings-benchmark-stage]` matched each selected stage after clicking `All Settings`
      - confirmed the stage visuals stepped from minimal placeholders to static benchmark rows to real param containers
- Next action:
  - Start the cleanup-first non-Pixi pass on the dict/param cluster, using the restored branch-local harness as the baseline verification path for the first vertical slice.

## 2026-03-26 007

- Item: Capture the pre-edit CDP baseline for the first dict/param cleanup slice.
- Status: `blocked`
- Details:
  - Intended subtask:
    - start the cleanup-first non-Pixi pass on `frontend/src/components/Params/ParamContainer.tsx`
    - use the branch-local `All Settings` benchmark harness as the pre-edit visual baseline before changing code
  - CDP itself was reachable, but the running worktree app on `http://127.0.0.1:3043/settings` did not reach the benchmark surface.
  - The page failed during app load with:
    - `Failed to check server mode (status 401)`
  - Because `/settings` never finished loading, the `All Settings` benchmark view and its dict/param rows were unavailable.
  - Per the repo verification rules, the required CDP visual baseline could not be completed, so the cleanup refactor was not started in this iteration.
- Next action:
  - Restart `ai.sh` for this worktree so the `/settings` app session can load cleanly, then retry the pre-edit CDP baseline before touching the dict/param cluster.

## 2026-03-26 008

- Item: Retry the pre-edit CDP baseline gate for the first dict/param cleanup slice after worktree restart.
- Status: `done`
- Details:
  - Used the current worktree bootstrap URL to establish the authenticated app session:
    - `http://127.0.0.1:8043/__setta__/bootstrap#token=...`
  - Confirmed the bootstrap redirect landed on the current worktree frontend origin:
    - `http://127.0.0.1:3043/?__setta_backend_origin=http%3A%2F%2F127.0.0.1%3A8043`
  - Opened `http://127.0.0.1:3043/settings` and verified the earlier `Failed to check server mode (status 401)` issue was no longer present.
  - Verified via Chrome DevTools MCP that:
    - `/settings` loaded successfully
    - backend calls relevant to settings/auth refresh returned `200`
    - the `All Settings` view was open
    - the pre-edit baseline surface for the first slice was present, including the dict/param area and benchmark rows such as `Dict` and `Param Defaults`
  - This satisfies the pre-edit CDP visual baseline gate required before starting the cleanup-first non-Pixi pass on the dict/param cluster.
- Next action:
  - Start the cleanup-first non-Pixi pass on `frontend/src/components/Params/ParamContainer.tsx`, with tests added or updated before behavior changes.

## 2026-03-26 009

- Item: Start the cleanup-first non-Pixi pass on `frontend/src/components/Params/ParamContainer.tsx`.
- Status: `blocked`
- Details:
  - Refactored `frontend/src/components/Params/ParamContainer.tsx` to collapse the duplicated article branches behind a typed shared wrapper plus a new pure helper module:
    - `frontend/src/components/Params/paramContainerView.ts`
  - Added focused Vitest coverage for the new helper boundary:
    - `frontend/src/components/Params/paramContainerView.test.ts`
  - Verification completed before the blocker:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Params/paramContainerView.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
  - Verification blocker:
    - required Chrome DevTools MCP visual check could not run
    - fresh-context CDP sub-agent reported `127.0.0.1:9266` was not listening
    - because the required post-edit visual gate is unavailable, this cleanup slice is not being marked complete or committed in this iteration
- Next action:
  - Restart `./ai.sh` for this worktree so CDP is reachable again, then rerun the post-edit `/settings` visual verification on `All Settings`; if it passes, append the success result and commit this `ParamContainer` cleanup slice.

## 2026-03-26 010

- Item: Complete the cleanup-first non-Pixi pass on `frontend/src/components/Params/ParamContainer.tsx`.
- Status: `done`
- Details:
  - Kept the `ParamContainer` cleanup refactor in the non-Pixi path and finished the verification/commit gate for this slice:
    - `frontend/src/components/Params/ParamContainer.tsx`
    - `frontend/src/components/Params/paramContainerView.ts`
    - `frontend/src/components/Params/paramContainerView.test.ts`
  - The refactor boundary now lives in a pure typed helper so the container renders through one shared article wrapper while preserving the existing leaf/top-level-nested/nested layout variants.
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Params/paramContainerView.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3043/settings`) after bootstrapping via `http://127.0.0.1:8043/__setta__/bootstrap#token=...`
      - page stayed authenticated and did not reproduce the earlier `401` failure
      - relevant settings/auth requests returned `200`
      - `Param Defaults` / `All Settings` and the visible dict/param area rendered normally without obvious layout breakage
- Next action:
  - Continue the cleanup-first non-Pixi pass across the remaining first-slice dict/param cluster, starting with the next bounded file around the `DictArea`/param-stack path before any Pixi renderer code lands.

## 2026-03-26 011

- Item: Complete the cleanup-first non-Pixi pass on `frontend/src/components/Params/GetParamSwitch.tsx`.
- Status: `done`
- Details:
  - Extracted the param-filtering and ancestry-expansion path into a pure typed helper so the component no longer mixes `matchSorter` results with raw string IDs:
    - `frontend/src/components/Params/GetParamSwitch.tsx`
    - `frontend/src/components/Params/paramSwitchView.ts`
    - `frontend/src/components/Params/paramSwitchView.test.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - unfiltered path-backed param rows
    - filtered leaf-name matches expanding back through their visible ancestor path
    - temporary DnD placeholder rows staying visible while filtering
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Params/paramSwitchView.test.ts src/components/Params/GroupContainer.test.tsx`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
      - `/settings` stayed authenticated and loaded cleanly at `http://127.0.0.1:3044/settings`
      - `All Settings` was active and the visible dict/param area rendered normally
      - expected rows and controls were present, including `Auto Refetch Callable Params On LSP Mismatch`, `Auto Backup`, `autobackupFreq 300`, `defaultZoomLevel 1.0`, `Grid Color`, and `Grid Pattern`
      - checked backend requests such as `api/loadSettings`, `api/backendInitStatus`, `api/authRefreshStatus`, and `api/loadProjectConfig`; they returned `200`
- Next action:
  - Continue the cleanup-first non-Pixi pass on the next bounded first-slice file, starting with `frontend/src/components/Params/ParamItems/ParamInput.tsx` before any Pixi renderer code lands.

## 2026-03-26 012

- Item: Complete the cleanup-first non-Pixi pass on `frontend/src/components/Params/ParamItems/ParamInput.tsx`.
- Status: `done`
- Details:
  - Refactored the hot `ParamInput` path behind a typed helper boundary while keeping the existing non-Pixi render path intact:
    - `frontend/src/components/Params/ParamItems/ParamInput.tsx`
    - `frontend/src/components/Params/paramInputView.ts`
    - `frontend/src/components/Params/paramInputView.test.ts`
  - The container now pulls `projectConfigId`, `baseValue`, and `codeObjType` through one typed selector instead of repeating the same guarded lookup, and delegates its change/reveal/dropzone event planning to the pure helper.
  - The new helper pins the existing behavior for:
    - value normalization plus realtime/backend update routing
    - password-reveal eligibility
    - stateless dropzone dependency event sequencing and payload shaping
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Params/paramInputView.test.ts src/components/Params/ParamUIs/DropzoneInput.test.tsx src/state/actions/websocketReceive.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/password-param-reveal.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
      - `/settings` stayed authenticated at `http://127.0.0.1:3044/settings`
      - backend requests such as `api/loadSettings`, `api/backendInitStatus`, `api/authRefreshStatus`, `api/loadProjectConfig`, and `api/getLatestLspDiagnostics` returned `200`
      - `All Settings` rendered the expected param rows and controls, including `Dropzone Param`, `Nested Param`, `Password Param`, `Rotary Param`, `Slider Param`, `Switch Param`, `Text Area Param`, `Text Param`, and `Time Param`, with no obvious layout breakage
- Next action:
  - Continue the cleanup-first non-Pixi pass on the next bounded first-slice file in the dict/param path, starting with `frontend/src/components/Section/Layouts/DictArea.tsx` before any Pixi renderer code lands.

## 2026-03-26 013

- Item: Complete the cleanup-first non-Pixi pass on `frontend/src/components/Section/Layouts/DictArea.tsx`.
- Status: `done`
- Details:
  - Refactored the `DictArea` benchmark/live branch behind a typed helper boundary so the non-Pixi slice no longer leaves its benchmark-shell switch and static-row shaping inline:
    - `frontend/src/components/Section/Layouts/DictArea.tsx`
    - `frontend/src/components/Section/Layouts/SettingsAllSettingsBenchmarkDictArea.tsx`
    - `frontend/src/components/Section/Layouts/dictAreaView.ts`
    - `frontend/src/components/Section/Layouts/dictAreaView.test.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - choosing the benchmark renderer only when the benchmark is active and the full section body is intentionally disabled
    - keeping the live `KwargsControls` + `ParamGroupContainer` path for inactive and full-body benchmark states
    - mapping flattened benchmark param-tree items into static benchmark rows without leaving the label/depth translation inline in the component body
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Layouts/dictAreaView.test.ts src/components/Section/Layouts/DictArea.test.tsx`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
      - `/settings` stayed authenticated at `http://127.0.0.1:3044/settings`
      - verified `All Settings` plus `section-body-shell` and `full` benchmark stages
      - the reduced stage kept the benchmark shell path without live param containers, and the full stage restored the dict/param tree normally
      - relevant backend/auth/settings requests visible during verification returned `200`
- Next action:
  - Continue the cleanup-first non-Pixi pass on the next bounded first-slice file in the dict/param cluster, starting with `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx` before any Pixi renderer code lands.

## 2026-03-26 014

- Item: Complete the cleanup-first non-Pixi pass on `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`.
- Status: `done`
- Details:
  - Refactored the inline text CodeMirror activation/autocomplete path behind a typed helper boundary so the non-Pixi slice no longer leaves its mouse/focus activation rules and core editor identity decisions inline in the component:
    - `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
    - `frontend/src/components/Utils/CodeMirror/textInputCodeMirrorView.ts`
    - `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - left-click activation marking the section active and swapping from the dummy editor to the real editor
    - tab-focus activation only when the editor is enabled and not already active
    - stable CodeMirror id generation plus python-only autocomplete gating and tooltip-parent normalization
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/editor/codemirror-autocomplete-clip.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
      - `/settings` stayed authenticated and loaded cleanly with `All Settings` open
      - the visible settings list rendered normally without obvious layout breakage or clipping after the cleanup
      - representative entries remained visible, including `textParamCodeObjDefault`, `passwordParamCodeObjDefault`, and `dictSectionDefault`
      - observed requests included `POST /api/loadSettings` `200`, `GET /api/backendInitStatus` `200`, `GET /api/authRefreshStatus` `200`, and `POST /api/loadProjectConfig` `200`
      - the bootstrap consume request returned `401`, but the existing browser auth cookies kept the page authenticated during verification
- Next action:
  - Continue the cleanup-first non-Pixi pass on the next bounded first-slice file in the dict/param cluster, starting with `frontend/src/components/Params/GroupContainer.tsx` before any Pixi renderer code lands.

## 2026-03-26 015

- Item: Complete the cleanup-first non-Pixi pass on `frontend/src/components/Params/GroupContainer.tsx`.
- Status: `done`
- Details:
  - Refactored the `GroupContainer` param-area decisions behind a typed helper boundary so the non-Pixi slice no longer leaves its edge-input filtering, pinned/unpinned list shaping, and unpinned min-height policy inline in the component:
    - `frontend/src/components/Params/GroupContainer.tsx`
    - `frontend/src/components/Params/groupContainerView.ts`
    - `frontend/src/components/Params/groupContainerView.test.ts`
    - `frontend/src/components/Params/GroupContainer.test.tsx`
  - The new helper preserves the existing non-Pixi behavior for:
    - filtering edge-input params out of the visible pinned/unpinned lists while keeping nested-depth accounting
    - deciding when the pinned stack should round its bottom edge
    - normalizing the legacy unpinned min-height setting and suppressing min-height application when the unpinned list is hidden or layout-locked
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerView.test.ts src/components/Params/GroupContainer.test.tsx`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
      - `/settings` stayed authenticated at `http://127.0.0.1:3044/settings`
      - `All Settings` rendered normally with no obvious overlap, clipping, or collapsed layout in the visible dict/param stack
      - representative rows remained visible, including `Auto Backup`, `autobackupFreq 300`, `Grid Color`, `Grid Pattern`, `Dict`, and `Param Defaults`
      - relevant backend/auth/settings requests returned `200`, including `api/authRefreshStatus`, `api/loadSettings`, `api/backendInitStatus`, and `api/loadProjectConfig`
- Next action:
  - Continue the cleanup-first non-Pixi pass on the next bounded first-slice file in the dict/param cluster, starting with `frontend/src/components/Utils/Combobox/IdNameCombobox.tsx` before any Pixi renderer code lands.

## 2026-03-26 016

- Item: Complete the cleanup-first non-Pixi pass on `frontend/src/components/Utils/Combobox/IdNameCombobox.tsx`.
- Status: `done`
- Details:
  - Refactored the thin combobox wrapper behind a typed helper boundary so the non-Pixi slice no longer leaves its hook option defaults and root wrapper sizing policy inline:
    - `frontend/src/components/Utils/Combobox/IdNameCombobox.tsx`
    - `frontend/src/components/Utils/Combobox/idNameComboboxView.ts`
    - `frontend/src/components/Utils/Combobox/idNameComboboxView.test.ts`
    - `frontend/src/components/Utils/Combobox/IdNameCombobox.test.tsx`
  - The new helper preserves the existing non-Pixi behavior for:
    - defaulting `selectedItemCanBeNull` and `clearInputAfterSelection` before passing the wrapper config into `useIdNameCombobox`
    - keeping the compact vs regular combobox root height policy stable across callers
    - preserving the real wrapper boundary for portaled menu open/select behavior and disabled-state no-open behavior
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Utils/Combobox/idNameComboboxView.test.ts src/components/Utils/Combobox/IdNameCombobox.test.tsx src/components/Utils/Combobox/ComboboxParts.test.tsx`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/app/app-mode-dropdown-portal-theme.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
      - the verifier used the already-authenticated `/settings` tab after the provided bootstrap URL was rejected in that browser session
      - `All Settings` rendered the dict/param stack normally
      - the visible `Tag filter` dropdown opened as a normal portal/menu with expected options such as `All` and `Untagged`
      - relevant requests returned `200`, including `GET /settings`, `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/authRefreshStatus`, `GET /api/backendInitStatus`, and `POST /api/loadProjectConfig`
- Next action:
  - Continue the cleanup-first non-Pixi pass on the next bounded first-slice file in the dict/param cluster, starting with `frontend/src/forks/dnd-kit/ParamDndContext.tsx` before any Pixi renderer code lands.

## 2026-03-26 017

- Item: Complete the cleanup-first non-Pixi pass on `frontend/src/forks/dnd-kit/ParamDndContext.tsx`.
- Status: `done`
- Details:
  - Refactored the param DnD provider decisions behind a typed helper boundary so the non-Pixi slice no longer leaves its helper-overlay visibility and list-key collision scoping inline in the component:
    - `frontend/src/forks/dnd-kit/ParamDndContext.tsx`
    - `frontend/src/forks/dnd-kit/paramDndContextView.ts`
    - `frontend/src/forks/dnd-kit/paramDndContextView.test.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - keeping the drag helper overlay mounted while a param drag is still active even if edit mode toggles off mid-drag
    - keeping the provider on the stable inert DnD context used by the param stack
    - scoping tracker collisions to the active `pinned` or `unpinned` list and explicitly clearing collisions when every candidate belongs to another list
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/forks/dnd-kit/paramDndContextView.test.ts src/forks/dnd-kit/dndCollisions.integration.test.ts src/forks/dnd-kit/adapter/dragEventMapping.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
      - the settings UI rendered normally with no obvious overlap, clipping, or broken helper overlays
      - representative visible rows and controls included `Filter`, tag rows such as `backend`, `sectionSizingPolicy`, `languageServer`, `shortcuts`, and `gui`, plus bottom stack tabs including `Param Defaults` and `All Settings`
      - relevant requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, and `POST /api/loadProjectConfig`
- Next action:
  - Continue the cleanup-first non-Pixi pass on the next bounded first-slice file in the dict/param cluster before any Pixi renderer code lands, starting with `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`.

## 2026-03-26 018

- Item: Complete the cleanup-first non-Pixi pass on `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`.
- Status: `done`
- Details:
  - Refactored the `ReactFlow` container decisions behind a typed helper boundary so the non-Pixi slice no longer leaves its wire-color fallback, scroll-to-pan translation math, wrapper dimension normalization, and render gating inline in the component:
    - `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
    - `frontend/src/forks/xyflow/core/container/reactFlowView.ts`
    - `frontend/src/forks/xyflow/core/container/reactFlowView.test.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - resolving light and dark wire colors while tolerating older backend builds that omit those settings
    - keeping renderer mount gating tied to positive wrapper dimensions from the observed canvas host
    - translating browser scroll offsets back into zoom-aware viewport pan deltas before resetting the sentinel scroll position
    - writing the same drawable width/height back into the xyflow store after subtracting the overview and UI editor panes
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/reactFlowView.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
      - `/settings` loaded with `All Settings` visible
      - the visible settings/dict-param area plus the canvas wrapper looked structurally intact with no obvious clipping, overlap, or missing layout
      - representative requests visible during verification returned `200`, including `loadProjectConfig`, `getAgentRuns`, `plugins/runtime`, `llm/apiKeys`, `llm/config`, `getAgentProfiles`, `getPromptTemplates`, and `setTopLevelSectionLayout`
- Next action:
  - Continue the cleanup-first non-Pixi pass on the next bounded first-slice file in the xyflow container cluster before any Pixi renderer code lands, starting with `frontend/src/forks/xyflow/core/container/FlowRenderer.tsx`.

## 2026-03-26 019

- Item: Complete the cleanup-first non-Pixi pass on `frontend/src/forks/xyflow/core/container/FlowRenderer.tsx`.
- Status: `done`
- Details:
  - Refactored the `FlowRenderer` container decisions behind a typed helper boundary so the non-Pixi slice no longer leaves its AI-follow viewport gating and selection-mode pan split inline in the component:
    - `frontend/src/forks/xyflow/core/container/FlowRenderer.tsx`
    - `frontend/src/forks/xyflow/core/container/flowRendererView.ts`
    - `frontend/src/forks/xyflow/core/container/flowRendererView.test.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - disabling wheel zoom, pinch zoom, scroll panning, drag panning, and zoom-activation while AI follow is transitioning
    - keeping selection mode routed into the pane as selecting state while separately suppressing viewport drag panning inside `ZoomPane`
    - passing through the configured pan/zoom settings unchanged in the normal interactive state
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/flowRendererView.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
      - `/settings` loaded cleanly at `http://127.0.0.1:3044/settings` with `All Settings` active
      - the visible settings/dict-param area and canvas shell rendered normally without obvious overlap, clipping, or missing content
      - representative visible rows and controls included `chartSectionDefault`, `dictSectionDefault`, `backend`, `languageServer`, `Is Frozen`, `Is Minimized`, `Position And Size Locked`, and `height 300.0` / `width 300.0`
      - relevant backend/auth/settings requests returned `200`, including `api/serverMode`, `api/loadSettings`, `api/backendInitStatus`, `api/authRefreshStatus`, `api/getDefaultConfigName`, `api/getFileBrowserRoot`, `api/loadAllProjectMetadata`, `api/loadProjectConfig`, and `api/llm/config`
- Next action:
  - Continue the cleanup-first non-Pixi pass on the next bounded first-slice file in the xyflow container cluster before any Pixi renderer code lands, starting with `frontend/src/forks/xyflow/core/container/NodeRenderer.tsx`.

## 2026-03-26 020

- Item: Complete the cleanup-first non-Pixi pass on `frontend/src/forks/xyflow/core/container/NodeRenderer.tsx`.
- Status: `done`
- Details:
  - Refactored the `NodeRenderer` container decisions behind a typed helper boundary so the non-Pixi slice no longer leaves its wrapper visibility/draggability shaping and resize-observer setup inline in the component:
    - `frontend/src/forks/xyflow/core/container/NodeRenderer.tsx`
    - `frontend/src/forks/xyflow/core/container/nodeRendererView.ts`
    - `frontend/src/forks/xyflow/core/container/nodeRendererView.test.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - keeping every rendered node wrapper draggable only while the pan-activation key is not pressed
    - keeping wrapper visibility tied to the existing fit-view readiness gate
    - creating the same resize observer that forwards node resize entries through `getNodeUpdateInformation(..., true)` into `updateNodeDimensions(...)`
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/nodeRendererView.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
      - `/settings` loaded cleanly at `http://127.0.0.1:3044/settings` with `All Settings` visible
      - the settings/tag list and canvas shell rendered normally without obvious overlap, clipping, or missing content
      - representative visible labels and rows included `backend`, `shortcuts`, `languageServer`, `gui`, `sectionSizingPolicy`, `Auto Backup`, `autobackupFreq 300`, `Completion Guard Enabled`, and `defaultTerminalShell null`
      - relevant backend/auth/settings requests returned `200`, including `api/serverMode`, `api/backendInitStatus`, `api/loadSettings`, and `api/authRefreshStatus`
- Next action:
  - Continue the cleanup-first non-Pixi pass on the next bounded first-slice file in the xyflow container cluster before any Pixi renderer code lands, starting with `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`.

## 2026-03-26 021

- Item: Complete the cleanup-first non-Pixi pass on `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`.
- Status: `done`
- Details:
  - Refactored the `EdgeRenderer` container decisions behind a typed helper boundary so the non-Pixi slice no longer leaves its svg mount gate, z-index ordering, active-variant filtering, handle-position lookup, and wrapped-edge prop shaping inline in the component:
    - `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`
    - `frontend/src/forks/xyflow/core/container/edgeRendererView.ts`
    - `frontend/src/forks/xyflow/core/container/edgeRendererView.test.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - suppressing the edge svg until the xyflow canvas has positive width and height
    - rendering only edges whose source and target variants are still the active variants for their sections
    - skipping hidden edges and edges whose source/target handle positions are not yet registered
    - keeping the surviving edges sorted by `zIndex` and mapped into the same wrapped-edge prop surface used for reconnect behavior
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/edgeRendererView.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
      - `/settings` loaded authenticated with `All Settings` visible
      - the visible settings shell, dict/param area, and canvas/edge shell rendered normally with no obvious clipping, overlap, or missing content
      - representative visible context included the `settings` heading, tag rows such as `shortcuts`, `sectionSizingPolicy`, `gui`, `languageServer`, and `backend`, canvas controls such as `toggle agentic edges`, `toggle arg edges`, `toggle snap to grid`, and `toggle minimap`, plus bottom tabs including `Param Defaults` and `All Settings`
      - relevant requests returned `200`, including `api/loadProjectConfig`, `api/getAgentRuns`, `api/plugins/runtime`, `api/llm/config`, `api/getPromptTemplates`, `api/getExternalAgentConfigs`, `api/getExternalAgentHealth`, `api/getEngineConfigs`, `api/getTranscriptionProfiles`, and `api/setTopLevelSectionLayout`
- Next action:
  - Treat the first branch-local cleanup-first non-Pixi file cluster as complete and start the first Pixi-side branch-local slice step from the plan, beginning with retained-scene packet extraction for edges and hit regions on the cleaned `xyflow` boundary.

## 2026-03-26 022

- Item: Start the first Pixi-side branch-local slice step with deterministic edge and hit-region packet extraction.
- Status: `done`
- Details:
  - Added a pure typed packet boundary for the cleaned `xyflow` edge path:
    - `frontend/src/forks/xyflow/core/container/edgeScenePackets.ts`
    - `frontend/src/forks/xyflow/core/container/edgeScenePackets.test.ts`
  - The new helper now deterministically:
    - filters to the active visible edge set using section variants plus registered handle positions
    - sorts packets by edge `zIndex`
    - derives stable edge geometry packets for `bezier` and `straight` edges
    - emits reconnect hit-region packets alongside the same edge geometry using shared interaction constants
  - Kept the current non-Pixi DOM edge renderer stable by routing `buildEdgeRendererView(...)` through the new packet helper and mapping packets back into the existing wrapped-edge prop surface:
    - `frontend/src/forks/xyflow/core/container/edgeRendererView.ts`
    - `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`
    - `frontend/src/forks/xyflow/core/components/Edges/StraightEdge.tsx`
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/edgeScenePackets.test.ts src/forks/xyflow/core/container/edgeRendererView.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
      - `/settings` loaded authenticated with the settings shell structurally intact
      - visible context included `Overview`, `settings`, `Filter`, `Tag`, tag rows such as `shortcuts`, `gui`, `sectionSizingPolicy`, `backend`, and `languageServer`, plus bottom tabs including `Param Defaults` and `All Settings`
      - no obvious clipping, overlap, or missing major content was observed in the visible viewport
      - relevant requests returned `200`, including `api/loadSettings`, `api/authRefreshStatus`, `api/backendInitStatus`, `api/getDefaultConfigName`, `api/getFileBrowserRoot`, `api/loadProjectConfig`, `api/getLatestLspDiagnostics`, `api/getAIFollowSnapshot`, and `api/getListenerCoverage`
- Next action:
  - Continue workstream `3. Scene Packet And Edge Packet Extraction` with the next bounded first-slice packet boundary, starting with deterministic node-visual packet extraction for the dict/param canary path before any Pixi renderer mounting lands.

## 2026-03-26 023

- Item: Extract deterministic benchmark dict-area scene packets for the first node-visual canary slice.
- Status: `done`
- Details:
  - Added a pure typed packet boundary for the benchmark dict/param shell on the canary path:
    - `frontend/src/components/Section/Layouts/dictAreaScenePackets.ts`
    - `frontend/src/components/Section/Layouts/dictAreaScenePackets.test.ts`
  - Kept the current benchmark DOM stable by routing `SettingsAllSettingsBenchmarkDictArea` through the new packet helper instead of rendering directly from ad hoc row data:
    - `frontend/src/components/Section/Layouts/SettingsAllSettingsBenchmarkDictArea.tsx`
  - The new helper now deterministically:
    - emits typed edge-summary packets for the benchmark shell
    - emits pinned/unpinned param-area packets in stable order
    - maps flattened benchmark param rows into semantic row packets with explicit `group` vs `value` kinds for future scene rendering
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Layouts/dictAreaScenePackets.test.ts src/components/Section/Layouts/dictAreaView.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings?settingsBenchmarkStage=static-param-list`)
      - `All Settings` stayed active and the benchmark shell rendered normally in the settings canvas
      - static param content remained visible, including rows such as `minHeight`, `minWidth`, `Size Mode Height`, and `Size Mode Width`, plus representative settings labels such as `backend`, `languageServer`, `gui`, and `sectionSizingPolicy`
      - relevant requests returned `200`, including `GET /settings?settingsBenchmarkStage=static-param-list`, `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, and `POST /api/loadProjectConfig`
- Next action:
  - Continue workstream `3. Scene Packet And Edge Packet Extraction` with the next bounded node-visual packet boundary, extending from the benchmark shell into the live dict/param canary rendering path before any Pixi mounting lands.

## 2026-03-26 024

- Item: Extract deterministic live param-row scene packets for the dict/param canary path.
- Status: `done`
- Details:
  - Added a pure typed packet boundary for the live visible param-row path:
    - `frontend/src/components/Params/paramSwitchScenePackets.ts`
    - `frontend/src/components/Params/paramSwitchScenePackets.test.ts`
  - Kept the current non-Pixi DOM renderer stable by routing `GetParamSwitch` through the new packet helper and mapping packet ids back into the existing `ParamSwitch` surface:
    - `frontend/src/components/Params/GetParamSwitch.tsx`
  - The new helper now deterministically:
    - preserves visible param-row ordering through the existing filter logic
    - expands matched leaf rows back through their visible ancestor paths
    - infers stable `group` vs `value` row kinds from the path data
    - keeps temp DnD placeholder rows visible as explicit `placeholder` packets when filtering hides real params
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Params/paramSwitchScenePackets.test.ts src/components/Params/paramSwitchView.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
      - `/settings` loaded authenticated with `All Settings` visible
      - the dict/param stack still looked structurally intact in the live app, with visible context including `Dict`, `Param Defaults`, and surrounding settings controls
      - relevant requests returned `200`, including `api/getAgentRuns`, `api/getEngineConfigs`, `api/getPromptTemplates`, `api/getExternalAgentHealth`, `api/plugins/runtime`, `api/llm/config`, `api/llm/apiKeys`, `api/loadProjectConfig`, `api/getFileBrowserRoot`, and `api/getFolderContents`
- Next action:
  - Continue workstream `3. Scene Packet And Edge Packet Extraction` by lifting the pinned/unpinned live param-area shell into a higher-level dict/param scene packet before any Pixi mounting lands.

## 2026-03-26 025

- Item: Lift the pinned/unpinned live param-area shell into a higher-level dict/param scene packet.
- Status: `done`
- Details:
  - Added a pure typed live dict/param-area packet boundary above the existing row packets:
    - `frontend/src/components/Params/groupContainerScenePackets.ts`
    - `frontend/src/components/Params/groupContainerScenePackets.test.ts`
  - Kept the current non-Pixi DOM renderer stable by routing the live pinned/unpinned shell through the new area packet builders while preserving the existing `ParamDndList` render path:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - lifts pinned and unpinned param-area shell metadata into stable ordered packets
    - carries nested live row packets inside each area packet instead of leaving the shell split across ad hoc component state
    - preserves filtered row visibility by flattening the required param paths into a deterministic live row order before building the nested row packets
    - keeps the existing pinned rounding and unpinned min-height policies attached to the packet boundary for future scene mounting
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerScenePackets.test.ts src/components/Params/GroupContainer.test.tsx src/components/Params/groupContainerView.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
      - `/settings` loaded authenticated with `All Settings` visible
      - the dict/param stack remained structurally intact after the live area-packet refactor, with representative visible labels and controls including `Auto Backup`, `Autosave`, `defaultTerminalShell`, `defaultZoomLevel`, `Grid Color`, `Pan On Drag`, and `basedpyright analysis`
      - no obvious overlap, clipping, or missing content was observed in the viewport
      - relevant requests returned `200`, including `/settings`, `/api/serverMode`, `/api/loadSettings`, `/api/loadProjectConfig`, and `/api/authRefreshStatus`
- Next action:
  - Continue workstream `3. Scene Packet And Edge Packet Extraction` with the next bounded dict/param canary packet step, using the new live area packet boundary as the source for the first retained-scene node-layout packet before any Pixi mounting lands.

## 2026-03-26 026

- Item: Extract the first retained-scene node-layout packet for the live dict/param canary path.
- Status: `done`
- Details:
  - Added a pure typed node-layout packet boundary above the live dict/param area packets:
    - `frontend/src/components/Section/Layouts/dictAreaNodeLayoutPackets.ts`
    - `frontend/src/components/Section/Layouts/dictAreaNodeLayoutPackets.test.ts`
  - The new helper takes the live area packet boundary as input and deterministically:
    - lifts the live pinned/unpinned param-area packets into ordered fixed-vs-grow layout blocks
    - folds the existing edge-strip height estimate into the same layout packet without starting Pixi mounting yet
    - aggregates fixed block ids, grow block ids, total visible param-row count, and total min-height contribution for the future retained-scene layout step
    - normalizes invalid min heights while preserving live placeholder/value/group row packets unchanged
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Layouts/dictAreaNodeLayoutPackets.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
      - `/settings` loaded authenticated at `http://127.0.0.1:3044/settings`
      - `All Settings` stayed visible and the settings shell / dict-param canary area rendered normally with no obvious overlap, clipping, or missing content
      - representative visible labels and controls included `settings`, `Filter`, `TAG`, `gui`, `sectionSizingPolicy`, `shortcuts`, `backend`, `languageServer`, `All Settings`, `Close worktree label`, and `Open settings`
      - relevant requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/getDefaultConfigName`, `POST /api/getFileBrowserRoot`, `POST /api/loadAllProjectMetadata`, and `POST /api/loadProjectConfig`
- Next action:
  - Continue workstream `3. Scene Packet And Edge Packet Extraction` by routing the live dict/param canary through this node-layout packet boundary as the mounting input for the first retained-scene node renderer step.

## 2026-03-26 027

- Item: Route the live dict/param canary through the retained-scene node-layout boundary in the production DOM path.
- Status: `done`
- Details:
  - Added a pure typed mount-view helper above the existing live scene packet and node-layout packet boundaries:
    - `frontend/src/components/Params/groupContainerNodeLayoutView.ts`
    - `frontend/src/components/Params/groupContainerNodeLayoutView.test.ts`
  - Updated the live `GroupContainer` path to build the combined live dict-area scene packet once in the parent, derive the node-layout packet from it, and feed the existing pinned/unpinned DOM surfaces from that shared layout-routed view instead of rebuilding per-area packets inline:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - routes live pinned/unpinned param areas through the existing node-layout block order before the DOM path consumes them
    - keeps the live DOM renderer on the current non-Pixi path while exposing the first real retained-scene mount input in production code
    - preserves the existing pinned/unpinned row packets, min-height policy, and max-nested-depth behavior while removing the duplicated per-area packet construction
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerNodeLayoutView.test.ts src/components/Params/GroupContainer.test.tsx src/components/Params/groupContainerScenePackets.test.ts src/components/Section/Layouts/dictAreaNodeLayoutPackets.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
      - bootstrap was attempted via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`, but that token was rejected in the verifier session; the already-authenticated settings tab still loaded cleanly
      - visible labels and controls included `settings`, `Filter`, `All Settings`, `Param Defaults`, `backend`, `gui`, `languageServer`, and `sectionSizingPolicy`
      - relevant requests returned `200`, including `GET /settings`, `GET /api/serverMode`, `GET /api/authRefreshStatus`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, and `GET /api/backendInitStatus`
      - no obvious visual regressions were observed in the visible settings shell or dict/param area
- Next action:
  - Continue the first retained-scene node renderer work by extracting deterministic block-frame mount packets from this live dict-area node-layout view before any Pixi node drawing lands.

## 2026-03-26 028

- Item: Extract deterministic block-frame mount packets from the live dict-area node-layout view.
- Status: `done`
- Details:
  - Added a pure typed block-frame packet boundary above the retained-scene node-layout view for the live dict/param canary path:
    - `frontend/src/components/Params/groupContainerBlockFramePackets.ts`
    - `frontend/src/components/Params/groupContainerBlockFramePackets.test.ts`
  - Updated the existing live node-layout view to expose the new ordered block-frame mount packets alongside the existing plain param-area lookups, while keeping the current DOM path behavior unchanged:
    - `frontend/src/components/Params/groupContainerNodeLayoutView.ts`
    - `frontend/src/components/Params/groupContainerNodeLayoutView.test.ts`
  - The new helper now deterministically:
    - emits ordered block-frame packets for the edge strip plus pinned/unpinned param areas
    - assigns stable frame ids and fixed-vs-grow mount metadata for future retained-scene mounting
    - preserves the existing plain `pinnedParamArea` / `unpinnedParamArea` node-layout view accessors so the live non-Pixi DOM path stays stable while the future scene renderer gains a real block-frame input
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerBlockFramePackets.test.ts src/components/Params/groupContainerNodeLayoutView.test.ts src/components/Params/GroupContainer.test.tsx`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
      - `/settings` loaded authenticated at `http://127.0.0.1:3044/settings`
      - the visible settings shell and dict/param area stayed structurally intact with no obvious clipping, overlap, or missing major content
      - representative visible labels and controls included `Project`, `Edit`, `Run`, `OVERVIEW`, `settings`, `Filter`, `TAG`, `All`, tag rows such as `sectionSizingPolicy`, `gui`, `backend`, `languageServer`, and `shortcuts`, plus bottom tabs including `Param Defaults` and `All Settings`
      - relevant requests returned `200`, including `api/loadSettings`, `api/backendInitStatus`, `api/authRefreshStatus`, `api/getDefaultConfigName`, `api/getFileBrowserRoot`, `api/loadAllProjectMetadata`, `api/getFolderContents`, `api/checkWorkspaceInitialized`, and `api/loadProjectConfig`
- Next action:
  - Continue the first retained-scene node renderer work by routing the live `GroupContainer` mount path through the new block-frame packets before any Pixi node drawing lands.

## 2026-03-26 029

- Item: Route the live `GroupContainer` DOM mount path through the ordered block-frame packets.
- Status: `done`
- Details:
  - Updated the production non-Pixi `GroupContainer` path to consume `liveDictAreaNodeLayoutView.blockFrames` directly instead of mounting the edge strip, pinned area, and unpinned area in a hardcoded sequence:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The live DOM path now stamps each mounted dict-area block with stable block-frame metadata from the packet boundary:
    - `data-dict-area-block-frame-id`
    - `data-dict-area-block-id`
    - `data-dict-area-block-mount-kind`
    - `data-dict-area-block-order-index`
  - Kept the current non-Pixi renderer behavior intact while switching the mount path over to the retained-scene block ordering:
    - edge strip still mounts only when present
    - pinned and unpinned param areas still use the existing DOM surfaces and measurement behavior
    - max nested depth still follows the same live param-area packets
  - Added focused render coverage for the block-frame-driven DOM mount order and metadata, and consolidated the existing test fixture setup:
    - `frontend/src/components/Params/GroupContainer.test.tsx`
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Params/GroupContainer.test.tsx src/components/Params/groupContainerNodeLayoutView.test.ts src/components/Params/groupContainerBlockFramePackets.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
      - `/settings` loaded authenticated at `http://127.0.0.1:3044/settings`
      - visible context included `All Settings`, `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, plus controls such as `Pan On Drag`, `Autosave`, `Grid Pattern`, and `Grid Color`
      - relevant requests returned `200`, including `GET /settings`, `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, and `POST /api/loadProjectConfig`
- Next action:
  - Continue the first retained-scene node renderer work from this block-frame-driven mount path, starting with the next bounded scene-owned dict-area block step before broad Pixi node drawing lands.

## 2026-03-26 030

- Item: Normalize the ordered dict-area block frames into explicit scene block kinds for the live mount path.
- Status: `done`
- Details:
  - Added a pure typed scene-block view above the ordered block-frame packets so the retained-scene mount path no longer has to branch directly on raw block-frame unions:
    - `frontend/src/components/Params/groupContainerSceneBlockView.ts`
    - `frontend/src/components/Params/groupContainerSceneBlockView.test.ts`
  - Updated the production non-Pixi `GroupContainer` path to consume the new explicit edge/pinned/unpinned scene block kinds instead of branching directly on `liveDictAreaNodeLayoutView.blockFrames`:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper preserves the existing non-Pixi behavior for:
    - normalizing the ordered block frames into explicit scene block kinds with stable mount metadata
    - deriving the same pinned/unpinned `maxNestedDepth` totals from the surviving block set
    - keeping the current DOM edge-strip and pinned/unpinned param-area surfaces intact while deepening the retained-scene mount contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerSceneBlockView.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
    - reused an already-authenticated tab instead of the bootstrap URL
    - `All Settings` was visible and the dict/param area still rendered normally
    - representative visible labels and controls included `Filter`, `Param Defaults`, `All Settings`, `minHeight`, `minWidth`, `Size Mode Height`, and `Size Mode Width`
    - relevant requests returned `200`, including `GET /settings`, `GET /api/serverMode`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/authRefreshStatus`, and `GET /api/backendInitStatus`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the first scene-native block renderer packet from this normalized dict-area scene block view before any broad Pixi node drawing lands.

## 2026-03-26 031

- Item: Extract the first scene-native block renderer packets from the normalized dict-area scene block view.
- Status: `done`
- Details:
  - Added a pure typed renderer-packet boundary above the normalized dict-area scene block view:
    - `frontend/src/components/Params/groupContainerSceneRendererPackets.ts`
    - `frontend/src/components/Params/groupContainerSceneRendererPackets.test.ts`
  - Updated the production non-Pixi `GroupContainer` path plus its block-mounted DOM surfaces to consume the new renderer packets instead of branching on the raw scene-block view payload:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper preserves the existing non-Pixi behavior for:
    - flattening explicit edge/pinned/unpinned scene blocks into deterministic renderer packets with stable mount metadata
    - keeping the pinned/unpinned max-nested-depth accounting on the same mount path while removing the remaining raw scene-block branching from `GroupContainer`
    - leaving the existing DOM edge-strip and pinned/unpinned param-area surfaces intact while exposing a cleaner future scene-renderer contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerSceneRendererPackets.test.ts src/components/Params/GroupContainer.test.tsx src/components/Params/groupContainerSceneBlockView.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
    - `/settings` loaded in the authenticated worktree session with `All Settings` visible
      - the dict/param area still rendered normally, with representative labels and controls including `defaultZoomLevel 1.0`, `Grid Color`, `Grid Pattern`, `Pan On Drag`, `Selection Mode`, `Dropzone Param`, `Nested Param`, `Password Param`, `Time Param`, and the `Size Mode Height` / `Size Mode Width` selectors
    - relevant requests returned `200`, including `/api/loadSettings`, `/api/authRefreshStatus`, `/api/loadProjectConfig`, `/api/getLatestLspDiagnostics`, `/api/getAIFollowSnapshot`, `/api/getListenerCoverage`, `/api/plugins/runtime`, `/api/getAgentProfiles`, `/api/getPromptTemplates`, `/api/getExternalAgentConfigs`, `/api/getExternalAgentHealth`, `/api/getEngineConfigs`, `/api/getTranscriptionProfiles`, `/api/getFileBrowserRoot`, `/api/getFolderContents`, and `/api/setTopLevelSectionLayout`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next bounded scene-owned block visual packet from this renderer-packet boundary before any broad Pixi node drawing lands.

## 2026-03-26 032

- Item: Extract the first scene-owned edge-strip visual packet from the dict-area renderer boundary.
- Status: `done`
- Details:
  - Added a pure typed visual-packet helper for the live dict-area edge strip:
    - `frontend/src/components/Params/groupContainerEdgeStripVisualPacket.ts`
    - `frontend/src/components/Params/groupContainerEdgeStripVisualPacket.test.ts`
  - Kept the current non-Pixi DOM edge-strip surface stable by routing `EdgesStrip` through the new visual packet instead of branching directly on raw port arrays and selection state:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - lifts input/output edge-strip ports into explicit visual columns with stable handle side/type metadata
    - carries per-port selection/selectability state for the input side without leaving that shaping inline in `EdgesStrip`
    - preserves the existing DOM edge-strip behavior while exposing a cleaner scene-owned visual contract for the first block-specific canary surface
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerEdgeStripVisualPacket.test.ts src/components/Params/GroupContainer.test.tsx src/components/Params/groupContainerSceneRendererPackets.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/edge-input-args-selection.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
      - `/settings` loaded authenticated at `http://127.0.0.1:3044/settings`
      - `All Settings` stayed visible and the dict/param shell rendered normally with representative controls including `Open section in floating window`, `Lock position and size`, `Minimize section`, `Delete section`, `Add arg`, and `Remove arg`
      - a distinct edge-strip row/handle was not visible in the current viewport, so the CDP pass verified the visible settings shell and dict/param surface rather than the edge-strip block itself
      - relevant requests returned `200`, including `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadSettings`, `POST /api/getDefaultConfigName`, `POST /api/loadProjectConfig`, `POST /api/setActiveViewMode`, and `POST /api/setTopLevelSectionLayout`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next bounded scene-owned block visual packet from the renderer boundary, starting with the pinned param-area block before any broad Pixi node drawing lands.

## 2026-03-26 033

- Item: Extract the pinned param-area visual packet from the dict-area renderer boundary.
- Status: `done`
- Details:
  - Added a pure typed visual-packet helper for the live pinned param-area block:
    - `frontend/src/components/Params/groupContainerPinnedParamAreaVisualPacket.ts`
    - `frontend/src/components/Params/groupContainerPinnedParamAreaVisualPacket.test.ts`
  - Kept the current non-Pixi pinned DOM surface stable by routing `GetPinnedParams` / `PinnedParamsArea` through the new visual packet instead of passing the raw renderer packet fields through multiple props:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - lifts the pinned block header into an explicit visual header payload
    - carries the pinned list metadata and row packets in one stable visual contract
    - preserves the existing DOM mount metadata and bottom-rounding behavior while exposing a cleaner scene-owned surface for the pinned canary block
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerPinnedParamAreaVisualPacket.test.ts src/components/Params/GroupContainer.test.tsx src/components/Params/groupContainerSceneRendererPackets.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
      - `/settings` loaded in the authenticated worktree session with `All Settings` visible and selected
      - the dict/param shell rendered normally with representative labels and controls intact, including `defaultZoomLevel`, `Grid Color`, `Pan On Drag`, `basedpyright analysis`, and the bottom tabs `Core`, `Section Defaults...`, `Param Defaults`, and `All Settings`
      - no obvious clipping, overlap, or missing content was visible in the current viewport
      - relevant requests returned `200`, including `api/authRefreshStatus`, `api/loadSettings`, `api/backendInitStatus`, `api/loadProjectConfig`, and `api/setTopLevelSectionLayout`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next bounded scene-owned block visual packet from the renderer boundary, starting with the unpinned param-area block before any broad Pixi node drawing lands.

## 2026-03-26 034

- Item: Extract the unpinned param-area visual packet from the dict-area renderer boundary.
- Status: `done`
- Details:
  - Added a pure typed visual-packet helper for the live unpinned param-area block:
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaVisualPacket.ts`
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaVisualPacket.test.ts`
  - Kept the current non-Pixi unpinned DOM surface stable by routing `GetUnpinnedParams` / `UnpinnedParamsArea` through the new visual packet instead of passing raw renderer-packet fields directly into the DOM mount path:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - lifts unpinned list metadata and row packets into one explicit visual contract
    - carries the unpinned min-height application policy through a dedicated container payload
    - preserves the existing scrollable unpinned DOM mount behavior while exposing a cleaner scene-owned surface for the remaining canary block
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerUnpinnedParamAreaVisualPacket.test.ts src/components/Params/GroupContainer.test.tsx src/components/Params/groupContainerSceneRendererPackets.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
    - `/settings` loaded in the authenticated worktree session with `All Settings` visible
    - the visible settings stack and dict/param area rendered normally after the unpinned visual-packet routing, with no obvious overlap, clipping, or missing content in the viewport
    - representative visible labels and controls included `All Settings`, `Param Defaults`, `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `aspectRatio`, `attachedTerminalSectionId`, `code`, `Is Frozen`, `Is Minimized`, `Position And Size Locked`, `Core Name Editable`, `Core Name Type`, `defaultVal`, `typeAnnotation`, and `value`
    - relevant requests returned `200`, including `api/loadProjectConfig`, `api/getLatestLspDiagnostics`, `api/getAIFollowSnapshot`, `api/getListenerCoverage`, `api/plugins/runtime`, `api/llm/apiKeys`, `api/llm/config`, `api/getAgentProfiles`, `api/getPromptTemplates`, `api/getExternalAgentConfigs`, `api/getExternalAgentHealth`, `api/getEngineConfigs`, `api/getTranscriptionProfiles`, `api/setProjectChatWindowingState`, `api/getFileBrowserRoot`, `api/getFolderContents`, `api/setTopLevelSectionLayout`, and `api/setActiveViewMode`
- Next action:
  - Continue the first retained-scene node renderer work by composing the extracted edge, pinned, and unpinned block visuals into a higher-level dict-area node visual packet before any broad Pixi node drawing lands.

## 2026-03-26 035

- Item: Compose the extracted dict-area block visuals into a node-level visual packet for the live mount path.
- Status: `done`
- Details:
  - Added a pure typed node-level visual packet helper above the existing edge, pinned, and unpinned block visuals:
    - `frontend/src/components/Params/groupContainerNodeVisualPacket.ts`
    - `frontend/src/components/Params/groupContainerNodeVisualPacket.test.ts`
  - Exported the shared edge-port input type from the edge-strip visual helper so the new node-level packet can compose the live edge-strip payload without rebuilding ad hoc shapes:
    - `frontend/src/components/Params/groupContainerEdgeStripVisualPacket.ts`
  - Updated the production non-Pixi `GroupContainer` path to build one live dict-area node visual packet and route the current DOM mount surfaces through it instead of composing each block visual independently at the mount site:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper preserves the existing non-Pixi behavior for:
    - keeping the ordered edge/pinned/unpinned block mount sequence deterministic while exposing one higher-level node visual contract
    - deriving the edge-strip visual state from the same selected-port and connectability inputs while suppressing empty edge visuals
    - leaving the existing DOM edge-strip and pinned/unpinned param-area surfaces intact while deepening the retained-scene packet boundary above the block visuals
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerNodeVisualPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
    - `/settings` loaded authenticated at `http://127.0.0.1:3044/settings`
    - `All Settings` was visible and the settings/dict/param stack rendered normally without obvious clipping, overlap, or missing content
    - representative visible labels and controls included `Core`, `Param Defaults`, `All Settings`, `Grid Color`, `Pan On Drag`, and `Zoom On Scroll`
    - relevant requests returned `200`, including `/api/serverMode`, `/api/loadSettings`, `/api/backendInitStatus`, `/api/authRefreshStatus`, `/api/loadProjectConfig`, and `/api/getLatestLspDiagnostics`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next node-level scene-owned packet above this dict-area visual boundary before any broad Pixi node drawing lands.

## 2026-03-26 036

- Item: Lift the live dict-area scene and visual composition into one higher-level node scene packet boundary.
- Status: `done`
- Details:
  - Added a pure typed node-scene packet helper above the existing live param-area scene packet and node visual packet layers:
    - `frontend/src/components/Params/groupContainerNodeScenePacket.ts`
    - `frontend/src/components/Params/groupContainerNodeScenePacket.test.ts`
  - Updated the production non-Pixi `GroupContainer` path to build one live dict-area node scene packet and consume its `visualPacket` instead of stitching together the scene, layout, block, renderer, and visual helpers inline:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - composes the live edge-strip scene inputs, live param-area scene packet, and higher-level node visual packet from one typed boundary
    - keeps the current DOM mount path stable while hiding the intermediate scene/layout/block/renderer helper chain behind one deeper module
    - leaves the existing edge-strip and pinned/unpinned DOM surfaces intact while exposing both `scenePacket` and `visualPacket` from the same node-level contract for the future retained-scene renderer
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerNodeScenePacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
    - `/settings` loaded authenticated at `http://127.0.0.1:3044/settings`
    - `All Settings` was visible and the visible settings/dict-param stack rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `shortcuts`, `gui`, `backend`, `sectionSizingPolicy`, `languageServer`, `defaultZoomLevel 1.0`, `Grid Color`, `Pan On Drag`, and `Auto Refetch Callable Params On LSP Mismatch`
    - relevant requests returned `200`, including `/api/authRefreshStatus`, `/api/loadSettings`, `/api/loadProjectConfig`, `/api/getDefaultConfigName`, and `/api/llm/apiKeys`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next higher-level scene-owned packet above `groupContainerNodeScenePacket.ts`, using this deeper node boundary as the single live dict-area composition input before any broad Pixi node drawing lands.

## 2026-03-26 037

- Item: Lift the live dict-area mount props into one higher-level node surface packet above the node-scene boundary.
- Status: `done`
- Details:
  - Added a pure typed node-surface packet helper above the existing node-scene boundary:
    - `frontend/src/components/Params/groupContainerNodeSurfacePacket.ts`
    - `frontend/src/components/Params/groupContainerNodeSurfacePacket.test.ts`
  - Updated the production non-Pixi `GroupContainer` mount path plus its block-mounted DOM surfaces to consume the new node-surface packet instead of re-stitching block-specific mount props inline:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - lifts the edge, pinned, and unpinned visual blocks into stable surface packets with the section-level background/style/mount context required by the current DOM surfaces
    - keeps the underlying `edgeStrip` and `scenePacket` available from the same higher-level boundary so the future retained-scene renderer can consume one deeper dict-area input
    - preserves the existing non-Pixi DOM mount order and block behavior while removing the remaining per-block prop stitching from the `GroupContainer` mount site
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerNodeSurfacePacket.test.ts src/components/Params/GroupContainer.test.tsx src/components/Params/groupContainerNodeScenePacket.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
    - `/settings` loaded in the authenticated worktree session with `All Settings` visible
    - the visible settings/dict-param area rendered normally with no obvious clipping, overlap, or missing content in the viewport
    - representative visible labels and controls included `shortcuts`, `gui`, `backend`, `sectionSizingPolicy`, `languageServer`, `Grid Color`, `Grid Pattern`, `Pan On Drag`, `Auto Backup`, and `Autosave`
    - representative backend/settings requests returned `200`, including `POST /api/loadProjectConfig`, `GET /api/llm/apiKeys`, `GET /api/llm/config`, `GET /api/getAgentProfiles`, and `GET /api/getEngineConfigs`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next higher-level scene-owned draw packet above `groupContainerNodeSurfacePacket.ts`, using this node-surface boundary as the single live dict-area surface input before any broad Pixi node drawing lands.

## 2026-03-26 038

- Item: Lift the live dict-area surface packet into one higher-level node draw packet above the node-surface boundary.
- Status: `done`
- Details:
  - Added a pure typed node-draw packet helper above the existing node-surface boundary:
    - `frontend/src/components/Params/groupContainerNodeDrawPacket.ts`
    - `frontend/src/components/Params/groupContainerNodeDrawPacket.test.ts`
  - Updated the production non-Pixi `GroupContainer` mount path to consume the new node-draw packet instead of branching directly on the node-surface packet blocks:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - lifts the ordered edge, pinned, and unpinned surface blocks into stable draw packets with explicit block ids plus mount metadata
    - keeps the underlying surface packets attached to the same higher-level draw boundary so the current DOM mount path stays stable while the future retained-scene renderer gets one deeper input
    - preserves the existing non-Pixi DOM mount order and block behavior while removing the remaining direct node-surface block branching from `GroupContainer`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerNodeDrawPacket.test.ts src/components/Params/GroupContainer.test.tsx src/components/Params/groupContainerNodeSurfacePacket.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
    - `/settings` loaded authenticated with `All Settings` visible
    - the visible dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative requests returned `200`, including `/api/loadSettings`, `/api/loadProjectConfig`, `/api/authRefreshStatus`, `/api/plugins/runtime`, and `/api/llm/config`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the first block-specific scene-owned draw packet from `groupContainerNodeDrawPacket.ts`, starting with the edge-strip block before any broad Pixi node drawing lands.

## 2026-03-26 039

- Item: Extract the edge-strip block into the first block-specific scene-owned draw packet helper.
- Status: `done`
- Details:
  - Added a pure typed draw-packet helper for the live dict-area edge strip:
    - `frontend/src/components/Params/groupContainerEdgeStripDrawPacket.ts`
    - `frontend/src/components/Params/groupContainerEdgeStripDrawPacket.test.ts`
  - Updated the higher-level node draw packet boundary to compose through the new edge-strip helper instead of building the edge draw block inline:
    - `frontend/src/components/Params/groupContainerNodeDrawPacket.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the edge-strip surface block into one explicit draw packet with stable `blockId`, `kind`, and mount metadata
    - keeping the higher-level node draw packet as a composition boundary instead of a mixed composition-plus-edge-shaping module
    - leaving the current DOM edge-strip mount path intact while deepening the future retained-scene block-specific draw contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerEdgeStripDrawPacket.test.ts src/components/Params/groupContainerNodeDrawPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check after one allowed lifecycle self-recovery with `./aireset.sh`
    - restart reassigned the worktree session to `http://127.0.0.1:3045/` and `http://127.0.0.1:8045`
    - bootstrap via `http://127.0.0.1:8045/__setta__/bootstrap#token=...` redirected into the frontend successfully
    - `/settings` loaded with `All Settings` visible and the dict/param area still rendered normally
    - representative visible labels and controls included `All Settings`, `Param Defaults`, `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Add arg`, `Remove arg`, `Pin selected args`, `Convert to edge connectors`, `Grid Color`, `Grid Pattern`, `Pan On Drag`, `Pan On Scroll Mode`, `Wire Color`, and `showParamUITypeTabShortcut`
    - representative requests returned `200`, including `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `GET /api/getAgentRuns`, and `GET /api/plugins/runtime`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific scene-owned draw packet from `groupContainerNodeDrawPacket.ts`, starting with the pinned param-area block before any broad Pixi node drawing lands.

## 2026-03-26 040

- Item: Extract the pinned param-area block into the next block-specific scene-owned draw packet helper.
- Status: `done`
- Details:
  - Added a pure typed draw-packet helper for the live dict-area pinned param area:
    - `frontend/src/components/Params/groupContainerPinnedParamAreaDrawPacket.ts`
    - `frontend/src/components/Params/groupContainerPinnedParamAreaDrawPacket.test.ts`
  - Updated the higher-level node draw packet boundary to compose through the new pinned helper instead of building the pinned draw block inline:
    - `frontend/src/components/Params/groupContainerNodeDrawPacket.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the pinned param-area surface block into one explicit draw packet with stable `blockId`, `kind`, and mount metadata
    - keeping the higher-level node draw packet as a composition boundary instead of a mixed composition-plus-pinned-block-shaping module
    - leaving the current DOM pinned param-area mount path intact while deepening the future retained-scene block-specific draw contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerPinnedParamAreaDrawPacket.test.ts src/components/Params/groupContainerNodeDrawPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
    - `/settings` loaded authenticated at `http://127.0.0.1:3044/settings`
    - `All Settings` was visible and the dict/param stack rendered normally without obvious clipping, overlap, or missing content
    - representative visible labels and controls included `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, `All Settings`, `defaultZoomLevel`, `Grid Color`, `maxZoom`, and `minWidth`
    - relevant backend/settings requests returned `200`, including `/api/loadProjectConfig`, `/api/getLatestLspDiagnostics`, `/api/getAIFollowSnapshot`, `/api/getListenerCoverage`, `/api/plugins/runtime`, `/api/llm/apiKeys`, `/api/llm/config`, `/api/getAgentProfiles`, `/api/getPromptTemplates`, `/api/getExternalAgentConfigs`, `/api/getExternalAgentHealth`, `/api/getEngineConfigs`, `/api/getTranscriptionProfiles`, `/api/setProjectChatWindowingState`, `/api/getFileBrowserRoot`, `/api/getAgentRuns`, `/api/getFolderContents`, and `/api/setTopLevelSectionLayout`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific scene-owned draw packet from `groupContainerNodeDrawPacket.ts`, starting with the unpinned param-area block before any broad Pixi node drawing lands.

## 2026-03-26 041

- Item: Extract the unpinned param-area block into the next block-specific scene-owned draw packet helper.
- Status: `done`
- Details:
  - Added a pure typed draw-packet helper for the live dict-area unpinned param area:
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaDrawPacket.ts`
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaDrawPacket.test.ts`
  - Updated the higher-level node draw packet boundary to compose through the new unpinned helper instead of building the unpinned draw block inline:
    - `frontend/src/components/Params/groupContainerNodeDrawPacket.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the unpinned param-area surface block into one explicit draw packet with stable `blockId`, `kind`, and mount metadata
    - keeping the higher-level node draw packet as a composition boundary instead of a mixed composition-plus-unpinned-block-shaping module
    - leaving the current DOM unpinned param-area mount path intact while deepening the future retained-scene block-specific draw contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerUnpinnedParamAreaDrawPacket.test.ts src/components/Params/groupContainerNodeDrawPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
    - `/settings` loaded authenticated at `http://127.0.0.1:3044/settings`
    - `All Settings` was visible and `Param Defaults` remained selected while the visible dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `Auto Refetch Callable Params On LSP Mismatch`, `Auto Backup`, `Autosave`, `Clear Terminal Before Marking As Ready`, `Rename Refactor Mode`, `Run Snapshot Mode`, and `Save Rendered Values`
    - relevant requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, and `GET /api/serverMode`
- Next action:
  - Continue the first retained-scene node renderer work by composing the edge, pinned, and unpinned block-specific draw helpers into the next higher-level scene-owned painter boundary above `groupContainerNodeDrawPacket.ts` before any broad Pixi node drawing lands.

## 2026-03-26 042

- Item: Compose the edge, pinned, and unpinned block-specific draw helpers into the next higher-level scene-owned painter boundary above `groupContainerNodeDrawPacket.ts`.
- Status: `done`
- Details:
  - Added a pure typed node-level painter packet helper above the existing block-specific draw helpers:
    - `frontend/src/components/Params/groupContainerNodePainterPacket.ts`
    - `frontend/src/components/Params/groupContainerNodePainterPacket.test.ts`
  - Updated the production non-Pixi `GroupContainer` mount path and its DOM block surfaces to consume the new node-level painter packet instead of branching directly on the node draw packet:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - composes the extracted edge-strip, pinned, and unpinned draw helpers into one higher-level painter contract
    - exposes the scene-owned visual payload plus the current DOM-facing style/mount context from one node-level boundary
    - keeps the existing non-Pixi DOM edge-strip and pinned/unpinned param-area surfaces intact while deepening the future retained-scene painter contract above `groupContainerNodeDrawPacket.ts`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerNodePainterPacket.test.ts src/components/Params/GroupContainer.test.tsx src/components/Params/groupContainerNodeDrawPacket.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
    - `/settings` loaded authenticated at `http://127.0.0.1:3044/settings`
    - `All Settings` was visible and the settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content in the viewport
    - relevant requests returned `200`, including `/api/serverMode`, `/api/authRefreshStatus`, `/api/loadSettings`, `/api/backendInitStatus`, `/api/getDefaultConfigName`, and `/api/loadProjectConfig`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the first block-specific scene-owned painter helper from `groupContainerNodePainterPacket.ts`, starting with the edge-strip block before any broad Pixi node drawing lands.

## 2026-03-26 043

- Item: Extract the edge-strip block into the first block-specific scene-owned painter helper.
- Status: `done`
- Details:
  - Added a pure typed painter-packet helper for the live dict-area edge strip:
    - `frontend/src/components/Params/groupContainerEdgeStripPainterPacket.ts`
    - `frontend/src/components/Params/groupContainerEdgeStripPainterPacket.test.ts`
  - Updated the higher-level node painter packet boundary to compose through the new edge-strip helper instead of building the edge-strip painter block inline:
    - `frontend/src/components/Params/groupContainerNodePainterPacket.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the edge-strip draw block into one explicit painter packet with stable `blockId`, `kind`, and mount metadata
    - keeping the higher-level node painter packet as a composition boundary instead of a mixed composition-plus-edge-strip-shaping module
    - leaving the current DOM edge-strip mount path intact while deepening the future retained-scene block-specific painter contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerEdgeStripPainterPacket.test.ts src/components/Params/groupContainerNodePainterPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
    - bootstrap redirected into `http://127.0.0.1:3044/?__setta_backend_origin=http%3A%2F%2F127.0.0.1%3A8044`, then `/settings` loaded authenticated at `http://127.0.0.1:3044/settings`
    - the visible settings shell and dict/param area rendered normally with representative context including `Project`, `Edit`, `Run`, the worktree label `pixijs-rewrite`, bottom tabs including `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, and `All Settings`, plus visible rows such as `Grid Color`, `Grid Pattern`, `Pan On Scroll Mode`, `selectionKeyCode`, and `diagnosticSeverityOverrides`
    - no obvious clipping, overlap, or missing content was observed in the visible viewport
    - representative requests returned `200`, including `GET /api/backendInitStatus`, `POST /api/loadSettings`, and `GET /api/authRefreshStatus`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific scene-owned painter helper from `groupContainerNodePainterPacket.ts`, starting with the pinned param-area block before any broad Pixi node drawing lands.

## 2026-03-26 044

- Item: Extract the pinned param-area block into the next block-specific scene-owned painter helper.
- Status: `done`
- Details:
  - Added a pure typed painter-packet helper for the live dict-area pinned param area:
    - `frontend/src/components/Params/groupContainerPinnedParamAreaPainterPacket.ts`
    - `frontend/src/components/Params/groupContainerPinnedParamAreaPainterPacket.test.ts`
  - Updated the higher-level node painter packet boundary to compose through the new pinned helper instead of building the pinned painter block inline:
    - `frontend/src/components/Params/groupContainerNodePainterPacket.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the pinned param-area draw block into one explicit painter packet with stable `blockId`, `kind`, and mount metadata
    - keeping the higher-level node painter packet as a composition boundary instead of a mixed composition-plus-pinned-block-shaping module
    - leaving the current DOM pinned param-area mount path intact while deepening the future retained-scene block-specific painter contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerPinnedParamAreaPainterPacket.test.ts src/components/Params/groupContainerNodePainterPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
    - `/settings` loaded authenticated at `http://127.0.0.1:3044/settings`
    - `All Settings` was visible and the settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, `All Settings`, `Grid Color`, `Pan On Drag`, `Auto Refetch Callable Params On LSP Mismatch`, and `Auto Backup`
    - representative requests returned `200`, including `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/authRefreshStatus`, and `POST /api/getLatestLspDiagnostics`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific scene-owned painter helper from `groupContainerNodePainterPacket.ts`, starting with the unpinned param-area block before any broad Pixi node drawing lands.

## 2026-03-26 045

- Item: Extract the unpinned param-area block into the next block-specific scene-owned painter helper.
- Status: `done`
- Details:
  - Added a pure typed painter-packet helper for the live dict-area unpinned param area:
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaPainterPacket.ts`
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaPainterPacket.test.ts`
  - Updated the higher-level node painter packet boundary to compose through the new unpinned helper instead of building the unpinned painter block inline:
    - `frontend/src/components/Params/groupContainerNodePainterPacket.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the unpinned param-area draw block into one explicit painter packet with stable `blockId`, `kind`, and mount metadata
    - keeping the higher-level node painter packet as a composition boundary instead of a mixed composition-plus-unpinned-block-shaping module
    - leaving the current DOM unpinned param-area mount path intact while deepening the future retained-scene block-specific painter contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerUnpinnedParamAreaPainterPacket.test.ts src/components/Params/groupContainerNodePainterPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
    - `/settings` loaded authenticated with `All Settings` visible alongside `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, and `Param Defaults`
    - representative visible controls included `toggle agentic edges`, `toggle arg edges`, `Grid Color`, `Pan On Drag`, `Zoom On Scroll`, and the chat actions area
    - no obvious clipping, overlap, or missing content was observed in the visible viewport
    - relevant requests returned `200`, including `GET /api/authRefreshStatus`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `POST /api/loadProjectConfig`, and `GET /api/serverMode`
- Next action:
  - Continue the first retained-scene node renderer work by composing the edge, pinned, and unpinned block-specific painter helpers into the next higher-level scene-owned canvas packet above `groupContainerNodePainterPacket.ts` before any broad Pixi node drawing lands.

## 2026-03-26 046

- Item: Lift the live dict-area painter boundary into one higher-level node canvas packet above `groupContainerNodePainterPacket.ts`.
- Status: `done`
- Details:
  - Added a pure typed node-canvas packet helper above the existing node painter boundary:
    - `frontend/src/components/Params/groupContainerNodeCanvasPacket.ts`
    - `frontend/src/components/Params/groupContainerNodeCanvasPacket.test.ts`
  - Updated the production non-Pixi `GroupContainer` mount path to consume the new node-canvas packet instead of branching directly on the node painter packet:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - lifts the ordered edge, pinned, and unpinned painter blocks into one `domBlocks` boundary for the current live DOM path
    - keeps the current DOM block mount order and max-nested-depth handling stable while hiding the node painter composition inside one deeper helper
    - exposes the retained-scene `scenePacket` plus edge-strip scene data from the same node-level boundary so the future canvas renderer can consume one deeper dict-area input
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerNodeCanvasPacket.test.ts src/components/Params/GroupContainer.test.tsx src/components/Params/groupContainerNodePainterPacket.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
    - `/settings` loaded authenticated at `http://127.0.0.1:3044/settings`
    - `All Settings` was visible and active, and the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, `All Settings`, `toggle agentic edges`, `toggle arg edges`, `toggle snap to grid`, `Show chat windows`, and the `Create project` / `Summarize codebase` / `Plan next steps` chat controls
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, and `POST /api/getLatestLspDiagnostics`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the first block-specific scene-owned canvas helper from `groupContainerNodeCanvasPacket.ts`, starting with the edge-strip block before any broad Pixi node drawing lands.

## 2026-03-26 047

- Item: Extract the edge-strip block into the first block-specific scene-owned canvas helper.
- Status: `done`
- Details:
  - Added a pure typed canvas-packet helper for the live dict-area edge strip:
    - `frontend/src/components/Params/groupContainerEdgeStripCanvasPacket.ts`
    - `frontend/src/components/Params/groupContainerEdgeStripCanvasPacket.test.ts`
  - Updated the higher-level node canvas packet boundary to compose through the new edge-strip canvas helper instead of passing the edge-strip painter block through inline:
    - `frontend/src/components/Params/groupContainerNodeCanvasPacket.ts`
  - Updated the production non-Pixi `GroupContainer` edge-strip mount site to consume the new canvas-specific edge-strip packet type while keeping the current DOM path unchanged:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the edge-strip painter block into one explicit canvas packet with stable `blockId`, `kind`, and mount metadata
    - keeping the higher-level node canvas packet as a composition boundary instead of a mixed composition-plus-edge-strip-shaping module
    - leaving the current DOM edge-strip mount path intact while deepening the future retained-scene block-specific canvas contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerEdgeStripCanvasPacket.test.ts src/components/Params/groupContainerNodeCanvasPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
    - bootstrap authenticated into `/home`, then `/settings` loaded with `All Settings` visible at `http://127.0.0.1:3044/settings`
    - the visible settings shell and dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `defaultZoomLevel`, `Grid Color`, `Grid Pattern`, `Pan On Drag`, `Zoom On Scroll`, plus edge-strip-related top-bar toggles `toggle agentic edges`, `toggle arg edges`, and `toggle shared chat edge mode`
    - a dedicated edge-strip subsection was not visible in the current viewport/session, so the CDP pass verified the authenticated settings/dict-param surface rather than a separate edge-strip row
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `GET /api/plugins/runtime`, and `GET /api/getEngineConfigs`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific scene-owned canvas helper from `groupContainerNodeCanvasPacket.ts`, starting with the pinned param-area block before any broad Pixi node drawing lands.

## 2026-03-26 048

- Item: Extract the pinned param-area block into the next block-specific scene-owned canvas helper.
- Status: `done`
- Details:
  - Added a pure typed canvas-packet helper for the live dict-area pinned param area:
    - `frontend/src/components/Params/groupContainerPinnedParamAreaCanvasPacket.ts`
    - `frontend/src/components/Params/groupContainerPinnedParamAreaCanvasPacket.test.ts`
  - Updated the higher-level node canvas packet boundary to compose through the new pinned helper instead of passing the pinned painter block through inline:
    - `frontend/src/components/Params/groupContainerNodeCanvasPacket.ts`
  - Updated the production non-Pixi `GroupContainer` pinned mount site to consume the new canvas-specific pinned packet type while keeping the current DOM path unchanged:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the pinned param-area painter block into one explicit canvas packet with stable `blockId`, `kind`, and mount metadata
    - keeping the higher-level node canvas packet as a composition boundary instead of a mixed composition-plus-pinned-block-shaping module
    - leaving the current DOM pinned param-area mount path intact while deepening the future retained-scene block-specific canvas contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerPinnedParamAreaCanvasPacket.test.ts src/components/Params/groupContainerNodeCanvasPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
    - `/settings` loaded authenticated at `http://127.0.0.1:3044/settings`
    - `All Settings` was visible in the bottom tab strip and the visible dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `Core`, `Section Defaults Structure and Code`, `Param Defaults`, `All Settings`, `CREATE PROJECT`, `SUMMARIZE CODEBASE`, and `PLAN NEXT STEPS`
    - representative requests returned `200`, including `GET /api/authRefreshStatus`, `GET /api/backendInitStatus`, `POST /api/loadSettings`, and `POST /api/loadProjectConfig`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific scene-owned canvas helper from `groupContainerNodeCanvasPacket.ts`, starting with the unpinned param-area block before any broad Pixi node drawing lands.

## 2026-03-26 049

- Item: Extract the unpinned param-area block into the next block-specific scene-owned canvas helper.
- Status: `done`
- Details:
  - Added a pure typed canvas-packet helper for the live dict-area unpinned param area:
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaCanvasPacket.ts`
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaCanvasPacket.test.ts`
  - Updated the higher-level node canvas packet boundary to compose through the new unpinned helper instead of passing the unpinned painter block through inline:
    - `frontend/src/components/Params/groupContainerNodeCanvasPacket.ts`
  - Updated the production non-Pixi `GroupContainer` unpinned mount site to consume the new canvas-specific unpinned packet type while keeping the current DOM path unchanged:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the unpinned param-area painter block into one explicit canvas packet with stable `blockId`, `kind`, and mount metadata
    - keeping the higher-level node canvas packet as a composition boundary instead of a mixed composition-plus-unpinned-block-shaping module
    - leaving the current DOM unpinned param-area mount path intact while deepening the future retained-scene block-specific canvas contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerUnpinnedParamAreaCanvasPacket.test.ts src/components/Params/groupContainerNodeCanvasPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
    - `/settings` loaded authenticated with `All Settings` visible
    - the visible dict/param area rendered normally after the unpinned canvas packet extraction, with representative labels and controls including `Param Defaults`, `Auto Refetch Callable Params On LSP Mismatch`, `Auto Backup`, `Autosave`, `Grid Color`, `Pan On Drag`, `Show Grid Lines`, and `Time Param` with `minHeight 32.0` and `minWidth 200.0`
    - relevant requests returned `200`, including `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAIFollowSnapshot`, `POST /api/getListenerCoverage`, `GET /api/plugins/runtime`, `GET /api/llm/apiKeys`, `GET /api/llm/config`, `GET /api/getAgentProfiles`, `GET /api/getPromptTemplates`, `GET /api/getExternalAgentConfigs`, `GET /api/getExternalAgentHealth`, `GET /api/getEngineConfigs`, `GET /api/getTranscriptionProfiles`, `POST /api/setProjectChatWindowingState`, `POST /api/getFileBrowserRoot`, `GET /api/getAgentRuns`, `POST /api/getFolderContents`, and `POST /api/setTopLevelSectionLayout`
- Next action:
  - Continue the first retained-scene node renderer work by composing the edge, pinned, and unpinned block-specific canvas helpers into the next higher-level scene-owned packet above `groupContainerNodeCanvasPacket.ts` before any broad Pixi node drawing lands.

## 2026-03-26 050

- Item: Compose the edge, pinned, and unpinned block-specific canvas helpers into the next higher-level scene-owned mount packet above `groupContainerNodeCanvasPacket.ts`.
- Status: `done`
- Details:
  - Added a pure typed node-level mount packet helper above the existing block-specific canvas helpers:
    - `frontend/src/components/Params/groupContainerNodeMountPacket.ts`
    - `frontend/src/components/Params/groupContainerNodeMountPacket.test.ts`
  - Updated the production non-Pixi `GroupContainer` mount path to consume the new node-level mount packet instead of composing the node draw plus canvas packet chain inline:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - composes the extracted edge-strip, pinned, and unpinned canvas helpers into one higher-level mount contract for the live dict-area DOM path
    - keeps the current `scenePacket`, `edgeStrip`, and `maxNestedDepth` available from the same node-level boundary so the future retained-scene renderer can consume one deeper dict-area input
    - preserves the existing non-Pixi DOM mount order and block behavior while removing the remaining node-surface to node-canvas packet stitching from `GroupContainer`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerNodeMountPacket.test.ts src/components/Params/GroupContainer.test.tsx src/components/Params/groupContainerNodeCanvasPacket.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
    - `/settings` loaded authenticated on the current `3044/8044` worktree session
    - visible settings shell context included `settings`, `Filter`, `Tag`, `Param Defaults`, and `All Settings`
    - the dict/param area rendered normally with representative controls including `Dropzone Param`, `Nested Param`, `Password Param`, `Rotary Param`, `Slider Param`, `Switch Param`, `Text Area Param`, and their `Size Mode` comboboxes
    - relevant requests returned `200`, including `POST /api/loadSettings`, `GET /api/authRefreshStatus`, `GET /api/backendInitStatus`, and `POST /api/loadProjectConfig`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the first block-specific scene-owned mount helper from `groupContainerNodeMountPacket.ts`, starting with the edge-strip block before any broad Pixi node drawing lands.

## 2026-03-26 051

- Item: Extract the edge-strip block into the first block-specific scene-owned mount helper.
- Status: `done`
- Details:
  - Added a pure typed mount-packet helper for the live dict-area edge strip:
    - `frontend/src/components/Params/groupContainerEdgeStripMountPacket.ts`
    - `frontend/src/components/Params/groupContainerEdgeStripMountPacket.test.ts`
  - Updated the higher-level node mount packet boundary to compose through the new edge-strip helper instead of passing the edge-strip canvas packet through inline:
    - `frontend/src/components/Params/groupContainerNodeMountPacket.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the edge-strip canvas block into one explicit mount packet with stable `blockId`, `kind`, and mount metadata
    - keeping the higher-level node mount packet as a composition boundary instead of a mixed composition-plus-edge-strip-shaping module
    - leaving the current DOM edge-strip mount path intact while deepening the future retained-scene block-specific mount contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerEdgeStripMountPacket.test.ts src/components/Params/groupContainerNodeMountPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
    - after bootstrapping, `/settings` rendered normally and `All Settings` was visible
    - the visible settings/dict-param area looked structurally intact with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `settings`, `shortcuts`, `backend`, `sectionSizingPolicy`, `gui`, `languageServer`, and the `All` filter control
    - relevant network responses on a fresh reload returned `200`, including `GET /settings`, `GET /index.css`, `GET /@vite/client`, `GET /src/index.tsx`, `GET /@react-refresh`, and `GET /src/App.tsx`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific scene-owned mount helper from `groupContainerNodeMountPacket.ts`, starting with the pinned param-area block before any broad Pixi node drawing lands.

## 2026-03-26 052

- Item: Extract the pinned param-area block into the next block-specific scene-owned mount helper.
- Status: `done`
- Details:
  - Added a pure typed mount-packet helper for the live dict-area pinned param area:
    - `frontend/src/components/Params/groupContainerPinnedParamAreaMountPacket.ts`
    - `frontend/src/components/Params/groupContainerPinnedParamAreaMountPacket.test.ts`
  - Updated the higher-level node mount packet boundary to compose through the new pinned helper instead of passing the pinned canvas packet through unchanged:
    - `frontend/src/components/Params/groupContainerNodeMountPacket.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the pinned param-area canvas block into one explicit mount packet with stable `blockId`, `kind`, and mount metadata
    - keeping the higher-level node mount packet as a composition boundary instead of a mixed composition-plus-pinned-block-shaping module
    - leaving the current DOM pinned param-area mount path intact while deepening the future retained-scene block-specific mount contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerPinnedParamAreaMountPacket.test.ts src/components/Params/groupContainerNodeMountPacket.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
    - `/settings` loaded without needing bootstrap auth and `All Settings` was visible
    - the visible settings/dict-param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels included `settings`, `backend`, `languageServer`, `sectionSizingPolicy`, `gui`, and `shortcuts`
    - relevant requests returned `200`, including `GET /api/getAgentRuns` and `POST /api/getFolderContents`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific scene-owned mount helper from `groupContainerNodeMountPacket.ts`, starting with the unpinned param-area block before any broad Pixi node drawing lands.

## 2026-03-26 053

- Item: Extract the unpinned param-area block into the next block-specific scene-owned mount helper.
- Status: `done`
- Details:
  - Added a pure typed mount-packet helper for the live dict-area unpinned param area:
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaMountPacket.ts`
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaMountPacket.test.ts`
  - Updated the higher-level node mount packet boundary to compose through the new unpinned helper instead of passing the unpinned canvas packet through unchanged:
    - `frontend/src/components/Params/groupContainerNodeMountPacket.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the unpinned param-area canvas block into one explicit mount packet with stable `blockId`, `kind`, and mount metadata
    - keeping the higher-level node mount packet as a composition boundary instead of a mixed composition-plus-unpinned-block-shaping module
    - leaving the current DOM unpinned param-area mount path intact while deepening the future retained-scene block-specific mount contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerUnpinnedParamAreaMountPacket.test.ts src/components/Params/groupContainerNodeMountPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
    - verified the existing authenticated worktree session at smaller and larger viewport sizes
    - `Param Defaults` / `All Settings` stayed visible and the dict/param stack rendered normally with no obvious clipping, overlap, missing content, or broken mount order in the visible viewport
    - representative visible labels and controls included `settings`, `Filter`, `TAG`, `Param Defaults`, `All Settings`, `textParamCodeObjDefault`, `colorPickerParamCodeObjDefault`, `dropzoneParamCodeObjDefault`, `buttonParamCodeObjDefault`, `switchParamCodeObjDefault`, and `nestedParamCodeObjDefault`
    - representative requests returned `200`, including `GET /api/getAgentRuns`, `POST /api/setActiveViewMode`, and `POST /api/setTopLevelSectionLayout`
- Next action:
  - Continue the first retained-scene node renderer work by composing the extracted edge, pinned, and unpinned mount helpers back through the next higher-level node mount boundary before any broad Pixi node drawing lands.

## 2026-03-26 054

- Item: Compose the extracted mount helpers into a node-level DOM packet above `groupContainerNodeMountPacket.ts`.
- Status: `done`
- Details:
  - Added a pure typed node-level DOM packet helper above the existing mount boundary:
    - `frontend/src/components/Params/groupContainerNodeDomPacket.ts`
    - `frontend/src/components/Params/groupContainerNodeDomPacket.test.ts`
  - Updated the production non-Pixi `GroupContainer` mount path to consume the new node-level DOM packet instead of consuming `groupContainerNodeMountPacket.ts` directly:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - Kept the current non-Pixi DOM behavior intact while deepening the live dict-area mount boundary:
    - composes the extracted edge-strip, pinned, and unpinned mount helpers through one higher-level `domBlocks` packet
    - preserves the existing DOM block order plus `scenePacket`, `edgeStrip`, and `maxNestedDepth` on the same node-level boundary
    - cleans up the `GroupContainer` wiring so the live DOM path no longer reaches straight into the node mount packet and no longer passes misleading `canvasPacket` props for mount-packet inputs
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerNodeDomPacket.test.ts src/components/Params/groupContainerNodeMountPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `All Settings` stayed active and the visible settings shell plus dict/param stack rendered normally after the new node DOM packet composition
    - representative visible labels and controls included `Core Name Editable`, `Core Name Type`, `defaultVal`, `Has Secret`, `Auto Refetch Callable Params On LSP Mismatch`, `Auto Backup`, `Config Language`, `edgeInputParams`, `Hide Unpinned Params`, `renderError`, and `renderedText`
    - no console errors were reported, and relevant backend requests returned `200`, including `GET/POST /api/getAgentRuns`, `POST /api/getFileBrowserRoot`, and `POST /api/getFolderContents`
- Next action:
  - Continue the first retained-scene node renderer work by using `groupContainerNodeDomPacket.ts` as the single live DOM/scene handoff boundary and start the first scene-owned canary that consumes that deeper node packet before any broad Pixi node drawing lands.

## 2026-03-27 055

- Item: Extract the edge-strip block into the first block-specific DOM helper above `groupContainerNodeDomPacket.ts`.
- Status: `done`
- Details:
  - Added a pure typed DOM-packet helper for the live dict-area edge strip:
    - `frontend/src/components/Params/groupContainerEdgeStripDomPacket.ts`
    - `frontend/src/components/Params/groupContainerEdgeStripDomPacket.test.ts`
  - Updated the higher-level node DOM packet boundary to compose through the new edge-strip helper instead of passing the edge-strip mount packet through unchanged:
    - `frontend/src/components/Params/groupContainerNodeDomPacket.ts`
  - Updated the production non-Pixi `GroupContainer` edge-strip mount site to consume the new DOM-specific edge-strip packet type while keeping the current DOM path unchanged:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the edge-strip mount block into one explicit DOM packet with stable `blockId`, `kind`, and mount metadata
    - keeping the higher-level node DOM packet as a composition boundary instead of a mixed composition-plus-edge-strip-shaping module
    - leaving the current DOM edge-strip surface intact while deepening the future retained-scene DOM handoff contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerEdgeStripDomPacket.test.ts src/components/Params/groupContainerNodeDomPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `All Settings` stayed visible and the settings shell plus dict/param area rendered normally after the new edge-strip DOM packet extraction
    - representative visible labels and controls included `OVERVIEW`, `settings`, `Filter`, tag rows `shortcuts`, `backend`, `sectionSizingPolicy`, `gui`, and `languageServer`, bottom tabs `Core`, `Section Defaults...`, `Param Defaults`, and `All Settings`, settings rows such as `Text Param`, `Time Param`, `Grid Color`, `Pan On Drag`, and `Zoom On Scroll`, plus edge-related controls `toggle agentic edges`, `toggle arg edges`, `toggle shared chat edge mode`, `Add arg`, `Remove arg`, and `Convert to edge connectors`
    - relevant requests returned `200`, including `GET /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `OPTIONS /api/loadProjectConfig`, `POST /api/loadProjectConfig`, and `GET /api/serverMode`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific DOM helper from `groupContainerNodeDomPacket.ts`, starting with the pinned param-area block before any broad Pixi node drawing lands.

## 2026-03-27 056

- Item: Extract the pinned param-area block into the next block-specific DOM helper above `groupContainerNodeDomPacket.ts`.
- Status: `done`
- Details:
  - Added a pure typed DOM-packet helper for the live dict-area pinned param area:
    - `frontend/src/components/Params/groupContainerPinnedParamAreaDomPacket.ts`
    - `frontend/src/components/Params/groupContainerPinnedParamAreaDomPacket.test.ts`
  - Updated the higher-level node DOM packet boundary to compose through the new pinned helper instead of passing the pinned mount packet through unchanged:
    - `frontend/src/components/Params/groupContainerNodeDomPacket.ts`
  - Updated the production non-Pixi `GroupContainer` pinned mount site to consume the new DOM-specific pinned packet type while keeping the current DOM path unchanged:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the pinned param-area mount block into one explicit DOM packet with stable `blockId`, `kind`, and mount metadata
    - keeping the higher-level node DOM packet as a composition boundary instead of a mixed composition-plus-pinned-block-shaping module
    - leaving the current DOM pinned param-area surface intact while deepening the future retained-scene DOM handoff contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerPinnedParamAreaDomPacket.test.ts src/components/Params/groupContainerNodeDomPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded authenticated with `All Settings` visible
    - the visible settings shell and dict/param area rendered normally after the new pinned DOM packet extraction, with representative labels and controls including `OVERVIEW`, `Filter`, `TAG`, `Param Defaults`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, and `settings`
    - representative requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `GET /api/backendInitStatus`, `GET /api/plugins/runtime`, `GET /api/getAgentRuns`, and `POST /api/getFileBrowserRoot`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific DOM helper from `groupContainerNodeDomPacket.ts`, starting with the unpinned param-area block before any broad Pixi node drawing lands.

## 2026-03-27 057

- Item: Extract the unpinned param-area block into the next block-specific DOM helper above `groupContainerNodeDomPacket.ts`.
- Status: `done`
- Details:
  - Added a pure typed DOM-packet helper for the live dict-area unpinned param area:
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaDomPacket.ts`
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaDomPacket.test.ts`
  - Updated the higher-level node DOM packet boundary to compose through the new unpinned helper instead of passing the unpinned mount packet through unchanged:
    - `frontend/src/components/Params/groupContainerNodeDomPacket.ts`
  - Updated the production non-Pixi `GroupContainer` unpinned mount site to consume the new DOM-specific unpinned packet type while keeping the current DOM path unchanged:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the unpinned param-area mount block into one explicit DOM packet with stable `blockId`, `kind`, and mount metadata
    - keeping the higher-level node DOM packet as a composition boundary instead of a mixed composition-plus-unpinned-block-shaping module
    - leaving the current DOM unpinned param-area surface intact while deepening the future retained-scene DOM handoff contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerUnpinnedParamAreaDomPacket.test.ts src/components/Params/groupContainerNodeDomPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - used the existing authenticated `/settings` tab; bootstrap was not needed
    - `All Settings` stayed visible/selected and the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative unpinned-param content was present in the accessibility tree, including `Hide Unpinned Params`, `Config Language`, `edgeInputParams`, and `edgeOutputPorts`
    - representative requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/backendInitStatus`, and the Vite module requests for `groupContainerNodeDomPacket.ts` and `groupContainerUnpinnedParamAreaDomPacket.ts`
- Next action:
  - Continue the first retained-scene node renderer work by using the fully block-specific `groupContainerNodeDomPacket.ts` boundary as the handoff for the first scene-owned canary consumer above the live DOM path before any broad Pixi node drawing lands.

## 2026-03-27 058

- Item: Compose the first scene-owned canary consumer above `groupContainerNodeDomPacket.ts`.
- Status: `done`
- Details:
  - Added a pure typed canary-packet helper above the fully block-specific node DOM boundary:
    - `frontend/src/components/Params/groupContainerNodeCanaryPacket.ts`
    - `frontend/src/components/Params/groupContainerNodeCanaryPacket.test.ts`
  - Updated the production non-Pixi `GroupContainer` mount path to consume the new node canary packet instead of stitching the surface packet and DOM packet chain inline:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - uses `groupContainerNodeDomPacket.ts` as the single DOM handoff boundary for the first scene-owned canary consumer
    - pairs each surviving edge-strip, pinned, and unpinned DOM block with its matching scene payload from the node scene packet
    - keeps the current DOM edge-strip and pinned/unpinned param-area surfaces intact while exposing a deeper canary contract above the live DOM path
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerNodeCanaryPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded in the authenticated worktree session with `All Settings` visible
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/authRefreshStatus`, `GET /api/serverMode`, and `GET /api/getAgentRuns`
    - the bootstrap token attempt on `http://127.0.0.1:8044/__setta__/bootstrap#token=...` returned `401`, but the existing browser session stayed authenticated during verification
- Next action:
  - Continue the first retained-scene node renderer work by extracting the first block-specific canary helper from `groupContainerNodeCanaryPacket.ts`, starting with the edge-strip block before any broad Pixi node drawing lands.

## 2026-03-27 059

- Item: Extract the edge-strip block into the first block-specific canary helper above `groupContainerNodeCanaryPacket.ts`.
- Status: `done`
- Details:
  - Added a pure typed canary helper for the live dict-area edge strip:
    - `frontend/src/components/Params/groupContainerEdgeStripCanaryPacket.ts`
    - `frontend/src/components/Params/groupContainerEdgeStripCanaryPacket.test.ts`
  - Updated the higher-level node canary boundary to compose through the new edge-strip helper instead of shaping the edge-strip canary packet inline:
    - `frontend/src/components/Params/groupContainerNodeCanaryPacket.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the edge-strip DOM/scene pairing into one explicit canary packet with stable `blockId`, `kind`, and scene handoff metadata
    - keeping `groupContainerNodeCanaryPacket.ts` as the higher-level composition boundary instead of a mixed composition-plus-edge-strip-pairing module
    - leaving the current DOM edge-strip surface intact while deepening the first scene-owned canary contract one block further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerEdgeStripCanaryPacket.test.ts src/components/Params/groupContainerNodeCanaryPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded authenticated with `All Settings` visible
    - the settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the new edge-strip canary helper extraction
    - representative edge-related controls remained present, including `Remove arg`, `Add arg`, `Convert to edge connectors`, and `toggle arg edges`
    - relevant requests returned `200`, including `loadSettings`, `backendInitStatus`, `authRefreshStatus`, `loadProjectConfig`, `getLatestLspDiagnostics`, `getAIFollowSnapshot`, `getListenerCoverage`, `setTopLevelSectionLayout`, and `setViewport`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific canary helper from `groupContainerNodeCanaryPacket.ts`, starting with the pinned param-area block before any broad Pixi node drawing lands.

## 2026-03-27 060

- Item: Extract the pinned param-area block into the next block-specific canary helper above `groupContainerNodeCanaryPacket.ts`.
- Status: `done`
- Details:
  - Added a pure typed canary helper for the live dict-area pinned param area:
    - `frontend/src/components/Params/groupContainerPinnedParamAreaCanaryPacket.ts`
    - `frontend/src/components/Params/groupContainerPinnedParamAreaCanaryPacket.test.ts`
  - Updated the higher-level node canary boundary to compose through the new pinned helper instead of shaping the pinned canary packet inline:
    - `frontend/src/components/Params/groupContainerNodeCanaryPacket.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the pinned param-area DOM/scene pairing into one explicit canary packet with stable `blockId`, `kind`, and scene handoff metadata
    - keeping `groupContainerNodeCanaryPacket.ts` as the higher-level composition boundary instead of a mixed composition-plus-pinned-block-pairing module
    - leaving the current DOM pinned param-area surface intact while deepening the first scene-owned canary contract one block further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerPinnedParamAreaCanaryPacket.test.ts src/components/Params/groupContainerNodeCanaryPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded in the authenticated worktree session after a successful bootstrap redirect
    - `All Settings` was visible and the settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `settings`, `All Settings`, `Project`, `Edit`, `Run`, `toggle agentic edges`, `toggle arg edges`, `toggle snap to grid`, `toggle minimap`, `Filter`, and the `shortcuts` / `languageServer` / `gui` / `sectionSizingPolicy` / `backend` entries
    - representative requests returned `200`, including `/api/loadSettings`, `/api/backendInitStatus`, `/api/authRefreshStatus`, `/api/getDefaultConfigName`, `/api/loadAllProjectMetadata`, and `/api/checkWorkspaceInitialized`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific canary helper from `groupContainerNodeCanaryPacket.ts`, starting with the unpinned param-area block before any broad Pixi node drawing lands.

## 2026-03-27 061

- Item: Extract the unpinned param-area block into the next block-specific canary helper above `groupContainerNodeCanaryPacket.ts`.
- Status: `done`
- Details:
  - Added a pure typed canary helper for the live dict-area unpinned param area:
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaCanaryPacket.ts`
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaCanaryPacket.test.ts`
  - Updated the higher-level node canary boundary to compose through the new unpinned helper instead of shaping the unpinned canary packet inline:
    - `frontend/src/components/Params/groupContainerNodeCanaryPacket.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the unpinned param-area DOM/scene pairing into one explicit canary packet with stable `blockId`, `kind`, and scene handoff metadata
    - keeping `groupContainerNodeCanaryPacket.ts` as the higher-level composition boundary instead of a mixed composition-plus-unpinned-block-pairing module
    - leaving the current DOM unpinned param-area surface intact while deepening the first scene-owned canary contract one block further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerUnpinnedParamAreaCanaryPacket.test.ts src/components/Params/groupContainerNodeCanaryPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - bootstrap/auth succeeded and `/settings` loaded with `All Settings` visible
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `OVERVIEW`, `settings`, `TAG`, `Filter`, `All`, `sectionSizingPolicy`, `ARGS`, `Core`, `Param Defaults`, and `All Settings`
    - representative requests returned `200`, including `GET /api/loadSettings`, `POST /api/loadProjectConfig`, `POST /api/getListenerCoverage`, and `POST /api/setTopLevelSectionLayout`
- Next action:
  - Continue the first retained-scene node renderer work by composing the edge, pinned, and unpinned block-specific canary helpers into the next higher-level scene-owned boundary above `groupContainerNodeCanaryPacket.ts` before any broad Pixi node drawing lands.

## 2026-03-27 062

- Item: Lift the live dict-area canary boundary into one higher-level node canary view above `groupContainerNodeCanaryPacket.ts`.
- Status: `done`
- Details:
  - Added a pure typed node-canary view helper above the existing block-specific canary helpers:
    - `frontend/src/components/Params/groupContainerNodeCanaryView.ts`
    - `frontend/src/components/Params/groupContainerNodeCanaryView.test.ts`
  - Updated the production non-Pixi `GroupContainer` path to consume the new node-canary view instead of branching directly on the node canary packet:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - lifts the ordered edge, pinned, and unpinned canary blocks into one higher-level live dict-area view with stable mount metadata
    - keeps the current DOM block mount order and max-nested-depth handling stable while hiding the node canary composition inside one deeper helper
    - preserves the existing non-Pixi DOM edge-strip and pinned/unpinned param-area surfaces while exposing the same scene-owned canary payload from one higher-level boundary
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerNodeCanaryView.test.ts src/components/Params/groupContainerNodeCanaryPacket.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded authenticated after bootstrap with `All Settings` visible
    - the visible settings shell plus dict/param area rendered normally after the new `groupContainerNodeCanaryView` boundary, with representative labels and controls including `Param Defaults`, `Section Defaults Structure and Code`, `Filter`, `Tag filter`, `defaultZoomLevel 1.0`, `Grid Color`, `Grid Pattern`, `Pan On Drag`, `Auto Backup`, and `autosave`
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, and `POST /api/loadProjectConfig`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the first block-specific helper from `groupContainerNodeCanaryView.ts`, starting with the edge-strip block before any broad Pixi node drawing lands.
