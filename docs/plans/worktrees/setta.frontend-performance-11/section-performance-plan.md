# Section Performance Plan

Date: 2026-03-16
Worktree: `setta.frontend-performance-11`
Branch at planning time: `frontend-performance-11`
Related log: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-log.md`

## Start Here

If you are a new chat/session picking this work up, use this section first.

- Despite the plan's callable origin, the active work is now broader than the previously closed section-shell-only scope.
- The accepted callable work in this branch remains pilot history for a broader sections-wide DOM simplification effort.
- Reopen this plan with expanded scope: remove all remaining live `grid` and `subgrid` usage and flatten wrappers as aggressively as possible from the section container level downward across all section types, then continue upward reducing shared complexity to the top only after the lower section stack is exhausted.
- Keep every accepted `Phase S0` / `Phase S1` / `Phase S2` / `Phase S3` checkpoint as append-only history and baseline evidence, not as proof that the broader sections stack is exhausted.

Current status:

- Callable pilot work: complete as pilot/history
- Callable-specific performance goal: not fully achieved
- Active plan: reopened expanded-scope sections-wide container-down flattening and grid removal
- Completed baseline: `Phase S0: Shared Section-Shell Baseline`
- Accepted history to preserve: `Phase S1`, `Phase S2`, and `Phase S3` through checkpoint 9
- Active phase: `Phase S1` follow-up inside checkpoint 1 at the shared param-row grid contract below the section container cluster
- Latest accepted checkpoint: `Phase S3` checkpoint 9 isolates standalone chat routes from unrelated project-structure churn
- Current state: the shared param-row row-container shells are now flex-based across the callable/dict/global-variables stack, and the same-scene `busy_tide` callable compare against untouched `main` is materially flatter (`124` nodes / depth `12` on `main` versus `92` / `9` on the worktree); the row-input follow-up has restored visible underline/focus feedback parity and dummy-vs-real CodeMirror mono font parity on the touched `mode` field, the shared callable row-shell follow-up has restored hover/highlight parity plus resize-handle placement parity to within roughly a pixel against untouched `main`, and five more local activation trims now remove the extra dummy-to-real handoff render, slim the text-input CodeMirror bootstrap, make activation commit synchronously while keeping the live extension/completion setup stable across ordinary value rerenders, split the plain text-input setup away from the autocomplete path while caching the static `getExtensions` pieces, and tighten `getOnCreateEditor.ts` so placeholder cursor sizing stays scoped to the mounted editor and first-click selection dispatch only happens when CodeMirror can resolve a valid position; the transport/harness blockers have moved again: the built-in `chrome-devtools-mcp` tool works again in this session, matched disposable `open` control scenes were recreated on `smooth_hawk` (worktree) and `dry_slow` (untouched `main`) with the historical `file` pinned / `buffering` edge-input / nested `errors` setup, and the canvas was re-centered so the callable sits inside the current `1400x900` debug window; the weak generic DevTools click probe is now explained and replaced because the overview pane still wins center-point hit testing ahead of the dummy `mode` field, while the real activation path is the dummy node's primary-button `mousedown`, so a direct dummy-node `pointerdown` + `mousedown` now deterministically mounts the live `.cm-editor` on both branches and yields fresh activation traces under `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-devtools-recovery/`; the corrected focused-DOM read shows that the main underline span does turn blue under that harness, so there is no longer evidence of a focused-underline regression; the lower CodeMirror activation seam now reads as locally exhausted, `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx` remains only a narrow trace-gated reopen candidate for the unchanged non-empty preview path, and the stronger remaining branch-vs-`main` delta still lives in the shared row contract itself (`frontend/index.css`, `frontend/src/components/Params/paramRowClassNames.ts`, `frontend/src/components/Params/ParamRowShell.tsx`, `frontend/src/components/Params/ParamContainer.tsx`, `frontend/src/components/Params/GroupContainer.tsx`, `frontend/src/components/Params/ParamUIs/ParamUI.tsx`, and `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`); the cross-section verification inventory is no longer missing its weakest piece: a direct Playwright representative now exists for `GlobalVariables`, the focused unit and Playwright cross-section suites are green across `Callable` / `Dict` / `GlobalVariables` / `MetaControl`, and direct headed-browser `GlobalVariables` probes now confirm the same row-contract split beyond callable (`worktree`: `section-param-row` + flex/flex/flex, untouched `main`: grid/grid/block); that closes the missing harness gap, but the checkpoint still does not have an explicit accepted shared-row compare that supersedes the earlier mixed cold-activation rerun, so the next required step is now specific: capture one more explicit untouched-`main` vs worktree shared-row compare before deciding whether checkpoint 1 can be accepted and the plan can move upward into `sectionChrome`
- Deferred follow-up watch items after the current structural passes: callable column resizing and section resizing are still noticeably slow, but they should be treated as post-flattening trace targets rather than immediate checkpoint drivers
- Plan closure: not complete for the expanded scope; close only after container-down `grid` removal, cross-section-type verification, and upward exhaustion reads are all complete against untouched `main` vs this branch

Non-negotiable constraints:

- Eliminate div soup wherever wrappers are not carrying real value.
- Remove all remaining live `grid` and `subgrid` usage from the section container level downward in the active implementation path.
- Use the simplest rendering/layout technique that preserves parity.
- Preserve all existing user-facing behavior, features, and interactions.
- Treat untouched `main` as the visual and interaction source of truth for every touched section path; the refactored branch must be pixel-perfect against `main` unless the user explicitly approves a visual change.
- The intended user-visible outcome is performance gain only, not redesign.
- Work from the deepest nested layout ownership outward/upward.
- Expect multiple passes; after removing a top shared grid layer, re-analyze before deciding the next pass.
- Use Chrome DevTools performance testing and compare untouched `main` vs this worktree.
- Check every touched section type, not only the earlier representative controls.
- For every touched text/code input path, explicitly verify underline/focus feedback, dummy-vs-real CodeMirror font and spacing parity, and activation responsiveness.
- For every touched param-row path, explicitly verify hover styling, resize-handle visibility and placement, live resize behavior, and pixel-perfect row geometry against untouched `main`.
- Do not promote callable column resize or section resize work above the active structural simplification passes unless a fresh untouched-`main` vs worktree trace shows they are blocking the current checkpoint.
- For any performance test that touches panning, zooming, resizing, or another section-shell interaction path, capture a Chrome DevTools `Performance` trace on that path. Playwright metrics or ad hoc timings can support the read, but they do not replace the DevTools profile.
- If a target truly cannot be achieved without `grid`, stop and report the blocker instead of introducing `grid`.
- Do not edit the settings page as part of this plan. Treat it as an observation-only perf control surface.

Immediate next step:

1. Treat the accepted `Phase S0` / `Phase S1` / `Phase S2` / `Phase S3` reports as baseline history and reuse them as comparison context, not as proof that the expanded scope is exhausted.
2. Start a fresh boundary read at:
   - `frontend/src/components/Section/Container/SectionContainerCore.tsx`
   - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
   - `frontend/src/components/Section/Container/SectionWindowSurface.tsx`
   - `frontend/src/components/Section/Container/SectionAreaSwitch.tsx`
3. From that cluster downward, inventory every remaining live `grid` or `subgrid` usage and every wrapper-heavy shell across all section-type entry paths; choose the deepest removable ownership seam first and flatten it before touching higher shells.
4. Expand representative coverage beyond `S0 Code` and `S0 Dict` to every section type affected by the seam, and explicitly verify:
   - text-input underline/focus feedback
   - dummy-vs-real CodeMirror font and spacing parity
   - CodeMirror activation responsiveness
5. For every candidate checkpoint, compare untouched `main` vs this branch on the exact touched interaction path in Chrome DevTools and pair the trace with fresh DOM audits for the touched section types.
6. After each accepted checkpoint, re-read from the section container level downward again; move upward only when the lower section stack no longer contains a stronger removable `grid` or wrapper seam.
7. Keep the previously accepted `Phase S3` route/window checkpoints as preserved history, but do not treat the earlier section-shell closure as active direction for this expanded scope.
8. Keep callable column resize and section resize as explicit deferred follow-up checks after the active flattening passes, then compare untouched `main` vs this branch on those resize paths once the structural work is otherwise complete.
9. Fresh reopened boundary read result:
   - the shared section-surface grid contract still lives in `frontend/src/components/Section/Container/sectionChrome.ts` through `section-grid-cols`, `section-grid-rows`, and `section-grid-areas`, so it remains an open upward seam
   - the deeper still-live contract is the shared param-row CSS grid system in `frontend/index.css`:
     - `section-args-nested`
     - `section-param-row`
     - `section-key`
     - `section-value`
     - `section-key-value`
   - that lower contract is still consumed by:
     - `frontend/src/components/Params/ParamRowShell.tsx`
     - `frontend/src/components/Params/GroupContainer.tsx`
     - `frontend/src/components/Params/ParamContainer.tsx`
     - the shared `KwargsControls` plus `ParamGroupContainer` stack
   - the primary affected section types are:
     - `Callable`
     - `Dict`
     - `GlobalVariables`
   - `MetaControl` remains a parallel lower-shell grid consumer through `single-cell-container` / `single-cell-child`, so keep it in the verification set, but it is not the deepest shared checkpoint candidate
10. Next narrow checkpoint candidate:
   - target the shared param-row grid contract and the surrounding `section-args-nested` wrappers before reopening the higher `sectionChrome` section-surface grid
   - start with:
     - `frontend/index.css`
     - `frontend/src/components/Params/paramRowClassNames.ts`
     - `frontend/src/components/Params/ParamRowShell.tsx`
     - `frontend/src/components/Params/GroupContainer.tsx`
   - pull in `frontend/src/components/Params/ParamContainer.tsx`, `frontend/src/components/Params/ParamSwitch.tsx`, and row-input consumers only as needed to preserve parity
   - lock the verification set to:
     - `Callable`
     - `Dict`
     - `GlobalVariables`
     - one floated/window rendering of a param section
     - `MetaControl` as a contrast check for lower-shell regressions
   - keep text-input underline/focus feedback, dummy-vs-real CodeMirror typography parity, and activation responsiveness as hard acceptance checks inside this checkpoint
11. Current checkpoint-1 follow-up after the row-container flex pass:
   - keep the work inside the same lower seam; do not move upward into `sectionChrome` yet
   - the row-input follow-up has already restored:
     - visible underline/focus parity on the touched `mode` field
     - dummy-vs-real CodeMirror mono font parity on the touched `mode` field
     - persistent live-editor mounting after first activation so repeated focus no longer pays a blur-triggered remount
     - removal of the extra dummy-to-real handoff render on first activation
     - a leaner text-input `basicSetup` plus reused language extension bundles for the real editor bootstrap
   - checkpoint 1 is still not accepted because the cold first-activation trace is only mixed against untouched `main`
   - the callable row-shell follow-up also has a hard visual gate:
     - every callable arg row must keep the same hover/highlight behavior as untouched `main` unless the user explicitly requests an additive visual treatment
     - resize handles must sit in the same place and behave the same way as untouched `main`
     - the recreated flex layout must stay pixel-perfect against untouched `main`, not just approximately aligned
   - the current row-shell parity repair has now restored:
     - callable row hover/highlight screenshots that visually align with untouched `main`
     - resize-handle placement that lands within roughly a pixel of untouched `main` on the representative `file`, `mode`, and nested `errors` rows
     - the representative callable reorder/indent and resize Playwright suite after the shared row-shell/handle recreation
   - the next fix slice stays in the same lower seam and should target the cold activation path under the newly flattened row shell:
     - `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
     - `frontend/src/components/Utils/CodeMirror/useCodeMirrorStyle.ts`
     - `frontend/src/components/Utils/CodeMirror/getExtensions.ts`
     - `frontend/src/components/Utils/CodeMirror/getOnCreateEditor.ts`
     - `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx`
     - `frontend/src/components/Utils/CodeMirror/codeMirrorLanguages.ts`
     - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
     - `frontend/src/components/Params/ParamUIs/TextParamInput.tsx`
     - `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
     - the mirrored param-input affordance copies in `frontend/src/components/App/appRegistry.tsx`
     - plus the shared row/handle recreation seam in:
       - `frontend/src/components/Params/ParamContainer.tsx`
       - `frontend/src/components/Params/ParamRowShell.tsx`
       - `frontend/src/components/Params/ResizeHandle.tsx`
       - `frontend/src/components/Params/GroupContainer.tsx`
       - `frontend/index.css`
  - acceptance remains blocked until the same-scene callable compare regains:
    - a clearly non-regressing cold row-activation trace on untouched `main` vs this worktree
    - the same visual/input parity across every touched section type after the activation-path changes land
    - pixel-perfect callable row recreation for hover, handle placement, and live resize behavior against untouched `main`
  - immediate next action inside the checkpoint:
    - keep the lower seam evidence-driven; the deterministic activation harness now exists, so use the dummy-node primary-button `mousedown` path rather than generic DevTools clicks for any further cold `mode` reruns
    - do not treat focused underline parity as the blocker here; the corrected DOM read shows untouched `main` still reaches the blue underline under the deterministic harness
    - do not reopen `TextInputCodeMirror` / `getExtensions` / `getOnCreateEditor` on the current evidence; this seam is locally exhausted enough that the next call should come from the mixed trace plus the corrected DOM/screenshot read together
    - shift the checkpoint evidence read one layer outward to the shared row contract in:
      - `frontend/index.css`
      - `frontend/src/components/Params/paramRowClassNames.ts`
      - `frontend/src/components/Params/ParamRowShell.tsx`
      - `frontend/src/components/Params/ParamContainer.tsx`
      - `frontend/src/components/Params/GroupContainer.tsx`
      - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
      - `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
    - use the current shared-row evidence set instead of building more harnesses:
      - `frontend/tests/e2e/params/callable-params.spec.ts`
      - `frontend/tests/e2e/params/dict-kwargs.spec.ts`
      - `frontend/tests/e2e/params/global-variables-kwargs.spec.ts`
      - `frontend/tests/e2e/params/meta-control-date-time-modes.spec.ts`
      - `frontend/src/components/Section/Layouts/CallableArea.test.tsx`
      - `frontend/src/components/Section/Layouts/DictArea.test.tsx`
      - `frontend/src/components/Section/Layouts/GlobalVariablesArea.test.tsx`
      - `frontend/src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx`
      - the existing callable standalone/window representative in `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
    - the current evidence is strong enough to stop adding new harnesses, but not yet strong enough to accept the checkpoint on its own because the hard acceptance gate still lacks an explicit accepted shared-row compare that replaces the earlier mixed cold-activation rerun
    - the next explicit call is therefore fixed:
      - capture one more explicit untouched-`main` vs worktree shared-row compare on the declared lower seam
      - then use that compare plus the existing cross-section evidence set to accept or reject checkpoint 1 before any move upward into `sectionChrome`
    - only if a fresh trace explicitly isolates the unchanged non-empty dummy preview path should `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx` be reopened before the plan climbs into `sectionChrome`

Historical accepted checkpoint notes retained below:

16. Historical accepted `Phase S3` direction before the expanded-scope reopen:
   - `frontend/src/components/Section/Container/SectionContainerCore.tsx` now isolates the active/highlight shell from the static edge-handle + resizable body subtree
   - a new focused invalidation guardrail proves active-only changes do not rerender:
     - the edge-handle subtree
     - `MinimizedDataEdgeHandles`
     - `SectionContainerCoreResizable`
   - the locked `S0 Code -> S0 Dict` activation trace stayed effectively flat:
     - worktree improved `RunTask` and `Commit`
     - worktree was only slightly higher on `FunctionCall`, `UpdateLayoutTree`, `Paint`, `EventDispatch`, and `FireAnimationFrame`
   - treat this as a narrow active-shell isolation checkpoint, not the final shared-shell answer
   - the next serious `Phase S3` pass should move outward into the broader shared section-surface shell ownership split across:
     - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
     - `frontend/src/components/Section/Container/SectionWindowSurface.tsx`
     - `frontend/src/components/Section/Container/sectionChrome.ts`
   - do not reopen the accepted controller, chrome, area-switch, or active-shell seams unless a later trace shows a boundary-specific regression
17. Current post-checkpoint-5 direction:
   - `frontend/src/components/Section/Container/sectionChrome.ts` now owns the shared section-surface mode split:
     - `bgColor`
     - meta-control mode
     - the shared window/canvas surface frame recipe
   - `frontend/src/components/Section/Container/SectionWindowSurface.tsx` no longer computes its shell classes inline and now consumes `getWindowSectionChrome(...)`
   - the locked untouched-`main` vs worktree `S0 Dict` floating-window visual compare stayed aligned after moving the shared chrome ownership:
     - header chrome
     - floating-window controls
     - the body shell
     - the visible `gamma` row
   - the rerun representative `S0 Dict` `300 x 300 -> 225 x 225` resize trace stayed acceptable:
     - worktree improved `FunctionCall`, `RunTask`, and `TimerFire`
     - worktree was only slightly higher on `UpdateLayoutTree`, `Layout`, `Paint`, `EventDispatch`, and `Commit`
     - `CLS 0.00` on both traces
   - treat this as a shared chrome-ownership checkpoint, not the final shell simplification
   - the next serious `Phase S3` pass should target actual body-shell or theme-state invalidation reduction above this model in:
     - `frontend/src/components/Section/Container/SectionWindowSurface.tsx`
     - the remaining shared section shell consumers above `sectionChrome.ts`
   - do not reopen the accepted controller, chrome, area-switch, active-shell, or shared surface-chrome seams unless a later trace shows a boundary-specific regression
18. Current post-checkpoint-6 direction:
   - `frontend/src/components/Section/Container/SectionWindowSurface.tsx` now keeps:
     - the outer floating shell
     - section-style vars
     - `SectionHeader`
   - a memoized floating body child now owns:
     - the body wrapper
     - `bodyOverride`
     - the shared `SectionAreaSwitch` path
   - focused invalidation coverage now proves the floating body subtree does not rerender when only:
     - durable `activeIds` change
     - preview style-color state changes
   - the representative marked active-id trace now favors the worktree on:
     - `FunctionCall`
     - `UpdateLayoutTree`
     - `Paint`
     - `RunTask`
     - `FireAnimationFrame`
   - `Commit` is the only small watch item left from this checkpoint, and it is not large enough to reject the pass
   - the next serious `Phase S3` step should move outward into higher shared floating/window consumers above `SectionWindowSurface.tsx`, not reopen the accepted floating-body memo seam unless a later trace proves it necessary
19. Current post-checkpoint-7 direction:
   - `frontend/src/components/Pages/Project/StandaloneWindowSpaceSurface.tsx` now keeps:
     - hydration and merge state
     - blocked managed-chat bookkeeping
     - snapped resize orchestration
     - the sorted visible-window list
   - a memoized per-window child now owns:
     - the absolute standalone `article` frame
     - the `SectionWindowSurface` versus `ProjectChatWindowSurface` split
     - per-window local chat-thread and embedded-git callbacks
   - focused invalidation coverage now proves unrelated standalone sibling windows do not rerender when only:
     - a different window is focused
     - a project-chat window updates its local thread
   - the representative standalone focus trace now favors the worktree on:
     - `FunctionCall`
     - `UpdateLayoutTree`
     - `RunTask`
     - `Commit`
   - `Layout`, `Paint`, `EventDispatch`, and `FireAnimationFrame` are slightly higher on the worktree, but not enough to reject the pass
   - the next serious `Phase S3` step should move outward into route-level or remaining shared floating/window ownership above `StandaloneWindowSpaceSurface.tsx`, not reopen the accepted per-window memo seam unless a later trace proves it necessary
20. Current post-checkpoint-8 direction:
   - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` now keeps the project-chat history lookup fully gated to `target.kind === "project_chat_thread"`
   - standalone `window_space` and `section` routes no longer subscribe to unrelated `useAIStore(...agentRuns...)` churn through the shared route shell
   - focused invalidation coverage now proves standalone routes stay stable when unrelated project-chat history changes:
     - `/windowspace/...`
     - `/section/...`
   - the representative standalone route trace now favors the worktree on:
     - `FunctionCall`
     - `RunTask`
     - `Commit`
   - `UpdateLayoutTree`, `Layout`, `Paint`, `EventDispatch`, and `TimerFire` stayed at `0.000` on both branches in the marked window, while `FireAnimationFrame` was only slightly higher on the worktree
   - the next serious `Phase S3` step should stay above this seam and target the remaining project-chat-only owner/error shell ownership in `StandaloneProjectSurfacePage.tsx`, not reopen the accepted standalone window-space or floating/window lower seams unless a later trace proves it necessary
