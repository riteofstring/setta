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

## 2026-03-27 046

- Item: Extract the live dict-area unpinned renderer block into its own helper boundary.
- Status: `done`
- Details:
  - Completed the next bounded live dict-area renderer cleanup step by extracting the remaining unpinned block shaping out of `frontend/src/components/Params/groupContainerLiveDictAreaRenderer.ts`:
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaRendererBlock.ts`
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaRendererBlock.test.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaRenderer.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaRenderer.test.ts`
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaSurfaceBlock.ts`
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaSurfaceBlock.test.ts`
  - The renderer layer now matches the existing edge-strip and pinned patterns:
    - `groupContainerLiveDictAreaRenderer.ts` composes through dedicated edge, pinned, and unpinned renderer-block helpers instead of leaving the unpinned block inline
    - the unpinned surface block now depends on the extracted renderer-block helper type directly instead of reaching back through the higher-level renderer module
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerUnpinnedParamAreaRendererBlock.test.ts src/components/Params/groupContainerLiveDictAreaRenderer.test.ts src/components/Params/groupContainerUnpinnedParamAreaSurfaceBlock.test.ts`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`)
      - the authenticated worktree settings tab rendered cleanly with the top bar, left rail, `pixijs-rewrite` project label, `settings`, `Filter`, the tag list (`shortcuts`, `gui`, `sectionSizingPolicy`, `languageServer`, `backend`), the `All` selector, and the bottom tabs including `Param Defaults` and `All Settings`
      - no obvious clipping, overlap, or missing content was visible in the dict/param area; the only truncation in view was the expected ellipsis on long bottom-tab labels
      - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `GET /api/llm/config`, and `GET /api/getAgentRuns`
- Next action:
  - Continue the retained-scene dict/param path by lifting the next higher-level boundary above `frontend/src/components/Params/groupContainerLiveDictAreaRenderer.ts` now that all three live renderer blocks are isolated.

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

## 2026-03-27 063

- Item: Extract the edge-strip block into the first block-specific helper above `groupContainerNodeCanaryView.ts`.
- Status: `done`
- Details:
  - Added a pure typed canary-view helper for the live dict-area edge strip:
    - `frontend/src/components/Params/groupContainerEdgeStripCanaryView.ts`
    - `frontend/src/components/Params/groupContainerEdgeStripCanaryView.test.ts`
  - Updated the higher-level node canary view boundary to compose through the new edge-strip helper instead of shaping the edge-strip view block inline:
    - `frontend/src/components/Params/groupContainerNodeCanaryView.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the edge-strip DOM/scene pairing into one explicit canary-view block with stable `blockId`, `kind`, and mount metadata
    - keeping `groupContainerNodeCanaryView.ts` as the higher-level composition boundary instead of a mixed composition-plus-edge-strip-view module
    - leaving the current DOM edge-strip surface intact while deepening the first scene-owned canary view contract one block further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerEdgeStripCanaryView.test.ts src/components/Params/groupContainerNodeCanaryView.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
      - `/settings` loaded after bootstrap and `All Settings` was visible
      - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
      - representative requests returned `200`, including `loadSettings`, `authRefreshStatus`, `backendInitStatus`, and `loadProjectConfig`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific helper from `groupContainerNodeCanaryView.ts`, starting with the pinned param-area block before any broad Pixi node drawing lands.

## 2026-03-27 064

- Item: Extract the pinned param-area block into the next block-specific helper above `groupContainerNodeCanaryView.ts`.
- Status: `done`
- Details:
  - Added a pure typed canary-view helper for the live dict-area pinned param area:
    - `frontend/src/components/Params/groupContainerPinnedParamAreaCanaryView.ts`
    - `frontend/src/components/Params/groupContainerPinnedParamAreaCanaryView.test.ts`
  - Updated the higher-level node canary view boundary to compose through the new pinned helper instead of shaping the pinned canary view block inline:
    - `frontend/src/components/Params/groupContainerNodeCanaryView.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the pinned param-area DOM/scene pairing into one explicit canary-view block with stable `blockId`, `kind`, and mount metadata
    - keeping `groupContainerNodeCanaryView.ts` as the higher-level composition boundary instead of a mixed composition-plus-pinned-block-view module
    - leaving the current DOM pinned param-area surface intact while deepening the first scene-owned canary view contract one block further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerPinnedParamAreaCanaryView.test.ts src/components/Params/groupContainerNodeCanaryView.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded authenticated with `All Settings` visible
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the new pinned canary-view helper extraction
    - representative visible labels and controls included `settings`, `Filter`, the tag list, `Core`, `Param Defaults`, `All Settings`, `Open settings`, and the top toolbar controls
    - representative requests returned `200`, including `POST /api/getFolderContents`, `POST /api/setActiveViewMode`, `POST /api/setTopLevelSectionLayout`, `GET /api/getAgentRuns`, and `GET /api/getFileBrowserRoot`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific helper from `groupContainerNodeCanaryView.ts`, starting with the unpinned param-area block before any broad Pixi node drawing lands.

## 2026-03-27 065

- Item: Extract the unpinned param-area block into the next block-specific helper above `groupContainerNodeCanaryView.ts`.
- Status: `done`
- Details:
  - Added a pure typed canary-view helper for the live dict-area unpinned param area:
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaCanaryView.ts`
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaCanaryView.test.ts`
  - Updated the higher-level node canary view boundary to compose through the new unpinned helper instead of shaping the unpinned canary view block inline:
    - `frontend/src/components/Params/groupContainerNodeCanaryView.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the unpinned param-area DOM/scene pairing into one explicit canary-view block with stable `blockId`, `kind`, and mount metadata
    - keeping `groupContainerNodeCanaryView.ts` as the higher-level composition boundary instead of a mixed composition-plus-unpinned-block-view module
    - leaving the current DOM unpinned param-area surface intact while deepening the first scene-owned canary view contract one block further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerUnpinnedParamAreaCanaryView.test.ts src/components/Params/groupContainerNodeCanaryView.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded authenticated with `All Settings` visible/selected
    - the visible settings shell plus dict/param area rendered normally after the new unpinned canary-view helper extraction
    - representative visible labels and controls included `Open section in floating window`, `Lock position and size`, `Minimize section`, `Delete section`, `Add arg`, and param fields such as `Core Name`, `Type`, and `Value`
    - representative requests returned `200`, including `POST /api/getFolderContents`
- Next action:
  - Continue the first retained-scene node renderer work by composing the edge, pinned, and unpinned block-specific helpers into the next higher-level scene-owned boundary above `groupContainerNodeCanaryView.ts` before any broad Pixi node drawing lands.

## 2026-03-27 066

- Item: Compose the block-specific canary-view helpers into a node canary render view above `groupContainerNodeCanaryView.ts`.
- Status: `done`
- Details:
  - Added a pure typed render-view helper above the existing block-specific canary-view helpers:
    - `frontend/src/components/Params/groupContainerNodeCanaryRenderView.ts`
    - `frontend/src/components/Params/groupContainerNodeCanaryRenderView.test.ts`
  - Updated the production non-Pixi `GroupContainer` path to consume the new node canary render view instead of reading the raw node canary view boundary directly:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - composes the edge-strip, pinned param-area, and unpinned param-area canary-view blocks into one higher-level render boundary with stable block keys
    - keeps the current DOM block mount order and mount metadata intact while hiding the render-key shaping inside one deeper helper
    - preserves the existing non-Pixi DOM edge-strip and pinned/unpinned param-area surfaces while deepening the first scene-owned canary render contract above the live DOM path
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerNodeCanaryRenderView.test.ts src/components/Params/groupContainerNodeCanaryView.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - bootstrap was not needed; the existing authenticated `/settings` tab was used
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the new node canary render view wiring
    - representative visible labels and controls included `settings`, `shortcuts`, `backend`, `sectionSizingPolicy`, `gui`, `languageServer`, `Filter`, `TAG`, `All Settings`, `Grid Color`, `Grid Pattern`, `Pan On Drag`, `Zoom On Scroll`, `minHeight 32.0`, and `minWidth 200.0`
    - representative request returned `200`: `POST http://127.0.0.1:8044/api/getFolderContents`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the edge-strip block into the first block-specific helper above `groupContainerNodeCanaryRenderView.ts` before any broad Pixi node drawing lands.

## 2026-03-27 067

- Item: Extract the edge-strip block into the first block-specific helper above `groupContainerNodeCanaryRenderView.ts`.
- Status: `done`
- Details:
  - Added a pure typed canary-render helper for the live dict-area edge strip:
    - `frontend/src/components/Params/groupContainerEdgeStripCanaryRenderView.ts`
    - `frontend/src/components/Params/groupContainerEdgeStripCanaryRenderView.test.ts`
  - Updated the higher-level node canary render boundary to compose through the new edge-strip helper instead of shaping the edge render block inline:
    - `frontend/src/components/Params/groupContainerNodeCanaryRenderView.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the live edge-strip canary view into one explicit render block with a stable frame-id key
    - keeping `groupContainerNodeCanaryRenderView.ts` as the higher-level composition boundary instead of a mixed composition-plus-edge-render module
    - leaving the current DOM edge-strip mount path intact while deepening the first scene-owned canary render contract one block further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerEdgeStripCanaryRenderView.test.ts src/components/Params/groupContainerNodeCanaryRenderView.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded authenticated with `All Settings` visible
    - the visible settings surface and dict/param area rendered normally with no obvious clipping, overlap, or missing content after the new edge-strip canary-render helper extraction
    - representative visible labels and controls included `settings`, `shortcuts`, `backend`, `languageServer`, `sectionSizingPolicy`, `gui`, `toggle agentic edges`, `toggle arg edges`, `toggle snap to grid`, and `toggle minimap`
    - representative requests returned `200`, including `POST /api/getFolderContents`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific helper from `groupContainerNodeCanaryRenderView.ts`, starting with the pinned param-area block before any broad Pixi node drawing lands.

## 2026-03-27 068

- Item: Extract the edge-strip block into the first block-specific helper above `groupContainerLiveDictAreaRenderer.ts`.
- Status: `done`
- Details:
  - Added a pure typed renderer-block helper for the live dict-area edge strip:
    - `frontend/src/components/Params/groupContainerEdgeStripRendererBlock.ts`
    - `frontend/src/components/Params/groupContainerEdgeStripRendererBlock.test.ts`
  - Updated the higher-level live dict-area renderer boundary to compose through the new edge-strip helper instead of shaping the edge-strip renderer block inline:
    - `frontend/src/components/Params/groupContainerLiveDictAreaRenderer.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaRenderer.test.ts`
  - Updated the edge-strip surface block to depend on the new block-specific helper type instead of importing that type from the higher-level renderer module:
    - `frontend/src/components/Params/groupContainerEdgeStripSurfaceBlock.ts`
    - `frontend/src/components/Params/groupContainerEdgeStripSurfaceBlock.test.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the edge-strip canary renderer into one explicit section-scoped renderer block with stable `key`, `kind`, and `sectionId`
    - keeping `groupContainerLiveDictAreaRenderer.ts` as a higher-level composition boundary instead of a mixed composition-plus-edge-strip-shaping module
    - leaving the current DOM edge-strip surface intact while deepening the first scene-owned live-renderer contract one block further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerEdgeStripRendererBlock.test.ts src/components/Params/groupContainerLiveDictAreaRenderer.test.ts src/components/Params/groupContainerEdgeStripSurfaceBlock.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - used the already-authenticated worktree tab and navigated it to `/settings`
    - `All Settings` became visible and the settings shell plus dict/param area rendered normally
    - representative visible labels and controls included `Section Defaults Structure and Code`, `Content and Media`, `Param Defaults`, `toggle agentic edges`, `watch code settings`, `Auto Backup`, `autobackupFreq 300`, and `defaultTerminalShell null`
    - representative requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, and `POST /api/getAIFollowSnapshot`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the pinned param-area block into the next block-specific helper above `groupContainerLiveDictAreaRenderer.ts` before any broad Pixi node drawing lands.

## 2026-03-27 068

- Item: Extract the pinned param-area block into the next block-specific helper above `groupContainerNodeCanaryRenderView.ts`.
- Status: `done`
- Details:
  - Added a pure typed canary-render helper for the live dict-area pinned param area:
    - `frontend/src/components/Params/groupContainerPinnedParamAreaCanaryRenderView.ts`
    - `frontend/src/components/Params/groupContainerPinnedParamAreaCanaryRenderView.test.ts`
  - Updated the higher-level node canary render boundary to compose through the new pinned helper instead of shaping that render block inline:
    - `frontend/src/components/Params/groupContainerNodeCanaryRenderView.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the live pinned param-area canary view into one explicit render block with a stable frame-id key
    - keeping `groupContainerNodeCanaryRenderView.ts` focused on higher-level block composition instead of mixed composition-plus-pinned-render shaping
    - leaving the current DOM pinned param-area mount path intact while deepening the first scene-owned canary render contract one block further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerPinnedParamAreaCanaryRenderView.test.ts src/components/Params/groupContainerNodeCanaryRenderView.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - the verifier used the already-authenticated browser session after `POST /__setta__/bootstrap/consume` returned `401` for the provided bootstrap token in that tab
    - `/settings` loaded with `All Settings` visible and the dict/param area rendered normally with no obvious clipping, overlap, or missing content after the pinned helper extraction
    - representative visible labels and controls included `shortcuts`, `languageServer`, `backend`, `gui`, `sectionSizingPolicy`, `Param Defaults`, `All Settings`, `minHeight`, `minWidth`, and `Size Mode`
    - representative requests returned `200`, including `GET /api/serverMode`, `GET /api/loadSettings`, `GET /api/authRefreshStatus`, `POST /api/loadAllProjectMetadata`, `POST /api/getFolderContents`, and `GET /api/checkWorkspaceInitialized`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific helper from `groupContainerNodeCanaryRenderView.ts`, starting with the unpinned param-area block before any broad Pixi node drawing lands.

## 2026-03-27 069

- Item: Extract the unpinned param-area block into the next block-specific helper above `groupContainerNodeCanaryRenderView.ts`.
- Status: `done`
- Details:
  - Added a pure typed canary-render helper for the live dict-area unpinned param area:
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaCanaryRenderView.ts`
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaCanaryRenderView.test.ts`
  - Updated the higher-level node canary render boundary to compose through the new unpinned helper instead of shaping that render block inline:
    - `frontend/src/components/Params/groupContainerNodeCanaryRenderView.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the live unpinned param-area canary view into one explicit render block with a stable frame-id key
    - keeping `groupContainerNodeCanaryRenderView.ts` focused on higher-level block composition instead of mixed composition-plus-unpinned-render shaping
    - leaving the current DOM unpinned param-area mount path intact while deepening the first scene-owned canary render contract one block further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerUnpinnedParamAreaCanaryRenderView.test.ts src/components/Params/groupContainerNodeCanaryRenderView.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - authenticated via the provided bootstrap URL and loaded `/settings` successfully
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the new unpinned canary-render helper extraction
    - representative visible labels and controls included `Core`, `Param Defaults`, `All Settings`, `toggle agentic edges`, `toggle arg edges`, `toggle snap to grid`, `gridPatternSize`, `Pan On Drag`, `Pan On Scroll`, `Zoom On Pinch`, and the section cards `shortcuts`, `gui`, `backend`, `sectionSizingPolicy`, and `languageServer`
    - representative requests returned `200`, including `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/plugins/runtime`, `GET /api/getFileBrowserRoot`, and `POST /api/setTopLevelSectionLayout`
- Next action:
  - Continue the first retained-scene node renderer work by composing the edge, pinned, and unpinned block-specific canary-render helpers into the next higher-level scene-owned boundary above `groupContainerNodeCanaryRenderView.ts` before any broad Pixi node drawing lands.

## 2026-03-27 070

- Item: Compose the block-specific canary-render helpers into a node canary renderer above `groupContainerNodeCanaryRenderView.ts`.
- Status: `done`
- Details:
  - Added a pure typed node-canary renderer helper above the existing block-specific canary-render helpers:
    - `frontend/src/components/Params/groupContainerNodeCanaryRenderer.ts`
    - `frontend/src/components/Params/groupContainerNodeCanaryRenderer.test.ts`
  - Updated the production non-Pixi `GroupContainer` path to consume the new node canary renderer instead of manually building and wiring `groupContainerNodeCanaryView.ts` plus `groupContainerNodeCanaryRenderView.ts` inline:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - composes the existing node canary packet, canary view, and canary render view into one higher-level scene-owned boundary
    - keeps the current DOM block mount order and `maxNestedDepth` handling stable while hiding the render-chain composition inside one deeper helper
    - preserves the existing non-Pixi DOM edge-strip and pinned/unpinned param-area surfaces while exposing both the canary packet and canary view from the same higher-level boundary for the next retained-scene slice
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerNodeCanaryRenderer.test.ts src/components/Params/groupContainerNodeCanaryRenderView.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded in the authenticated worktree session with `All Settings` visible and selected
    - the visible settings shell plus dict/param area rendered normally after the new renderer boundary wiring, with representative labels and controls including `Auto Refetch Callable Params On LSP Mismatch`, `Auto Backup`, `Grid Color`, `Pan On Drag`, `Selection Mode`, and `Wire Color`
    - representative requests returned `200`, including `GET /api/authRefreshStatus`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, and `POST /api/checkWorkspaceInitialized`
    - repeated React 19 `element.ref` console messages were observed, but they did not block rendering or this verification
- Next action:
  - Continue the first retained-scene node renderer work by extracting the first block-specific helper above `groupContainerNodeCanaryRenderer.ts`, starting with the edge-strip block before any broad Pixi node drawing lands.

## 2026-03-27 071

- Item: Extract the edge-strip block into the first block-specific helper above `groupContainerNodeCanaryRenderer.ts`.
- Status: `done`
- Details:
  - Added a pure typed canary-renderer helper for the live dict-area edge strip:
    - `frontend/src/components/Params/groupContainerEdgeStripCanaryRenderer.ts`
    - `frontend/src/components/Params/groupContainerEdgeStripCanaryRenderer.test.ts`
  - Updated the higher-level node canary renderer boundary to compose through the new edge-strip helper instead of leaving the edge renderer block inline:
    - `frontend/src/components/Params/groupContainerNodeCanaryRenderer.ts`
    - `frontend/src/components/Params/groupContainerNodeCanaryRenderer.test.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the live edge-strip canary render view into one explicit renderer block while retaining the paired canary view payload
    - keeping `groupContainerNodeCanaryRenderer.ts` focused on higher-level block composition instead of mixed composition-plus-edge-renderer shaping
    - leaving the current DOM edge-strip surface intact while deepening the first scene-owned canary renderer contract one block further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerEdgeStripCanaryRenderer.test.ts src/components/Params/groupContainerNodeCanaryRenderer.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded in an authenticated worktree session with `All Settings` visible and styled active
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the new edge-strip canary-renderer helper extraction
    - representative visible labels and controls included `settings`, `Filter`, `shortcuts`, `backend`, `languageServer`, `gui`, `Core`, `Param Defaults`, and `All Settings`
    - representative requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `GET /api/authRefreshStatus`, and `GET /api/backendInitStatus`
    - the provided bootstrap URL was rejected in that browser session, but the already-authenticated `/settings` tab stayed usable for verification
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific helper from `groupContainerNodeCanaryRenderer.ts`, starting with the pinned param-area block before any broad Pixi node drawing lands.

## 2026-03-27 072

- Item: Extract the pinned param-area block into the next block-specific helper above `groupContainerNodeCanaryRenderer.ts`.
- Status: `done`
- Details:
  - Added a pure typed canary-renderer helper for the live dict-area pinned param area:
    - `frontend/src/components/Params/groupContainerPinnedParamAreaCanaryRenderer.ts`
    - `frontend/src/components/Params/groupContainerPinnedParamAreaCanaryRenderer.test.ts`
  - Updated the higher-level node canary renderer boundary to compose through the new pinned helper instead of leaving the pinned renderer block inline:
    - `frontend/src/components/Params/groupContainerNodeCanaryRenderer.ts`
    - `frontend/src/components/Params/groupContainerNodeCanaryRenderer.test.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the live pinned param-area canary render view into one explicit renderer block while retaining the paired canary view payload
    - keeping `groupContainerNodeCanaryRenderer.ts` focused on higher-level block composition instead of mixed composition-plus-pinned-renderer shaping
    - leaving the current DOM pinned param-area surface intact while deepening the first scene-owned canary renderer contract one block further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerPinnedParamAreaCanaryRenderer.test.ts src/components/Params/groupContainerNodeCanaryRenderer.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded in an authenticated worktree session with `All Settings` visible and selected
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the new pinned canary-renderer helper extraction
    - representative visible labels and controls included `settings`, `All Settings`, `dictSectionDefault`, `colorPickerParamCodeObjDefault`, `Config Language`, `Core Name Type`, and `Value`
    - representative requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/serverMode`, and `POST /api/setTopLevelSectionLayout`
- Next action:
  - Continue the first retained-scene node renderer work by extracting the next block-specific helper from `groupContainerNodeCanaryRenderer.ts`, starting with the unpinned param-area block before any broad Pixi node drawing lands.

## 2026-03-27 073

- Item: Extract the unpinned param-area block into the next block-specific helper above `groupContainerNodeCanaryRenderer.ts`.
- Status: `done`
- Details:
  - Added a pure typed canary-renderer helper for the live dict-area unpinned param area:
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaCanaryRenderer.ts`
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaCanaryRenderer.test.ts`
  - Updated the higher-level node canary renderer boundary to compose through the new unpinned helper instead of leaving the unpinned renderer block inline:
    - `frontend/src/components/Params/groupContainerNodeCanaryRenderer.ts`
    - `frontend/src/components/Params/groupContainerNodeCanaryRenderer.test.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the live unpinned param-area canary render view into one explicit renderer block while retaining the paired canary view payload
    - keeping `groupContainerNodeCanaryRenderer.ts` focused on higher-level block composition instead of mixed composition-plus-unpinned-renderer shaping
    - leaving the current DOM unpinned param-area surface intact while deepening the first scene-owned canary renderer contract one block further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerUnpinnedParamAreaCanaryRenderer.test.ts src/components/Params/groupContainerNodeCanaryRenderer.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded with `All Settings` visible and selected
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the new unpinned canary-renderer helper extraction
    - representative visible labels and controls included `Core Name Editable`, `Config Language`, `Hide Unpinned Params`, `Position And Size Locked`, `Grid Color`, and `Wire Color`
    - representative requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/serverMode`, and `GET /src/components/Params/groupContainerUnpinnedParamAreaCanaryRenderer.ts`
- Next action:
  - Continue the first retained-scene node renderer work by composing the edge, pinned, and unpinned block-specific helpers into the next higher-level scene-owned boundary above `groupContainerNodeCanaryRenderer.ts` before any broad Pixi node drawing lands.

## 2026-03-27 074

- Item: Compose the edge, pinned, and unpinned block-specific helpers into the next higher-level scene-owned boundary above `groupContainerNodeCanaryRenderer.ts`.
- Status: `done`
- Details:
  - Added a pure typed live dict-area canary boundary above the existing node canary packet and renderer chain:
    - `frontend/src/components/Params/groupContainerNodeCanaryBoundary.ts`
    - `frontend/src/components/Params/groupContainerNodeCanaryBoundary.test.ts`
  - Updated the production non-Pixi `GroupContainer` path to consume the new higher-level canary boundary instead of manually building the node canary packet and then the node canary renderer inline:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - composes the existing node-scene packet, node canary packet, and node canary renderer from one higher-level boundary
    - keeps the current DOM edge-strip and pinned/unpinned param-area surfaces intact while hiding the last packet-to-renderer wiring hop behind one deeper module
    - preserves the existing non-Pixi block order and `maxNestedDepth` behavior while exposing the deeper node-scene input from the same boundary for the next retained-scene slice
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerNodeCanaryBoundary.test.ts src/components/Params/groupContainerNodeCanaryRenderer.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3044 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8044 SETTA_BOOTSTRAP_TOKEN=<current worktree token> pnpm -C frontend exec playwright test frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
    - note: `./scripts/run-playwright-e2e.sh` minted a bootstrap token that hit `401` in Playwright global setup during this iteration, so the verification reran directly against the already-running worktree session with the current bootstrap token
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` was authenticated and `All Settings` was visible in the tab row
    - the visible dict/param area rendered normally after the new canary boundary wiring, with representative labels and controls including `Auto Backup`, `Date Control Mode`, `Core Name Type`, and `Open section in floating window`
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, and `GET /api/authRefreshStatus`
- Next action:
  - Continue the first retained-scene node renderer work by lifting the live dict-area canary boundary into the next higher-level scene-owned boundary above `groupContainerNodeCanaryBoundary.ts` before any broad Pixi node drawing lands.

## 2026-03-27 075

- Item: Lift the live dict-area canary boundary into one higher-level scene-owned boundary above `groupContainerNodeCanaryBoundary.ts`.
- Status: `done`
- Details:
  - Added a pure typed live dict-area boundary helper above the existing node-scene and node-canary boundary chain:
    - `frontend/src/components/Params/groupContainerLiveDictAreaBoundary.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaBoundary.test.ts`
  - Updated the production non-Pixi `GroupContainer` path to consume the new higher-level live dict-area boundary instead of building `groupContainerNodeScenePacket.ts` and then `groupContainerNodeCanaryBoundary.ts` inline:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - composes the raw live dict-area scene inputs plus the existing canary boundary from one deeper module
    - keeps the current DOM edge-strip and pinned/unpinned param-area surfaces intact while hiding the scene-packet-to-canary-boundary wiring hop behind one higher-level boundary
    - preserves the existing non-Pixi block order and `maxNestedDepth` behavior while exposing the same node-scene and canary payload from the new boundary
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaBoundary.test.ts src/components/Params/groupContainerNodeCanaryBoundary.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - authenticated `/settings` loaded with `All Settings` visible
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, missing content, or broken mount order after the new live dict-area boundary wiring
    - representative visible labels and controls included `Project`, `Edit`, `Run`, `settings`, `Filter`, `TAG`, `All`, `languageServer`, `shortcuts`, `backend`, `sectionSizingPolicy`, `gui`, and the bottom tabs `Core`, `Section Defaults Struct...`, `Section Defaults Conte...`, `Param Defaults`, and `All Settings`
    - representative requests returned `200`, including `GET /api/getAgentRuns`, `POST /api/getFileBrowserRoot`, `POST /api/getFolderContents`, `GET /settings`, `GET /index.css`, and `GET /src/App.tsx`
    - console showed the existing React 19 `Accessing element.ref was removed...` messages, but they did not block rendering or this verification
- Next action:
  - Continue the first retained-scene node renderer work by lifting the live dict-area boundary into the next higher-level scene-owned boundary above `groupContainerLiveDictAreaBoundary.ts` before any broad Pixi node drawing lands.

## 2026-03-27 076