21. Current post-checkpoint-9 direction:
   - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` now keeps standalone project-chat owner/error/title wiring inside `StandaloneProjectChatRouteSurface`
   - the shared standalone route parent now only owns:
     - load and `404` handling
     - target resolution
     - shared outer shell selection
     - non-chat title handling
   - standalone chat routes no longer subscribe to unrelated project-structure dictionaries through the shared parent shell:
     - `projectConfig.windowSpaces`
     - `projectConfig.sectionVariantMap`
     - `sections`
     - `sectionVariants`
     - `sectionImpls`
   - focused invalidation coverage now proves standalone project-chat thread routes stay stable when unrelated project structure churn only clones those dictionaries
   - the representative standalone chat-route structure trace now favors the worktree on:
     - `FunctionCall`
     - `RunTask`
     - `Commit`
   - `UpdateLayoutTree`, `Layout`, `Paint`, `EventDispatch`, and `TimerFire` stayed at `0.000` on both branches in the marked window, and `FireAnimationFrame` dropped to `0.000` on the worktree
   - the next serious `Phase S3` step should be a fresh boundary read above `StandaloneProjectSurfacePage.tsx` to decide whether any meaningful route-shell seam still remains or whether `Phase S3` is structurally exhausted, not a reopening of the accepted floating/window or standalone-route seams unless a later trace proves it necessary
22. Fresh boundary read after checkpoint 9:
   - reviewed the remaining ownership above the accepted standalone route seam in:
     - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`
     - `frontend/src/components/Pages/Project/ShareStandaloneProjectSurfacePage.tsx`
     - `frontend/src/components/Pages/router.tsx`
     - `frontend/src/components/Modals/ModalContainer.tsx`
     - `frontend/src/components/Pages/GlobalWrapper.tsx`
   - the remaining wrappers above `StandaloneProjectSurfacePage.tsx` are:
     - general mode routing
     - share-mode wrapping
     - modal hosting
     - global app/bootstrap shells
   - those owners do not form another meaningful standalone section-shell simplification seam:
     - they are not standalone-route-specific project-state subscribers
     - they are not the accepted shared section frame/window-space/chat-route owners this plan has been flattening
     - the accepted checkpoint-9 representative trace already leaves the worktree marked route window close to idle
   - treat `Phase S3` as structurally exhausted for the current section-shell scope
   - do not continue implementation work under this plan unless a new untouched-`main` vs worktree trace identifies another meaningful section-shell-specific hotspot
23. Prior closure state, now superseded by explicit scope expansion:
   - the accepted `Phase S0` through `Phase S3` checkpoints covered the narrower shared section-shell simplification scope that ended at the standalone route seam
   - that earlier closeout remains valid historical context for the narrower scope, but it is no longer the active direction for this document
   - the reopened scope now requires:
     - removing all remaining live `grid` and `subgrid` usage from the section container level downward
     - flattening wrappers as aggressively as possible while preserving parity
     - checking all touched section types instead of relying only on the earlier representative controls
     - continuing upward reducing shared complexity to the top only after the lower section stack is exhausted
   - close this plan only after the expanded scope is exhausted with fresh untouched-`main` vs worktree evidence

Use the log for append-only history, but the active direction and next step should be readable from this file alone.

## Goal

Simplify the section DOM structure as aggressively as possible, while keeping visible layout and interaction behavior effectively identical to untouched `main`.

This file started as a callable-only plan. The accepted callable work now serves as the pilot/baseline for a broader sections-wide DOM simplification effort because the remaining grid and measurement contracts live above the callable subtree.

Active goal now:

- Reduce section-shell DOM complexity across shared section infrastructure, not just callables.
- Remove all remaining live `grid` and `subgrid` usage from the section container level downward across all touched section types.
- Eliminate div soup wherever wrappers are not carrying real value.
- Prefer the simplest layout/rendering technique that preserves behavior and parity.
- Treat performance wins as likely upside, but not as guaranteed proof before the shared section-shell work is complete.
- Keep comparing untouched `main` vs this worktree in Chrome DevTools at each accepted checkpoint.
- Work from the deepest nested structures outward/upward into the shared section shell.
- Continue upward only after the lower section stack is exhausted.
- Expect multiple passes. Do not assume the first grid-removal pass will reveal the final target structure.
- The intended user-facing result is performance gain only, not visual or UX change.
- All existing features and interactions must remain intact.
- Treat text-input focus affordances, dummy-vs-real CodeMirror typography parity, and CodeMirror activation responsiveness as required regression checks across all touched section types.