- Item: Lift the live dict-area boundary into the next higher-level shared view boundary above `groupContainerLiveDictAreaBoundary.ts`.
- Status: `done`
- Details:
  - Deepened the live dict-area helper chain so the higher-level view now owns one shared `LiveDictAreaBoundary` instance instead of reaching it indirectly through `liveDictAreaRenderBoundary`:
    - `frontend/src/components/Params/groupContainerLiveDictAreaRenderBoundary.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaView.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaRenderBoundary.test.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaView.test.ts`
  - Added a reusable render-boundary entrypoint:
    - `buildLiveDictAreaRenderBoundaryFromBoundary(...)`
    - this lets higher-level helpers consume an already-lifted `LiveDictAreaBoundary` without rebuilding or rethreading it indirectly
  - Updated `buildLiveDictAreaView(...)` to:
    - build `LiveDictAreaBoundary` once
    - reuse that same boundary for both `buildLiveDictAreaRenderBoundaryFromBoundary(...)` and `buildLiveDictAreaSceneBoundary(...)`
    - expose `liveDictAreaBoundary` directly from the higher-level view contract so later boundaries can keep lifting from the same shared object
  - Locked the new shared-boundary contract in tests:
    - render-boundary tests now cover the reuse path for a caller that already lifted the boundary
    - view tests now assert the render boundary and scene boundary both point at the same shared `liveDictAreaBoundary`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaRenderBoundary.test.ts src/components/Params/groupContainerLiveDictAreaView.test.ts src/components/Params/groupContainerLiveDictAreaMountBoundary.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Note:
    - a single combined Playwright run of all three specs timed out in the benchmark spec while opening the staged settings canvas after the edge/scroll specs had already run in the same session
    - rerunning the benchmark spec alone in a fresh isolated workspace passed, so this iteration records the split clean-batch verification instead of the contaminated combined batch
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - the fresh bootstrap consume attempt returned `401`, so verification fell back to an already-authenticated `/settings` tab
    - `All Settings` was visible and selected, and the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `settings`, `Filter`, `TAG`, `shortcuts`, `sectionSizingPolicy`, `backend`, `languageServer`, `gui`, `chatSectionDefault`, `dictSectionDefault`, and `stateMachineStartSectionDefault`
    - relevant requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, and `GET /api/getAgentRuns`
- Next action:
  - Continue the first retained-scene node renderer work by lifting this shared live dict-area view boundary into the next higher-level scene-owned boundary above `groupContainerLiveDictAreaView.ts` before any broad Pixi node drawing lands.

## 2026-03-27 076

- Item: Lift the live dict-area boundary into one higher-level scene-owned renderer above `groupContainerLiveDictAreaBoundary.ts`.
- Status: `done`
- Details:
  - Added a pure typed live dict-area renderer helper above the existing live dict-area boundary:
    - `frontend/src/components/Params/groupContainerLiveDictAreaRenderer.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaRenderer.test.ts`
  - Updated the production non-Pixi `GroupContainer` path to consume the new renderer boundary instead of attaching `sectionId` and `handleColumnResizeStart` directly while iterating the raw live dict-area boundary blocks:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - lifts each surviving live dict-area block into a renderer block with the section-level render props required by the current DOM surfaces
    - keeps the current DOM edge-strip and pinned/unpinned param-area surfaces intact while hiding the last boundary-to-render-props wiring hop behind one deeper helper
    - preserves the existing non-Pixi block order and `maxNestedDepth` behavior while exposing the same live dict-area boundary payload from the new renderer
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaRenderer.test.ts src/components/Params/groupContainerLiveDictAreaBoundary.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - the existing authenticated `/settings` session loaded successfully without needing bootstrap
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, missing content, or broken mount order after the new renderer boundary wiring

## 2026-03-27 077

- Item: Lift the live dict-area seam into `frontend/src/components/Section/Layouts/DictArea.tsx`.
- Status: `done`
- Details:
  - Raised the section-container/live-dict-area handoff to `DictArea` so higher layers no longer depend on `DictAreaLiveBoundary` directly:
    - `frontend/src/components/Section/Layouts/DictArea.tsx`
    - `frontend/src/components/Section/Container/SectionContainerDictArea.tsx`
    - `frontend/src/components/Section/Container/sectionContainerAreaDictView.ts`
  - `DictArea` now exports the shared `DictAreaProps` contract and the section-container dict path composes through `DictArea` instead of importing the lower live boundary type/component directly.
  - Updated the affected section-container test mock surface to the higher seam:
    - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Container/sectionContainerAreaDictView.test.ts src/components/Section/Container/SectionContainerAreaDictBoundary.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `All Settings` was visible and the settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative network responses returned `200`, including `loadSettings`, `loadProjectConfig`, and `setTopLevelSectionLayout`
- Next action:
  - Continue the retained-scene seam lift by moving the live dict-area handoff one level higher above `DictArea.tsx`, starting with the `SectionContainerAreaDictBoundary` path.
    - representative visible labels and controls included `OVERVIEW`, `settings`, the left tag list, the bottom tabs `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, and `All Settings`, plus visible rows, switches, comboboxes, and value widgets in `Param Defaults` / `All Settings`
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAIFollowSnapshot`, `POST /api/getListenerCoverage`, and `POST /api/setTopLevelSectionLayout`
- Next action:
  - Continue the first retained-scene node renderer work by lifting the live dict-area renderer into the next higher-level scene-owned boundary above `groupContainerLiveDictAreaRenderer.ts` before any broad Pixi node drawing lands.

## 2026-03-27 077

- Item: Resume from the current repo frontier and extract the pinned param-area renderer block from `groupContainerLiveDictAreaRenderer.ts`.
- Status: `done`
- Details:
  - Repo state had already advanced beyond the previous durable-log tail when this iteration started; this entry resumes from the actual code frontier instead of re-landing the already-present live dict-area boundary chain.
  - Added a pure typed pinned renderer-block helper for the live dict-area renderer:
    - `frontend/src/components/Params/groupContainerPinnedParamAreaRendererBlock.ts`
    - `frontend/src/components/Params/groupContainerPinnedParamAreaRendererBlock.test.ts`
  - Updated the higher-level live dict-area renderer boundary to compose through the new pinned helper instead of shaping the pinned renderer block inline:
    - `frontend/src/components/Params/groupContainerLiveDictAreaRenderer.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaRenderer.test.ts`
  - Updated the pinned surface helper to depend on the lower-level pinned renderer-block boundary instead of importing the type from the higher-level renderer module:
    - `frontend/src/components/Params/groupContainerPinnedParamAreaSurfaceBlock.ts`
    - `frontend/src/components/Params/groupContainerPinnedParamAreaSurfaceBlock.test.ts`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerPinnedParamAreaRendererBlock.test.ts src/components/Params/groupContainerLiveDictAreaRenderer.test.ts src/components/Params/groupContainerPinnedParamAreaSurfaceBlock.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded in an authenticated worktree session without needing bootstrap
    - `All Settings` was visible in the accessibility tree and the dict/param area rendered normally after the pinned renderer-block extraction
    - representative requests returned `200`, including `GET /settings`, `GET /api/authRefreshStatus`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, and `GET /api/backendInitStatus`
- Next action:
  - Continue the live dict-area renderer cleanup by extracting the unpinned param-area renderer block from `groupContainerLiveDictAreaRenderer.ts`.

## 2026-03-27 077

- Item: Lift the live dict-area renderer into one higher-level scene-owned render boundary above `groupContainerLiveDictAreaRenderer.ts`.
- Status: `done`
- Details:
  - Added a pure typed live dict-area render-boundary helper above the existing live dict-area renderer:
    - `frontend/src/components/Params/groupContainerLiveDictAreaRenderBoundary.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaRenderBoundary.test.ts`
  - Updated the production non-Pixi `GroupContainer` path to consume the new render-boundary helper instead of building `groupContainerLiveDictAreaBoundary.ts` and then `groupContainerLiveDictAreaRenderer.ts` in separate steps:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - composes the raw live dict-area inputs, the existing live dict-area boundary, and the live dict-area renderer from one deeper module
    - keeps the current DOM edge-strip and pinned/unpinned param-area surfaces intact while hiding the last boundary-to-renderer wiring hop behind one higher-level boundary
    - preserves the existing non-Pixi block order and `maxNestedDepth` behavior while exposing the same live dict-area boundary payload from the new helper
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaRenderBoundary.test.ts src/components/Params/groupContainerLiveDictAreaRenderer.test.ts src/components/Params/groupContainerLiveDictAreaBoundary.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - reused the already-authenticated `/settings` tab; bootstrap was not needed in that browser session
    - `All Settings` was visible and reachable in the bottom tab strip, and the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the new render-boundary wiring
    - representative visible labels and controls included `settings`, `Filter`, `TAG`, `listRootSectionDefault`, `dictSectionDefault`, `groupSectionDefault`, `Param Defaults`, `All Settings`, `Open section in floating window`, `Lock position and size`, and `Minimize section`
    - representative requests returned `200`, including `/api/loadSettings`, `/api/loadProjectConfig`, `/api/getLatestLspDiagnostics`, `/api/getAIFollowSnapshot`, `/api/getListenerCoverage`, `/api/serverMode`, and `/api/authRefreshStatus`; non-200 responses were limited to expected cached `304` asset/module requests
- Next action:
  - Continue the first retained-scene node renderer work by lifting the live dict-area render boundary into the next higher-level scene-owned boundary above `groupContainerLiveDictAreaRenderBoundary.ts` before any broad Pixi node drawing lands.

## 2026-03-27 078

- Item: Lift the live dict-area render boundary into one higher-level scene-owned surface boundary above `groupContainerLiveDictAreaRenderBoundary.ts`.
- Status: `done`
- Details:
  - Added a pure typed live dict-area surface helper above the existing live dict-area render boundary:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSurface.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaSurface.test.ts`
  - Updated the production non-Pixi `GroupContainer` path to consume the new higher-level surface helper instead of spreading render-boundary block props inline while iterating the live dict-area blocks:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new helper now deterministically:
    - composes the raw live dict-area inputs, the existing live dict-area render boundary, and the final component-facing surface props from one deeper module
    - keeps the current DOM edge-strip and pinned/unpinned param-area surfaces intact while hiding the last render-boundary-to-surface-props wiring hop behind one higher-level boundary
    - preserves the existing non-Pixi block order and `maxNestedDepth` behavior while exposing the same live dict-area render-boundary payload from the new helper
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaSurface.test.ts src/components/Params/groupContainerLiveDictAreaRenderBoundary.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded successfully after the bootstrap handoff and the settings shell rendered normally
    - `All Settings` was visible with the expected dict/param area UI, including `shortcuts`, `backend`, `languageServer`, `sectionSizingPolicy`, `gui`, `Filter`, `Param Defaults`, and `All Settings`
    - representative requests returned `200`, including `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/getDefaultConfigName`, `POST /api/loadAllProjectMetadata`, `POST /api/getFileBrowserRoot`, `POST /api/getFolderContents`, and `POST /api/checkWorkspaceInitialized`; static Vite asset requests showed expected `304` cache hits
- Next action:
  - Continue the first retained-scene node renderer work by lifting the live dict-area surface boundary into the next higher-level scene-owned boundary above `groupContainerLiveDictAreaSurface.ts` before any broad Pixi node drawing lands.

## 2026-03-27 079

- Item: Lift the live dict-area surface boundary into one higher-level scene-owned mount boundary above `groupContainerLiveDictAreaSurface.ts`.
- Status: `done`
- Details:
  - Added a typed live dict-area mount module above the existing live dict-area surface boundary:
    - `frontend/src/components/Params/groupContainerLiveDictAreaMount.tsx`
    - `frontend/src/components/Params/groupContainerLiveDictAreaMount.test.tsx`
  - Updated the production non-Pixi `GroupContainer` path to consume the new mount module instead of switching over the live dict-area surface blocks inline:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new mount layer now deterministically:
    - composes the existing live dict-area surface into the concrete edge-strip, pinned param-area, and unpinned param-area DOM mount path from one deeper module
    - keeps the current DOM surfaces and measurement behavior intact while hiding the last surface-to-component wiring hop behind one higher-level boundary
    - preserves the existing non-Pixi block order, block-frame metadata, and `maxNestedDepth` flow while shrinking `GroupContainer.tsx`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaMount.test.tsx src/components/Params/groupContainerLiveDictAreaSurface.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded successfully and `All Settings` was visible and reachable in the bottom tab bar
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing blocks after the new mount-boundary wiring
    - representative requests returned `200`, including `loadSettings`, `backendInitStatus`, `authRefreshStatus`, and `loadProjectConfig`
- Next action:
  - Continue the first retained-scene node renderer work by lifting the live dict-area mount boundary into the next higher-level scene-owned boundary above `groupContainerLiveDictAreaMount.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 080

- Item: Lift the live dict-area mount boundary into one higher-level scene-owned boundary above `groupContainerLiveDictAreaMount.tsx`.
- Status: `done`
- Details:
  - Added a typed top-level live dict-area boundary above the existing surface and mount layers:
    - `frontend/src/components/Params/groupContainerLiveDictArea.tsx`
    - `frontend/src/components/Params/groupContainerLiveDictArea.test.tsx`
  - Updated the production non-Pixi `GroupContainer` path to consume the new live dict-area boundary instead of building the surface and mounting it inline:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new boundary now deterministically:
    - composes the existing live dict-area surface builder and mount module from one deeper component boundary
    - relays `maxNestedDepth` back to `GroupContainer` from the deeper surface result so the current column-width and measurement flow stays intact
    - keeps the current DOM edge-strip and pinned/unpinned param-area surfaces intact while hiding the last surface-to-mount wiring hop behind one higher-level boundary
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictArea.test.tsx src/components/Params/groupContainerLiveDictAreaMount.test.tsx src/components/Params/groupContainerLiveDictAreaSurface.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded in an authenticated worktree session and `All Settings` remained visible and reachable
    - the visible settings shell plus dict/param area rendered normally after the new higher-level boundary wiring, with representative labels and controls including `toggle agentic edges`, `toggle arg edges`, `watch code settings`, `zoom in`, `zoom out`, `fit view`, `toggle minimap`, `Create chat window`, `Core`, `Param Defaults`, and `All Settings`
    - representative requests returned `200`, including `/api/serverMode`, `/api/loadSettings`, `/api/backendInitStatus`, `/api/loadProjectConfig`, `/api/getLatestLspDiagnostics`, `/api/getAIFollowSnapshot`, `/api/getListenerCoverage`, `/api/getAgentRuns`, and `/api/plugins/runtime`
    - caveat: the provided bootstrap URL token was rejected in that verifier session, but the already-authenticated `/settings` tab remained usable for the required visual verification
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `groupContainerLiveDictArea.tsx` boundary into the next higher-level scene-owned boundary before any broad Pixi node drawing lands.

## 2026-03-27 081

- Item: Lift the new `groupContainerLiveDictArea.tsx` boundary into one higher-level scene-owned section boundary above it.
- Status: `done`
- Details:
  - Added a typed section-level live dict-area boundary above the existing live dict-area surface/mount composition:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSection.tsx`
    - `frontend/src/components/Params/groupContainerLiveDictAreaSection.test.tsx`
  - Updated the production non-Pixi `GroupContainer` path to consume the new section boundary instead of reading the section-scoped store state and building the live dict-area input inline:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new section boundary now deterministically:
    - composes the current section-scoped selector state, capability hooks, display-name lookup, and live dict-area input shaping from one deeper component boundary
    - keeps the current DOM edge-strip and pinned/unpinned param-area surfaces intact while hiding the last section-state-to-live-dict-area wiring hop behind one higher-level boundary
    - preserves the existing non-Pixi block order and `maxNestedDepth` callback flow while shrinking `GroupContainer.tsx`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaSection.test.tsx src/components/Params/groupContainerLiveDictArea.test.tsx src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded successfully and the `All Settings` tab remained reachable in the bottom tab bar
    - the visible dict/param area rendered normally with no obvious clipping, overlap, or missing blocks after the new section-boundary wiring
    - representative visible labels and controls included `dictSectionDefault`, `textAreaParamCodeObjDefault`, `rotaryParamCodeObjDefault`, `codeParamCodeObjDefault`, `Core Name`, `Editable`, `Type`, `defaultVal`, `typeAnnotation`, and `Value`
    - representative requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/serverMode`, `GET /src/components/Params/groupContainerLiveDictAreaSection.tsx`, and `GET /src/components/Params/groupContainerLiveDictArea.tsx`
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `groupContainerLiveDictAreaSection.tsx` boundary into the next higher-level scene-owned boundary before any broad Pixi node drawing lands.

## 2026-03-27 082

- Item: Lift the new `groupContainerLiveDictAreaSection.tsx` boundary into one higher-level scene-owned section container above it.
- Status: `done`
- Details:
  - Added a typed live dict-area section-container boundary above the existing section boundary:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionContainer.tsx`
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionContainer.test.tsx`
  - Updated the production non-Pixi `GroupContainer` path to consume the new section-container boundary instead of owning the live dict-area `maxNestedDepth` state and `useParamColumnWidth(...)` wiring inline:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new section-container boundary now deterministically:
    - composes the current column-width hook and `maxNestedDepth` feedback loop from one deeper component boundary above `LiveDictAreaSection`
    - keeps the current DOM edge-strip and pinned/unpinned param-area surfaces intact while hiding the last section-boundary-to-column-width wiring hop behind one higher-level boundary
    - preserves the existing non-Pixi block order and live dict-area rendering behavior while shrinking `GroupContainer.tsx` further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaSectionContainer.test.tsx src/components/Params/groupContainerLiveDictAreaSection.test.tsx src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded authenticated with `All Settings` reachable and visible in the bottom tab strip
    - the visible dict/param area rendered normally after the new section-container wiring, with representative rows and controls including `Dropzone Param`, `Nested Param`, `Password Param`, `Rotary Param`, `Slider Param`, `Switch Param`, `Text Area Param`, `Text Param`, `Time Param`, and the `Size Mode Height` / `Size Mode Width` selectors
    - representative requests returned `200`, including `GET /`, `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/authRefreshStatus`, `GET /api/backendInitStatus`, `POST /api/getDefaultConfigName`, `POST /api/getFileBrowserRoot`, and `POST /api/loadAllProjectMetadata`; static frontend assets were expected `304` cache hits
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `groupContainerLiveDictAreaSectionContainer.tsx` boundary into the next higher-level `GroupContainer` shell boundary before any broad Pixi node drawing lands.

## 2026-03-27 083

- Item: Lift the new `groupContainerLiveDictAreaSectionContainer.tsx` boundary into one higher-level `GroupContainer` shell boundary above it.
- Status: `done`
- Details:
  - Added a typed `GroupContainer` shell boundary above the existing live dict-area section-container boundary:
    - `frontend/src/components/Params/groupContainerShell.tsx`
    - `frontend/src/components/Params/groupContainerShell.test.tsx`
  - Updated the production non-Pixi `GroupContainer` path to consume the new shell boundary instead of owning the shell-level fixed-height measurement, waiting overlay, and section-container mount inline:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - The new shell boundary now deterministically:
    - composes the current shell-level fixed-height measurement and pending-height flush behavior from one deeper component boundary above `LiveDictAreaSectionContainer`
    - keeps the current waiting spinner overlay and live dict-area section-container path intact while hiding the last shell-level observer and overlay wiring hop behind one higher-level boundary
    - preserves the existing non-Pixi dict/param shell structure while shrinking `GroupContainer.tsx` to the remaining DnD wrapper boundary
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerShell.test.tsx src/components/Params/groupContainerLiveDictAreaSectionContainer.test.tsx src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded successfully after the bootstrap handoff and the settings shell rendered normally
    - `All Settings` remained visible with no obvious clipping, overlap, or missing blocks after the new shell-boundary wiring
    - representative visible labels and controls included `Auto Refetch Callable Params On LSP Mismatch`, `Auto Backup`, `autobackupFreq 300`, `defaultTerminalShell null`, `Grid Color`, `Pan On Drag`, `Zoom On Scroll`, `label "Start"`, `machineGroupId ...`, `Size height 96.0 width 240.0`, and `View Mode`
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, and `POST /api/getFileBrowserRoot`
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `groupContainerShell.tsx` boundary into the next higher-level `GroupContainer` wrapper above the remaining `ParamDndContext` boundary before any broad Pixi node drawing lands.

## 2026-03-27 084

- Item: Lift the new `groupContainerShell.tsx` boundary into one higher-level `GroupContainer` wrapper above the remaining `ParamDndContext` boundary.
- Status: `done`
- Details:
  - Added a typed `GroupContainer` wrapper boundary above the existing shell boundary:
    - `frontend/src/components/Params/groupContainerWrapper.tsx`
  - Updated the production non-Pixi `GroupContainer` path to consume the new wrapper boundary instead of owning the final `ParamDndContext` shell handoff inline:
    - `frontend/src/components/Params/GroupContainer.tsx`
  - Updated focused coverage so the wrapper boundary is exercised directly on the live dict-area path:
    - `frontend/src/components/Params/GroupContainer.test.tsx`
  - The new wrapper boundary now deterministically:
    - composes the remaining param DnD provider hop from one deeper component boundary above `GroupContainerShell`
    - keeps the current shell-backed dict/param DOM path intact while hiding the last `ParamDndContext` wiring hop behind one higher-level boundary
    - preserves the existing non-Pixi dict/param structure while shrinking `GroupContainer.tsx` to a thin memoized export
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - bootstrapped auth through the current worktree backend and opened `/settings` with `All Settings` selected
    - the settings list and dict/param stack rendered normally with no obvious clipping, overlap, or missing blocks after the new wrapper-boundary wiring
    - representative visible entries included `stateMachineGateSectionDefault`, `dictSectionDefault`, `backend`, and `languageServer`
    - representative requests returned `200`, including `GET /api/authRefreshStatus`, `GET /api/backendInitStatus`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, and `GET /api/plugins/runtime`
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `groupContainerWrapper.tsx` boundary into the next higher-level live dict/param caller in `frontend/src/components/Section/Layouts/DictArea.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 085

- Item: Deepen the live dict-area section boundary by extracting the section input-shaping helper from `frontend/src/components/Params/groupContainerLiveDictAreaSection.tsx`.
- Status: `done`
- Details:
  - Continued from the current committed worktree state after the higher-level node-canary/live-dict-area boundary stack and outer `GroupContainer` wrapper/shell extraction already present in the worktree.
  - Extracted the live dict-area section input shaping into a new pure typed helper boundary:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionInput.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionInput.test.ts`
  - Updated `frontend/src/components/Params/groupContainerLiveDictAreaSection.tsx` to consume the new helper for:
    - unique param display-name collection across top-level ids plus nested path ids
    - live `LiveDictArea` input shaping, including connectability gating, display-name fallback, and pinned/unpinned payload assembly
  - Kept the current non-Pixi DOM path intact while reducing the inline coupling in `LiveDictAreaSection`:
    - the component still owns the store-backed selectors and hook wiring
    - the pure helper now owns the deterministic input contract passed into the live dict-area boundary
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaSectionInput.test.ts src/components/Params/groupContainerLiveDictAreaSection.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `All Settings` loaded without auth bootstrap and the visible settings shell plus dict/param area rendered normally
    - representative visible labels and controls included `settings`, `TAG`, `languageServer`, `gui`, `sectionSizingPolicy`, `shortcuts`, `backend`, the filter box, and bottom tabs `Core`, `Section Defaults Struct...`, `Section Defaults Conte...`, `Param Defaults`, and `All Settings`
    - relevant requests returned `200`, including `GET /api/loadSettings`, `GET /api/backendInitStatus`, `POST /api/loadProjectConfig`, `GET /api/authRefreshStatus`, and `GET /api/plugins/runtime`
- Next action:
  - Continue the cleanup-first pass on `frontend/src/components/Params/groupContainerLiveDictAreaSection.tsx` by extracting the remaining store-backed section-state selector above the new input helper before moving the retained-scene canary higher.

## 2026-03-27 086

- Item: Extract the remaining store-backed `LiveDictAreaSection` selector into a dedicated boundary hook.
- Status: `done`
- Details:
  - Added a typed store-backed boundary above the pure section builder:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionStoreBoundary.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionStoreBoundary.test.tsx`
  - Updated `frontend/src/components/Params/groupContainerLiveDictAreaSection.tsx` to consume the new hook instead of owning the share-capability, misc, settings, and project-store selection inline.
  - The new boundary preserves the existing non-Pixi behavior for:
    - composing `useShareCapabilities`, `useMisc`, `useSettings`, and `useProjectState(..., _.isEqual)` through one hook boundary
    - keeping the existing pure `groupContainerLiveDictAreaSectionBoundary.ts` contract and live dict/param DOM path unchanged
    - shrinking `LiveDictAreaSection.tsx` to a thin render wrapper above the live dict-area surface
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaSectionStoreBoundary.test.tsx src/components/Params/groupContainerLiveDictAreaSection.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded authenticated after the bootstrap handoff and `All Settings` was visible/selectable
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `shortcuts`, `gui`, `backend`, `sectionSizingPolicy`, `languageServer`, and `All Settings`
    - representative `200` responses included the `/settings` document plus Vite/frontend asset requests such as `index.css`, `@vite/client`, `src/index.tsx`, `src/App.tsx`, and `src/components/Pages/router.tsx`
- Next action:
  - Continue the cleanup-first pass by lifting the new `groupContainerLiveDictAreaSectionStoreBoundary.ts` hook into the next higher-level live dict-area caller above `groupContainerLiveDictAreaSection.tsx` before moving the retained-scene canary higher.

## 2026-03-27 086

- Item: Deepen the live dict-area section boundary by extracting the remaining store-backed section-state selector from `frontend/src/components/Params/groupContainerLiveDictAreaSection.tsx`.
- Status: `done`
- Details:
  - Added a new pure typed state helper above the existing section input helper:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionState.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionState.test.ts`
  - Updated `frontend/src/components/Params/groupContainerLiveDictAreaSection.tsx` to consume the new helper through a single `useProjectState(...)` selector instead of building the section-state payload and display-name selector inline.
  - Kept the current non-Pixi DOM path intact while reducing the remaining store-coupled logic in `LiveDictAreaSection`:
    - the new state helper now owns the deterministic store-backed section payload, including edge input labels, edge output label fallback, selected/style normalization, pinned/unpinned param maps, and display-name collection
    - the existing input helper still owns the final `LiveDictArea` boundary contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaSectionState.test.ts src/components/Params/groupContainerLiveDictAreaSectionInput.test.ts src/components/Params/groupContainerLiveDictAreaSection.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded cleanly and the expected settings shell remained visible, including `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, and `All Settings`
    - the dict/param area rendered normally after the extraction, with representative visible labels and controls including `sectionSizingPolicy`, `backend`, `shortcuts`, `languageServer`, `gui`, `Dict`, `Button Param`, `Code Param`, `Switch Param`, and `Text Param`
    - representative requests returned `200`, including `GET /__setta__/bootstrap`, `POST /__setta__/bootstrap/consume`, `GET /settings?...`, `GET /index.css`, and `GET /src/App.tsx?...`
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `groupContainerLiveDictAreaSectionState.ts` boundary into the next higher-level scene-owned boundary above `LiveDictAreaSection` before any broad Pixi node drawing lands.

## 2026-03-27 087

- Item: Lift the new `groupContainerLiveDictAreaSectionState.ts` boundary into one higher-level scene-owned boundary above `LiveDictAreaSection`.
- Status: `done`
- Details:
  - Added a new pure typed boundary above the existing section-state and section-input helpers:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionBoundary.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionBoundary.test.ts`
  - Updated `frontend/src/components/Params/groupContainerLiveDictAreaSection.tsx` to consume the new boundary through a single `useProjectState(...)` selector instead of stitching `groupContainerLiveDictAreaSectionState.ts` and `groupContainerLiveDictAreaSectionInput.ts` together inline.
  - Kept the current non-Pixi DOM path intact while shrinking `LiveDictAreaSection` further:
    - the new boundary now owns the deterministic composition from store-backed section state plus share/settings/misc-derived flags into the final `LiveDictArea` render input
    - `LiveDictAreaSection` now remains a thin hook adapter over the higher-level boundary and the existing `LiveDictArea` component
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaSectionBoundary.test.ts src/components/Params/groupContainerLiveDictAreaSection.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded and `All Settings` was visible in the bottom tab strip
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the new section-boundary wiring
    - representative visible labels and controls included `OVERVIEW`, `settings`, `Filter`, `TAG`, the tag list, and the bottom tabs `Core`, `Section Defaults Struct...`, `Section Defaults Conte...`, `Param Defaults`, and `All Settings`
    - representative requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/getAgentRuns`, `GET /api/plugins/runtime`, `POST /api/setActiveViewMode`, and `POST /api/setTopLevelSectionLayout`
    - note: the verifier also saw existing console warnings/errors including repeated React `Maximum update depth exceeded` plus accessibility warnings; they did not block rendering or this bounded verification, and this iteration did not investigate them
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `groupContainerLiveDictAreaSectionBoundary.ts` boundary into the next higher-level scene-owned boundary above `LiveDictAreaSection` before any broad Pixi node drawing lands.

## 2026-03-27 088

- Item: Lift the new `groupContainerLiveDictAreaSectionBoundary.ts` boundary into one higher-level scene-owned section-container boundary above `LiveDictAreaSection`.
- Status: `done`
- Details:
  - Added a new typed section-container boundary above the existing section boundary:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionContainerBoundary.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionContainerBoundary.test.tsx`
  - Updated `frontend/src/components/Params/groupContainerLiveDictAreaSectionContainer.tsx` to consume the new boundary instead of owning the `maxNestedDepth` state and `useParamColumnWidth(...)` wiring inline.
  - Kept the current non-Pixi DOM path intact while shrinking `LiveDictAreaSectionContainer` further:
    - the new boundary now owns the deterministic composition from the outer-ref/section props into the `LiveDictAreaSection` props that add `handleColumnResizeStart` plus `onMaxNestedDepthChange`
    - the boundary also stabilizes the nested-depth feedback loop by ignoring redundant `onMaxNestedDepthChange(...)` payloads whose pinned/unpinned depths did not actually change, preventing the infinite render cycle that the container test exposed
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaSectionContainerBoundary.test.tsx src/components/Params/groupContainerLiveDictAreaSectionContainer.test.tsx src/components/Params/groupContainerLiveDictAreaSection.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - the provided bootstrap URL token was rejected in that browser session, but the existing authenticated `/settings` tab remained usable
    - `All Settings` stayed visible/reachable and the visible settings shell plus dict/param area rendered normally after the new section-container boundary wiring
    - representative visible labels and controls included `Dict`, `Rotary Param`, `Switch Param`, `Text Param`, and `UI Type`, plus the surrounding settings shell and bottom tab strip
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `GET /api/getAgentRuns`, `POST /api/getFileBrowserRoot`, `POST /api/getFolderContents`, `GET /api/plugins/runtime`, and `POST /api/getLatestLspDiagnostics`
    - notable console noise was limited to existing accessibility warnings and repeated React 19 `element.ref` deprecation messages; the earlier `Maximum update depth exceeded` symptom did not reappear in this bounded verification
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `groupContainerLiveDictAreaSectionContainerBoundary.ts` boundary into the next higher-level scene-owned boundary above `LiveDictAreaSectionContainer` before any broad Pixi node drawing lands.

## 2026-03-27 089

- Item: Lift the remaining `GroupContainerShell` shell-level wiring into one higher-level boundary above `LiveDictAreaSectionContainer`.
- Status: `done`
- Details:
  - Added a new typed shell boundary above the existing live dict-area section-container boundary:
    - `frontend/src/components/Params/groupContainerShellBoundary.ts`
    - `frontend/src/components/Params/groupContainerShellBoundary.test.tsx`
  - Updated `frontend/src/components/Params/groupContainerShell.tsx` to consume the new boundary instead of owning the outer-ref, fixed-height measurement, pending-height flush, and waiting-state wiring inline.
  - Kept the current non-Pixi DOM path intact while shrinking `GroupContainerShell` further:
    - the new boundary now owns the deterministic composition from shell props into the `LiveDictAreaSectionContainer` input plus the waiting overlay signal
    - `GroupContainerShell` now remains a thin render wrapper over the shell boundary and the existing `LiveDictAreaSectionContainer`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerShellBoundary.test.tsx src/components/Params/groupContainerShell.test.tsx src/components/Params/groupContainerLiveDictAreaSectionContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded authenticated and `All Settings` remained visible
    - the visible settings shell plus dict/param area rendered normally after the shell-boundary extraction, with representative visible labels and controls including `Select A Section to Edit`, `Auto Backup`, `Grid Color`, `Param Defaults`, and `Section Defaults Content and Media`
    - representative requests returned `200`, including `GET /settings`, `GET /@vite/client`, `GET /index.css`, `GET /src/App.tsx?...`, `GET /api/getFileBrowserRoot`, and `GET /api/getFolderContents`
    - notable console noise was limited to existing React 19 `element.ref` warnings; no obvious clipping, overlap, or missing content was observed in the captured viewport
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `groupContainerShellBoundary.ts` boundary into the next higher-level live dict-area caller in `frontend/src/components/Section/Layouts/DictArea.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 090

- Item: Lift the new `groupContainerShellBoundary.ts` boundary into the next higher-level live dict-area caller in `frontend/src/components/Section/Layouts/DictArea.tsx`.
- Status: `done`
- Details:
  - Added a typed live dict-area layout boundary above the existing `GroupContainer` wrapper path:
    - `frontend/src/components/Section/Layouts/LiveDictAreaLayout.tsx`
  - Extended the existing dict-area view helper boundary so the live branch now shapes its `KwargsControls` and `ParamGroupContainer` props through one deterministic contract:
    - `frontend/src/components/Section/Layouts/dictAreaView.ts`
    - `frontend/src/components/Section/Layouts/dictAreaView.test.ts`
  - Updated the production non-Pixi `DictArea` path to consume the new live layout boundary instead of owning the last inline kwargs-plus-group-container handoff itself:
    - `frontend/src/components/Section/Layouts/DictArea.tsx`
    - `frontend/src/components/Section/Layouts/DictArea.test.tsx`
  - The new live dict-area layout boundary now deterministically:
    - composes the remaining `KwargsControls` and `ParamGroupContainer` hop from one deeper boundary above the `GroupContainer` shell/wrapper stack
    - keeps the current benchmark/live switch intact while hiding the last live dict/param caller wiring hop behind a dedicated layout boundary
    - preserves the existing non-Pixi settings dict/param DOM structure while shrinking `DictArea.tsx` to the benchmark gate plus one live-layout handoff
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Layouts/dictAreaView.test.ts src/components/Section/Layouts/DictArea.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded already authenticated and did not require consuming the provided bootstrap token in that browser session
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the new live-layout boundary wiring
    - representative visible labels and controls included `settings`, `gui`, `sectionSizingPolicy`, `backend`, `languageServer`, `shortcuts`, `Grid Color`, `Grid Color Dark Mode`, `Grid Pattern`, `Pan On Drag`, `Wire Color`, `Param Defaults`, and `All Settings`
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, and `POST /api/getAIFollowSnapshot`
    - notable console noise was limited to existing accessibility warnings about missing form `id`/`name` attributes and unmatched `aria-labelledby` targets; no runtime error investigation was needed for this bounded slice
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `LiveDictAreaLayout.tsx` boundary into the next higher-level section layout caller in `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 091

- Item: Lift the new `LiveDictAreaLayout.tsx` boundary into the next higher-level section layout caller in `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`.
- Status: `done`
- Details:
  - Added a typed section-container dict-area boundary above the existing live dict-area layout:
    - `frontend/src/components/Section/Container/SectionContainerDictArea.tsx`
    - `frontend/src/components/Section/Container/sectionContainerDictAreaView.ts`
    - `frontend/src/components/Section/Container/sectionContainerDictAreaView.test.ts`
  - Updated the production `AreaSwitch` dict branch to consume the new section-container boundary instead of calling `DictArea.tsx` directly:
    - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
    - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - Shrank `frontend/src/components/Section/Layouts/DictArea.tsx` to a live-only wrapper over `LiveDictAreaLayout`, so the benchmark/live routing now lives one level higher in the section-container caller.
  - Kept the current non-Pixi DOM path intact while lifting the dict-area handoff:
    - the new section-container boundary now owns the deterministic benchmark-vs-live routing above `LiveDictAreaLayout`
    - `AreaSwitch` still presents the same dict surface contract to the surrounding section chrome
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/sectionContainerDictAreaView.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Section/Layouts/DictArea.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded in the authenticated app and the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `settings`, `Filter`, `TAG`, `All Settings`, `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, `Open section in floating window`, `Lock position and size`, `Minimize section`, `Delete section`, `Remove arg`, and `Add arg`
    - representative requests returned `200`, including `GET /api/authRefreshStatus`, `GET /api/backendInitStatus`, `POST /api/loadSettings`, and `POST /api/loadProjectConfig`
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `SectionContainerDictArea.tsx` boundary into the next higher-level section-area routing boundary above `AreaSwitch` before any broad Pixi node drawing lands.

## 2026-03-27 092

- Item: Lift the `SectionContainerDictArea.tsx` boundary into the higher-level section-area routing boundary above `AreaSwitch`.
- Status: `done`
- Details:
  - Added a typed section-area routing boundary above the existing dict-area branch:
    - `frontend/src/components/Section/Container/SectionContainerArea.tsx`
    - `frontend/src/components/Section/Container/sectionContainerAreaView.ts`
    - `frontend/src/components/Section/Container/sectionContainerAreaView.test.ts`
  - Updated `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` so `AreaSwitch` is now a thin minimized/null gate plus delegation boundary instead of owning the direct section-type switch, chat-surface wiring, and dict-area handoff inline.
  - Kept the current non-Pixi DOM path intact while lifting the dict-area route one level higher:
    - the new section-area boundary now owns the deterministic section-type-to-area routing above `SectionContainerDictArea`
    - `AreaSwitch` still preserves the existing minimized behavior and default `chatHost="section_layout"` contract for its callers
    - chat, dict, and null-routing behavior now have a direct pure helper boundary instead of being tested only through the large render switch
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/sectionContainerAreaView.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded with the worktree session authenticated enough for `api/authRefreshStatus`, `api/loadSettings`, and `api/backendInitStatus` to return `200`
    - `All Settings` remained visible/reachable and the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `settings`, `TAG`, `gui`, `languageServer`, `backend`, `sectionSizingPolicy`, `shortcuts`, `Core`, `Param Defaults`, and `All Settings`
    - non-blocking console noise was limited to existing React 19 `element.ref` deprecation messages plus accessibility warnings about missing form `id/name` attributes and broken `aria-labelledby` targets
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `SectionContainerArea.tsx` boundary into the next higher-level section-window/body caller above `AreaSwitch` before any broad Pixi node drawing lands.

## 2026-03-27 093

- Item: Lift the `SectionContainerArea.tsx` boundary into the section-window caller above `AreaSwitch`.
- Status: `done`
- Details:
  - Added a dedicated window-surface body boundary plus a pure typed helper above the existing area renderer:
    - `frontend/src/components/Section/Container/SectionWindowSurfaceBody.tsx`
    - `frontend/src/components/Section/Container/sectionWindowSurfaceBodyView.ts`
    - `frontend/src/components/Section/Container/sectionWindowSurfaceBodyView.test.ts`
  - Updated `frontend/src/components/Section/Container/SectionWindowSurface.tsx` to consume the new boundary instead of delegating directly to `AreaSwitch`.
  - Kept the current non-Pixi window DOM path intact while lifting the higher-level handoff one step above `AreaSwitch`:
    - the new helper now owns the nullish `bodyOverride` fallback, minimized-to-null gate, and window-scoped `SectionContainerArea` prop shaping in one deterministic contract
    - `SectionWindowSurface` now remains focused on section chrome, theme resolution, and header wiring while the body fallback is isolated behind the new boundary
  - Updated the existing window-surface test to target the lifted boundary directly:
    - `frontend/src/components/Section/Container/SectionWindowSurface.test.tsx`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/sectionWindowSurfaceBodyView.test.ts src/components/Section/Container/SectionWindowSurface.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "workspace floating section windows switch threads through the section binding and survive reload"`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3043/`) in a fresh sub-agent context
    - reused the already-authenticated worktree tab instead of consuming the provided bootstrap token
    - opened `/settings`, created a floating section window, and confirmed the window still rendered live section body content after the new body-boundary wiring
    - representative requests returned `200`, including `POST /api/setTopLevelSectionLayout` and `POST /api/setProjectChatWindowingState`
- Next action:
  - Continue the first retained-scene node renderer work by lifting the remaining `SectionContainerArea.tsx` body caller in `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` above `AreaSwitch` before any broad Pixi node drawing lands.

## 2026-03-27 094

- Item: Lift the remaining `SectionContainerArea.tsx` body caller in `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` above `AreaSwitch`.
- Status: `done`
- Details:
  - Added a dedicated on-canvas section body boundary plus a pure typed helper above the existing area renderer:
    - `frontend/src/components/Section/Container/SectionCanvasBody.tsx`
    - `frontend/src/components/Section/Container/sectionCanvasBodyView.ts`
    - `frontend/src/components/Section/Container/sectionCanvasBodyView.test.ts`
  - Updated `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` to consume the new boundary instead of keeping the externalized-window placeholder gate, minimized-body suppression, and default `chatHost="section_layout"` handoff inline.
  - Removed the now-unused production `AreaSwitch` seam from `SectionContainerCoreResizabe.tsx` after both higher-level callers had been lifted above it.
  - Updated the existing section-container test to target the lifted canvas-body boundary directly:
    - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/sectionCanvasBodyView.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded cleanly after bootstrap auth and the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `setta`, `Project`, `Edit`, `Run`, workspace label `pixijs-rewrite`, `shortcuts`, `gui`, `backend`, `sectionSizingPolicy`, `languageServer`, and `All Settings`
    - representative requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, and `GET /api/serverMode`
    - non-blocking console noise was limited to repeated existing React 19 `element.ref` deprecation messages
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `SectionCanvasBody.tsx` boundary into the next higher-level section-container caller in `frontend/src/components/Section/Container/SectionContainerCore.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 095

- Item: Lift the `SectionCanvasBody.tsx` boundary into the next higher-level section-container caller in `frontend/src/components/Section/Container/SectionContainerCore.tsx`.
- Status: `done`
- Details:
  - Added a dedicated core-body boundary plus a pure typed helper above the existing on-canvas body renderer:
    - `frontend/src/components/Section/Container/SectionContainerCoreBody.tsx`
    - `frontend/src/components/Section/Container/sectionContainerCoreBodyView.ts`
    - `frontend/src/components/Section/Container/sectionContainerCoreBodyView.test.ts`
  - Updated `frontend/src/components/Section/Container/SectionContainerCore.tsx` to build the current canvas body once and inject it into the resizable shell instead of leaving the `SectionCanvasBody` / benchmark-placeholder decision inside `SectionContainerCoreResizabe.tsx`.
  - Shrunk `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` so it now stays focused on the resizable shell, chrome, and header/incrementer wiring while consuming an injected `body` prop from the higher-level caller.
  - Updated the existing section-container resizable test to cover the new injection seam while keeping the on-canvas body routing checks in the same focused test file:
    - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/sectionContainerCoreBodyView.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded authenticated with the page title `Settings` and visible connection state `Connected to server`
    - `All Settings` stayed visible/reachable and the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the new core-body boundary wiring
    - representative visible labels and controls included `Core`, `Section Defaults Structure and Code`, `Param Defaults`, `Auto Backup`, `Grid Color`, `basedpyright analysis`, `defaultZoomLevel`, `sectionSizingPolicy`, and `Core Name Editable`
    - representative requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `GET /api/getAgentProfiles`, `GET /api/getPromptTemplates`, `GET /api/getExternalAgentConfigs`, `GET /api/getEngineConfigs`, and `GET /api/getTranscriptionProfiles`
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `SectionContainerCoreBody.tsx` boundary into the next higher-level section-container caller in `frontend/src/components/Section/Container/SectionContainer.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 096

- Item: Lift the `SectionContainerCoreBody.tsx` boundary into the next higher-level section-container caller in `frontend/src/components/Section/Container/SectionContainer.tsx`.
- Status: `done`
- Details:
  - Added a pure typed section-container view boundary above the lifted core-body boundary:
    - `frontend/src/components/Section/Container/sectionContainerView.ts`
    - `frontend/src/components/Section/Container/sectionContainerView.test.ts`
  - Updated `frontend/src/components/Section/Container/SectionContainer.tsx` to build the current core body once and inject it into `SectionContainerCore` instead of leaving the `SectionContainerCoreBody` construction and branch-specific body wiring inside `SectionContainerCore.tsx`.
  - Updated `frontend/src/components/Section/Container/SectionContainerCore.tsx` so it now consumes an injected body element and compares the lifted body props in its memo boundary instead of ignoring the new higher-level body contract.
  - Added focused component coverage for the lifted section-container seam:
    - `frontend/src/components/Section/Container/SectionContainer.test.tsx`
  - Kept the current non-Pixi DOM path intact while shrinking the higher-level section caller:
    - the new helper now owns the deterministic render gating for generated-python visibility, joined code-terminal groups, nested-layout variant selection, and core-body prop shaping
    - `SectionContainer.tsx` now stays focused on store selection, active-state outline logic, and the final container wrapper shell
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/sectionContainerView.test.ts src/components/Section/Container/SectionContainer.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - used the existing authenticated worktree tab instead of consuming the provided bootstrap token
    - `All Settings` stayed visible and the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the lifted section-container body wiring
    - representative visible labels and controls included `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, `All Settings`, `shortcuts`, `gui`, `backend`, `sectionSizingPolicy`, and `languageServer`
    - representative requests returned `200`, including `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAIFollowSnapshot`, `POST /api/getListenerCoverage`, `GET /api/getExternalAgentHealth`, and `GET /api/getAgentProfiles`
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `sectionContainerView.ts` / `SectionContainerCoreBody.tsx` boundary into the next higher-level section-container caller in `frontend/src/components/Section/Container/SortableSectionContainer.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 097

- Item: Lift the `sectionContainerView.ts` / `SectionContainerCoreBody.tsx` boundary into the next higher-level section-container caller in `frontend/src/components/Section/Container/SortableSectionContainer.tsx`.
- Status: `done`
- Details:
  - Added a dedicated sortable-section body boundary plus a pure typed helper above the lifted `SectionContainer` call:
    - `frontend/src/components/Section/Container/SortableSectionBody.tsx`
    - `frontend/src/components/Section/Container/sortableSectionBodyView.ts`
    - `frontend/src/components/Section/Container/sortableSectionBodyView.test.ts`
    - `frontend/src/components/Section/Container/SortableSectionBody.test.tsx`
  - Updated `frontend/src/components/Section/Container/SortableSectionContainer.tsx` to consume the new boundary instead of owning the temp-placeholder vs live `SectionContainer` handoff inline.
  - Kept the current non-Pixi sortable DOM path intact while lifting the next section-container caller boundary one level higher:
    - the new helper now owns the deterministic routing between temp placeholder rendering, temp-section suppression once the initial transform is removed, and the regular `SectionContainer` drag-listener handoff
    - `SortableSectionContainer.tsx` now stays focused on sortable transform state, z-indexing, and edge-handle update scheduling while delegating the section-body branch through one deeper boundary
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/sortableSectionBodyView.test.ts src/components/Section/Container/SortableSectionBody.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded authenticated after bootstrap and the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible UI included the top app chrome, the `All Settings` tab in the bottom tab strip, and the dict/param panels
    - representative requests returned `200`, including `POST /api/loadSettings`, `GET /api/authRefreshStatus`, `GET /api/backendInitStatus`, and `POST /api/loadProjectConfig`
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `SortableSectionBody.tsx` boundary into the next higher-level nested-section caller in `frontend/src/components/Section/Container/ManyNestedSections.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 098

- Item: Lift the `SortableSectionBody.tsx` boundary into the next higher-level nested-section caller in `frontend/src/components/Section/Container/ManyNestedSections.tsx`.
- Status: `done`
- Details:
  - Added a dedicated nested-section body boundary plus a pure typed helper above the existing sortable section caller:
    - `frontend/src/components/Section/Container/ManyNestedSectionsBody.tsx`
    - `frontend/src/components/Section/Container/manyNestedSectionsView.ts`
    - `frontend/src/components/Section/Container/manyNestedSectionsView.test.ts`
    - `frontend/src/components/Section/Container/ManyNestedSectionsBody.test.tsx`
  - Updated `frontend/src/components/Section/Container/ManyNestedSections.tsx` to consume the new boundary instead of owning the tight-vs-default nested layout classes and direct `SortableSectionContainer` mapping inline.
  - Kept the current non-Pixi nested-section DOM path intact while lifting the next caller boundary one level higher:
    - the new helper now owns the deterministic layout-variant selection for tight, default, kanban, and task-list nested section stacks
    - the new body boundary now owns the direct `SortableSectionContainer` mapping plus the existing navigation-rail click handoff for non-group, non-kanban stacks
    - `ManyNestedSections.tsx` now stays focused on DnD child lookup, embedded-terminal filtering, and section-orientation/view-mode store selection
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/manyNestedSectionsView.test.ts src/components/Section/Container/ManyNestedSectionsBody.test.tsx`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/section-children-dnd-ui.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check required one bounded lifecycle recovery:
      - first fresh-context verifier session loaded `http://127.0.0.1:3044/settings` but stayed on the loading screen, so the visual gate could not be completed there
      - restarted the current non-main worktree once with `./aireset.sh`, which relaunched the worktree app on `http://127.0.0.1:3046/` / `http://127.0.0.1:8046`
      - reran the CDP check in a fresh sub-agent context after bootstrap via `http://127.0.0.1:8046/__setta__/bootstrap#token=...`
      - `/settings` then rendered normally with no obvious clipping, overlap, or missing major content in the visible nested-section/settings shell
      - representative visible labels and controls included `settings`, `Filter`, tag rows `gui`, `languageServer`, `sectionSizingPolicy`, `backend`, and `shortcuts`, section controls such as `Open section in floating window`, `Lock position and size`, `Minimize section`, and `Delete section`, plus bottom tabs `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, and `All Settings`
      - representative requests returned `200`, including `POST /__setta__/bootstrap/consume`, the frontend navigation to `/?__setta_backend_origin=http%3A%2F%2F127.0.0.1%3A8046`, and `GET /settings`
      - remaining console noise was limited to existing React 19 `element.ref` warnings
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `ManyNestedSectionsBody.tsx` boundary into the next higher-level nested-section caller in `frontend/src/components/Section/Container/SectionContainer.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 099

- Item: Lift the `ManyNestedSectionsBody.tsx` boundary into the next higher-level nested-section caller in `frontend/src/components/Section/Container/SectionContainer.tsx`.
- Status: `done`
- Details:
  - Added a dedicated nested-sections boundary plus a pure typed helper above the existing `MaybeManyNestedSections` caller:
    - `frontend/src/components/Section/Container/SectionContainerNestedSections.tsx`
    - `frontend/src/components/Section/Container/sectionContainerNestedSectionsView.ts`
    - `frontend/src/components/Section/Container/sectionContainerNestedSectionsView.test.ts`
  - Updated `frontend/src/components/Section/Container/SectionContainer.tsx` to consume the new boundary instead of owning the final `MaybeManyNestedSections` mount plus joined code-terminal `-mt-px` wrapper inline.
  - Kept the current non-Pixi nested-section DOM path intact while lifting the next caller boundary one level higher:
    - the new helper now owns the deterministic direct-vs-wrapped nested-section routing for standard containers versus joined code-terminal groups
    - `SectionContainer.tsx` now stays focused on store selection, core body construction, joined-shell outline chrome, and the higher-level container branch
  - Updated the existing section-container test to cover the lifted nested-sections seam:
    - `frontend/src/components/Section/Container/SectionContainer.test.tsx`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/sectionContainerNestedSectionsView.test.ts src/components/Section/Container/SectionContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - authenticated `/settings` successfully and the visible settings shell plus nested section/dict-param area rendered normally with no obvious clipping, overlap, or missing content after the lifted nested-sections boundary wiring
    - representative visible labels included `All Settings`, `dictSectionDefault`, `textParamCodeObjDefault`, `dateParamCodeObjDefault`, and `groupSectionDefault`
    - representative requests returned `200`, including `POST /api/loadSettings`, `GET /api/backendInitStatus`, `POST /api/loadAllProjectMetadata`, `POST /api/getFolderContents`, and `POST /api/setTopLevelSectionLayout`
- Next action:
  - Continue the first retained-scene node renderer work by lifting the new `SectionContainerNestedSections.tsx` boundary into the next higher-level caller in `frontend/src/components/Section/Container/SortableSectionBody.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 100

- Item: Lift the `SectionContainerNestedSections.tsx` boundary into the next higher-level caller in `frontend/src/components/Section/Container/SortableSectionBody.tsx`.
- Status: `done`
- Details:
  - Moved the nested-sections mount responsibility out of `SectionContainer.tsx` by turning it into an injected renderer seam:
    - `frontend/src/components/Section/Container/SectionContainer.tsx`
    - `frontend/src/components/Section/Container/SectionContainerNestedSections.tsx`
  - Updated the higher-level section callers to provide that renderer explicitly:
    - `frontend/src/components/Section/Container/SortableSectionBody.tsx`
    - `frontend/src/forks/xyflow/core/components/wrapNode.tsx`
  - Updated focused coverage to pin the new seam:
    - `frontend/src/components/Section/Container/SectionContainer.test.tsx`
    - `frontend/src/components/Section/Container/SortableSectionBody.test.tsx`
  - Kept the current non-Pixi DOM path intact while lifting the nested-sections boundary one caller higher:
    - `SectionContainer` now computes the nested-section props but no longer directly mounts `SectionContainerNestedSections`
    - `SortableSectionBody` and the direct top-level node wrapper now own the explicit nested-sections renderer handoff
    - the joined code-terminal nested-section flag still flows through the lifted seam without changing the visible settings surface
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/SectionContainer.test.tsx src/components/Section/Container/SortableSectionBody.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` was already authenticated and usable without consuming the bootstrap URL
    - `All Settings` stayed visible/reachable and the dict/param surface rendered normally with no obvious nested-sections regression
    - representative visible labels and controls included `languageServer`, `dictSectionDefault`, `gui`, `shortcuts`, `aspectRatio`, `Config Language`, `Hide Unpinned Params`, `Is Frozen`, `Is Minimized`, `Position And Size Locked`, `height`, `width`, `Auto Backup`, `Autosave`, and `Rename Refactor Mode`
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, and `POST /api/getLatestLspDiagnostics`
    - remaining console noise was limited to existing React 19 `element.ref` deprecation warnings
- Next action:
  - Continue the first retained-scene node renderer work by lifting the nested-sections renderer seam one caller higher above `SortableSectionBody.tsx` in the next section-surface caller before any broad Pixi node drawing lands.

## 2026-03-27 101

- Item: Lift the nested-sections renderer seam one caller higher into `frontend/src/components/Section/Container/SortableSectionContainer.tsx`.
- Status: `done`
- Details:
  - Turned `SortableSectionBody` into a pure injected seam for nested-section rendering:
    - `frontend/src/components/Section/Container/SortableSectionBody.tsx`
    - `frontend/src/components/Section/Container/sortableSectionBodyView.ts`
  - Updated `frontend/src/components/Section/Container/SortableSectionContainer.tsx` to own the standard `renderSectionContainerNestedSections(...)` handoff instead of leaving that import hardcoded inside `SortableSectionBody.tsx`.
  - Added focused coverage to pin both sides of the lifted seam:
    - `frontend/src/components/Section/Container/SortableSectionBody.test.tsx`
    - `frontend/src/components/Section/Container/SortableSectionContainer.test.tsx`
  - Kept the current non-Pixi nested-section DOM path intact while lifting the renderer one caller higher:
    - `SortableSectionBody` now only decides temp vs live section-body routing and delegates nested-section rendering entirely through its injected contract
    - `SortableSectionContainer` now owns the explicit default nested-section renderer handoff for sortable nested sections
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/SortableSectionBody.test.tsx src/components/Section/Container/SortableSectionContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/section-children-dnd-ui.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` was already authenticated and usable without consuming the provided bootstrap URL
    - the visible settings shell plus nested section / dict-param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `OVERVIEW`, `settings`, `All Settings`, `Param Defaults`, `Dictation Mode`, `Config Language`, `Open section in floating window`, `Lock position and size`, `Minimize section`, `Delete section`, and `Show Row Numbers`
    - representative requests returned `200`, including `POST /api/getFolderContents`, `GET /api/getAgentRuns`, and `POST /api/getFileBrowserRoot`
    - remaining console noise was limited to existing accessibility warnings about missing form `id/name` attributes and broken `aria-labelledby` targets
- Next action:
  - Continue the first retained-scene node renderer work by lifting the nested-sections renderer seam one caller higher above `SortableSectionContainer.tsx` in `frontend/src/components/Section/Container/ManyNestedSectionsBody.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 102