Historical callable-only phases below remain valid as an append-only record of the pilot work that already landed.

## Planning Inputs

- Reviewed `docs/notes/performance/frontend-performance-branches-retrospective.md`.
- Reviewed `docs/guides/browser-mcp-quickstart.md`.
- Reviewed `docs/guides/verification-checklist.md`.
- Inspected the current callable subtree:
  - `frontend/src/components/Section/Layouts/CallableArea.tsx`
  - `frontend/src/components/Section/SectionParts/Search.tsx`
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
  - `frontend/src/components/Params/GroupContainer.tsx`
  - `frontend/src/components/Params/ParamDndList.tsx`
  - `frontend/src/components/Params/GetParamSwitch.tsx`
  - `frontend/src/components/Params/ParamSwitch.tsx`
  - `frontend/src/components/Params/ParamContainer.tsx`
  - `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`

## What The Existing Evidence Already Says

- The main bottleneck is the live callable/settings param-row and widget subtree, not the outer React Flow shell.
- DOM flattening is directionally correct, but DOM count reduction alone is not enough.
- Input/editor polish is now a tracked regression surface in the expanded scope:
  - text-input underlines must still light up on focus
  - dummy CodeMirror must visually match the real editor path closely enough that activation does not cause a font/spacing jump
  - activating a CodeMirror-backed text input must stay responsive enough that the handoff does not feel delayed
- Resize performance is also a tracked follow-up surface, but not the current driver:
  - callable column resizing is still noticeably slow
  - section resizing is still noticeably slow
  - both should be measured after the active flattening passes are otherwise complete, unless new traces show they block the current structural checkpoint selection
- We should not reopen previously rejected paths unless the product assumption changes:
  - backend-only fixes as the primary answer
  - subscription partitioning
  - lazy overlay mounting
  - observer/listener-budget work as the main lever
  - workerized param filtering
  - `content-visibility`
  - RAF-throttled transform propagation
  - code-widget-only SnapDOM
  - minimap-first tuning
  - canvas-engine rewrite under always-live DOM
- The current callable subtree still uses recursive `grid` / `subgrid` contracts heavily in the row and group layers, so the next focused pass should attack that directly.

## What "Shared Chrome / Editor Path" Means

When the log/report says the remaining hotspot is in the "shared chrome / editor path", it means the dominant work is no longer isolated to callable-specific row rendering. It is in shared infrastructure that many section types pay for:

- section container and resize shell work
- shared section chrome and overlays
- edge-handle positioning work
- CodeMirror/editor layout work
- shared chat/window chrome such as `ProjectChatBottomDock`

In other words, the remaining cost is higher in the section stack than `CallableArea` itself.

## Architectural Focus

- Treat the row/tree path as one architecture cluster, not as isolated files:
  - `ParamContainer`
  - `ParamSwitch`
  - `GetParamSwitch`
  - `ParamDndList`
- The main structural goal is to replace the current recursive row shell contract with a smaller row primitive and a clearer shell boundary.
- Use `improve-codebase-architecture` when the row primitive, shell boundary, or ownership split becomes unclear during implementation.
- Use `debug-with-http-logging` when parity or perf behavior becomes ambiguous enough that traces and screenshots are not sufficient to explain the mechanism.