- Item: Lift the nested-section child renderer seam one caller higher into `frontend/src/components/Section/Container/ManyNestedSections.tsx`.
- Status: `done`
- Details:
  - Turned `ManyNestedSectionsBody` into an injected renderer seam for nested child sections instead of hardcoding `SortableSectionContainer`:
    - `frontend/src/components/Section/Container/ManyNestedSectionsBody.tsx`
    - `frontend/src/components/Section/Container/manyNestedSectionsView.ts`
  - Updated `ManyNestedSections.tsx` to own the default sortable child renderer handoff:
    - `frontend/src/components/Section/Container/ManyNestedSections.tsx`
  - Added focused coverage to pin both sides of the lifted seam:
    - `frontend/src/components/Section/Container/ManyNestedSectionsBody.test.tsx`
    - `frontend/src/components/Section/Container/ManyNestedSections.test.tsx`
  - Kept the current non-Pixi nested-section DOM path intact while lifting the renderer one caller higher:
    - `ManyNestedSectionsBody` now only owns layout shell selection plus navigation-rail chrome
    - `ManyNestedSections.tsx` now owns the explicit `SortableSectionContainer` renderer handoff for child sections
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/ManyNestedSectionsBody.test.tsx src/components/Section/Container/ManyNestedSections.test.tsx src/components/Section/Container/manyNestedSectionsView.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/section-children-dnd-ui.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - the supplied bootstrap token was rejected in that browser session (`Token rejected`; `POST /__setta__/bootstrap/consume` `401`), but the already-authenticated `/settings` tab remained usable
    - the visible settings shell plus nested section / dict-param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `settings`, `Filter`, `TAG`, `All`, `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, `All Settings`, and nested param labels such as `nestedParamCodeObjDefault`, `textAreaParamCodeObjDefault`, `textParamCodeObjDefault`, `dropdownParamCodeObjDefault`, `dropzoneParamCodeObjDefault`, `switchParamCodeObjDefault`, `sliderParamCodeObjDefault`, `rotaryParamCodeObjDefault`, and `passwordParamCodeObjDefault`
    - representative requests returned `200`, including `POST /api/getFolderContents`, `GET /api/getAgentRuns`, and `POST /api/setTopLevelSectionLayout`
- Next action:
  - Continue the first retained-scene node renderer work by lifting the nested-section child renderer seam one caller higher above `ManyNestedSections.tsx` in `frontend/src/components/Section/Container/SectionContainerNestedSections.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 103

- Item: Extract the edge-strip block into the first block-specific live surface helper above `groupContainerLiveDictAreaSurface.ts`.
- Status: `done`
- Details:
  - Added a pure typed live-surface helper for the dict-area edge strip:
    - `frontend/src/components/Params/groupContainerEdgeStripSurfaceBlock.ts`
    - `frontend/src/components/Params/groupContainerEdgeStripSurfaceBlock.test.ts`
  - Updated the higher-level `LiveDictAreaSurface` builder to compose through the new edge-strip helper instead of shaping the edge-strip surface block inline:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSurface.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the edge-strip renderer block into explicit component-facing surface props with stable `key`, `kind`, and `sectionId` wiring
    - keeping `groupContainerLiveDictAreaSurface.ts` as a composition boundary instead of a mixed composition-plus-edge-strip-shaping module
    - leaving the current DOM edge-strip mount path intact while deepening the live dict-area surface contract above the renderer boundary
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerEdgeStripSurfaceBlock.test.ts src/components/Params/groupContainerLiveDictAreaSurface.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded as the authenticated app shell and `All Settings` stayed visible
    - the settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative edge-adjacent controls remained present, including `toggle arg edges`, `Add arg`, `Remove arg`, and `Convert to edge connectors`
    - representative requests returned `200`, including `/api/loadProjectConfig`, `/api/getLatestLspDiagnostics`, `/api/getAIFollowSnapshot`, `/api/getListenerCoverage`, `/api/getEngineConfigs`, and `/api/setTopLevelSectionLayout`
- Next action:
  - Continue the live dict-area surface pass by extracting the pinned param-area block into the next block-specific surface helper above `groupContainerLiveDictAreaSurface.ts`.

## 2026-03-27 104

- Item: Extract the pinned param-area block into the next block-specific live surface helper above `groupContainerLiveDictAreaSurface.ts`.
- Status: `done`
- Details:
  - Added a pure typed live-surface helper for the dict-area pinned param area:
    - `frontend/src/components/Params/groupContainerPinnedParamAreaSurfaceBlock.ts`
    - `frontend/src/components/Params/groupContainerPinnedParamAreaSurfaceBlock.test.ts`
  - Updated the higher-level `LiveDictAreaSurface` builder to compose through the new pinned helper instead of shaping the pinned param-area surface block inline:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSurface.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the pinned param-area renderer block into explicit component-facing surface props with stable `key`, `kind`, and `sectionId` wiring
    - keeping `groupContainerLiveDictAreaSurface.ts` focused on higher-level block composition instead of mixed composition-plus-pinned-param-area shaping
    - leaving the current DOM pinned param-area mount path intact while deepening the live dict-area surface contract above the renderer boundary
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerPinnedParamAreaSurfaceBlock.test.ts src/components/Params/groupContainerLiveDictAreaSurface.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3043/settings`) in a fresh sub-agent context
    - the supplied bootstrap token was rejected in that browser session, but the active authenticated runtime session remained usable for verification
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the new pinned surface helper extraction
    - representative visible labels and controls included `PROJECT AI CHAT`, `CREATE PROJECT`, `SUMMARIZE CODEBASE`, `PLAN NEXT STEPS`, `All Settings`, `Project AI Settings`, `toggle snap to grid`, `toggle minimap`, and `Type a message...`
    - representative dict/param content remained visible, including `Auto Refetch Callable Params On LSP Mismatch`, `Auto Backup`, `defaultZoomLevel 1.0`, `Grid Color`, `Pan On Drag`, and `basedpyright analysis ...`
    - representative requests returned `200`, including `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, and `GET /api/plugins/runtime`
- Next action:
  - Continue the live dict-area surface pass by extracting the unpinned param-area block into the next block-specific surface helper above `groupContainerLiveDictAreaSurface.ts`.

## 2026-03-27 105

- Item: Extract the unpinned param-area block into the next block-specific live surface helper above `groupContainerLiveDictAreaSurface.ts`.
- Status: `done`
- Details:
  - Added a pure typed live-surface helper for the dict-area unpinned param area:
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaSurfaceBlock.ts`
    - `frontend/src/components/Params/groupContainerUnpinnedParamAreaSurfaceBlock.test.ts`
  - Updated the higher-level `LiveDictAreaSurface` builder to compose through the new unpinned helper instead of shaping the unpinned param-area surface block inline:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSurface.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the unpinned param-area renderer block into explicit component-facing surface props with stable `key`, `kind`, and `sectionId` wiring
    - keeping `groupContainerLiveDictAreaSurface.ts` focused on higher-level block composition instead of mixed composition-plus-unpinned-param-area shaping
    - leaving the current DOM unpinned param-area mount path intact while deepening the live dict-area surface contract above the renderer boundary
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerUnpinnedParamAreaSurfaceBlock.test.ts src/components/Params/groupContainerLiveDictAreaSurface.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - the settings shell rendered normally with `All Settings` visible and the dict/param area populated without obvious clipping, overlap, or missing content
    - representative visible controls included `toggle agentic edges`, `toggle arg edges`, `toggle snap to grid`, `fit view`, and settings panels such as `shortcuts`, `gui`, `backend`, `sectionSizingPolicy`, and `languageServer`
    - representative requests returned `200`, including `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/getDefaultConfigName`, `POST /api/getFileBrowserRoot`, `POST /api/loadAllProjectMetadata`, `POST /api/getFolderContents`, and `POST /api/checkWorkspaceInitialized`
    - remaining console noise was limited to existing React 19 `element.ref` deprecation warnings
- Next action:
  - Continue the live dict-area surface pass by lifting the now fully block-composed `LiveDictAreaSurface` builder into the next higher-level caller above `groupContainerLiveDictAreaSurface.ts`.

## 2026-03-27 106

- Item: Lift the block-composed `LiveDictAreaSurface` builder into a higher-level `LiveDictArea` view helper.
- Status: `done`
- Details:
  - Added a pure typed higher-level view helper above the existing surface boundary:
    - `frontend/src/components/Params/groupContainerLiveDictAreaView.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaView.test.ts`
  - Updated `LiveDictArea` to consume the new view helper instead of calling `buildLiveDictAreaSurface(...)` directly:
    - `frontend/src/components/Params/groupContainerLiveDictArea.tsx`
    - `frontend/src/components/Params/groupContainerLiveDictArea.test.tsx`
  - The new helper preserves the existing non-Pixi behavior for:
    - lifting the already block-composed surface plus its `maxNestedDepth` into one higher-level caller boundary
    - keeping `LiveDictArea` focused on React memo/effect wiring plus mount handoff instead of mixed composition-plus-surface-building work
    - leaving the current DOM mount path intact while deepening the live dict-area surface contract one caller above `groupContainerLiveDictAreaSurface.ts`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaView.test.ts src/components/Params/groupContainerLiveDictArea.test.tsx src/components/Params/groupContainerLiveDictAreaSurface.test.ts src/components/Params/groupContainerLiveDictAreaMount.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded authenticated without a login/bootstrap blocker
    - representative visible labels and controls included `Select A Section to Edit`, `Param Defaults`, `All Settings`, `Grid Color`, `Pan On Drag`, `Auto Backup`, `Autosave`, and `Completion Guard Enabled`
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, and `POST /api/loadProjectConfig`
- Next action:
  - Continue the live dict-area surface pass by lifting the new `groupContainerLiveDictAreaView.ts` boundary into the next higher-level caller above `groupContainerLiveDictArea.tsx`.

## 2026-03-27 107

- Item: Lift the live dict-area layout wiring into the higher-level `DictArea` and section-container callers above the current live dict-area path.
- Status: `done`
- Details:
  - Added a typed live dict-area boundary in `Section/Layouts` above the current layout renderer:
    - `frontend/src/components/Section/Layouts/DictAreaLiveBoundary.tsx`
    - `frontend/src/components/Section/Layouts/DictAreaLiveBoundary.test.tsx`
  - Updated the existing live layout renderer to accept already-built layout props instead of rebuilding them inline:
    - `frontend/src/components/Section/Layouts/LiveDictAreaLayout.tsx`
  - Routed both higher-level live dict-area callers through the new boundary so the last live-layout-view-to-renderer hop is hidden behind one deeper module:
    - `frontend/src/components/Section/Layouts/DictArea.tsx`
    - `frontend/src/components/Section/Container/SectionContainerDictArea.tsx`
    - `frontend/src/components/Section/Container/sectionContainerDictAreaView.ts`
    - `frontend/src/components/Section/Container/sectionContainerDictAreaView.test.ts`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping the current `KwargsControls` plus `ParamGroupContainer` DOM path intact while moving the live dict-area layout-view wiring into one higher-level boundary
    - keeping the benchmark dict-area branch untouched while aligning the live section-container path with the new `DictAreaLiveBoundary` contract
    - shrinking both `DictArea.tsx` and `SectionContainerDictArea.tsx` so they no longer own the last live dict-area layout wiring hop inline
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Layouts/DictAreaLiveBoundary.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/dictAreaView.test.ts src/components/Section/Container/sectionContainerDictAreaView.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - the provided bootstrap token was rejected in that browser session, so the verifier reused the existing authenticated `/settings` tab
    - `All Settings` stayed visible and the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the new boundary wiring
    - representative visible labels and controls included `toggle agentic edges`, `toggle arg edges`, `toggle snap to grid`, `Create chat window`, `Create project`, `Summarize codebase`, `Plan next steps`, the tabs `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, and `All Settings`, plus the dict/param cards `shortcuts`, `gui`, `backend`, `sectionSizingPolicy`, and `languageServer`
    - representative requests returned `200`, including `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAIFollowSnapshot`, `POST /api/getListenerCoverage`, `GET /api/llm/config`, `GET /api/getAgentProfiles`, `GET /api/getPromptTemplates`, `GET /api/getEngineConfigs`, and `POST /api/setTopLevelSectionLayout`
- Next action:
  - Continue the live dict-area surface pass by lifting the new `SectionContainerDictArea` boundary into the next higher-level dict-area dispatch caller in `frontend/src/components/Section/Container/SectionContainerArea.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 108

- Item: Lift the `SectionContainerDictArea` boundary into the next higher-level dict-area dispatch caller in `frontend/src/components/Section/Container/SectionContainerArea.tsx`.
- Status: `done`
- Details:
  - Added a dedicated dict-area dispatch boundary above the existing `SectionContainerDictArea` renderer:
    - `frontend/src/components/Section/Container/SectionContainerAreaDictBoundary.tsx`
    - `frontend/src/components/Section/Container/SectionContainerAreaDictBoundary.test.tsx`
  - Updated `frontend/src/components/Section/Container/SectionContainerArea.tsx` to consume the new boundary instead of owning the benchmark/live dict branch inline.
  - Narrowed the higher-level area test so it now verifies dict routing through the lifted boundary instead of re-testing the benchmark/live split there:
    - `frontend/src/components/Section/Container/SectionContainerArea.test.tsx`
  - Kept the current non-Pixi DOM path intact while lifting the dict dispatch one caller higher:
    - the new boundary now owns the `useSettingsAllSettingsBenchmark()` hook plus the `buildSectionContainerAreaDictView(...)` benchmark-vs-live routing
    - `SectionContainerArea.tsx` now stays focused on section-type dispatch and no longer mixes higher-level area routing with dict benchmark/live switching
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/sectionContainerAreaView.test.ts src/components/Section/Container/SectionContainerAreaDictBoundary.test.tsx src/components/Section/Container/SectionContainerArea.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check required one bounded lifecycle recovery:
    - the first fresh-context verifier could not attach to a usable browser-devtools page, so the required visual gate could not be completed there
    - restarted the current non-main worktree once with `./aireset.sh`, which relaunched the worktree app on `http://127.0.0.1:3045/` / `http://127.0.0.1:8045`
    - retried the CDP check in a fresh sub-agent context against `http://127.0.0.1:3045/settings`
    - the visible settings shell plus dict/param area then rendered normally with no obvious clipping, overlap, or missing content; representative visible labels and controls included `settings`, `Filter`, `languageServer`, `sectionSizingPolicy`, `shortcuts`, `gui`, `backend`, and the bottom tabs `Core`, `Section Defaults Struct...`, `Section Defaults Conte...`, `Param Defaults`, and `All Settings`
    - representative requests returned `200`, including `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/serverMode`, `GET /api/backendInitStatus`, and `GET /api/authRefreshStatus`; `GET /settings` returned `304`
    - the fresh bootstrap token route returned `401` in that browser session, but direct navigation to the restarted worktree settings page still succeeded
- Next action:
  - Continue the live dict-area surface pass by lifting the new `SectionContainerAreaDictBoundary.tsx` seam into the next higher-level area caller above `SectionContainerArea.tsx`, starting with `frontend/src/components/Section/Container/SectionCanvasArea.tsx`.

## 2026-03-27 108

- Item: Lift the `SectionContainerDictArea` benchmark-vs-live dict routing into `frontend/src/components/Section/Container/SectionContainerArea.tsx`.
- Status: `done`
- Details:
  - Moved the benchmark-vs-live dict dispatch up into a new higher-level area helper boundary owned by `SectionContainerArea`:
    - `frontend/src/components/Section/Container/SectionContainerArea.tsx`
    - `frontend/src/components/Section/Container/sectionContainerAreaDictView.ts`
    - `frontend/src/components/Section/Container/sectionContainerAreaDictView.test.ts`
    - `frontend/src/components/Section/Container/SectionContainerArea.test.tsx`
  - Shrunk `SectionContainerDictArea` back down to a thin live-only wrapper over `DictAreaLiveBoundary`, removing the lower benchmark/live routing seam from that module:
    - `frontend/src/components/Section/Container/SectionContainerDictArea.tsx`
  - Updated the nearby routing/integration coverage to pin the new ownership boundary and the actual `LiveDictAreaLayout` prop seam:
    - `frontend/src/components/Section/Container/sectionContainerAreaView.test.ts`
    - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping dict sections on the live `SectionContainerDictArea` path whenever the benchmark is inactive or the full body is enabled
    - switching dict sections to `SettingsAllSettingsBenchmarkDictArea` only when the benchmark disables the full section body
    - leaving `SectionContainerDictArea` focused on the live dict-area renderer handoff instead of mixed benchmark/live dispatch
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/SectionContainerArea.test.tsx src/components/Section/Container/sectionContainerAreaDictView.test.ts src/components/Section/Container/sectionContainerAreaView.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded authenticated and stayed usable without a login wall or blank shell
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the higher-level dict boundary lift
    - representative visible labels and controls included `Project`, `Edit`, `Run`, project name `pixijs-rewrite`, bottom tabs `Core`, `Section Defaults Struct...`, `Section Defaults Conte...`, `Param Defaults`, and `All Settings`, plus settings cards `backend`, `gui`, `languageServer`, `shortcuts`, and `sectionSizingPolicy`
    - representative sampled requests returned `200`, including `GET /settings` and the Vite/frontend asset requests used to load the page
- Next action:
  - Continue the live dict-area surface pass by lifting the new area-level dict boundary above `SectionContainerArea.tsx` into the next higher-level section body caller on the canvas path before any broad Pixi node drawing lands.

## 2026-03-27 109

- Item: Lift the area-level dict boundary above `SectionContainerArea.tsx` into the next higher-level canvas body caller in `frontend/src/components/Section/Container/SectionCanvasBody.tsx`.
- Status: `done`
- Details:
  - Added a higher-level canvas-area boundary and helper above the existing section-area renderer:
    - `frontend/src/components/Section/Container/SectionCanvasArea.tsx`
    - `frontend/src/components/Section/Container/sectionCanvasAreaView.ts`
    - `frontend/src/components/Section/Container/sectionCanvasAreaView.test.ts`
  - Updated the canvas-body boundary to hand off its on-canvas branch through the new higher-level boundary instead of shaping lower-level `SectionContainerArea` props inline:
    - `frontend/src/components/Section/Container/SectionCanvasBody.tsx`
    - `frontend/src/components/Section/Container/sectionCanvasBodyView.ts`
    - `frontend/src/components/Section/Container/sectionCanvasBodyView.test.ts`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping window-placeholder and minimized-section suppression inside `SectionCanvasBody`
    - moving the `chatHost: "section_layout"` and area-prop shaping into one deeper canvas-area helper above `SectionContainerArea`
    - leaving the current dict benchmark/live dispatch and chat surface behavior intact while shrinking the canvas-body boundary
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/sectionCanvasAreaView.test.ts src/components/Section/Container/sectionCanvasBodyView.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - reused an already authenticated `/settings` tab because it was already available in that browser session
    - `All Settings` stayed visible and the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the new canvas-area boundary wiring
    - representative visible labels and controls included `Project`, `Edit`, `Run`, `All Settings`, `Auto Refetch Callable Params On LSP Mismatch`, `Auto Backup`, `Autosave`, `sectionSizingPolicy`, `languageServer`, and the chat actions `CREATE PROJECT`, `SUMMARIZE CODEBASE`, and `PLAN NEXT STEPS`
    - representative requests returned `200`, including `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAIFollowSnapshot`, `POST /api/getListenerCoverage`, `GET /api/getFileBrowserRoot`, `POST /api/getFolderContents`, and `POST /api/setTopLevelSectionLayout`
- Next action:
  - Continue the live dict-area surface pass by lifting the new `SectionCanvasArea.tsx` boundary into the next higher-level section body caller in `frontend/src/components/Section/Container/SectionContainerCoreBody.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 110

- Item: Lift the `SectionCanvasArea.tsx` boundary into the next higher-level section body caller in `frontend/src/components/Section/Container/SectionContainerCoreBody.tsx`.
- Status: `done`
- Details:
  - Added a higher-level core-body boundary above the existing canvas-body renderer:
    - `frontend/src/components/Section/Container/SectionContainerCoreCanvasBody.tsx`
    - `frontend/src/components/Section/Container/SectionContainerCoreCanvasBody.test.tsx`
  - Updated `frontend/src/components/Section/Container/SectionContainerCoreBody.tsx` to hand off its live section-body path through the new boundary instead of owning the benchmark-to-canvas switch inline.
  - Kept the current non-Pixi DOM path intact while shrinking `SectionContainerCoreBody` further:
    - the new boundary now owns the benchmark placeholder vs live `SectionCanvasBody` renderer split
    - `SectionContainerCoreBody.tsx` now remains a thin wrapper over the higher-level boundary and the existing typed view contract
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/SectionContainerCoreCanvasBody.test.tsx src/components/Section/Container/sectionContainerCoreBodyView.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - the settings shell loaded normally and the core/body layout stayed intact after the refactor
    - representative visible labels and controls included `Core`, `Section Defaults Structure and Code`, `Param Defaults`, `All Settings`, `Auto Refetch Callable Params On LSP Mismatch`, and `Auto Backup`
    - representative requests returned `200`, including `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAIFollowSnapshot`, `POST /api/getListenerCoverage`, `GET /api/plugins/runtime`, and `GET /api/llm/config`
    - no console errors were present during the check
- Next action:
  - Continue the live dict-area surface pass by lifting the new `SectionContainerCoreCanvasBody.tsx` boundary into the next higher-level section core caller in `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 111

- Item: Lift the `SectionContainerCoreCanvasBody.tsx` boundary into the next higher-level section core caller in `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`.
- Status: `done`
- Details:
  - Added a pure typed resizable-shell view helper above the existing core canvas-body boundary:
    - `frontend/src/components/Section/Container/sectionContainerCoreResizableView.ts`
    - `frontend/src/components/Section/Container/sectionContainerCoreResizableView.test.ts`
  - Updated `SectionContainerCoreResizabe.tsx` to own the higher-level body handoff directly instead of receiving a prebuilt body element:
    - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
    - the shell now renders `SectionContainerCoreCanvasBody` itself and keeps the benchmark/header/meta-menu/incrementer decisions behind the new typed view helper
  - Propagated the lifted typed `bodyProps` seam through the higher-level callers and removed the now-redundant wrapper component:
    - `frontend/src/components/Section/Container/SectionContainerCore.tsx`
    - `frontend/src/components/Section/Container/SectionContainer.tsx`
    - deleted `frontend/src/components/Section/Container/SectionContainerCoreBody.tsx`
  - Updated nearby integration coverage to pin the new contract:
    - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
    - `frontend/src/components/Section/Container/SectionContainer.test.tsx`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping `SectionContainerCoreResizabe.tsx` as the higher-level owner of section chrome plus the lifted core canvas-body boundary
    - shrinking the section-core seam from a rendered `body` element to typed `bodyProps` routed through the higher-level callers
    - leaving the current DOM/live canvas path intact while deepening the section-core contract above `SectionContainerCoreCanvasBody.tsx`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/sectionContainerCoreResizableView.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Section/Container/SectionContainer.test.tsx src/components/Section/Container/SectionContainerCoreCanvasBody.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - the authenticated settings shell loaded and `All Settings` stayed visible
    - the dict/param area rendered without obvious clipping, overlap, or missing content after the lifted resizable-shell boundary
    - representative requests returned `200`, including `/api/serverMode`, `/api/loadSettings`, `/api/backendInitStatus`, and `/api/authRefreshStatus`
- Next action:
  - Continue the live dict-area surface pass by lifting the new `SectionContainerCoreResizabe.tsx` body boundary into the next higher-level section core caller in `frontend/src/components/Section/Container/SectionContainerCore.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 112

- Item: Lift the `SectionContainerCoreResizabe.tsx` body boundary into the next higher-level section core caller in `frontend/src/components/Section/Container/SectionContainerCore.tsx`.
- Status: `done`
- Details:
  - Updated `SectionContainerCore.tsx` to own the live `SectionContainerCoreCanvasBody` handoff directly instead of leaving that ownership inside the resizable shell:
    - `frontend/src/components/Section/Container/SectionContainerCore.tsx`
  - Shrunk `SectionContainerCoreResizabe.tsx` back down to a pure shell that renders `children`, removing the lower body-renderer ownership from that module:
    - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  - Added focused coverage for the lifted ownership boundary and updated the resizable-shell test to pin its new child-rendering contract:
    - `frontend/src/components/Section/Container/SectionContainerCore.test.tsx`
    - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping `SectionContainerCore.tsx` as the higher-level owner of the core canvas-body boundary
    - leaving `SectionContainerCoreResizabe.tsx` responsible only for the resizable shell, header/meta-menu, and incrementer chrome
    - keeping the current DOM/live canvas path intact while deepening the section-core contract above `SectionContainerCoreResizabe.tsx`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/SectionContainerCore.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` stayed authenticated and the page remained usable
    - the visible settings shell and dict/param area rendered normally with no obvious clipping, overlap, or missing content after the lifted body boundary
    - representative visible labels and controls included `Project`, `Edit`, `Run`, `Open settings`, `Select A Section to Edit`, `Auto Refetch Callable Params On LSP Mismatch`, `Auto Backup`, `Grid Color`, `Zoom On Scroll`, `Core`, `Param Defaults`, and `All Settings`
    - representative requests returned `200`, including `GET /settings`, `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, and `POST /api/loadProjectConfig`
- Next action:
  - Continue the live dict-area surface pass by lifting the new `SectionContainerCore.tsx` body boundary into the next higher-level caller in `frontend/src/components/Section/Container/SectionContainer.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 113

- Item: Lift the `SectionContainerCore.tsx` body boundary into the next higher-level caller in `frontend/src/components/Section/Container/SectionContainer.tsx`.
- Status: `done`
- Details:
  - Updated `SectionContainer.tsx` to own the live `SectionContainerCoreCanvasBody` handoff directly instead of leaving that ownership inside `SectionContainerCore.tsx`:
    - `frontend/src/components/Section/Container/SectionContainer.tsx`
  - Shrunk `SectionContainerCore.tsx` back down to a higher-level shell that now accepts shell props plus children rather than the lifted body props:
    - `frontend/src/components/Section/Container/SectionContainerCore.tsx`
  - Updated the typed view contract so the section-container view now carries the shell-facing `sectionTypeName` and `bgColor` props separately from the body props:
    - `frontend/src/components/Section/Container/sectionContainerView.ts`
  - Updated focused coverage to pin the new ownership seam:
    - `frontend/src/components/Section/Container/SectionContainer.test.tsx`
    - `frontend/src/components/Section/Container/SectionContainerCore.test.tsx`
    - `frontend/src/components/Section/Container/sectionContainerView.test.ts`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping `SectionContainer.tsx` as the higher-level owner of the live core-canvas-body boundary
    - leaving `SectionContainerCore.tsx` responsible only for the section shell, handles, outline/state styling, and resizable chrome
    - keeping the current DOM/live canvas path intact while deepening the section-container contract above `SectionContainerCore.tsx`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/sectionContainerView.test.ts src/components/Section/Container/SectionContainer.test.tsx src/components/Section/Container/SectionContainerCore.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded authenticated after bootstrap and stayed usable
    - visible labels and controls included `All Settings`, `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, plus the settings shell and dict/param area panels
    - the visible surface showed no obvious clipping, overlap, or missing content after the lifted ownership boundary
    - representative requests returned `200`, including `POST /api/loadSettings`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `POST /api/getFileBrowserRoot`, `POST /api/loadAllProjectMetadata`, and `GET /api/backendInitStatus`
- Next action:
  - Continue the live dict-area surface pass by lifting the new `SectionContainer.tsx` body boundary into the next higher-level caller, starting with `frontend/src/components/Section/Container/SortableSectionBody.tsx`, before any broad Pixi node drawing lands.

## 2026-03-27 114

- Item: Lift the `SectionContainer.tsx` body boundary into the next higher-level caller, starting with `frontend/src/components/Section/Container/SortableSectionBody.tsx`.
- Status: `done`
- Details:
  - Updated `frontend/src/components/Section/Container/SectionContainer.tsx` so it no longer instantiates `SectionContainerCoreCanvasBody` inline:
    - the section container now accepts a typed `renderCoreBody(...)` boundary and remains responsible for the higher-level section shell plus nested-section routing
  - Lifted the live core-canvas-body handoff into the sortable section caller:
    - `frontend/src/components/Section/Container/SortableSectionBody.tsx`
    - `frontend/src/components/Section/Container/SortableSectionBody.test.tsx`
  - Updated focused coverage for the lifted section-container seam:
    - `frontend/src/components/Section/Container/SectionContainer.test.tsx`
  - Fixed the remaining direct production caller introduced by the new contract so the live node path still renders on the canvas:
    - `frontend/src/forks/xyflow/core/components/wrapNode.tsx`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping `SortableSectionBody.tsx` as the higher-level owner of the live `SectionContainerCoreCanvasBody` boundary for sortable sections
    - leaving `SectionContainer.tsx` focused on the section shell, joined code-terminal wrapper, and nested-section routing instead of mixed shell-plus-body ownership
    - keeping the current DOM/live canvas path intact for both sortable sections and the direct xyflow node wrapper while deepening the section-container contract above `SectionContainer.tsx`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/SectionContainer.test.tsx src/components/Section/Container/SortableSectionBody.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - first result: failed
    - cause: the lifted `renderCoreBody(...)` contract surfaced one remaining direct production caller in `frontend/src/forks/xyflow/core/components/wrapNode.tsx` with runtime error `renderCoreBody is not a function`
    - rerun after patching `wrapNode.tsx`: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded and the settings shell rendered normally with tabs `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, and `All Settings` visible
    - representative visible labels and controls included `Project`, `Edit`, `Run`, `Open settings`, `Auto Backup`, `Pan On Drag`, `Grid Color`, and `Project AI Settings`
    - no obvious clipping, overlap, or missing content was observed in the visible viewport
    - representative requests returned `200`, including `/api/loadProjectConfig`, `/api/getLatestLspDiagnostics`, `/api/getAIFollowSnapshot`, `/api/getListenerCoverage`, and related bootstrap calls
- Next action:
  - Continue the live dict-area surface pass by lifting the new `SortableSectionBody.tsx` body boundary into the next higher-level sortable caller in `frontend/src/components/Section/Container/SortableSectionContainer.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 115

- Item: Lift the `SortableSectionBody.tsx` body boundary into the next higher-level sortable caller in `frontend/src/components/Section/Container/SortableSectionContainer.tsx`.
- Status: `done`
- Details:
  - Updated `frontend/src/components/Section/Container/SortableSectionContainer.tsx` to own the live `SectionContainerCoreCanvasBody` handoff directly instead of leaving that ownership inside `SortableSectionBody.tsx`:
    - the sortable container now provides the typed `renderCoreBody(...)` boundary alongside the existing nested-sections renderer
  - Shrunk `frontend/src/components/Section/Container/SortableSectionBody.tsx` down to a thinner sortable/body adapter that only routes its caller-provided body renderer into `SectionContainer`
  - Extended the sortable body prop contract to carry the lifted body-renderer seam:
    - `frontend/src/components/Section/Container/sortableSectionBodyView.ts`
  - Updated focused coverage to pin the new ownership boundary:
    - `frontend/src/components/Section/Container/SortableSectionContainer.test.tsx`
    - `frontend/src/components/Section/Container/SortableSectionBody.test.tsx`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping `SortableSectionContainer.tsx` as the higher-level owner of the live `SectionContainerCoreCanvasBody` boundary for sortable sections
    - leaving `SortableSectionBody.tsx` focused on temp-section suppression and `SectionContainer` routing instead of mixed routing-plus-body ownership
    - keeping the current DOM/live canvas path intact while deepening the sortable-section contract above `SortableSectionBody.tsx`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/SortableSectionContainer.test.tsx src/components/Section/Container/SortableSectionBody.test.tsx src/components/Section/Container/sortableSectionBodyView.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` stayed authenticated after bootstrap and `All Settings` remained visible
    - the visible settings shell and dict/param area showed no obvious clipping, overlap, or missing content after the lifted sortable boundary
    - representative visible labels and controls included `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, `Grid Color`, `Pan On Drag`, `Auto Backup`, and `Autosave`
    - representative requests returned `200`, including `GET /api/authRefreshStatus`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, and `GET /api/getLatestLspDiagnostics`
- Next action:
  - Continue the live dict-area surface pass by lifting the new `SortableSectionContainer.tsx` body boundary into the next higher-level sortable caller before any broad Pixi node drawing lands.

## 2026-03-27 116

- Item: Lift the `SortableSectionContainer.tsx` body boundary into the next higher-level sortable caller in `frontend/src/components/Section/Container/ManyNestedSections.tsx`.
- Status: `done`
- Details:
  - Updated `frontend/src/components/Section/Container/ManyNestedSections.tsx` to own the live `SectionContainerCoreCanvasBody` handoff for nested sortable sections instead of leaving that default core-body renderer hardcoded inside `SortableSectionContainer.tsx`:
    - `frontend/src/components/Section/Container/ManyNestedSections.tsx`
    - `frontend/src/components/Section/Container/SortableSectionContainer.tsx`
  - The sortable container now accepts the typed `renderCoreBody(...)` prop from its caller and forwards it through the temp/regular sortable path down to `SortableSectionBody`.
  - Updated focused coverage to pin the lifted ownership seam:
    - `frontend/src/components/Section/Container/ManyNestedSections.test.tsx`
    - `frontend/src/components/Section/Container/SortableSectionContainer.test.tsx`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping `ManyNestedSections.tsx` as the higher-level owner of the live `SectionContainerCoreCanvasBody` boundary for nested sortable sections
    - leaving `SortableSectionContainer.tsx` focused on sortable transform state, z-indexing, edge-handle scheduling, and routing the caller-provided body renderer through the sortable shell
    - keeping the current DOM/live canvas path intact while deepening the nested-sortable contract above `SortableSectionContainer.tsx`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/SortableSectionContainer.test.tsx src/components/Section/Container/ManyNestedSections.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - the bootstrap token was rejected in the fresh bootstrap tab, so verification used the already-open authenticated live `/settings` session
    - `All Settings` remained visible and the settings shell, visible dict/param area, and canvas path rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `Auto Refetch Callable Params On LSP Mismatch`, `Auto Backup`, `Autosave`, `Grid Color`, `Pan On Drag`, `By Type Browser`, and `Callable`
    - representative requests returned `200`, including `POST /api/getFolderContents` and `POST /api/getFileBrowserRoot`
- Next action:
  - Continue the live dict-area surface pass by lifting the nested sortable-section body boundary into the next higher-level caller above `ManyNestedSections.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 117

- Item: Lift the nested sortable-section renderer boundary into the next higher-level caller above `frontend/src/components/Section/Container/ManyNestedSections.tsx`.
- Status: `done`
- Details:
  - Updated `frontend/src/components/Section/Container/ManyNestedSections.tsx` so it no longer hardcodes the default nested sortable-section renderer:
    - `MaybeManyNestedSections` now accepts a caller-owned typed `renderNestedSections(...)` boundary and routes it through the existing DnD/body seam
  - Lifted the default nested sortable-section renderer into `frontend/src/components/Section/Container/SectionContainerNestedSections.tsx`:
    - the higher-level nested-sections boundary now owns the production `SortableSectionContainer` + `SectionContainerCoreCanvasBody` handoff for the live graph path
  - Routed the standalone section surface through the same higher-level boundary so the direct page path no longer bypasses the lifted nested-sections contract:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`
  - Updated focused coverage to pin the new ownership seam:
    - `frontend/src/components/Section/Container/ManyNestedSections.test.tsx`
    - `frontend/src/components/Section/Container/SectionContainerNestedSections.test.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping `SectionContainerNestedSections.tsx` as the higher-level owner of the default nested sortable-section renderer
    - leaving `ManyNestedSections.tsx` focused on nested-section state selection, terminal filtering, and DnD/body routing instead of owning the production renderer choice
    - routing both the graph path and standalone section surface through the same lifted nested-sections contract while keeping the current DOM/live canvas path intact
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/ManyNestedSections.test.tsx src/components/Section/Container/SectionContainerNestedSections.test.tsx src/components/Section/Container/sectionContainerNestedSectionsView.test.ts src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - used the existing authenticated `/settings` session; bootstrap was not needed
    - `All Settings` remained visible and the visible dict/param area rendered with no obvious clipping, overlap, or missing content after the lifted nested-sections renderer boundary
    - representative visible labels and controls included `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, `All Settings`, `defaultZoomLevel`, `Grid Color`, `Auto Refetch Callable Params On LSP Mismatch`, and `basedpyright analysis`
    - representative requests returned `200`, including `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAIFollowSnapshot`, `POST /api/getListenerCoverage`, and `POST /api/setTopLevelSectionLayout`
- Next action:
  - Continue the live dict-area surface pass by lifting the nested-section renderer seam into the next higher-level caller above `SectionContainerNestedSections.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 118

- Item: Lift the nested-section renderer seam into the next higher-level caller above `frontend/src/components/Section/Container/SectionContainerNestedSections.tsx`.
- Status: `done`
- Details:
  - Updated `frontend/src/components/Section/Container/SortableSectionContainer.tsx` so the sortable shell no longer hardcodes `renderSectionContainerNestedSections(...)` internally:
    - `SortableSectionContainer` now accepts a typed caller-owned `renderNestedSections(...)` boundary and threads it through the temp/regular sortable path down to `SortableSectionBody`
  - Updated `frontend/src/components/Section/Container/SectionContainerNestedSections.tsx` so the higher-level nested-sections boundary now owns the recursive renderer injection for each child sortable section:
    - each rendered `SortableSectionContainer` now receives both the lifted `renderCoreBody(...)` boundary and the recursive `renderNestedSections(...)` boundary from its caller
  - This deepens the non-Pixi section-container contract by removing the hardcoded lower-level import from `SortableSectionContainer.tsx` back into `SectionContainerNestedSections.tsx` while keeping the current live DOM/canvas path intact.
  - Updated focused coverage to pin the lifted ownership seam:
    - `frontend/src/components/Section/Container/SortableSectionContainer.test.tsx`
    - `frontend/src/components/Section/Container/SectionContainerNestedSections.test.tsx`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/SortableSectionContainer.test.tsx src/components/Section/Container/SectionContainerNestedSections.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `All Settings` remained visible and the settings shell plus visible dict/param area rendered normally with no obvious clipping, overlap, or missing content after the lifted nested-section renderer seam
    - representative visible labels and controls included `Grid Color`, `Pan On Drag`, `minHeight 120.0`, and `Size Mode Height`
    - representative requests returned `200`, including `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getListenerCoverage`, `GET /api/getFileBrowserRoot`, and `POST /api/getFolderContents`
- Next action:
  - Continue the live dict-area surface pass by lifting the now-caller-owned nested-section renderer seam one level higher in the section-container stack before any broad Pixi node drawing lands.

## 2026-03-27 119

- Item: Lift the default nested-section renderer ownership above `frontend/src/components/Section/Container/SectionContainerNestedSections.tsx`.
- Status: `done`
- Details:
  - Split the generic wrapped/unwrapped nested-sections view from the live recursive renderer injection:
    - `frontend/src/components/Section/Container/SectionContainerNestedSections.tsx`
    - `frontend/src/components/Section/Container/SectionContainerNestedSectionsBoundary.tsx`
  - The generic `SectionContainerNestedSections` boundary now only owns:
    - the `MaybeManyNestedSections` handoff
    - the joined-code-terminal wrapper decision from `sectionContainerNestedSectionsView.ts`
    - the caller-owned `renderNestedSections(...)` seam
  - Lifted the live recursive sortable-section ownership into the new higher-level boundary and routed the current live callers through it:
    - `frontend/src/forks/xyflow/core/components/wrapNode.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`
  - Updated focused coverage to pin both sides of the split:
    - `frontend/src/components/Section/Container/SectionContainerNestedSections.test.tsx`
    - `frontend/src/components/Section/Container/SectionContainerNestedSectionsBoundary.test.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping the recursive `SortableSectionContainer` + `SectionContainerCoreCanvasBody` injection on the live graph path
    - leaving `SectionContainerNestedSections.tsx` as a thinner renderer boundary that no longer owns the production recursion choice inline
    - routing both the xyflow node path and the standalone section surface through the same higher-level nested-sections boundary
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/SectionContainerNestedSections.test.tsx src/components/Section/Container/SectionContainerNestedSectionsBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - bootstrapped the worktree auth and confirmed `/settings` stayed authenticated with `All Settings` visible
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the boundary lift
    - representative visible labels and controls included `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, `All Settings`, `defaultZoomLevel 1.0`, `Grid Color`, `Pan On Drag`, and `Auto Backup`
    - representative requests returned `200`, including `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAIFollowSnapshot`, `POST /api/getListenerCoverage`, `GET /api/plugins/runtime`, and `GET /api/llm/apiKeys`
- Next action:
  - Continue the live dict-area surface pass by lifting the now-caller-owned nested-section boundary one level higher above `frontend/src/components/Section/Container/SectionContainerNestedSectionsBoundary.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 120

- Item: Lift the now-caller-owned nested-section boundary one level higher above `frontend/src/components/Section/Container/SectionContainerNestedSectionsBoundary.tsx` in the live xyflow node wrapper path.
- Status: `done`
- Details:
  - Added a typed higher-level section-container boundary for the live node path:
    - `frontend/src/components/Section/Container/SectionContainerBoundary.tsx`
  - Updated the xyflow node wrapper to consume the new boundary instead of wiring the default core-body and nested-sections renderers inline:
    - `frontend/src/forks/xyflow/core/components/wrapNode.tsx`
  - Added focused coverage to pin the lifted ownership seam:
    - `frontend/src/components/Section/Container/SectionContainerBoundary.test.tsx`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping the live xyflow node wrapper on the same `SectionContainer` DOM/canvas path
    - moving the default `SectionContainerCoreCanvasBody` plus `SectionContainerNestedSectionsBoundary` ownership into one higher-level boundary above `wrapNode.tsx`
    - leaving `wrapNode.tsx` focused on node positioning, drag behavior, resize observation, and wrapper chrome instead of section-container renderer assembly
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/SectionContainerBoundary.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` stayed authenticated without needing a new bootstrap consume
    - the visible settings shell, dict/param area, and representative controls such as `Core`, `Section Defaults Structure and Code`, `Param Defaults`, and `All Settings` rendered normally with no obvious clipping, overlap, or missing content
    - representative requests returned `200`, including `/settings`, `/api/loadSettings`, `/api/loadProjectConfig`, `/api/backendInitStatus`, and `/api/authRefreshStatus`
- Next action:
  - Continue the live dict-area surface pass by lifting the remaining standalone-section caller one level higher above `frontend/src/components/Section/Container/SectionContainerNestedSectionsBoundary.tsx`, starting with `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`, before any broad Pixi node drawing lands.

## 2026-03-27 121

- Item: Lift the remaining standalone-section caller one level higher above `frontend/src/components/Section/Container/SectionContainerNestedSectionsBoundary.tsx` in the standalone project surface route.
- Status: `done`
- Details:
  - Added a typed higher-level standalone section surface boundary for the standalone route path:
    - `frontend/src/components/Section/Container/StandaloneSectionSurfaceBoundary.tsx`
    - `frontend/src/components/Section/Container/StandaloneSectionSurfaceBoundary.test.tsx`
  - Updated `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` to consume the new boundary instead of wiring `SectionWindowSurface` plus the group/list nested-sections override inline.
  - Updated `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx` so the page test now treats the standalone section surface as the caller-owned boundary instead of mocking the lower-level nested-sections + window-surface seam directly.
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping standalone group/list-root section routes on the same nested-sections-only body override path
    - keeping standalone non-group section routes on the default `SectionWindowSurface` body path
    - leaving `StandaloneProjectSurfacePage.tsx` focused on route/ownership decisions instead of section-surface assembly details
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/StandaloneSectionSurfaceBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug"`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings/section/languageserver`) in a fresh sub-agent context
    - the provided bootstrap token was rejected with `401` in that browser session, so verification reused the existing authenticated worktree session
    - the standalone section surface loaded successfully on the `languageServer` route and the visible viewport showed the section plus `ARGS` panel with no obvious clipping, overlap, or missing content
    - representative requests returned `200`, including `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, and `GET /api/plugins/runtime`
- Next action:
  - Continue the live dict-area surface pass by lifting the new standalone section-surface boundary one level higher in the standalone route stack before any broad Pixi node drawing lands.

## 2026-03-27 122

- Item: Lift the new standalone section-surface boundary one level higher in the standalone route stack.
- Status: `done`
- Details:
  - Added a typed higher-level standalone route boundary above the section/chat/window surface implementations:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfaceRouteBoundary.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfaceRouteBoundary.test.tsx`
  - Updated `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` to consume the new route boundary instead of directly assembling the standalone project-chat frame, standalone section surface, window-space surface, and route-owned not-found shells inline.
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping `StandaloneProjectSurfacePage.tsx` focused on route param resolution, load/title/auth state, and route-owned error-state bookkeeping instead of target-surface assembly
    - keeping standalone section routes on the same lifted `StandaloneSectionSurfaceBoundary` path while moving the surrounding route-shell ownership one level higher
    - keeping standalone project chat and window-space routes on their existing DOM/live surface paths while routing them through one caller-owned boundary in the standalone route stack
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfaceRouteBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/components/Pages/Project/ShareStandaloneProjectSurfacePage.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug|wraps standalone project chat routes in the shared project-chat frame"`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app in a fresh sub-agent context after bootstrapping with the provided token
    - `http://127.0.0.1:3044/settings/section/languageserver` stayed authenticated and rendered the expected section UI with visible labels such as `languageServer`, `ARGS`, `Filter`, `basedpyright`, `analysis`, and `diagnosticSeverityOverrides`, with no obvious clipping, overlap, or missing content
    - `http://127.0.0.1:3044/settings/chat` stayed authenticated and rendered the chat settings surface with visible controls such as `Search conversations`, `New Chat`, `View Threads`, `Project AI Settings`, `CREATE PROJECT`, and `Type a message...`, with no obvious clipping, overlap, or missing content
    - representative requests returned `200`, including `GET /api/authRefreshStatus`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAIFollowSnapshot`, `POST /api/getListenerCoverage`, `GET /api/plugins/runtime`, `GET /api/llm/config`, and `GET /api/getExternalAgentHealth`
- Next action:
  - Continue the live dict-area surface pass by lifting the standalone route-owned target/render switch one level higher in the standalone page stack before any broad Pixi node drawing lands.

## 2026-03-27 123

- Item: Lift the standalone page-owned loading / not-found / blocked / route render switch one level higher in the standalone page stack.
- Status: `done`
- Details:
  - Added a typed higher-level standalone page boundary above the route surface implementations:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageBoundary.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageBoundary.test.tsx`
  - Updated `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` to consume the new page boundary instead of directly switching between the loading spinner, route-owned not-found shell, managed-chat-blocked shell, and the lifted `StandaloneProjectSurfaceRouteBoundary`.
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping `StandaloneProjectSurfacePage.tsx` focused on route param resolution, project/chat/window-space ownership state, managed-chat eligibility bookkeeping, and document-title updates
    - keeping the final render switch for standalone page load/error/blocked/route states behind one caller-owned boundary above the standalone route boundary
    - leaving the already-lifted standalone route boundary responsible only for route-target surface rendering after the page-level gate resolves
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfacePageBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/components/Pages/Project/ShareStandaloneProjectSurfacePage.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug|deployment allowLLM=false blocks managed standalone section and window-space routes|wraps standalone project chat routes in the shared project-chat frame"`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in a fresh sub-agent context
    - bootstrapped the authenticated worktree app and verified `http://127.0.0.1:3044/settings/chat` rendered cleanly with visible labels including `Settings`, `Start a new thread`, `Create Project`, `Summarize Codebase`, `Plan Next Steps`, and `Type a message...`, with no obvious clipping, overlap, or missing controls
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `GET /api/getAgentProfiles`, `GET /api/getPromptTemplates`, and `GET /api/plugins/runtime`
    - note: a direct follow-up navigation to `http://127.0.0.1:3044/settings/section/languageserver` in that browser session resolved to the route-owned `Section Not Found` shell instead of the expected section surface; the targeted standalone section-route Playwright spec above still passed in isolation for this slice
- Next action:
  - Continue the live dict-area surface pass by lifting the remaining standalone page-owned route-state bookkeeping seam one level higher above `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 124

- Item: Lift the remaining standalone page-owned route-state bookkeeping seam one level higher above `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`.
- Status: `done`
- Details:
  - Added a typed higher-level standalone page state boundary above the lower page render boundary:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageStateBoundary.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageStateBoundary.test.tsx`
  - Updated `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` to hand off the remaining standalone route-state bookkeeping into the new boundary instead of owning it inline.
  - The new boundary now owns the non-Pixi standalone page state seam for:
    - standalone project-chat thread title derivation from route-owned history
    - owner-key/error-code bookkeeping for same-tab standalone surface transitions
    - managed-chat block decisions before the lower route/page boundary renders
    - standalone project-chat route navigation path construction
    - standalone document-title updates for chat, section, and window-space routes
  - The refactor preserves the existing non-Pixi behavior while leaving `StandaloneProjectSurfacePage.tsx` focused on route params, store selection, share-policy inputs, and lifecycle hooks.
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfacePageStateBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePageBoundary.test.tsx src/components/Pages/Project/ShareStandaloneProjectSurfacePage.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in a fresh sub-agent context
    - CDP was reachable and the existing authenticated worktree session stayed usable
    - `http://127.0.0.1:3044/settings/chat` rendered normally with visible controls including `New Chat`, `View Threads`, `Project AI Settings`, `Create Project`, `Summarize Codebase`, `Plan Next Steps`, and `Send message`
    - `http://127.0.0.1:3044/settings/section/languageserver` rendered normally with visible labels and controls including `languageServer`, `ARGS`, `Remove arg`, `Add arg`, `Filter`, and `basedpyright`
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAIFollowSnapshot`, and `POST /api/getListenerCoverage`
    - console status was clean apart from a preexisting accessibility warning about form fields lacking `id` or `name`
- Next action:
  - Continue the live dict-area surface pass by lifting the remaining standalone target-resolution/store-selection seam one level higher above `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 125

- Item: Lift the remaining standalone target-resolution/store-selection seam one level higher above `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`.
- Status: `done`
- Details:
  - Added a typed higher-level standalone target boundary above the lifted page-state boundary:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageTargetBoundary.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageTargetBoundary.test.tsx`
  - Updated `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` to hand off the remaining standalone target-resolution and store-selection work into the new boundary instead of owning it inline.
  - The new boundary now owns the non-Pixi standalone page seam for:
    - resolving route params into the lifted `StandaloneSurfaceTarget` for project-chat, section, and window-space routes
    - selecting the store-backed `projectConfigId`, standalone window-space config, and managed-chat authority inputs needed by the lower page-state boundary
    - deriving `canUseManagedChat` from the share session and building project-chat history entries for the lifted standalone route state
  - The refactor preserves the existing non-Pixi behavior while leaving `StandaloneProjectSurfacePage.tsx` focused on route params, config-load state, navigation, and the page-level lifecycle hooks.
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfacePageTargetBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/components/Pages/Project/ShareStandaloneProjectSurfacePage.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts`
    - result: passed (`38` passed)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in a fresh sub-agent context
    - `http://127.0.0.1:3044/settings/chat` rendered cleanly with visible controls including `Search conversations`, `New Chat`, `View Threads`, `Project AI Settings`, `CREATE PROJECT`, `SUMMARIZE CODEBASE`, and `PLAN NEXT STEPS`
    - `http://127.0.0.1:3044/settings/section/languageserver` rendered cleanly with visible labels and controls including `languageServer`, `ARGS`, `Filter`, `basedpyright`, and the arg rows
    - no obvious clipping, overlap, or missing content was visible in either route
    - representative requests returned `200`, including `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, and `GET /api/plugins/runtime`
- Next action:
  - Continue the live dict-area surface pass by lifting the remaining standalone route-param/load-state seam one level higher above `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 126

- Item: Lift the remaining standalone route-param/load-state seam one level higher above `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`.
- Status: `done`
- Details:
  - Added a typed higher-level standalone page route/load boundary above the lifted target boundary:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.test.tsx`
  - Updated `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` to consume the new boundary instead of directly owning:
    - `useLoadProjectConfig()`
    - `useParams()`
    - `useNavigate()`
    - the page-level `useCodeMirrorStyleLoader`, `useAddMouseLocationListener`, and `usePluginRuntimeBootstrap` hook wiring
  - The refactor preserves the existing non-Pixi behavior while leaving `StandaloneProjectSurfacePage.tsx` focused on the route entrypoint handoff and the reusable `StandaloneProjectSurfacePageWithLoadState` export for the share wrapper path.
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/components/Pages/Project/ShareStandaloneProjectSurfacePage.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts`
    - result: passed (`38` passed)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in a fresh sub-agent context
    - the bootstrap page loaded but `POST /__setta__/bootstrap/consume` returned `401` in that browser session; the already-usable worktree session still rendered both standalone routes directly
    - `http://127.0.0.1:3044/settings/chat` rendered cleanly with visible controls including `Search conversations`, `New Chat`, `View Threads`, `Project AI Settings`, `Start a new thread`, `Create Project`, `Summarize Codebase`, `Plan Next Steps`, `Type a message...`, and `Send message`
    - `http://127.0.0.1:3044/settings/section/languageserver` rendered cleanly with visible labels and controls including `Remove arg`, `Add arg`, `Pin selected args`, `Convert to edge connectors`, `Delete selected args`, `Filter`, `basedpyright`, `analysis`, and `diagnosticSeverityOverrides`
    - representative requests returned `200`, including `GET /settings/chat`, `GET /settings/section/languageserver`, `GET /index.css`, `GET /@vite/client`, and `GET /src/index.tsx?...`
- Next action:
  - Continue the live dict-area surface pass by lifting the new standalone page route/load boundary one level higher in the standalone/share route stack before any broad Pixi node drawing lands.

## 2026-03-27 127