For the broadened sections-wide pass, treat these as the shared architecture cluster:

- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
- `frontend/src/components/Utils/Resizable/CustomResizable.tsx`
- `frontend/src/components/Section/Container/sectionChrome.ts`
- `frontend/src/components/Params/GroupContainer.tsx`
- `frontend/src/components/Params/ParamContainer.tsx`
- `frontend/src/components/Params/ParamSwitch.tsx`

## Layout Principles

- Default to the flattest DOM structure that preserves behavior.
- Eliminate div soup aggressively:
  - remove generic wrappers that exist only for grouping
  - keep wrappers only when they carry real behavior, semantic value, measurement ownership, or unavoidable positioning responsibility
- Rule out `grid` for the active sections-wide refactor.
- Do not add new `grid` or `subgrid` layout in the implementation path.
- Work from deeply nested layout ownership outward/upward:
  - remove or simplify the innermost wrappers first
  - then simplify the row/group contracts that contain them
  - then simplify the higher-level section shell once the inner contracts are stable
- Reach for simpler techniques first:
  - plain block flow when it is sufficient
  - `relative` + `absolute` positioning for overlays, underlines, and visual chrome
  - pseudo-elements for purely visual affordances
  - `flex` for truly one-dimensional layout when it simplifies the contract
- Prefer `relative` + `absolute` positioning for decorative layers, underlines, badges, hover chrome, and overlays when that removes wrapper nodes or layout coupling.
- Prefer pseudo-elements over extra DOM nodes for purely visual affordances.
- Use `flex` only when the layout is truly one-dimensional and it simplifies the contract without introducing extra measurement or wrapper work.
- Existing `grid` / `subgrid` usage is now something to remove, not something to preserve by default.
- If a target layout truly cannot be achieved without `grid`, stop implementation and report that explicitly instead of introducing `grid` anyway.
- The rendering rule is: use the simplest technique that preserves parity and all existing features.
- Use semantic HTML where it fits naturally, but treat that as a second-pass improvement after the structural/performance simplification is already stable.
- Good candidates for later passes include `section`, `header`, `nav`, `aside`, lists, and other semantic containers that can replace generic wrappers without adding layout risk.
- Do not force semantic tags into places where they complicate parity or make the structure harder to reason about.
- If a layout choice is not clearly simpler or clearly faster, do not keep it by inertia; measure it.

## Current Callable Hotspot Map

The likely leaf-to-shell refactor order is:

1. Leaf UI nodes
   - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
   - `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
   - widget-specific wrappers that still inject row/layout wrappers
2. Row switch / row container nodes
   - `frontend/src/components/Params/ParamContainer.tsx`
   - `frontend/src/components/Params/ParamSwitch.tsx`
   - `frontend/src/components/Params/GetParamSwitch.tsx`
   - `frontend/src/components/Params/ParamDndList.tsx`
3. Callable support shells
   - `frontend/src/components/Section/SectionParts/Search.tsx`
   - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
4. Group shells
   - `frontend/src/components/Params/GroupContainer.tsx`
5. Callable-wide shell audit
   - only if needed after phases 1-3
   - `frontend/src/components/Section/Container/sectionChrome.ts`
   - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`

Useful size indicators from the current code scan:

- `GroupContainer.tsx`: 999 lines
- `ParamUI.tsx`: 736 lines
- `KwargsControls.tsx`: 575 lines
- `Search.tsx`: 442 lines
- `ParamNameInput.tsx`: 418 lines
- `ParamSwitch.tsx`: 314 lines

## Hard Guardrails

- Do not implement the refactor on the current `main` worktree. Use a dedicated performance worktree/branch so untouched `main` stays the control.
- Keep `docs/notes/performance/frontend-performance-branches-retrospective.md` in this worktree and treat it as the local do-not-repeat decision log.
- Commit frequently in small, logical increments while the refactor is in progress.
- Commit messages should be very descriptive so each checkpoint is understandable later without extra context.
- Make a descriptive checkpoint commit as soon as a coherent doc/test/layout checkpoint has passed its required verification so the user can push incrementally.
- Do not lose any user-facing functionality during the refactor.
- As far as the user can tell, untouched `main` and the refactor worktree should behave and look the same, except that the refactor worktree should ideally perform better.
- Do not add compatibility shims, fallback layers, or temporary dual-path behavior to preserve the old structure. This work is not constrained by production backward-compatibility requirements.
- Every DOM/layout change is a visual change and requires CDP visual verification.
- For every completed layout checkpoint, stop and compare screenshots between untouched `main` and this worktree before making more layout changes.
- If CDP is unavailable for either worktree, stop and ask the user to start `./ai.sh` in the needed directory before continuing.
- Every phase must end with a comparison against untouched `main` on the same scenario.
- “Pixel perfect” is the target. If any delta remains, document the exact element and the reason it cannot be preserved.
- Each phase requires explicit user approval before starting the next phase.
- Every measurement report is append-only under `perf/reports/frontend/`.
- The work log under `docs/plans/worktrees/setta.frontend-performance-11/section-performance-log.md` is append-only.
- Phase 2 is the first decisive checkpoint for whether the DOM-first callable strategy is paying off. Phase 1 is useful cleanup but not proof of success by itself.

## Checkpoint Verification Cadence

For every completed layout checkpoint, meaning a small coherent batch of layout edits that should now look correct:

1. Stop editing.
2. Capture screenshots in CDP for untouched `main` and this worktree on the same callable scenario.
3. Compare the key callable geometry and styling before continuing:
   - search row
   - first visible param row
   - nested child row
   - pinned params header and first pinned row
   - unpinned list container
   - resize handle
   - agentic handles
4. If there is visible drift, fix it or explicitly document it before continuing with more layout edits.

## Minimum Callable Regression Run

This is the minimum callable regression run for every layout checkpoint and every phase gate. It complements the lighter `open` baseline from Phase 0 instead of replacing it.

Scenario setup:

1. Start from an isolated project config.
2. Ensure generated Python code imports `math`.
   - If the active python target prefix does not already contain `import math`, add it before continuing.
3. Create a callable section and set the callable to `math.sqrt`.
4. Rename and expand params so the callable exposes `a` through `k`.
   - Rename the builtin `x` param to `a`.
   - Add kwargs and rename them to `b`, `c`, `d`, `e`, `f`, `g`, `h`, `i`, `j`, `k`.
   - For isolated automated checkpoint runs, disable `settings.backend.autoRefetchCallableParamsOnLspMismatch` before building this invalid-but-intentional signature shape so the backend does not silently refetch the real `math.sqrt` signature mid-test.
5. Partition the params into all three callable areas:
   - edge inputs: `a`, `b`, `c`, `d`
   - pinned params: `e`, `f`, `g`
   - unpinned params: `h`, `i`, `j`, `k`
6. Place the callable at a deterministic viewport transform before taking screenshots.
7. Run the scenario in both `light` and `dark` color modes.
8. Run the scenario both on the canvas route and on the direct standalone section route:
   - `/:projectConfigName/section/:sectionSlug`
   - treat the direct route as the fullscreen control surface
   - if the standalone surface intentionally omits canvas-only controls, do not add a shim; verify the controls that are supposed to exist there