- Item: Lift the standalone/share route stack one level higher above `frontend/src/components/Pages/Project/ShareStandaloneProjectSurfacePage.tsx`.
- Status: `done`
- Details:
  - Added a typed higher-level share-route boundary for the standalone project surface stack:
    - `frontend/src/components/Pages/Project/ShareStandaloneProjectSurfacePageBoundary.tsx`
    - `frontend/src/components/Pages/Project/ShareStandaloneProjectSurfacePageBoundary.test.tsx`
  - Updated `frontend/src/components/Pages/Project/ShareStandaloneProjectSurfacePage.tsx` to consume the new boundary instead of directly assembling `ShareWrapper`, `ModalContainer`, and `StandaloneProjectSurfacePageWithLoadState`.
  - Updated `frontend/src/components/Pages/Project/ShareStandaloneProjectSurfacePage.test.tsx` so the page test now treats the share route as a thin entrypoint above the lifted share boundary instead of mocking the lower standalone load-state seam directly.
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping the share standalone surface on the same `ShareWrapper manageTitle={false}` path
    - keeping the modal-wrapped standalone surface handoff on the same lifted `StandaloneProjectSurfacePageWithLoadState` path
    - leaving `ShareStandaloneProjectSurfacePage.tsx` focused on the route entrypoint instead of share-wrapper assembly details
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/ShareStandaloneProjectSurfacePageBoundary.test.tsx src/components/Pages/Project/ShareStandaloneProjectSurfacePage.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug|wraps standalone project chat routes in the shared project-chat frame"`
    - result: passed (`2` passed)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in fresh sub-agent contexts
    - `http://127.0.0.1:3044/settings/chat` rendered normally with visible controls including `Search conversations`, `New Chat`, `View Threads`, `Project AI Settings`, and the message composer/send controls, with no obvious clipping, overlap, or missing content
    - representative requests returned `200`, including `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, and `GET /api/plugins/runtime`
    - the bootstrap token was rejected in later browser sessions, so the follow-up section-route verification reused the existing authenticated worktree tab
    - `http://127.0.0.1:3044/settings/section/languageserver` rendered the expected section surface with visible labels and controls including `languageServer`, `ARGS`, `Filter`, `basedpyright`, and `analysis`, with no obvious clipping, overlap, or missing content
- Next action:
  - Continue the live dict-area surface pass by lifting the remaining share-route entry seam one level higher above `frontend/src/components/Pages/Project/ShareStandaloneProjectSurfacePage.tsx`, starting with the standalone/share route element assembly in `frontend/src/components/Pages/router.tsx`, before any broad Pixi node drawing lands.

## 2026-03-27 128

- Item: Lift the standalone/share route-element assembly seam out of `frontend/src/components/Pages/router.tsx`.
- Status: `done`
- Details:
  - Added a typed standalone route-elements boundary above the lifted standalone/share page entrypoints:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfaceRouteElements.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfaceRouteElements.test.tsx`
  - Updated `frontend/src/components/Pages/router.tsx` to consume the new boundary instead of directly assembling the IDE/share standalone surface route elements inline.
  - The new boundary now owns the non-Pixi standalone/share route-element seam for:
    - wrapping the IDE standalone surface in the shared `GlobalWrapper` + `ModalContainer` route shell
    - handing the share route element off to `ShareStandaloneProjectSurfacePage`
    - preserving caller-supplied `app` and `launcher` route elements while leaving `router.tsx` focused on route ordering, path IDs, and higher-level `ModeWrapper` assembly
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfaceRouteElements.test.tsx src/components/Pages/router.test.tsx src/components/Pages/Project/ShareStandaloneProjectSurfacePage.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug|deployment allowLLM=false blocks managed standalone section and window-space routes|wraps standalone project chat routes in the shared project-chat frame"`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in a fresh sub-agent context
    - bootstrap succeeded and redirected into the authenticated app shell without needing an existing tab fallback
    - `http://127.0.0.1:3044/settings/chat` rendered cleanly with visible controls including `Settings`, `New`, `Hide Threads`, `Search in conversation`, `Start a new thread`, and `Type a message...`
    - `http://127.0.0.1:3044/settings/section/languageserver` rendered cleanly with visible labels and controls including `languageServer`, `ARGS`, `Filter`, `basedpyright`, `analysis`, and `diagnosticSeverityOverrides`
    - representative requests returned `200`, including `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAIFollowSnapshot`, `POST /api/getListenerCoverage`, and `GET /api/plugins/runtime`
- Next action:
  - Continue the live dict-area surface pass by lifting the remaining standalone/share route-definition seam one level higher above `frontend/src/components/Pages/router.tsx`, using the new route-elements boundary as the caller-facing input for the remaining standalone route-object assembly before any broad Pixi node drawing lands.

## 2026-03-27 129

- Item: Lift the standalone/share route-definition seam out of `frontend/src/components/Pages/router.tsx`.
- Status: `done`
- Details:
  - Added a typed standalone route-definition helper above the lifted route-elements boundary:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfaceRoutes.ts`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfaceRoutes.test.tsx`
  - Updated `frontend/src/components/Pages/router.tsx` to consume the new helper instead of defining the four standalone route objects inline.
  - The new helper now owns the non-Pixi standalone/share route-definition seam for:
    - preserving the canonical standalone route order for chat-thread, chat, window-space, and section routes
    - rendering each standalone route object through the caller-owned `ModeWrapper` boundary built from the already-lifted standalone/share route elements
    - leaving `router.tsx` focused on the higher-level route stack ordering and non-standalone route definitions instead of repeated standalone route-object assembly
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfaceRoutes.test.tsx src/components/Pages/router.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug|deployment allowLLM=false blocks managed standalone section and window-space routes|wraps standalone project chat routes in the shared project-chat frame"`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in a fresh sub-agent context
    - bootstrapped the current worktree session successfully and both `http://127.0.0.1:3044/settings/chat` and `http://127.0.0.1:3044/settings/section/languageserver` stayed authenticated
    - `/settings/chat` rendered normally with visible controls including `Search conversations`, `New Group`, `New Chat`, `View Threads`, `Project AI Settings`, `Start a new thread`, `CREATE PROJECT`, `SUMMARIZE CODEBASE`, `PLAN NEXT STEPS`, and the message composer, with no obvious clipping, overlap, or missing content
    - `/settings/section/languageserver` rendered normally with visible controls including `languageServer`, `ARGS`, `Remove arg`, `Add arg`, `Filter`, `basedpyright`, `analysis`, and `diagnosticSeverityOverrides`, with no obvious clipping, overlap, or missing content
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `GET /api/getAgentProfiles`, `GET /api/getPromptTemplates`, `GET /api/getFileBrowserRoot`, and `POST /api/getFolderContents`
- Next action:
  - Continue the live dict-area surface pass by lifting the remaining standalone/share route-stack insertion seam one level higher above `frontend/src/components/Pages/router.tsx`, starting with the standalone route-array ownership in the top-level `appRoutes` stack before any broad Pixi node drawing lands.

## 2026-03-27 130

- Item: Lift the standalone/share route-array insertion seam out of the top-level `appRoutes` stack in `frontend/src/components/Pages/router.tsx`.
- Status: `done`
- Details:
  - Added a typed standalone app-routes helper above the lifted route-definition boundary:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfaceAppRoutes.ts`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfaceAppRoutes.test.tsx`
  - Updated `frontend/src/components/Pages/router.tsx` to consume the new helper instead of inserting `standaloneProjectSurfaceRoutes` directly into the top-level `appRoutes` array inline.
  - The new helper now owns the non-Pixi standalone/share route-array insertion seam for:
    - preserving the canonical top-level route order of `index`, `home`, `workspaceLaunch`, standalone chat/thread/window-space/section routes, `viewMode`, `project`, and `catchAll`
    - keeping the lifted standalone route objects inserted between `workspaceLaunchRoute` and `viewModeRoute` without cloning the caller-owned route objects
    - leaving `router.tsx` focused on route element assembly, route object construction, and router creation instead of the last inline standalone route-stack splice
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfaceAppRoutes.test.tsx src/components/Pages/router.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug|deployment allowLLM=false blocks managed standalone section and window-space routes|wraps standalone project chat routes in the shared project-chat frame"`
    - result: passed (`3` passed)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in a fresh sub-agent context
    - the provided bootstrap token was rejected in that browser session, so the verifier reused an existing authenticated worktree tab
    - `http://127.0.0.1:3044/settings/chat` rendered cleanly with visible controls including `Search conversations`, `New Group`, `New Chat`, `View Threads`, `Project AI Settings`, `Search in conversation`, `Start a new thread`, `CREATE PROJECT`, `SUMMARIZE CODEBASE`, `PLAN NEXT STEPS`, `Type a message...`, and `Send message`
    - `http://127.0.0.1:3044/settings/section/languageserver` rendered cleanly with visible labels and controls including `languageServer`, `ARGS`, `Remove arg`, `Add arg`, `Filter`, and the visible `basedpyright` arg row
    - representative requests returned `200`, including `GET /settings/chat`, `GET /settings/section/languageserver`, `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAIFollowSnapshot`, `POST /api/getListenerCoverage`, and `GET /api/plugins/runtime`
- Next action:
  - Continue the live dict-area surface pass by lifting the remaining standalone/share route-stack creation seam one level higher above `frontend/src/components/Pages/router.tsx`, starting with the caller that still assembles `standaloneProjectSurfaceRouteElements`, `standaloneProjectSurfaceRoutes`, and the new standalone app-routes helper input before any broad Pixi node drawing lands.

## 2026-03-27 131

- Item: Lift the remaining standalone/share route-stack creation seam out of `frontend/src/components/Pages/router.tsx`.
- Status: `done`
- Details:
  - Added a typed higher-level standalone app-route-stack helper above the previously lifted route-elements, route-definition, and app-routes helpers:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfaceAppRouteStack.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfaceAppRouteStack.test.tsx`
  - Updated `frontend/src/components/Pages/router.tsx` to consume the new helper instead of directly assembling:
    - `buildStandaloneProjectSurfaceRouteElements(...)`
    - `buildStandaloneProjectSurfaceRoutes(...)`
    - `buildStandaloneProjectSurfaceAppRoutes(...)`
  - The new helper now owns the non-Pixi standalone/share route-stack creation seam for:
    - composing the lifted standalone/share route elements from the caller-owned `app` and `launcher` route elements
    - rendering the canonical standalone route objects through the caller-owned mode boundary
    - inserting the resulting standalone route stack into the top-level app route list between workspace launch and view mode
  - The refactor preserves the existing non-Pixi behavior while leaving `router.tsx` focused on the remaining top-level route definitions and router creation instead of the lifted standalone route-stack assembly chain.
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfaceAppRouteStack.test.tsx src/components/Pages/router.test.tsx`
    - result: passed
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfaceRouteElements.test.tsx src/components/Pages/Project/StandaloneProjectSurfaceRoutes.test.tsx src/components/Pages/Project/StandaloneProjectSurfaceAppRoutes.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug|deployment allowLLM=false blocks managed standalone section and window-space routes|wraps standalone project chat routes in the shared project-chat frame"`
    - result: passed (`3` passed)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in a fresh sub-agent context after bootstrapping with the provided token
    - `http://127.0.0.1:3044/settings/chat` rendered cleanly with visible controls including `Search conversations`, `New Group`, `New Chat`, `View Threads`, `Project AI Settings`, `Start a new thread`, `CREATE PROJECT`, `SUMMARIZE CODEBASE`, `PLAN NEXT STEPS`, `Type a message...`, and `Send message`
    - `http://127.0.0.1:3044/settings/section/languageserver` rendered cleanly with visible labels and controls including `languageServer`, `ARGS`, `Remove arg`, `Add arg`, `Pin selected args`, `Convert to edge connectors`, `Delete selected args`, `Filter`, and the visible `basedpyright` arg rows
    - no obvious clipping, overlap, or missing content was visible in either route
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAIFollowSnapshot`, `POST /api/getListenerCoverage`, `GET /api/plugins/runtime`, `POST /api/getFileBrowserRoot`, and `POST /api/getFolderContents`
- Next action:
  - Continue the live dict-area surface pass by lifting the remaining route-group assembly seam one level higher above `frontend/src/components/Pages/router.tsx`, starting with the caller that still combines the lifted standalone app-route stack with the top-level non-standalone route definitions before any broad Pixi node drawing lands.

## 2026-03-27 132

- Item: Lift the remaining route-group assembly seam out of `frontend/src/components/Pages/router.tsx`.
- Status: `done`
- Details:
  - Added a typed top-level route-stack helper above the lifted standalone route-stack boundary:
    - `frontend/src/components/Pages/modeWrappedAppRouteStack.ts`
    - `frontend/src/components/Pages/modeWrappedAppRouteStack.test.tsx`
  - Updated `frontend/src/components/Pages/router.tsx` to consume the new helper instead of constructing the non-standalone top-level route objects inline before passing them into `buildStandaloneProjectSurfaceAppRouteStack(...)`.
  - The new helper now owns the non-Pixi route-group assembly seam for:
    - turning the caller-owned mode route-element groups into the canonical top-level `index`, `home`, `workspaceLaunch`, `viewMode`, `project`, and `catchAll` route objects
    - handing the resulting top-level route objects plus the standalone app/launcher route elements off to the already-lifted standalone app-route stack boundary
    - leaving `router.tsx` focused on route-element ownership, workspace-launch policy resolution, and final router creation instead of the last inline route-group object assembly
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/modeWrappedAppRouteStack.test.tsx src/components/Pages/router.test.tsx src/components/Pages/Project/StandaloneProjectSurfaceAppRouteStack.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug|deployment allowLLM=false blocks managed standalone section and window-space routes|wraps standalone project chat routes in the shared project-chat frame"`
    - result: passed (`3` passed)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in fresh sub-agent contexts
    - the provided bootstrap token was rejected in those browser sessions, so verification reused an existing authenticated worktree tab
    - `http://127.0.0.1:3044/settings` rendered cleanly with visible `Settings`, `Connected to server`, and a link back to `/home`
    - `http://127.0.0.1:3044/settings/chat` rendered cleanly with visible controls including `Search conversations`, `New Chat`, `View Threads`, `Project AI Settings`, `Search in conversation`, `Start a new thread`, `CREATE PROJECT`, `SUMMARIZE CODEBASE`, `PLAN NEXT STEPS`, `Type a message...`, and `Send message`
    - representative requests returned `200`, including `GET /api/backendInitStatus`, `POST /api/loadSettings`, `GET /api/authRefreshStatus`, `GET /api/plugins/runtime`, `GET /api/getAgentProfiles`, `GET /api/getPromptTemplates`, `GET /api/getExternalAgentHealth`, `GET /api/getEngineConfigs`, `GET /api/getTranscriptionProfiles`, and `POST /api/getFileBrowserRoot`
    - standalone section-route behavior remained covered by the targeted Playwright route spec in this verification pass
- Next action:
  - Continue the live dict-area surface pass by lifting the remaining router-creation seam one level higher above `frontend/src/components/Pages/router.tsx`, starting with the caller that still feeds the assembled app route stack into `createBrowserRouter(...)` before any broad Pixi node drawing lands.

## 2026-03-27 133

- Item: Lift the standalone page route-state bookkeeping out of `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.tsx`.
- Status: `done`
- Details:
  - Added a dedicated route-state boundary above the existing target boundary:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageRouteStateBoundary.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageRouteStateBoundary.test.tsx`
  - Updated `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.tsx` so the load boundary now owns only:
    - `useLoadProjectConfig()` load-state normalization
    - CodeMirror style loading
    - mouse-location listener setup
    - plugin runtime bootstrap gating
  - Moved the remaining route param and navigation bookkeeping into the new boundary:
    - `projectConfigName`
    - `sectionSlug`
    - `chatId`
    - `windowSpaceSlug`
    - `navigate`
  - Updated the focused load-boundary test so it now pins the lifted ownership seam instead of re-testing route param capture inline:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.test.tsx`
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePageRouteStateBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/components/Pages/Project/ShareStandaloneProjectSurfacePageBoundary.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - the existing authenticated worktree session was reused; bootstrap was not needed
    - the settings shell rendered normally with visible `Settings` / `Connected to server` state after the new route-state boundary wiring
    - representative requests returned `200`, including settings/config/backend-init/diagnostics requests; Vite asset `304` responses were expected cache hits
    - non-blocking console noise was limited to existing React 19 `element.ref` warnings and accessibility warnings about missing form `id`/`name` attributes plus `aria-labelledby` mismatches
- Next action:
  - Continue the live dict-area surface pass by lifting the remaining router-creation seam one level higher above `frontend/src/components/Pages/router.tsx`, starting with the caller that still feeds the assembled app route stack into `createBrowserRouter(...)` before any broad Pixi node drawing lands.

## 2026-03-27 134

- Item: Lift the remaining browser-router creation seam out of `frontend/src/components/Pages/router.tsx`.
- Status: `done`
- Details:
  - Added a typed browser-router helper above the lifted route-stack boundary:
    - `frontend/src/components/Pages/modeWrappedBrowserRouter.ts`
    - `frontend/src/components/Pages/modeWrappedBrowserRouter.test.tsx`
  - Exported the existing route-stack helper arg type so the new browser-router boundary can own the final handoff without duplicating the route-stack contract:
    - `frontend/src/components/Pages/modeWrappedAppRouteStack.ts`
  - Updated `frontend/src/components/Pages/router.tsx` to consume the new helper instead of directly calling `createBrowserRouter(...)`.
  - The new helper now owns the non-Pixi router-creation seam for:
    - building the lifted mode-wrapped app route stack through the existing route-stack boundary
    - feeding the assembled route stack into `createBrowserRouter(...)`
    - leaving `router.tsx` focused on route-element ownership and workspace-launch/mode wiring instead of the final browser-router construction hop
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/modeWrappedBrowserRouter.test.tsx src/components/Pages/modeWrappedAppRouteStack.test.tsx src/components/Pages/router.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug|deployment allowLLM=false blocks managed standalone section and window-space routes|wraps standalone project chat routes in the shared project-chat frame"`
    - result: passed (`3` passed)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in a fresh sub-agent context
    - bootstrapped the current worktree session successfully before verification
    - `http://127.0.0.1:3044/settings` rendered normally with the workspace/settings chrome and settings panels visible
    - `http://127.0.0.1:3044/settings/chat` rendered normally after the initial spinner with visible controls including `CREATE PROJECT`, `SUMMARIZE CODEBASE`, `PLAN NEXT STEPS`, the message composer, and the `Settings` link
    - no obvious clipping, overlap, or missing content was visible in either route
    - representative requests returned `200`, including `GET /settings`, `GET /settings/chat`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/authRefreshStatus`, `GET /api/plugins/runtime`, `GET /api/getAgentProfiles`, `GET /api/getPromptTemplates`, `GET /api/getFileBrowserRoot`, and `GET /api/getLatestLspDiagnostics`
- Next action:
  - Continue the live dict-area surface pass by lifting the remaining route-element ownership seam one level higher above `frontend/src/components/Pages/router.tsx`, starting with the mode-specific home/project/catch-all route-element bundles before any broad Pixi node drawing lands.

## 2026-03-28 135

- Item: Lift the remaining mode-wrapped route-element bundle assembly seam out of `frontend/src/components/Pages/modeWrappedRouterArgs.tsx`.
- Status: `done`
- Details:
  - Added a typed higher-level route-element assembly helper above the existing router-args boundary:
    - `frontend/src/components/Pages/modeWrappedRouterRouteElements.ts`
    - `frontend/src/components/Pages/modeWrappedRouterRouteElements.test.tsx`
  - Updated `frontend/src/components/Pages/modeWrappedRouterArgs.tsx` to consume the new helper instead of directly stitching together:
    - `buildModeWrappedStandaloneAppLauncherRouteElements(...)`
    - `buildModeWrappedHomeProjectCatchAllRouteElements(...)`
    - `buildModeWrappedIndexWorkspaceLaunchRouteElements(...)`
  - Narrowed `frontend/src/components/Pages/modeWrappedRouterArgs.test.tsx` to the remaining ownership seam:
    - `buildModeWrappedRouterArgs()` now only owns the `renderModeElement(...)` handoff into `ModeWrappedRouteBoundary`
    - `viewModeRouteElements` still aliases `projectRouteElements` from the lifted route-element bundle
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping the already-lifted standalone app/launcher, home/project/catch-all, and index/workspace-launch route-element builders unchanged
    - moving their shared composition into one deeper helper above `modeWrappedRouterArgs.tsx`
    - leaving the lifted router/browser-router stack focused on higher-level route-stack and router creation seams instead of lower-level route-element bundle assembly
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/modeWrappedRouterRouteElements.test.tsx src/components/Pages/modeWrappedRouterArgs.test.tsx src/components/Pages/router.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts`
    - result: passed (`39` passed)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in a fresh sub-agent context
    - reused the already-open authenticated worktree tabs and confirmed `/settings`, `/settings/chat`, and `/settings/section/languageserver` all rendered normally after the route-element assembly lift
    - representative visible labels and controls included `OVERVIEW`, `settings`, `All Settings`, `Search conversations`, `New Chat`, `Project AI Settings`, `languageServer`, `ARGS`, `Add arg`, `Remove arg`, and the visible `basedpyright` settings tree
    - no obvious clipping, overlap, or missing content was observed in the checked routes
    - representative requests returned `200`, including `GET /api/loadSettings`, `GET /api/backendInitStatus`, and `GET /api/authRefreshStatus`
- Next action:
  - Continue the router cleanup by lifting the remaining `modeWrappedRouterArgs.tsx` ownership seam one level higher above the current helper stack, starting with the `renderModeElement(...)` / `viewModeRouteElements` handoff before any broad Pixi node drawing lands.

## 2026-03-27 135

- Item: Lift the mode-specific home/project/catch-all route-element bundles out of `frontend/src/components/Pages/router.tsx`.
- Status: `done`
- Details:
  - Added a dedicated helper boundary for the home/project/catch-all route-element bundles:
    - `frontend/src/components/Pages/modeWrappedHomeProjectCatchAllRouteElements.tsx`
    - `frontend/src/components/Pages/modeWrappedHomeProjectCatchAllRouteElements.test.tsx`
  - Updated `frontend/src/components/Pages/router.tsx` to consume the new helper instead of owning those mode-specific route-element bundles inline.
  - Exported the shared route-grid container from the new helper so the remaining launcher home route element can reuse the same shell without duplicating the grid wrapper.
  - The new helper now owns the non-Pixi route-element bundle seam for:
    - assembling the `home`, `project`, and `catchAll` `ModeRouteElements` bundles for IDE/share/app/launcher modes
    - preserving the shared project/view-mode bundle wiring through one lifted `projectRouteElements` object
    - leaving `router.tsx` focused on the remaining index/workspace-launch/share-index route wiring plus mode/bootstrap ownership instead of the larger inline home/project/catch-all JSX trees
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/modeWrappedHomeProjectCatchAllRouteElements.test.tsx src/components/Pages/modeWrappedBrowserRouter.test.tsx src/components/Pages/router.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts`
    - result: passed (`2` passed)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in a fresh sub-agent context after bootstrapping via `http://127.0.0.1:8044/__setta__/bootstrap#token=...`
    - `http://127.0.0.1:3044/settings` rendered normally with the settings workspace visible and no obvious clipping, overlap, or missing-content issues
    - `http://127.0.0.1:3044/settings/chat` rendered normally with the chat settings surface visible and no obvious clipping, overlap, or missing-content issues
    - `http://127.0.0.1:3044/does-not-exist` rendered normally as the fallback `Project Not Found` page with no obvious clipping, overlap, or missing-content issues
    - representative requests returned `200`, including `/api/loadSettings`, `/api/backendInitStatus`, `/api/authRefreshStatus`, `/api/loadProjectConfig`, `/api/getLatestLspDiagnostics`, `/api/getAIFollowSnapshot`, `/api/getListenerCoverage`, `/api/getFileBrowserRoot`, `/api/getFolderContents`, `/api/llm/config`, and `/api/plugins/runtime`; static asset revalidations were expected `304`s
- Next action:
  - Continue the live dict-area surface pass by lifting the next remaining route-element ownership seam above `frontend/src/components/Pages/router.tsx`, starting with the index/workspace-launch/share-index route-element bundle wiring before any broad Pixi node drawing lands.

## 2026-03-27 136

- Item: Lift the index/workspace-launch/share-index route-element bundle wiring out of `frontend/src/components/Pages/router.tsx`.
- Status: `done`
- Details:
  - Added a dedicated helper boundary for the remaining index/workspace-launch/share-index route-element bundle seam:
    - `frontend/src/components/Pages/modeWrappedIndexWorkspaceLaunchRouteElements.tsx`
    - `frontend/src/components/Pages/modeWrappedIndexWorkspaceLaunchRouteElements.test.tsx`
  - Updated `frontend/src/components/Pages/router.tsx` to consume the new helper instead of owning:
    - the IDE index route element
    - the share-index redirect element and default-config resolution
    - the workspace-launch route-kind mapping for IDE/share/app/launcher modes
  - The new helper now owns the non-Pixi route-element bundle seam for:
    - assembling `indexRouteElements` for IDE/share/app/launcher modes
    - assembling `workspaceLaunchRouteElements` from the existing route-kind policy
    - keeping `router.tsx` focused on the remaining mode wrapper, launcher home element, standalone route wiring, and final router composition instead of the last inline index/workspace-launch JSX bundle
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/modeWrappedIndexWorkspaceLaunchRouteElements.test.tsx src/components/Pages/router.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/app/app-mode-routing.spec.ts --grep "app mode blocks direct /launching navigation"`
    - result: passed (`1` passed)
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/launcher/launcher-home.spec.ts --grep "launcher mode resolves /launching intent-token handoffs"`
    - result: passed (`1` passed)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in a fresh sub-agent context
    - reused the existing authenticated app session; bootstrap was not required to complete the check
    - `http://127.0.0.1:3044/settings` rendered normally with the connected settings shell visible
    - `http://127.0.0.1:3044/launching` rendered the expected launch-failure surface (`SWITCHING WORKSPACE`, `Launch failed`, `Missing pending workspace launch request.`) without obvious clipping, overlap, or missing primary content
    - representative requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, and `GET /api/serverMode`
    - console noise was limited to existing React 19 `element.ref` warnings and existing accessibility warnings; no route-breaking console errors appeared during verification
- Next action:
  - Continue the live dict-area surface pass by lifting the next remaining route-element ownership seam above `frontend/src/components/Pages/router.tsx`, starting with the remaining standalone app/launcher route elements and mode-wrapper-owned JSX before any broad Pixi node drawing lands.

## 2026-03-27 137

- Item: Lift the remaining standalone app/launcher route elements out of `frontend/src/components/Pages/router.tsx`.
- Status: `done`
- Details:
  - Added a dedicated helper boundary for the remaining standalone app/launcher route-element seam:
    - `frontend/src/components/Pages/modeWrappedStandaloneAppLauncherRouteElements.tsx`
    - `frontend/src/components/Pages/modeWrappedStandaloneAppLauncherRouteElements.test.tsx`
  - Updated `frontend/src/components/Pages/router.tsx` to consume the new helper instead of owning:
    - the lazy app route element
    - the launcher home route element
    - the standalone app route element handoff
    - the standalone launcher redirect element handoff
  - The new helper now owns the non-Pixi standalone app/launcher seam for:
    - building the shared lazy app route element once and reusing it for standalone app routes
    - building the launcher home route element through the existing route-grid shell
    - owning the project-root redirect element used by the standalone launcher route
    - leaving `router.tsx` focused on the remaining mode-wrapper JSX and helper composition instead of the last standalone app/launcher element bundle
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/modeWrappedStandaloneAppLauncherRouteElements.test.tsx src/components/Pages/router.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/app/app-mode-routing.spec.ts frontend/tests/e2e/launcher/launcher-home.spec.ts --grep "app routes select the configured UI root|app mode blocks direct /launching navigation|launcher mode resolves /launching intent-token handoffs"`
    - result: passed (`3` passed)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in a fresh sub-agent context
    - the provided bootstrap token was rejected in that browser session (`POST /__setta__/bootstrap/consume 401`), but the existing authenticated app tab remained usable for verification
    - `http://127.0.0.1:3044/settings` rendered normally in the existing session with no obvious clipping, overlap, or missing content; the visible page was sparse in that session (`Connected to server`, home link), but structurally intact
    - `http://127.0.0.1:3044/launching` rendered a clean launch-failure surface (`Launch failed`, `Missing pending workspace launch request.`) without obvious clipping or overlap
    - representative requests returned `200`, including `/settings`, `/launching`, `/api/loadSettings`, `/api/backendInitStatus`, `/api/authRefreshStatus`, `/api/loadProjectConfig`, and `/api/serverMode`
    - console noise was limited to the existing React 19 `element.ref` warnings plus the expected bootstrap `401` error in the rejected bootstrap tab
- Next action:
  - Continue the live dict-area surface pass by lifting the remaining mode-wrapper-owned JSX out of `frontend/src/components/Pages/router.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 138

- Item: Complete the cleanup-first non-Pixi pass on `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`.
- Status: `done`
- Details:
  - Refactored the `EdgeRenderer` container decisions behind a typed helper boundary so the non-Pixi slice no longer leaves its edge-component fallback and reconnect-hit-target sizing inline in the component:
    - `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`
    - `frontend/src/forks/xyflow/core/container/edgeRendererView.ts`
    - `frontend/src/forks/xyflow/core/container/edgeRendererView.test.ts`
  - The new helper preserves the existing non-Pixi behavior for:
    - keeping the edge layer gated on positive canvas dimensions before mounting the edge SVG
    - defaulting unknown/custom edge types back to the wrapped bezier renderer while preserving the original edge `type` prop passed through to the wrapper
    - centralizing the always-selectable / always-reconnectable edge props plus the reconnect hit-target sizing instead of repeating them inline in the container
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/edgeRendererView.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/edge-visibility-toggles.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded authenticated and `All Settings` stayed visible
    - `svg.react-flow__edges` was present and the visible settings/canvas area showed no obvious visual regression
    - representative visible labels and rows included `shortcuts`, `gui`, `backend`, `sectionSizingPolicy`, `languageServer`, `defaultZoomLevel 1.0`, `Grid Color`, `Pan On Drag`, `Auto Refetch Callable Params On LSP Mismatch`, and `Autosave`
    - relevant requests returned `200`, including `GET /api/authRefreshStatus`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `POST /api/loadProjectConfig`, and `GET /api/serverMode`
- Next action:
  - Resume the current live dict-area surface pass by lifting the remaining mode-wrapper-owned JSX out of `frontend/src/components/Pages/router.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 139

- Item: Lift the remaining mode-wrapper-owned JSX/state boundary out of `frontend/src/components/Pages/router.tsx`.
- Status: `done`
- Details:
  - Added a dedicated route boundary component above the lifted router composition seam:
    - `frontend/src/components/Pages/ModeWrappedRouteBoundary.tsx`
    - `frontend/src/components/Pages/ModeWrappedRouteBoundary.test.tsx`
  - Updated `frontend/src/components/Pages/router.tsx` to consume the new boundary instead of owning:
    - server-mode initialization side effects
    - unresolved loading-shell JSX
    - mode-error retry-shell JSX
    - final mode-to-route-element resolution
  - The new boundary now owns the remaining non-Pixi mode-wrapper seam for:
    - kicking off `initializeServerMode()` only while the mode is unresolved
    - rendering the existing loading/error shells without leaving that UI inline in `router.tsx`
    - resetting the server-mode store on retry and handing resolved modes back through `resolveModeElementForServerMode(...)`
    - leaving `router.tsx` focused on route-element assembly plus final router composition only
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/ModeWrappedRouteBoundary.test.tsx src/components/Pages/router.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts --grep "settings view tabs filter sections and minimap"`
    - result: passed (`1` passed)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - reused the existing authenticated worktree tab; bootstrap was not required in that browser session
    - `/settings` loaded cleanly and the visible settings surface rendered as expected with the settings shell plus tabs/content including `Core`, `Section Defaults ...`, `Param Defaults`, and `All Settings`
    - representative requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `GET /api/llm/config`, and `POST /api/getFileBrowserRoot`
- Next action:
  - Continue the live dict-area surface pass by lifting the remaining top-level route-helper assembly seam out of `frontend/src/components/Pages/router.tsx`, starting with the precomputed route-element bundles before any broad Pixi node drawing lands.

## 2026-03-27 140

- Item: Lift the top-level precomputed route-element bundle assembly out of `frontend/src/components/Pages/router.tsx`.
- Status: `done`
- Details:
  - Added a dedicated helper boundary for the remaining top-level router assembly seam:
    - `frontend/src/components/Pages/modeWrappedRouterArgs.tsx`
    - `frontend/src/components/Pages/modeWrappedRouterArgs.test.tsx`
    - `frontend/src/components/Pages/routerModule.test.tsx`
  - Updated `frontend/src/components/Pages/router.tsx` to consume the new helper instead of owning:
    - standalone app/launcher route-element bundle extraction
    - home/project/catch-all route-element bundle extraction
    - index/workspace-launch route-element bundle extraction
    - the `ModeWrappedRouteBoundary` render callback wiring passed into the browser-router factory
  - The new helper now owns the non-Pixi top-level route bundle seam for:
    - assembling the full `BuildModeWrappedAppRouteStackArgs` payload from the already-lifted route-element builders
    - keeping `viewModeRouteElements` tied to the same project-route bundle
    - leaving `router.tsx` focused only on the final browser-router creation call
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/modeWrappedRouterArgs.test.tsx src/components/Pages/routerModule.test.tsx src/components/Pages/router.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts frontend/tests/e2e/app/app-mode-routing.spec.ts frontend/tests/e2e/launcher/launcher-home.spec.ts --grep "settings view tabs filter sections and minimap|app routes select the configured UI root|app mode blocks direct /launching navigation|launcher mode resolves /launching intent-token handoffs"`
    - result: passed (`4` passed)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in a fresh sub-agent context
    - verified `/settings` after bootstrap and confirmed the app shell, navigation, and settings surface rendered without obvious clipping, overlap, or missing primary content
    - verified `/launching` rendered the expected fallback card surface (`SWITCHING WORKSPACE`, `Launch failed`, `Missing pending workspace launch request.`) cleanly
    - representative requests returned `200`, including `GET /__setta__/bootstrap`, `POST /__setta__/bootstrap/consume`, `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, and `GET /api/authRefreshStatus`
- Next action:
  - Treat the `router.tsx` cleanup pass as complete and return to the retained-scene rewrite sequence with the next bounded Pixi-side canary step before any broad node drawing lands.

## 2026-03-27 141

- Item: Deepen the `EdgeRenderer` helper boundary so it also owns SVG mount metadata and reconnect callback wiring.
- Status: `done`
- Details:
  - Followed up the earlier `EdgeRenderer` cleanup by moving the remaining SVG/null-gate and reconnect closure shaping into the typed helper boundary:
    - `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`
    - `frontend/src/forks/xyflow/core/container/edgeRendererView.ts`
    - `frontend/src/forks/xyflow/core/container/edgeRendererView.test.ts`
  - The helper now owns the remaining non-Pixi container policy for:
    - returning `null` until the edge layer has positive canvas dimensions
    - passing stable SVG class/size metadata back to the container instead of leaving the shell props inline
    - wiring per-edge reconnect callbacks inside the helper so the container stays a thin wrapped-edge mapper
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/edgeRendererView.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts frontend/tests/e2e/sections/edge-visibility-toggles.spec.ts`
    - result: passed (`2` passed)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - bootstrap-authenticated `/settings` loaded cleanly and `All Settings` stayed visible
    - the visible settings/dict-param area plus canvas shell looked structurally intact with no obvious overlap or clipping
      - representative requests returned `200`, including `POST /api/loadSettings`, `GET /api/authRefreshStatus`, `GET /api/backendInitStatus`, and `POST /api/loadProjectConfig`
- Next action:
  - Return to the retained-scene rewrite sequence with the next bounded Pixi-side canary step before any broad node drawing lands.

## 2026-03-27 142

- Item: Lift the live dict-area scene renderer packet chain into a dedicated scene boundary and expose it from `buildLiveDictAreaView`.
- Status: `done`
- Details:
  - Added a higher-level scene boundary for the first retained-scene canary path:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSceneBoundary.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaSceneBoundary.test.ts`
  - Updated the live dict-area view/surface composition so the cleaned DOM surface path and the explicit scene-renderer packet path are both available from one higher-level view boundary without changing visible behavior:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSurface.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaView.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaView.test.ts`
  - The new scene boundary now owns the bounded Pixi-side canary seam for:
    - rebuilding the deterministic `nodeLayoutView` from the already-cleaned live dict-area boundary
    - normalizing that layout into explicit scene block views
    - lifting those blocks into stable scene renderer packets beside the existing DOM surface path
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaSceneBoundary.test.ts src/components/Params/groupContainerLiveDictAreaView.test.ts src/components/Params/groupContainerLiveDictAreaSurface.test.ts src/components/Params/groupContainerLiveDictArea.test.tsx`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
      - `/settings` loaded successfully after bootstrap and `All Settings` stayed visible and selected
      - the visible dict/param stack rendered without obvious clipping, overlap, or missing content
      - representative visible labels/rows included `sectionSizingPolicy`, `groupSectionDefault`, `genPythonCodeSectionDefault`, `shortcuts`, `backend`, `languageServer`, and `gui`
      - relevant requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/llm/config`, `GET /api/plugins/runtime`, and `POST /api/setTopLevelSectionLayout`
- Next action:
  - Continue the retained-scene canary by lifting the next scene-owned bridge above `buildLiveDictAreaView`, starting with a dedicated mount/consumer boundary for the scene renderer packets before any broad Pixi node drawing lands.

## 2026-03-27 143

- Item: Lift the next scene-owned bridge above `buildLiveDictAreaView` into a dedicated live dict-area mount/consumer boundary.
- Status: `done`
- Details:
  - Added a dedicated mount/consumer boundary above the current live dict-area view seam:
    - `frontend/src/components/Params/groupContainerLiveDictAreaMountBoundary.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaMountBoundary.test.ts`
  - Updated the live dict-area component to consume the new boundary instead of reaching directly into `buildLiveDictAreaView(...)`:
    - `frontend/src/components/Params/groupContainerLiveDictArea.tsx`
    - `frontend/src/components/Params/groupContainerLiveDictArea.test.tsx`
  - The new boundary now owns the bounded retained-scene bridge for:
    - composing the existing DOM mount props from the higher-level view result
    - exposing the retained-scene boundary alongside the DOM mount path from one deeper seam
    - keeping `maxNestedDepth` relayed through the same higher-level boundary while preserving current visible behavior
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaMountBoundary.test.ts src/components/Params/groupContainerLiveDictAreaView.test.ts src/components/Params/groupContainerLiveDictArea.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` was authenticated and `All Settings` stayed visible and selected
    - the live dict/param stack rendered cleanly with no obvious clipping, overlap, or missing content in the visible viewport
    - representative successful network request observed during the check: `POST http://127.0.0.1:8044/api/getFolderContents` `200`
    - caveat: that verification pass only exposed a small set of page requests in the Network panel, so the sampled request list was correspondingly narrow
- Next action:
  - Continue the retained-scene canary by lifting the new `groupContainerLiveDictAreaMountBoundary.ts` seam into the next higher-level live dict-area caller so the scene-renderer packets keep moving upward before any broad Pixi node drawing lands.

## 2026-03-27 144

- Item: Lift the `groupContainerLiveDictAreaMountBoundary.ts` seam into `frontend/src/components/Params/groupContainerLiveDictAreaSection.tsx`.
- Status: `done`
- Details:
  - Moved the live dict-area mount-boundary ownership up one caller so `LiveDictAreaSection` now builds and consumes the mount boundary directly instead of routing through a one-off wrapper component:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSection.tsx`
    - `frontend/src/components/Params/groupContainerLiveDictAreaSection.test.tsx`
  - Removed the now-redundant `LiveDictArea` wrapper and its dedicated test after confirming nothing else depended on that extra layer:
    - `frontend/src/components/Params/groupContainerLiveDictArea.tsx`
    - `frontend/src/components/Params/groupContainerLiveDictArea.test.tsx`
  - The retained-scene canary seam now sits one level higher in the live dict-area call chain while preserving the existing non-Pixi behavior for:
    - memoizing the higher-level mount boundary from the section store input
    - relaying `maxNestedDepth` updates through the same callback contract
    - mounting the existing DOM dict-area surface through `LiveDictAreaMount` without changing visible block order
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaMountBoundary.test.ts src/components/Params/groupContainerLiveDictAreaSection.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded authenticated after bootstrap
    - `All Settings` stayed visible and selected
    - the dict/param area rendered normally without obvious clipping, overlap, or missing content
    - representative requests returned `200`, including `/api/authRefreshStatus`, `/api/loadSettings`, `/api/loadProjectConfig`, and `/api/setTopLevelSectionLayout`
- Next action:
  - Continue the retained-scene canary by lifting the live dict-area mount seam into the next higher-level caller above `frontend/src/components/Params/groupContainerLiveDictAreaSection.tsx`, starting with the section-container layer before any broad Pixi node drawing lands.

## 2026-03-27 145

- Item: Lift the live dict-area mount seam into the section-container layer above `frontend/src/components/Params/groupContainerLiveDictAreaSection.tsx`.
- Status: `done`
- Details:
  - Moved the live dict-area mount-boundary ownership up into the section-container boundary so the section-container layer now owns both the column-width feedback loop and the retained-scene mount seam:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionContainerBoundary.ts`
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionContainerBoundary.test.tsx`
  - Updated the section-container component to mount `LiveDictAreaMount` directly from that higher-level boundary instead of routing through a dedicated section wrapper:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionContainer.tsx`
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionContainer.test.tsx`
  - Removed the now-redundant `LiveDictAreaSection` wrapper and its dedicated integration test after confirming the section-container seam now owns that responsibility cleanly:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSection.tsx`
    - `frontend/src/components/Params/groupContainerLiveDictAreaSection.test.tsx`
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaSectionContainerBoundary.test.tsx src/components/Params/groupContainerLiveDictAreaSectionContainer.test.tsx`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
      - `/settings` loaded in the authenticated worktree session with `All Settings` visible and selected
      - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
      - representative visible labels and controls included `settings`, `backend`, `shortcuts`, `languageServer`, `gui`, `sectionSizingPolicy`, `Filter`, `Tag`, and the bottom tab `All Settings`
      - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAIFollowSnapshot`, `POST /api/getListenerCoverage`, `GET /api/getAgentRuns`, and `GET /api/plugins/runtime`
      - caveat: the provided bootstrap token was rejected with `POST /__setta__/bootstrap/consume` `401`, so the check reused the already-authenticated settings tab instead
- Next action:
  - Continue the retained-scene canary by lifting the live dict-area mount seam into the next higher-level caller above `frontend/src/components/Params/groupContainerLiveDictAreaSectionContainer.tsx`, starting with the shell boundary layer before any broad Pixi node drawing lands.

## 2026-03-27 146

- Item: Lift the live dict-area mount seam into the shell boundary layer above `frontend/src/components/Params/groupContainerLiveDictAreaSectionContainer.tsx`.
- Status: `done`
- Details:
  - Moved the live dict-area mount-boundary ownership up into the shell boundary hook so `GroupContainerShell` now mounts `LiveDictAreaMount` directly while the shell boundary owns both the fixed-height measurement seam and the retained-scene mount seam:
    - `frontend/src/components/Params/groupContainerShellBoundary.ts`
    - `frontend/src/components/Params/groupContainerShell.tsx`
    - `frontend/src/components/Params/groupContainerShellBoundary.test.tsx`
  - Removed the now-redundant `LiveDictAreaSectionContainer` wrapper and its dedicated integration test after confirming the shell boundary layer now owns that responsibility cleanly:
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionContainer.tsx`
    - `frontend/src/components/Params/groupContainerLiveDictAreaSectionContainer.test.tsx`
  - Verification:
    - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerShellBoundary.test.tsx src/components/Params/groupContainerShell.test.tsx src/components/Params/groupContainerLiveDictAreaSectionContainerBoundary.test.tsx`
      - result: passed
    - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
      - result: passed
    - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
      - `/settings` loaded authenticated with `All Settings` visible
      - the visible app chrome, settings overview/sidebar, central settings canvas, and bottom section tabs rendered without obvious clipping, overlap, or missing content
      - sampled requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, and `GET /api/backendInitStatus`
      - caveat: the verifier checked the live viewport state and sampled requests, but did not traverse every nested settings subpanel in this pass
- Next action:
  - Continue the retained-scene canary by lifting the live dict-area mount seam into the next higher-level caller above `frontend/src/components/Params/groupContainerShell.tsx`, starting with the shell caller above the shell boundary before any broad Pixi node drawing lands.

## 2026-03-27 147

- Item: Lift the live dict-area mount seam into the wrapper layer above `frontend/src/components/Params/groupContainerShell.tsx`.
- Status: `done`
- Details:
  - Moved the `GroupContainerShell` boundary ownership up into the wrapper layer so the wrapper now builds the shell boundary and the shell is a pure view over mount props plus the waiting overlay:
    - `frontend/src/components/Params/groupContainerWrapper.tsx`
    - `frontend/src/components/Params/groupContainerShell.tsx`
  - Replaced the old shell-owned integration test with wrapper-owned integration coverage and removed the now-redundant shell test file:
    - `frontend/src/components/Params/groupContainerWrapper.test.tsx`
    - `frontend/src/components/Params/groupContainerShell.test.tsx`
  - This keeps the retained-scene mount seam moving upward through the live dict-area call chain while preserving the existing non-Pixi DOM mount path and DnD wrapper behavior.
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/groupContainerWrapper.test.tsx src/components/Params/groupContainerShellBoundary.test.tsx src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
    - note: an earlier run in a separate temp workspace hit a transient `.react-flow__pane` readiness timeout; the immediate rerun with the same command passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded and `All Settings` was visible and focusable in the bottom tab strip
    - the visible settings shell plus dict/param area rendered without obvious clipping, overlap, or missing content
    - representative visible labels and controls included `Project`, `Edit`, `Run`, `Open settings`, `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, `All Settings`, `minHeight`, `minWidth`, `Size Mode Height`, `Size Mode Width`, `Text Param`, `Time Param`, and `Slider Param`
    - representative requests returned `200`, including `GET /settings`, `POST /api/loadSettings`, and `GET /api/backendInitStatus`
- Next action:
  - Continue the retained-scene canary by lifting the live dict-area mount seam into the next higher-level caller above `frontend/src/components/Params/groupContainerWrapper.tsx`, starting with `frontend/src/components/Params/GroupContainer.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 148

- Item: Lift the live dict-area mount seam into `frontend/src/components/Params/GroupContainer.tsx`.
- Status: `done`
- Details:
  - Moved the `useGroupContainerShellBoundary(...)` ownership up into `ParamGroupContainer` so the top-level group-container caller now builds the shell boundary and passes only pure shell props into the lower wrapper:
    - `frontend/src/components/Params/GroupContainer.tsx`
    - `frontend/src/components/Params/groupContainerWrapper.tsx`
  - Updated the focused coverage to pin the new ownership boundary at `ParamGroupContainer` and removed the now-redundant wrapper-owned integration test file:
    - `frontend/src/components/Params/GroupContainer.test.tsx`
    - `frontend/src/components/Params/groupContainerWrapper.test.tsx`
  - This keeps the retained-scene mount seam moving upward through the live dict-area call chain while preserving the existing non-Pixi DOM mount path for:
    - the DnD wrapper around the shell-backed live dict-area surface
    - the waiting overlay path
    - the ordered edge/pinned/unpinned block-frame mount order
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Params/GroupContainer.test.tsx src/components/Params/groupContainerShellBoundary.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` was already authenticated and `All Settings` stayed visible
    - the visible settings shell, overview/tag list, bottom tabs, and reachable dict/param stack rendered without obvious clipping, overlap, or missing content
    - representative rows and controls remained reachable, including `backend`, `shortcuts`, `languageServer`, `gui`, `Param Defaults`, `All Settings`, `Config Language`, `Hide Unpinned Params`, `Size height`, `Text Param`, `Time Param`, and `Slider Param`
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, and `POST /api/getLatestLspDiagnostics`
    - caveat: the first viewport primarily showed the overview/tag list, so some deeper settings rows were confirmed by scrolling and the accessibility tree rather than the initial fold
- Next action:
  - Continue the retained-scene canary by lifting the live dict-area mount seam into the next higher-level caller above `frontend/src/components/Params/GroupContainer.tsx`, starting with `frontend/src/components/Section/Layouts/LiveDictAreaLayout.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 149

- Item: Lift the live dict-area mount seam into `frontend/src/components/Section/Layouts/LiveDictAreaLayout.tsx`.
- Status: `done`
- Details:
  - Moved the `useGroupContainerShellBoundary(...)` ownership up into `LiveDictAreaLayout` so the live dict-area layout now builds the shell boundary for the dict canary path and passes only pure wrapper props into the lower DnD wrapper:
    - `frontend/src/components/Section/Layouts/LiveDictAreaLayout.tsx`
  - Added focused layout-level coverage for the new ownership boundary and refreshed the surrounding dict-area view assertion text to match the seam move:
    - `frontend/src/components/Section/Layouts/LiveDictAreaLayout.test.tsx`
    - `frontend/src/components/Section/Layouts/dictAreaView.test.ts`
  - This keeps the retained-scene mount seam moving upward through the live dict-area call chain while preserving the existing non-Pixi DOM mount path for:
    - `KwargsControls`
    - the shell-backed dict/param surface under the DnD wrapper
    - the existing waiting overlay and ordered block mount behavior
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Layouts/LiveDictAreaLayout.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/dictAreaView.test.ts src/components/Params/GroupContainer.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app in a fresh sub-agent context
    - initial CDP access was unavailable, so one allowed lifecycle self-recovery was used via `./aireset.sh`
    - the restart reassigned the worktree session to `http://127.0.0.1:3046/` and `http://127.0.0.1:8046`
    - `/settings` loaded after bootstrapping the restarted worktree session and the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `PROJECT AI CHAT`, `New Chat`, `View Threads`, `Project AI Settings`, `CREATE PROJECT`, `SUMMARIZE CODEBASE`, `PLAN NEXT STEPS`, and the bottom tabs `Core`, `Section Defaults Structure and Code`, `Section Defaults Content and Media`, `Param Defaults`, and `All Settings`
    - representative requests returned `200`, including `/api/loadSettings`, `/api/loadProjectConfig`, `/api/getLatestLspDiagnostics`, `/api/getAIFollowSnapshot`, `/api/getListenerCoverage`, `/api/getAgentRuns`, and `/api/setTopLevelSectionLayout`
- Next action:
  - Continue the retained-scene canary by lifting the live dict-area mount seam into the next higher-level caller above `frontend/src/components/Section/Layouts/LiveDictAreaLayout.tsx`, starting with `frontend/src/components/Section/Layouts/DictAreaLiveBoundary.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 150

- Item: Lift the live dict-area mount seam into `frontend/src/components/Section/Layouts/DictAreaLiveBoundary.tsx`.
- Status: `done`
- Details:
  - Moved the `useGroupContainerShellBoundary(...)` ownership up into `DictAreaLiveBoundary` so the boundary now builds the shell seam for the live dict-area path and `LiveDictAreaLayout` is a pure view over:
    - `kwargsControlsProps`
    - `groupContainerWrapperProps`
  - Updated the focused coverage to pin the new ownership boundary at `DictAreaLiveBoundary` and removed the now-redundant lower integration test file:
    - `frontend/src/components/Section/Layouts/DictAreaLiveBoundary.test.tsx`
    - `frontend/src/components/Section/Layouts/LiveDictAreaLayout.test.tsx`
    - `frontend/src/components/Section/Layouts/dictAreaView.test.ts`
  - Updated the neighboring container test mock to follow the higher seam after `DictAreaLiveBoundary` became the relevant integration boundary:
    - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - This keeps the retained-scene mount seam moving upward through the live dict-area call chain while preserving the existing non-Pixi DOM mount path for:
    - `KwargsControls`
    - the shell-backed dict/param surface under the DnD wrapper
    - the ordered edge/pinned/unpinned block mount behavior
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Layouts/DictAreaLiveBoundary.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/dictAreaView.test.ts`
    - result: passed
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - the verifier bootstrapped a fresh page with the provided worktree session and confirmed `All Settings` stayed visible
    - the visible settings shell plus dict/param content rendered without obvious clipping, overlap, or missing panels
    - representative requests returned `200`, including `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `GET /api/backendInitStatus`, and `GET /api/serverMode`
    - no repo-level lifecycle recovery was needed
- Next action:
  - Continue the retained-scene canary by lifting the live dict-area mount seam into the next higher-level caller above `frontend/src/components/Section/Layouts/DictAreaLiveBoundary.tsx`, starting with `frontend/src/components/Section/Container/SectionContainerDictArea.tsx` before any broad Pixi node drawing lands.

## 2026-03-27 151

- Item: Lift the live dict-area seam into `frontend/src/components/Section/Container/SectionContainerDictArea.tsx`.
- Status: `done`
- Details:
  - Raised the section-container/live-dict-area handoff so the section-container dict path now depends on `DictArea` and its exported `DictAreaProps` contract instead of importing `DictAreaLiveBoundary` directly:
    - `frontend/src/components/Section/Layouts/DictArea.tsx`
    - `frontend/src/components/Section/Container/SectionContainerDictArea.tsx`
    - `frontend/src/components/Section/Container/sectionContainerAreaDictView.ts`
  - Updated the affected section-container test mock surface to follow the higher seam:
    - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - This keeps the retained-scene seam moving upward through the dict-area call chain while preserving the existing non-Pixi DOM path for:
    - the `All Settings` live dict/param surface
    - the benchmark/live routing boundary above it
    - the lower `DictAreaLiveBoundary` ownership of the shell-backed dict/param mount
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Container/sectionContainerAreaDictView.test.ts src/components/Section/Container/SectionContainerAreaDictBoundary.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `All Settings` was visible and the settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative requests returned `200`, including `loadSettings`, `loadProjectConfig`, and `setTopLevelSectionLayout`
- Next action:
  - Continue the retained-scene seam lift by moving the live dict-area handoff one level higher above `frontend/src/components/Section/Container/SectionContainerDictArea.tsx`, starting with the `SectionContainerAreaDictBoundary` path.

## 2026-03-27 152

- Item: Lift the live dict-area seam into `frontend/src/components/Section/Container/SectionContainerAreaDictBoundary.tsx`.
- Status: `done`
- Details:
  - Raised the dict-area handoff above the thin section-container wrapper so the dict boundary now depends on `DictArea` and its exported `DictAreaProps` contract directly:
    - `frontend/src/components/Section/Container/SectionContainerAreaDictBoundary.tsx`
    - `frontend/src/components/Section/Container/sectionContainerAreaDictView.ts`
  - Updated the focused coverage to pin the higher seam and renamed the live-view payload away from the deleted wrapper terminology:
    - `frontend/src/components/Section/Container/SectionContainerAreaDictBoundary.test.tsx`
    - `frontend/src/components/Section/Container/sectionContainerAreaDictView.test.ts`
  - Removed the now-dead wrapper file:
    - `frontend/src/components/Section/Container/SectionContainerDictArea.tsx`
  - This keeps the retained-scene seam moving upward through the dict-area call chain while preserving the existing non-Pixi DOM path for:
    - the benchmark-vs-live routing inside the section-container dict boundary
    - the live `DictArea` handoff into `DictAreaLiveBoundary`
    - the `All Settings` dict/param surface under the same benchmark gating behavior
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/SectionContainerAreaDictBoundary.test.tsx src/components/Section/Container/sectionContainerAreaDictView.test.ts`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - first run timed out waiting for `.react-flow__pane` in the temporary E2E workspace
    - reran the same spec immediately without code changes; second run passed (`1 passed (2.5m)`)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded in the authenticated frontend tab with `All Settings` visible
    - the visible settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content
    - representative requests returned `200`, including `loadSettings`, `loadProjectConfig`, and `backendInitStatus`
- Next action:
  - Continue the retained-scene seam lift by moving the live dict-area handoff one level higher above `frontend/src/components/Section/Container/SectionContainerAreaDictBoundary.tsx`, starting with the `SectionContainerArea.tsx` path.

## 2026-03-28 153