Interactions that must be covered on every run:

1. Capture a roomy baseline screenshot.
2. Resize the callable with the right resize handle.
3. Resize the callable with the bottom resize handle.
4. Resize the callable with the bottom-right resize handle.
5. Resize the param column using the callable param-column resize handle.
6. Drag/reorder at least one unpinned param row using the live DnD interaction.
7. Indent and unindent at least one unpinned param row using `Tab` and `Shift + Tab`.
8. On the standalone direct route, verify the callable still renders correctly and supports the interactions that are intentionally available there.
9. Capture a screenshot after every completed state transition above, in every required surface/theme variant.

Assertions that must be covered on every run:

1. All three callable areas render at the same time:
   - edge strip rows for `a` through `d`
   - pinned rows for `e` through `g`
   - unpinned rows for `h` through `k`
2. Overflow states are explicitly checked:
   - roomy state: the unpinned list does not vertically overflow
   - constrained state: the unpinned list vertically overflows and remains scrollable
   - recovered state: overflow returns to the expected non-overflow state after expanding again
3. Column-resize states are explicitly checked:
   - narrower column width applies
   - wider column width applies
4. Drag/reorder is explicitly checked:
   - the dragged param lands in the expected visible order
   - the reordered state remains usable and screenshot-stable
5. Tab indent is explicitly checked:
   - `Tab` indents the selected param under the expected parent
   - `Shift + Tab` restores it to the expected top-level location
6. Theme and route coverage are explicitly checked:
   - the same scenario renders in both `light` and `dark`
   - the direct standalone route renders without workspace panes
   - if the standalone route intentionally omits canvas-only outer resize handles, that omission is preserved
7. The resize interactions keep the callable usable:
   - edge rows remain visible
   - pinned header remains visible
   - at least one unpinned row remains visible
   - the intended resize handles remain present

Suggested automated coverage:

- `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
- `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`

## Phase 0: Control Setup And Baseline

Purpose: create the harness so each later phase is measured and reversible.

Tasks:

1. Create or switch to a dedicated callable-performance worktree/branch off `main`.
2. Verify CDP access for untouched `main` and this worktree.
   - If either session is unavailable, stop and ask the user to start `./ai.sh` in the needed directory.
3. Choose one deterministic callable scenario with real callable params, nested params, pinned params, and at least one resize interaction.
4. Capture the untouched `main` baseline:
   - CDP performance trace for `pan`
   - CDP performance trace for `zoom`
   - CDP performance trace for `resize`
   - DOM metrics for the callable subtree: total nodes, max depth, count of `display:grid`, count of `subgrid`, and hot descendants
5. Lock visual parity checks:
   - reuse and extend existing Playwright specs:
     - `frontend/tests/e2e/params/callable-params.spec.ts`
     - `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
     - `frontend/tests/e2e/sections/agentic-edge-callable-handle-alignment.spec.ts`
     - `frontend/tests/e2e/sections/minimized-callable-edge-handles.spec.ts`
     - any relevant callable sizing coverage in `frontend/tests/e2e/sections/section-sizing.spec.ts`
   - add a callable geometry/parity spec if current coverage is not enough
   - capture the first screenshot pair for untouched `main` and this worktree before any layout edits
   - compare key bounding boxes between untouched `main` and the refactor worktree:
     - callable search row
     - first visible param row
     - nested child param row
     - pinned params header and first pinned row
     - unpinned list container
     - resize handle
     - agentic handles
6. Write the baseline section in a new perf report:
   - suggested path: `perf/reports/frontend/2026-03-16_callable-dom-first.md`

Exit criteria:

- Stable baseline scenario exists.
- Baseline CDP traces and DOM metrics are recorded.
- Visual parity harness is in place.

Gate:

- Prompt user before Phase 1.

## Phase 1: Leaf DOM Flattening

Purpose: remove unnecessary nested DOM and grid usage from the deepest callable leaves before touching row shells.

Targets:

- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
- `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
- widget-specific wrappers used by callable params
- small callable-search wrappers in `frontend/src/components/Section/SectionParts/Search.tsx` where they are leaf-only and not row-contract-critical

Tasks:

1. Replace non-semantic wrapper `div`s with fragments where the wrapper exists only for JSX grouping.
2. Replace leaf `grid` wrappers with `relative` / `absolute` / `flex` layouts where geometry can stay identical.
3. Collapse duplicated decorative wrappers around borders, overlays, and error affordances when the same effect can be achieved on the row or leaf root.
4. Preserve stable hooks:
   - `id^="ParamContainer-..."`
   - existing class hooks still used by tests and styling
   - handle alignment hooks
5. Add or update Vitest coverage for leaf layout invariants when practical.

Verification:

- Follow the checkpoint screenshot cadence during the phase.
- Run the minimum callable regression run and review its screenshots.
- Run the callable-related Playwright coverage.
- Run CDP visual check against untouched `main`.
- Re-run the callable baseline traces and DOM metrics.
- Append results to the perf report.

Exit criteria:

- Measurable DOM simplification in the leaf subtree.
- No visual drift in callable layout.
- No regression in handle alignment, param visibility, or resize affordances.

Gate:

- Prompt user before Phase 2.

## Phase 2: Row And Tree Flattening

Purpose: remove recursive row-level `grid` / `subgrid` structure while preserving the callable row contract.

Targets:

- `frontend/src/components/Params/ParamContainer.tsx`
- `frontend/src/components/Params/ParamSwitch.tsx`
- `frontend/src/components/Params/GetParamSwitch.tsx`
- `frontend/src/components/Params/ParamDndList.tsx`

Tasks:

1. Replace the current row shell patterns that depend on `grid-cols-subgrid`.
2. Consolidate duplicate temp/real row layout contracts where one row primitive can serve both.
3. Move row alignment to a simpler contract:
   - CSS custom properties for column widths are acceptable
   - `relative` / `absolute` positioning for overlays and handles is preferred
   - `flex` is acceptable when absolute positioning is not enough
4. Keep DnD behavior unchanged:
   - same draggable hit zones
   - same transform behavior under zoom
   - same placeholder geometry
5. Keep nested param indentation and child-tree visibility identical.

Verification:

- Follow the checkpoint screenshot cadence during the phase.
- Run the minimum callable regression run and review its screenshots.
- Playwright geometry assertions for top-level, nested, and temporary rows.
- CDP visual check at normal size and resized extremes.
- CDP performance trace rerun on the same pan/zoom/resize scenario.
- Append results to the perf report and log.

Exit criteria:

- Recursive subgrid dependency is materially reduced or removed in the row layer.
- DnD and resize behavior still match untouched `main`.
- Pan/zoom/resize traces show clear improvement or at minimum a clear DOM-cost reduction with no behavioral regression.
- Treat this as the main go/no-go checkpoint for continuing the DOM-first callable strategy.

Gate:

- Prompt user before Phase 3.

## Phase 3: Callable Render-Path Narrowing

Purpose: now that Phase 2 removed the obvious row/tree shell duplication, reduce subscription breadth and repeated derived work in the callable render path. Return to more shell flattening only if a trace or DOM audit points back to a remaining shell hotspot.

Targets:

- `frontend/src/components/Params/GetParamSwitch.tsx`
- `frontend/src/components/Params/ParamDndList.tsx`
- `frontend/src/components/Params/GroupContainer.tsx`
- `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
- `frontend/src/components/Section/SectionParts/Search.tsx`