- Item: Lift the caller-owned dict-area renderer seam one level higher above `frontend/src/components/Section/Container/SectionContainerArea.tsx`, starting with `SectionCanvasArea.tsx`.
- Status: `done`
- Details:
  - Added a caller-owned dict-renderer seam to the generic section-area boundary:
    - `frontend/src/components/Section/Container/sectionContainerAreaView.ts`
    - `frontend/src/components/Section/Container/SectionContainerArea.tsx`
  - Lifted the production dict-area renderer ownership into the canvas-area caller:
    - `frontend/src/components/Section/Container/SectionCanvasArea.tsx`
    - `frontend/src/components/Section/Container/SectionCanvasArea.test.tsx`
  - Updated the focused section-area coverage to pin the higher seam:
    - `frontend/src/components/Section/Container/SectionContainerArea.test.tsx`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping `SectionContainerArea.tsx` on the same section-type dispatch path while letting callers provide the dict renderer explicitly
    - keeping the canvas path on the same `SectionContainerAreaDictBoundary` renderer via the new `renderDictArea(...)` seam
    - leaving the current settings dict/param DOM path intact while shrinking the generic area boundary’s direct ownership of the dict renderer
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/sectionContainerAreaView.test.ts src/components/Section/Container/SectionContainerArea.test.tsx src/components/Section/Container/SectionCanvasArea.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - bootstrap was rejected in that browser session, so verification reused the existing authenticated `/settings` tab
    - `All Settings` stayed visible/reachable and the settings shell plus dict/param area rendered normally with no obvious clipping, overlap, or missing content after the seam lift
    - representative visible labels and controls included `Filter`, `TAG`, `Grid Color`, `Grid Pattern`, `Pan On Drag`, `Zoom On Pinch`, `Create Project`, `Summarize Codebase`, and `Plan Next Steps`
    - representative requests returned `200`, including `/api/loadSettings`, `/api/loadProjectConfig`, `/api/getFileBrowserRoot`, `/api/getFolderContents`, `/api/serverMode`, and `/api/authRefreshStatus`
- Next action:
  - Continue the retained-scene seam lift by moving the remaining caller-owned dict-area renderer seam one level higher above `frontend/src/components/Section/Container/SectionContainerArea.tsx`, starting with the window-surface caller in `frontend/src/components/Section/Container/SectionWindowSurfaceBody.tsx`.

## 2026-03-28 154

- Item: Lift the caller-owned dict-area renderer seam into `frontend/src/components/Section/Container/SectionWindowSurfaceBody.tsx`.
- Status: `done`
- Details:
  - Raised the remaining window-surface dict-area handoff so `SectionWindowSurfaceBody` now owns the dict renderer seam above `SectionContainerArea` instead of leaving that ownership in the generic area boundary:
    - `frontend/src/components/Section/Container/SectionWindowSurfaceBody.tsx`
    - `frontend/src/components/Section/Container/SectionWindowSurfaceBody.test.tsx`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping `SectionWindowSurfaceBody` on the same override-vs-area-vs-none branching path
    - routing dict sections through `SectionContainerAreaDictBoundary` from the window-surface caller via `renderDictArea(...)`
    - leaving the current floating/window-surface dict/param DOM path intact while shrinking `SectionContainerArea.tsx` ownership further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/SectionWindowSurfaceBody.test.tsx src/components/Section/Container/sectionWindowSurfaceBodyView.test.ts src/components/Section/Container/SectionWindowSurface.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - directly exercised the floating/window-surface path on the visible `gui` section by clicking `Open section in floating window`
    - the resulting floating surface rendered dict/param content cleanly, including `defaultZoomLevel`, `Grid Color`, `Grid Pattern`, `Pan On Drag`, `Pan On Scroll`, `Selection Mode`, `Show Grid Lines`, `Wire Color`, and `Zoom On Pinch`, with no obvious clipping, overlap, or missing content
    - representative requests returned `200`, including `POST /api/loadSettings`, `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAgentRuns`, and `POST /api/getFileBrowserRoot`
- Next action:
  - Continue the retained-scene seam lift by moving the remaining caller-owned dict-area renderer seam one level higher above `frontend/src/components/Section/Container/SectionWindowSurfaceBody.tsx`, starting with `frontend/src/components/Section/Container/SectionWindowSurface.tsx`.

## 2026-03-28 155

- Item: Lift the caller-owned dict-area renderer seam into `frontend/src/components/Section/Container/SectionWindowSurface.tsx`.
- Status: `done`
- Details:
  - Raised the remaining window-surface dict-area renderer handoff one caller higher so `SectionWindowSurface` now owns the dict renderer seam above `SectionWindowSurfaceBody`:
    - `frontend/src/components/Section/Container/SectionWindowSurface.tsx`
    - `frontend/src/components/Section/Container/SectionWindowSurfaceBody.tsx`
  - Updated focused coverage to pin the higher ownership boundary:
    - `frontend/src/components/Section/Container/SectionWindowSurface.test.tsx`
    - `frontend/src/components/Section/Container/SectionWindowSurfaceBody.test.tsx`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping `SectionWindowSurfaceBody` on the same override-vs-area-vs-none branching path
    - routing dict sections through `SectionContainerAreaDictBoundary` from the higher-level window-surface caller via `renderDictArea(...)`
    - leaving the floating/window-surface dict/param DOM path intact while shrinking `SectionWindowSurfaceBody.tsx` ownership further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/SectionWindowSurfaceBody.test.tsx src/components/Section/Container/SectionWindowSurface.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug"`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded successfully and the visible `backend` section was opened in a floating window via the section header control
    - the floating surface rendered dict/param content cleanly with no obvious clipping, overlap, or missing content
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `OPTIONS /api/loadProjectConfig`, and `GET /settings`
- Next action:
  - Continue the retained-scene seam lift by moving the remaining caller-owned dict-area renderer seam one level higher above `frontend/src/components/Section/Container/SectionWindowSurface.tsx`, starting with `frontend/src/components/Section/Container/StandaloneSectionSurfaceBoundary.tsx`.

## 2026-03-28 156

- Item: Lift the caller-owned dict-area renderer seam into `frontend/src/components/Section/Container/StandaloneSectionSurfaceBoundary.tsx`.
- Status: `done`
- Details:
  - Raised the standalone section-route dict-area handoff one caller higher so `StandaloneSectionSurfaceBoundary` now owns the dict renderer seam above `SectionWindowSurface`:
    - `frontend/src/components/Section/Container/StandaloneSectionSurfaceBoundary.tsx`
    - `frontend/src/components/Section/Container/SectionWindowSurface.tsx`
  - Updated focused coverage to pin the higher ownership boundary on the standalone route surface:
    - `frontend/src/components/Section/Container/StandaloneSectionSurfaceBoundary.test.tsx`
    - `frontend/src/components/Section/Container/SectionWindowSurface.test.tsx`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping `SectionWindowSurface` on the same shared window-surface path while allowing callers to supply the dict renderer explicitly
    - routing standalone section surfaces through `SectionContainerAreaDictBoundary` from the higher-level standalone caller via `renderDictArea(...)`
    - leaving the standalone `gui` settings dict/param DOM path intact while shrinking `SectionWindowSurface.tsx` ownership further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Section/Container/SectionWindowSurface.test.tsx src/components/Section/Container/StandaloneSectionSurfaceBoundary.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug"`
    - first run failed before assertions with backend `ECONNRESET` during isolated-project setup in the temporary E2E workspace
    - reran the same spec immediately without code changes; second run passed (`1 passed (1.3m)`)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings/section/gui`) in a fresh sub-agent context
    - the standalone `gui` dict surface rendered normally after the initial loading spinner resolved
    - representative visible controls and labels included `defaultZoomLevel`, `Grid Color`, `Grid Color Dark Mode`, `Grid Pattern`, `gridPatternSize`, `Left Side Pane Shifts Map`, `maxZoom`, `minZoom`, `Pan On Drag`, `Pan On Scroll`, and `Pan On Scroll Mode`
    - no obvious clipping, overlap, or missing content was observed in the standalone dict/param surface
    - representative requests returned `200`, including `POST /api/loadProjectConfig`, `POST /api/loadSettings`, and `GET /api/backendInitStatus`
- Next action:
  - Continue the retained-scene seam lift by moving the caller-owned dict-area renderer seam one level higher above `frontend/src/components/Section/Container/StandaloneSectionSurfaceBoundary.tsx`, starting with `frontend/src/components/Pages/Project/StandaloneProjectSurfaceRouteBoundary.tsx`.

## 2026-03-28 157

- Item: Lift the caller-owned dict-area renderer seam into `frontend/src/components/Pages/Project/StandaloneProjectSurfaceRouteBoundary.tsx`.
- Status: `done`
- Details:
  - Raised the standalone section-route dict-area handoff one caller higher so `StandaloneProjectSurfaceRouteBoundary` now owns the dict renderer seam above `StandaloneSectionSurfaceBoundary`:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfaceRouteBoundary.tsx`
    - `frontend/src/components/Section/Container/StandaloneSectionSurfaceBoundary.tsx`
  - Updated focused coverage to pin the higher ownership boundary on both sides of the seam:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfaceRouteBoundary.test.tsx`
    - `frontend/src/components/Section/Container/StandaloneSectionSurfaceBoundary.test.tsx`
  - The refactor preserves the existing non-Pixi behavior for:
    - keeping `StandaloneSectionSurfaceBoundary` on the same shared window-surface path while allowing callers to supply the dict renderer explicitly
    - routing standalone section routes through `SectionContainerAreaDictBoundary` from the higher-level standalone route caller via `renderDictArea(...)`
    - leaving the standalone `gui` dict/param DOM path intact while shrinking `StandaloneSectionSurfaceBoundary.tsx` ownership further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfaceRouteBoundary.test.tsx src/components/Section/Container/StandaloneSectionSurfaceBoundary.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug"`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings/section/gui`) in a fresh sub-agent context
    - the standalone `gui` dict surface rendered normally in the existing authenticated worktree tab without needing bootstrap in that browser session
    - representative visible controls and labels included `ARGS`, `Add arg`, `Remove arg`, `Filter`, `Grid Color`, `Grid Pattern`, `Left Side Pane Shifts Map`, `Pan On Scroll`, `Selection Mode`, and `Show Grid Lines`
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, and `POST /api/loadProjectConfig`
- Next action:
  - Continue the retained-scene seam lift by moving the caller-owned dict-area renderer seam one level higher above `frontend/src/components/Pages/Project/StandaloneProjectSurfaceRouteBoundary.tsx`, starting with `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageBoundary.tsx`.

## 2026-03-28 158

- Item: Lift the caller-owned dict-area renderer seam into `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageBoundary.tsx`.
- Status: `done`
- Details:
  - Raised the standalone page-level dict-area handoff one caller higher so `StandaloneProjectSurfacePageBoundary` now owns the dict renderer seam above `StandaloneProjectSurfaceRouteBoundary`:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageBoundary.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfaceRouteBoundary.tsx`
  - Updated the focused coverage to pin the higher ownership boundary and verify the lifted seam is still passed through the loaded page path:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageBoundary.test.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfaceRouteBoundary.test.tsx`
  - This refactor preserves the existing non-Pixi behavior for:
    - page-level loading / `404` / managed-chat-blocked gating in `StandaloneProjectSurfacePageBoundary`
    - route-level section/chat/window-space switching in `StandaloneProjectSurfaceRouteBoundary`
    - standalone section surfaces still receiving the same `SectionContainerAreaDictBoundary` renderer through a caller-owned prop instead of route-local ownership
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfacePageBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfaceRouteBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePageStateBoundary.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug"`
    - result: passed
  - Chrome DevTools MCP visual check on the restarted worktree app in a fresh sub-agent context
    - the initial pre-restart verification failed because the stale worktree session rejected bootstrap and `http://127.0.0.1:3044/settings/section/gui` fell through to `Section Not Found`
    - used the one allowed lifecycle self-recovery via `./aireset.sh`, which restarted the worktree on `http://127.0.0.1:3046/` and `http://127.0.0.1:8046`
    - `pnpm -C frontend cdp-port` returned `9267` after the restart; `source activate.sh && setta status --connect-info --latest --json --workspace .` returned `Error: No matching Setta sessions found.`
    - despite that status caveat, the restarted app was reachable and `http://127.0.0.1:3046/settings/section/gui` rendered normally with no obvious clipping, overlap, or missing content
    - representative visible controls and labels included `gui`, `ARGS`, `defaultZoomLevel`, `Grid Color`, `Grid Color Dark Mode`, `Grid Pattern`, `Pan On Drag`, `Pan On Scroll`, and `sectionTagColorChoices`
    - representative requests returned `200`, including `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAIFollowSnapshot`, and `POST /api/getListenerCoverage`
- Next action:
  - Continue the retained-scene seam lift by moving the caller-owned dict-area renderer seam one level higher above `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageBoundary.tsx`, starting with `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageStateBoundary.tsx`.

## 2026-03-28 159

- Item: Lift the caller-owned dict-area renderer seam into `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageStateBoundary.tsx`.
- Status: `done`
- Details:
  - Raised the standalone page-state dict-area handoff one caller higher so `StandaloneProjectSurfacePageStateBoundary` now owns the dict renderer seam above `StandaloneProjectSurfacePageBoundary`:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageStateBoundary.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageBoundary.tsx`
  - Updated focused coverage to pin the higher ownership boundary on both sides of the seam:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageStateBoundary.test.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageBoundary.test.tsx`
  - This refactor preserves the existing non-Pixi behavior for:
    - keeping `StandaloneProjectSurfacePageBoundary` on the same loading / `404` / managed-chat-blocked gating path while accepting the dict renderer from its caller
    - routing standalone section surfaces through the same `SectionContainerAreaDictBoundary` renderer from the higher-level page-state caller via `renderDictArea(...)`
    - leaving the standalone settings dict/param DOM path intact while shrinking `StandaloneProjectSurfacePageBoundary.tsx` ownership further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfacePageStateBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePageBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfaceRouteBoundary.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug"`
    - result: passed
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings/section/gui`) in a fresh sub-agent context
    - the supplied bootstrap token was rejected in that browser session, so verification reused the existing authenticated tab
    - the standalone `gui` dict surface rendered normally with no obvious clipping, overlap, or missing content
    - representative visible controls and labels included `ARGS`, `defaultZoomLevel`, `Grid Color`, `Grid Pattern`, `Pan On Drag`, `Show Grid Lines`, `Wire Color`, and `Zoom On Scroll`
    - representative requests returned `200`, including `POST /api/loadAllProjectMetadata` and `POST /api/loadProjectConfig` with `projectConfigName=settings`
- Next action:
  - Continue the retained-scene seam lift by moving the caller-owned dict-area renderer seam one level higher above `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageStateBoundary.tsx`, starting with `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageTargetBoundary.tsx`.

## 2026-03-28 160

- Item: Lift the caller-owned dict-area renderer seam into `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageTargetBoundary.tsx`.
- Status: `done`
- Details:
  - Raised the standalone page-target dict-area handoff one caller higher so `StandaloneProjectSurfacePageTargetBoundary` now owns the dict renderer seam above `StandaloneProjectSurfacePageStateBoundary`:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageTargetBoundary.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageStateBoundary.tsx`
  - Updated the focused coverage to pin the higher ownership boundary on both sides of the seam:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageTargetBoundary.test.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageStateBoundary.test.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageRouteStateBoundary.test.tsx`
  - This refactor preserves the existing non-Pixi behavior for:
    - keeping `StandaloneProjectSurfacePageStateBoundary` on the same title/error/chat-state path while accepting the dict renderer from its caller
    - routing standalone section surfaces through the same `SectionContainerAreaDictBoundary` renderer from the higher-level page-target caller via `renderDictArea(...)`
    - leaving the standalone settings dict/param DOM path intact while shrinking `StandaloneProjectSurfacePageStateBoundary.tsx` ownership further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfacePageTargetBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePageStateBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePageRouteStateBoundary.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug"`
    - result: passed
  - Chrome DevTools MCP visual check:
    - the initial check on `http://127.0.0.1:3044/settings/section/gui` stalled during init with repeated `Maximum update depth exceeded` console errors, so the GUI surface never rendered
    - used the one allowed lifecycle self-recovery via `./aireset.sh`, which restarted the worktree on `http://127.0.0.1:3046/` and `http://127.0.0.1:8046`
    - `source activate.sh && setta status --connect-info --latest --json --workspace .` still returned `Error: No matching Setta sessions found.`, so the retry used the live restart output for the refreshed URLs
    - on the restarted app, `http://127.0.0.1:3046/settings/section/gui` rendered normally after bootstrap with no obvious clipping, overlap, or missing content
    - representative visible labels included `gui`, `ARGS`, `Filter`, `Grid Color`, `Grid Pattern`, `Pan On Drag`, `Show Grid Lines`, `Zoom On Pinch`, and `Wire Color`
    - representative successful requests visible in DevTools included `GET /api/serverMode`, `POST /api/loadSettings`, and `GET /api/backendInitStatus`
- Next action:
  - Continue the retained-scene seam lift by moving the caller-owned dict-area renderer seam one level higher above `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageTargetBoundary.tsx`, starting with `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageRouteStateBoundary.tsx`.

## 2026-03-28 161

- Item: Lift the caller-owned dict-area renderer seam into `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageRouteStateBoundary.tsx`.
- Status: `done`
- Details:
  - Raised the standalone page-route-state dict-area handoff one caller higher so `StandaloneProjectSurfacePageRouteStateBoundary` now owns the dict renderer seam above `StandaloneProjectSurfacePageTargetBoundary`:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageRouteStateBoundary.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageTargetBoundary.tsx`
  - Updated the focused coverage to pin the higher ownership boundary while keeping the target-boundary tests focused on target resolution and state handoff:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageRouteStateBoundary.test.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageTargetBoundary.test.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageStateBoundary.test.tsx`
  - This refactor preserves the existing non-Pixi behavior for:
    - deriving route params and navigation in `StandaloneProjectSurfacePageRouteStateBoundary` while also providing the shared `SectionContainerAreaDictBoundary` renderer from that higher caller
    - keeping `StandaloneProjectSurfacePageTargetBoundary` on the same standalone target-resolution, managed-chat authority, and chat-history selector path while accepting the dict renderer from its caller
    - leaving the standalone settings dict/param DOM path intact while shrinking `StandaloneProjectSurfacePageTargetBoundary.tsx` ownership further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfacePageRouteStateBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePageTargetBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePageStateBoundary.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug"`
    - result: passed
  - Chrome DevTools MCP visual check:
    - the initial check on `http://127.0.0.1:3044/settings/section/gui` was blocked because the bootstrap token at `http://127.0.0.1:8044/__setta__/bootstrap#token=...` was rejected and the page stayed stuck on `Loading settings…` with repeated `Maximum update depth exceeded` console errors
    - used the one allowed lifecycle self-recovery via `./aireset.sh`, which restarted the current worktree on `http://127.0.0.1:3046/` and `http://127.0.0.1:8046` with a new bootstrap URL from the live script output
    - `source activate.sh && setta status --connect-info --latest --json --workspace .` still returned `Error: No matching Setta sessions found.`, so the retry used the live restart output for the refreshed URLs
    - on the restarted app, `http://127.0.0.1:3046/settings/section/gui` rendered normally after bootstrap with no obvious clipping, overlap, or missing content
    - representative visible labels included `defaultZoomLevel`, `Grid Color`, `Grid Color Dark Mode`, `Grid Pattern`, `gridPatternSize`, `Left Side Pane Shifts Map`, `maxZoom`, `minZoom`, `Pan On Drag`, `Pan On Scroll`, `Pan On Scroll Mode`, `panOnScrollSpeed`, `sectionTagColorChoices`, `Selection Mode`, `Show Grid Lines`, `snapGrid`, `transitionDuration`, `Wire Color`, `Wire Color Dark Mode`, `Zoom On Double Click`, `Zoom On Pinch`, and `Zoom On Scroll`
    - representative successful requests visible in DevTools included `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `POST /api/getLatestLspDiagnostics`, `POST /api/getAIFollowSnapshot`, `POST /api/getListenerCoverage`, and `GET /api/plugins/runtime`
- Next action:
  - Continue the retained-scene seam lift by moving the caller-owned dict-area renderer seam one level higher above `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageRouteStateBoundary.tsx`, starting with `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.tsx`.

## 2026-03-28 162

- Item: Lift the caller-owned dict-area renderer seam into `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.tsx`.
- Status: `done`
- Details:
  - Raised the standalone page-load dict-area handoff one caller higher so `StandaloneProjectSurfacePageLoadBoundary.tsx` now owns the dict renderer seam above `StandaloneProjectSurfacePageRouteStateBoundary.tsx`:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageRouteStateBoundary.tsx`
  - Updated focused coverage to pin the higher ownership boundary and verify the route-state boundary now forwards the caller-owned renderer unchanged while it still derives route params and navigation:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.test.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageRouteStateBoundary.test.tsx`
  - This refactor preserves the existing non-Pixi behavior for:
    - keeping `StandaloneProjectSurfacePageLoadBoundary.tsx` on the same `useLoadProjectConfig` / CodeMirror-style-loader / mouse-listener / plugin-bootstrap path while also providing the shared `SectionContainerAreaDictBoundary` renderer from that higher caller
    - keeping `StandaloneProjectSurfacePageRouteStateBoundary.tsx` on the same standalone route-param and navigation path while accepting the dict renderer from its caller
    - leaving the standalone settings dict/param DOM path intact while shrinking `StandaloneProjectSurfacePageRouteStateBoundary.tsx` ownership further
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePageRouteStateBoundary.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePageTargetBoundary.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug"`
    - result: passed
  - Chrome DevTools MCP visual check in a fresh sub-agent context:
    - the initial check on `http://127.0.0.1:3044/settings/section/gui` failed closed on a stale authenticated session and rendered `settings · Section Not Found`
    - used the one allowed lifecycle self-recovery via `./aireset.sh`, which restarted the current worktree on `http://127.0.0.1:3046/` and `http://127.0.0.1:8046` with a new bootstrap URL from the live script output
    - `pnpm -C frontend cdp-port` returned `9267` after the restart; `source activate.sh && setta status --connect-info --latest --json --workspace .` still returned `Error: No matching Setta sessions found.`
    - on the restarted app, `http://127.0.0.1:3046/settings/section/gui` rendered normally after bootstrap with no obvious clipping, overlap, or missing content
    - representative visible labels and controls included `gui`, `ARGS`, `Remove arg`, `Add arg`, `Pin selected args`, `Delete selected args`, `Grid Color`, `Grid Pattern`, `Pan On Scroll`, and `Zoom On Scroll`
- Next action:
  - Continue the retained-scene seam lift by moving the caller-owned dict-area renderer seam one level higher above `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.tsx`, starting with `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`.

## 2026-03-28 163

- Item: Lift the caller-owned dict-area renderer seam above `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.tsx` into its direct higher-level callers.
- Status: `done`
- Details:
  - Raised the standalone page entry seam so `StandaloneProjectSurfacePage.tsx` now owns the shared dict-area renderer above the load boundary:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageEntry.test.tsx`
  - Raised the share-route entry seam so `ShareStandaloneProjectSurfacePageBoundary.tsx` now owns the same caller-provided dict renderer above `StandaloneProjectSurfacePageWithLoadState`:
    - `frontend/src/components/Pages/Project/ShareStandaloneProjectSurfacePageBoundary.tsx`
    - `frontend/src/components/Pages/Project/ShareStandaloneProjectSurfacePageBoundary.test.tsx`
  - Shrunk `StandaloneProjectSurfacePageLoadBoundary.tsx` down to a pure load/lifecycle pass-through for a caller-owned `renderDictArea(...)` seam instead of owning the renderer inline:
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.test.tsx`
  - The refactor preserves the existing non-Pixi behavior for:
    - the standalone section-route dict surface path
    - the standalone chat/share route path through the same load boundary
    - the shared `SectionContainerAreaDictBoundary` renderer contract, now supplied by the higher callers instead of the load boundary itself
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfacePageEntry.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePageLoadBoundary.test.tsx src/components/Pages/Project/ShareStandaloneProjectSurfacePageBoundary.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes resolve the renamed slug and fail closed on the stale slug|wraps standalone project chat routes in the shared project-chat frame"`
    - result: passed (`2` passed)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044`) in a fresh sub-agent context
    - `http://127.0.0.1:3044/settings/section/gui` rendered normally with visible controls including `Grid Color`, `Grid Pattern`, `Pan On Drag`, `Show Grid Lines`, and `Zoom On Scroll`
    - `http://127.0.0.1:3044/settings/chat` rendered normally after the initial loading shell with visible controls including `Start a new thread`, `New Chat`, `View Threads`, `Project AI Settings`, `CREATE PROJECT`, `SUMMARIZE CODEBASE`, `PLAN NEXT STEPS`, and the message composer
    - no obvious clipping, overlap, or missing content was observed in either route
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `POST /api/loadProjectConfig`, `GET /api/authRefreshStatus`, and `GET /api/plugins/runtime`
- Next action:
  - Continue the retained-scene seam lift by moving the caller-owned dict-area renderer seam one level higher above `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` and `frontend/src/components/Pages/Project/ShareStandaloneProjectSurfacePageBoundary.tsx`, starting with the standalone/share route entry stack before any broad Pixi node drawing lands.

## 2026-03-28 164

- Item: Lift the remaining mode-route-boundary handoff out of `frontend/src/components/Pages/modeWrappedRouterArgs.tsx`.
- Status: `done`
- Details:
  - Added a dedicated helper boundary for the remaining mode-route-boundary/router-args seam:
    - `frontend/src/components/Pages/modeWrappedRouteBoundaryArgs.tsx`
    - `frontend/src/components/Pages/modeWrappedRouteBoundaryArgs.test.tsx`
  - Updated `frontend/src/components/Pages/modeWrappedRouterArgs.tsx` to consume the new helper instead of owning:
    - the `ModeWrappedRouteBoundary` render callback
    - the `viewModeRouteElements` alias back to `projectRouteElements`
  - Narrowed the focused router-args coverage to the remaining merge/delegation seam:
    - `frontend/src/components/Pages/modeWrappedRouterArgs.test.tsx`
    - `buildModeWrappedRouterArgs()` now only composes the lifted route-element bundle helper with the lifted route-boundary helper
  - This refactor preserves the existing non-Pixi behavior for:
    - routing every mode-wrapped route through the same `ModeWrappedRouteBoundary`
    - keeping view-mode routes tied to the existing project-route element bundle
    - leaving `modeWrappedRouterArgs.tsx` as a thin composition boundary instead of a mixed composition plus render-policy owner
- Verification:
  - Vitest: `pnpm -C frontend exec vitest run src/components/Pages/modeWrappedRouteBoundaryArgs.test.tsx src/components/Pages/modeWrappedRouterArgs.test.tsx src/components/Pages/routerModule.test.tsx`
    - result: passed
  - Playwright: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts frontend/tests/e2e/app/app-mode-routing.spec.ts --grep "settings view tabs filter sections and minimap|app routes select the configured UI root"`
    - result: passed (`2` passed)
  - Chrome DevTools MCP visual check on the running worktree app (`http://127.0.0.1:3044/settings`) in a fresh sub-agent context
    - `/settings` loaded cleanly after bootstrap and the visible settings shell stayed structurally intact
    - representative visible UI included the left settings navigation, the central settings canvas/cards, and the bottom view tabs including `Core` and `All Settings`
    - representative requests returned `200`, including `GET /api/serverMode`, `POST /api/loadSettings`, `GET /api/backendInitStatus`, `GET /api/authRefreshStatus`, `POST /api/loadProjectConfig`, `GET /api/getAgentRuns`, `GET /api/getPromptTemplates`, `GET /api/getExternalAgentHealth`, and `GET /api/llm/config`
    - no obvious clipping, overlap, or broken route shell was observed
- Next action:
  - Treat the remaining `modeWrappedRouterArgs.tsx` cleanup pass as complete and return to the retained-scene rewrite sequence with the next bounded Pixi-side canary step before any broad node drawing lands.