Tasks:

1. Collapse broad selectors in `GetParamSwitch` into narrower derived boundaries so the component only subscribes to renderable param ids, not the whole section/code-object cluster.
2. Deepen the `ParamDndList` / `GroupContainer` handoff so tree, duplicate-index, and filter derivation happen once per callable list instead of being spread across multiple shallow seams.
3. Re-check callable-specific measurement/update code in `KwargsControls` and `Search`:
   - keep necessary observers
   - do not introduce heuristic shortcuts
   - reduce layout-read and style-write surfaces where a simpler render boundary makes them unnecessary
4. Only return to group-shell flattening when a trace or DOM audit shows remaining shell overhead in:
   - `frontend/src/components/Section/Container/sectionChrome.ts`
   - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
5. After each accepted checkpoint:
   - run the minimum callable regression run and review its screenshots
   - re-run the callable pair
   - perform the required CDP screenshot comparison with untouched `main`
6. Once a meaningful cluster of render-path changes lands, rerun targeted traces against the relevant interaction path instead of assuming the idle open-control baseline is sufficient.

Verification:

- Follow the checkpoint screenshot cadence during the phase.
- Run the minimum callable regression run and review its screenshots.
- Existing callable Playwright specs plus focused Vitest coverage for any new render-path helper.
- CDP visual comparison with untouched `main`.
- CDP trace reruns on the relevant interaction path once a render-path cluster lands.
- Append any callable-wide DOM audit results only when a checkpoint actually changes the shell/DOM shape.

Exit criteria:

- The callable render path subscribes through narrower boundaries than untouched `main`.
- The next remaining hot path is identified by trace evidence, not assumption.
- Any remaining shell work is explicitly justified by measurement.

Gate:

- Prompt user before Phase 4.

## Phase 4: JS / React Optimization Pass

Purpose: optimize scripting cost only after the DOM and layout contracts are stable.

Current status after the accepted Phase 3 checkpoints:

- Treat Phase 3 as complete once the latest accepted filter/reorder traces no longer point at a clear callable-owned seam.
- Do not start Phase 4 just to keep pushing numbers down.
- Only continue callable-specific Phase 4 work when a fresh trace proves the next dominant scripting hotspot is still inside the callable subtree.
- If the next dominant signal has moved to shared page chrome or editor work, record that boundary in the log/report and stop the callable-specific track there rather than refactoring speculative targets.

Targets:

- `frontend/src/components/Params/GetParamSwitch.tsx`
- `frontend/src/components/Params/ParamDndList.tsx`
- `frontend/src/components/Params/GroupContainer.tsx`
- `frontend/src/components/Section/SectionParts/Search.tsx`
- any hot selector or derived-data helper reached from the callable path

Tasks:

1. Use CDP traces to identify the hottest scripting and commit paths in the refactored callable subtree.
2. Remove over-broad subscriptions or repeated derived work only when the trace proves they matter.
3. Reduce repeated filtering, tree building, and deep equality work where a narrower boundary is available.
4. Add automated guardrails for the hot path when practical:
   - Playwright coarse budgets or logged metrics
   - Vitest coverage for hot helper paths
5. Re-measure on the same scenario.

Verification:

- Use traces to prove the hot scripting path before changing code.
- Run the minimum callable regression run and review its screenshots after each accepted change.
- Re-run targeted Playwright coverage.
- Run CDP performance traces on the same locked scenario.
- Append results to the perf report.

Exit criteria:

- The post-DOM callable path shows reduced scripting cost.
- No user-visible behavior changed.

Gate:

- Prompt user before any broader “all sections” rollout.

## Branch-Comparison Workflow

For every completed layout checkpoint and every phase end:

1. Keep untouched `main` as the control.
2. Run the same callable scenario in the implementation worktree.
3. Compare:
   - screenshots or visible layout in CDP
   - bounding boxes of key callable elements
   - Chrome DevTools `Performance` trace metrics for pan, zoom, resize
   - DOM metrics for the callable subtree
4. If there is any visual drift:
   - stop
   - identify the exact element
   - either fix it in the current phase or document why perfect parity is impossible

## Definition Of Done For The Callable Track

- Callable subtree is measurably flatter than untouched `main`.
- Callable pan/zoom/resize traces improve on the same scenario.
- Callable geometry matches untouched `main` closely enough that any remaining delta is explicitly documented.
- Existing callable behavior is covered by Playwright/Vitest and still passes.
- Perf report and work log are updated append-only.

Current closeout status:

- The first, third, fourth, and fifth items above are satisfied by the accepted checkpoints already recorded in the log/report.
- The second item is not yet satisfied:
  - the Phase 2 closeout rerun showed the callable subtree is materially flatter, but pan stayed within noise, zoom stayed effectively flat, and resize was only marginally different on the same locked scenario
  - later Phase 3 work improved the callable filter/reorder path, but it did not convert the locked pan/zoom/resize scenario into a clear callable-owned win
  - the fresh locked resize reopen check also failed to hand ownership back to the callable subtree:
    - the worktree still exposed `ForcedReflow`
    - the dominant contributors stayed in shared chrome/editor work (`eq`, `ProjectChatBottomDock`)
    - callable-owned contributions (`getHandleCenter`, `KwargsControls.updateHeight`) remained small trailing costs
- Therefore this callable-specific track should currently be treated as stopped short of full completion, not as "tasks completed".
- Only reopen the callable track if:
  - a fresh trace proves the locked pan/zoom/resize gap is still callable-owned, or
  - the scope explicitly expands to shared page chrome / editor work that sits outside the callable subtree.

## Active Continuation After The Callable Pilot

The active work is now sections-wide DOM simplification.

The callable work already completed in this branch remains important because it proved two things:

- flattening the subtree is possible without user-facing regression
- the remaining layout contract is defined above the callable subtree, so a broader section-shell pass is justified

Implementation order for the broadened pass:

1. Start at the deepest nested layout ownership in the selected representative sections.
2. Move outward/upward only after the inner contract for that slice is stable and screenshot-verified.
3. Do not start by flattening the top-level section shell while the inner row/group contract is still noisy.
4. After the top-most shared grid layer is removed, pause and re-analyze the remaining structure before committing to the next pass.
5. Preserve all existing user-facing features while simplifying the structure:
   - resize
   - drag/reorder
   - keyboard interactions
   - standalone routes
   - theme variants
   - handles and overlays
   - any other existing section behavior on the representative scenes

### Representative scenarios

Keep the callable scenarios as required controls:

- locked `open` control scene
- `math.sqrt` minimum regression matrix

Add at least two shared section-shell controls before implementation resumes:

- one editor-backed non-callable section
- one non-editor section that still exercises the shared section shell and resizing path

Each accepted checkpoint should compare untouched `main` and this worktree on the same representative scene set in Chrome DevTools.

For any checkpoint that exercises panning, zooming, resizing, or a similar section-shell movement on these scenes, record a Chrome DevTools `Performance` trace for the touched interaction path. Do not treat automated timings alone as sufficient evidence.

Add an occasional large-surface pan/zoom control outside the locked checkpoint scenes:

- `http://127.0.0.1:3011/settings`
- specifically the `All settings` view mode / tab
- use it as a periodic sanity check because it is large and structurally complex
- keep it observation-only for this plan; do not edit that page while doing the section-shell work

### Active phases

#### Phase S0: Shared Section-Shell Baseline

Purpose: identify the section-container-down grid/subgrid and wrapper contracts that still survive across all section types.

Tasks:

1. Capture a fresh DOM audit for every touched section type on untouched `main` and this worktree:
   - total nodes
   - max depth
   - grid count
   - subgrid count
   - wrapper-only nodes
2. Capture Chrome DevTools `Performance` traces for:
   - the shared resize path
   - any obviously coupled pan/zoom path
   - the touched text/code input activation path where dummy and real CodeMirror hand off
   - Do not treat Playwright timings or ad hoc stopwatch numbers as a substitute for this trace evidence.
3. Map the shared shell ownership at and below the section container cluster:
   - `SectionContainerCoreResizabe`
   - `CustomResizable`
   - `sectionChrome`
   - `SectionWindowSurface`
   - `SectionAreaSwitch`
   - shared edge-handle work
   - editor/chat chrome that fires during section resize
4. For each touched section type, identify the deepest remaining DOM cluster and the deepest remaining live `grid` / `subgrid` seam that should be attacked first before moving outward/upward.
5. Record the input/editor regression checks that must hold for every touched section type:
   - underline/focus feedback
   - dummy/real CodeMirror font and spacing parity
   - activation responsiveness

Exit criteria:

- The shared section-container-down hotspot map is written down.
- The representative scene set across touched section types is locked.
- The deepest-first attack order for the first pass is written down.

#### Phase S1: Section-Container-Down Grid And Wrapper Removal

Purpose: remove remaining live `grid` / `subgrid` usage and wrapper-heavy shells from the section container level downward before moving higher in the stack.

Targets:

- `SectionContainerCoreResizabe`
- `SectionContainerCore`
- `SectionWindowSurface`
- `SectionAreaSwitch`
- the deepest touched section-type-specific shells under that cluster

Tasks:

1. Choose the deepest removable ownership seam first; do not start at the top if a lower container-down seam is still stronger.
2. Remove live `grid` / `subgrid` usage from the touched slice and replace it with simpler layout primitives that preserve parity.
3. Flatten wrapper nodes aggressively where they are not carrying real ownership or semantics.
4. Keep each checkpoint small and screenshot/trace-gated on untouched `main` vs this branch.
5. Re-verify every touched section type, including text/code input focus and activation behavior.
6. If a target cannot be completed without `grid`, stop and document the blocker instead of shipping a new grid-based solution.

Exit criteria:

- The touched container-down slice is materially flatter than untouched `main`.
- No live `grid` / `subgrid` remains in the accepted slice without a documented blocker.
- No user-facing behavior changes or input/editor regressions are introduced.
- A follow-up structural audit is recorded before moving to the next pass.

#### Phase S2: Lower Section-Type Shell Simplification

Purpose: continue removing lower-shell complexity inside section-type-specific bodies once the container-down read proves the next seam is below the shared container cluster.

Targets:

- `GroupContainer`
- `ParamContainer`
- `ParamSwitch`
- text/code input shells that still show dummy/real parity gaps
- any surviving shared section-row shell below the section container stack

Tasks:

1. Remove surviving row-level `grid` / `subgrid` contracts.
2. Collapse nested lower shells that still exist only to satisfy the old layout contract.
3. Prefer shared non-grid primitives instead of multiple similar wrappers.
4. Fix or eliminate dummy/real CodeMirror visual mismatches in the touched slice.
5. Fix or eliminate CodeMirror activation handoff cost that is obvious on the touched path.
6. If a row/shell target cannot be reproduced without grid, stop and document the blocker rather than keeping grid as an exception.
7. Continue moving outward/upward only after the lower slice is stable under parity and DevTools checks.

Exit criteria:

- The touched lower section-type shells are materially simpler than untouched `main`.
- The touched slice has no known text-input underline, dummy/real font, or activation regressions.
- After the strongest lower seam is removed, a fresh structural read determines whether another lower pass is needed or whether the work should move upward.

#### Phase S3: Upward Shared Shell Climb

Purpose: once the section-container-down and lower section-type slices are exhausted, continue upward reducing shared complexity to the top of the relevant stack.

Targets:

- higher shared window shells
- route-level section hosts
- any remaining shared wrappers above the accepted lower slices that are proven hot by traces

Tasks:

1. Re-run a boundary read after each accepted lower checkpoint before claiming the next upward seam.
2. Remove unnecessary shared wrappers and remaining complexity only where the lower stack is no longer the stronger target.
3. Reduce layout and activation work where a simpler shared shell makes it unnecessary.
4. Keep parity on handles, selection, hover, minimized/fullscreen behavior, and input/editor interactions.
5. Treat this phase as intentionally later than the container-down and lower-shell work, not as the starting point.

Exit criteria:

- The upward shared shell is flatter than untouched `main`.
- The representative resize and input activation paths are re-measured on the touched scenes.
- A fresh exhaustion read determines whether another upward pass is justified.

#### Phase S4: Trace-Backed Follow-Up

Purpose: only after the lower and upward structural simplification passes land, revisit any remaining scripting/layout hotspots shown by DevTools.

Tasks:

1. Re-run Chrome DevTools traces on `main` vs this worktree.
2. Continue only where the next hotspot is proven by measurement.
3. Include the deferred resize follow-up checks once the active structural work is otherwise complete:
   - callable column resize
   - section resize
4. For those deferred resize checks, compare untouched `main` vs this branch on the exact resize path before deciding whether they become new checkpoints.
5. Do not keep refactoring by aesthetics alone once the structural work is done.
6. If the previous pass materially changed the shell shape, start this phase with another DOM/ownership audit before deciding what the next pass should be.

Exit criteria:

- The next remaining hotspot is explicitly identified.
- Any further work is justified by evidence rather than assumption.

#### Phase S5: Semantic HTML Cleanup

Purpose: once the simplified non-grid structure is stable, replace generic wrappers with semantic HTML where it fits naturally.

Tasks:

1. Audit the stabilized structure for obvious semantic upgrades:
   - `section`
   - `header`
   - `nav`
   - `aside`
   - lists and list items
2. Apply semantic tags only where they preserve parity and do not complicate the simplified structure.
3. Keep this phase lower priority than the structural/performance work.

Exit criteria:

- Obvious semantic upgrades are applied where they are genuinely helpful.
- No user-facing behavior or layout regressions are introduced.

## Current Blockers At Planning Time

- Baseline capture is still pending.
- CDP availability must be re-verified separately for untouched `main` and this worktree before Phase 0 execution.
- If either CDP session is unavailable, stop and ask the user to start `./ai.sh` in the needed directory.
