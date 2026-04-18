# Go-Rewrite Pixi Canvas-First Log

Date started: 2026-04-17
Draft worktree placeholder: `go-rewrite-pixijs`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`

## Usage

Append-only execution log for the `go-rewrite` Pixi-first restart.

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
- baseline benchmark results
- Ralph/supervisor bootstrap work
- visible UX/parity findings
- editing-overlay decisions
- dense-scene perf evidence

## 2026-04-17 001

- Item: Create the draft plan/log/checklist/handoff set for a `go-rewrite`-based Pixi-first restart.
- Status: `done`
- Details:
  - Reviewed the existing Pixi rewrite plan, the pan/zoom pivot plan, the current rewrite log structure, the Ralph mode doc, the frontend-performance retrospective, the dense `All Settings` benchmark report, and the tldraw comparison discussion.
  - Locked the new architectural direction:
    - Pixi-first resting graph surface
    - DOM only for active heavyweight editing surfaces and popups
    - no second-click editing model
    - no default assumption that visible inactive content stays fully live in DOM
  - Chose a neutral placeholder doc path until the real `go-rewrite` worktree exists:
    - `docs/worktrees/go-rewrite-pixijs/`
- Next action:
  - once the new `go-rewrite` worktree exists, port these docs there, refresh the worktree name/path references, and complete the Ralph-loop bootstrap checklist before taking the first code slice

## 2026-04-17 002

- Item: Port the restart docs and Ralph/supervisor support into `/home/ubuntu/dev/setta.go-rewrite-pixijs`.
- Status: `done`
- Details:
  - Created `docs/worktrees/go-rewrite-pixijs/{plan,log,checklist,handoff}.md` in the new worktree.
  - Ported the missing Ralph/supervisor files and refreshed the loop scripts needed for the supervisor flow.
  - Locked `/home/ubuntu/dev/setta` as the read-only reference worktree path for side-by-side comparisons in this restart.
- Next action:
  - confirm the running loop reads the new worktree doc set instead of the inherited `pixijs-graph` plan files

## 2026-04-17 003

- Item: Add explicit preservation guardrails so the new loop does not undo the `go-rewrite` refactor while porting ideas from older branches.
- Status: `done`
- Details:
  - Added an explicit `go-rewrite` preservation rule to the plan, checklist, and handoff.
  - Locked the architectural rule that older Pixi/frontend-performance branches are research inputs only, not structures to copy wholesale.
  - Defined rollback of broad `go-rewrite` refactors as a replan decision rather than something the loop may do silently.
- Next action:
  - fix `RALPH.md` to point at the new worktree plan/handoff/log and then let the loop proceed to baseline restoration

## 2026-04-17 004

- Item: Retarget `RALPH.md` to the new worktree docs and make the restart requirement explicit.
- Status: `done`
- Details:
  - Updated `RALPH.md` so the loop config now points at `docs/worktrees/go-rewrite-pixijs/{plan,handoff,log}.md`.
  - Added reference-worktree notes pointing the read-only compare path at `/home/ubuntu/dev/setta`.
  - Confirmed from the loop scripts that `RALPH.md` is parsed at startup, so a Ralph process that was already running before this edit should be restarted once.
- Next action:
  - restart Ralph once if it was already running, then move directly to baseline restoration on `All Settings`

## 2026-04-17 005

- Item: Fix the remaining Ralph bootstrap blockers in `go-rewrite-pixijs`.
- Status: `done`
- Details:
  - Restored the missing `scripts/ralph-default-prompt.md` file in the new worktree so the loop can render prompts.
  - Added `main_worktree_root: /home/ubuntu/dev/setta` to `RALPH.md`.
  - Patched `scripts/run-codex-loop.sh` and `scripts/run-codex-supervisor.sh` to honor an explicit `main_worktree_root` from config before falling back to branch-name discovery.
  - Bounded startup verification now reaches loop bootstrap with:
    - the correct plan/handoff/log paths
    - `Main worktree root: /home/ubuntu/dev/setta`
    - main-lifecycle bootstrap starting instead of failing on missing prompt/discovery errors
- Next action:
  - rerun Ralph from the updated config and continue to baseline restoration on `All Settings`

## 2026-04-17 006

- Item: Fix the remaining `ai.sh` helper imports required for lifecycle bootstrap.
- Status: `done`
- Details:
  - Restored `scripts/lib/node_tooling.sh` so `scripts/ai.sh` can initialize Node/pnpm tooling.
  - Restored `scripts/lib/clear_devtools_profile_auth_cookies.py` to match the source worktree helper set.
  - Bounded startup verification no longer fails on missing prompt or missing helper imports; the loop now reaches lifecycle bootstrap with the correct config and reference worktree path.
  - Remaining startup noise now points at environment bootstrap state (`.venv` missing) rather than missing loop files.
- Next action:
  - rerun Ralph and let lifecycle bootstrap proceed far enough to settle the dev environment, then continue to the baseline restoration phase

## 2026-04-18 007

- Item: Harden the baseline probe plumbing for `settings` -> `All Settings`.
- Status: `done`
- Details:
  - Updated `scripts/run-playwright-e2e.sh` so the helper no longer assumes `pnpm` is already on `PATH`:
    - it now bootstraps Node tooling before starting Vite / Playwright
    - it now accepts the current Go CLI bootstrap-token log shapes (`bootstrap#token=` and `and paste:`), not only the old `Token:` line
  - Added `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts` as the first focused `go-rewrite` baseline probe for the `All Settings` view.
  - Static verification passed for the code slice:
    - `bash -n scripts/run-playwright-e2e.sh`
    - `pnpm -C frontend exec eslint tests/e2e/settings/settings-all-settings-baseline.spec.ts`
  - Runtime verification is still blocked one layer later:
    - the disposable helper now reaches browser startup and test execution instead of failing on missing `pnpm` / stale token parsing
    - but both the disposable helper and direct browser automation still fail before a usable Settings surface because browser-side `POST http://127.0.0.1:8069/api/loadProjectConfig` requests fail with `net::ERR_ALPN_NEGOTIATION_FAILED`
    - fresh worktree bootstrap URLs are one-shot; stale tokens quickly degrade into misleading `401` bootstrap failures, so each retry must refresh the URL first
  - No baseline perf report was written yet because the Settings graph surface never reached a trustworthy loaded state under automation in this iteration.
- Next action:
  - fix or narrow the `loadProjectConfig` browser transport failure on the live worktree Settings route, then rerun the new baseline probe and record the first `go-rewrite` baseline report

## 2026-04-18 008

- Item: Fix the OpenAPI request rewrite that was breaking browser-side `loadProjectConfig` on the live worktree runtime.
- Status: `done`
- Details:
  - Reproduced the live failure on the current runtime values (`frontend http://127.0.0.1:3068/`, `backend http://127.0.0.1:8068`) and narrowed it to `frontend/src/openapi/http/client.ts`:
    - plain browser `fetch("http://127.0.0.1:8068/api/loadProjectConfig", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: ... })` succeeded
    - the OpenAPI wrapper path that rewrote a `Request` into `new Request(resolvedURL, request)` failed in Chromium for the same JSON-body POST with `net::ERR_ALPN_NEGOTIATION_FAILED`
  - Updated `frontend/src/openapi/http/client.ts` so rewritten OpenAPI requests now preserve method/body/headers by explicitly rebuilding the request instead of cloning a `Request` object into another `Request` with a new URL.
  - Added `frontend/src/openapi/http/client.test.ts` as a regression test proving that the rewritten POST URL still carries the serialized JSON body and share-session headers.
  - Verification for this slice:
    - `pnpm -C frontend exec vitest run src/openapi/http/client.test.ts`
    - `pnpm -C frontend exec eslint src/openapi/http/client.ts src/openapi/http/client.test.ts`
    - headless Playwright runtime check importing `/src/openapi/http` in-browser after bootstrap:
      - `loadProjectConfig({ body: { projectConfigName: "round_lime" } })` returned `200`
      - no `requestfailed` events were emitted for `loadProjectConfig`
  - Rerunning `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts` no longer hits the old ALPN transport failure, but the lane is still blocked one layer later by an unrelated app crash:
    - `ReferenceError: DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX is not defined`
    - source: `src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - CDP visual check confirmed the new state:
    - bootstrap/auth handoff succeeds
    - final URL is `http://127.0.0.1:3068/round_lime`
    - the live page lands in the React error boundary instead of a usable project surface because of the `ProjectChatBottomDock` runtime error
- Next action:
  - fix the `ProjectChatBottomDock` runtime error so the `settings` baseline probe can finish and produce the first durable Phase 1 report
LOOP_TERMINAL_MARKER: none

## 2026-04-18 045

- Item: Collapse the extra `sectionSizingPolicy` key-column wrapper so the owned param label itself occupies the slot on the retained canvas lane.
- Status: `done`
- Details:
  - Kept this slice on the canonical dense target `settings-section__sectionSizingPolicy` instead of reopening a closed callable/dict/globalVariables lane.
  - `frontend/src/components/Params/ParamContainer.tsx` now forwards the key-column class/style directly onto the non-kwarg label component only on the active `canvas-shell-underlay` `sectionSizingPolicy` lane, removing the extra `.section-key` wrapper there.
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now marks that dense lane as the lightweight param-label owner, and `frontend/src/components/Params/ParamItems/ParamTextLabel.tsx` now exposes `data-canvas-owned-param-label-lightweight="true"` so the retained-text path and probes can attribute the new root cleanly.
  - Added focused coverage at:
    - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - updated `frontend/src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx`
    - new `frontend/src/components/Params/ParamContainer.lightweightLeadingContent.test.tsx`
    - updated `frontend/tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts`
  - The checked whole-section probe now proves the intended structural cut on the live worktree runtime:
    - `legacyLeadingContentWrapperCount: 0`
    - `lightweightParamLabelCount: 168`
    - `leadingContentCount: 168`
  - Recorded the follow-up dense rerun at `perf/reports/frontend/2026-04-18_settings-all-settings-section-sizing-policy-lightweight-param-label-rerun.md`.
  - Dense rerun outcome versus the prior lightweight-resize-handle report:
    - `documentNodeCount` dropped from `8815` to `8647`
    - `documentNodeCount` is now down `906` from the durable `go-rewrite` baseline (`9553` -> `8647`)
    - `raf.meanMs` moved from `110.98ms` to `112.38ms`
    - `raf.p95Ms` improved from `233.3ms` to `216.7ms`
    - `longTasks.totalMs` moved from `17907ms` to `18184ms`
  - Interpretation: this slice moved dense inactive row DOM again without claiming a fresh motion win; it stays in the structural-row cost lane rather than a pure ownership hop.
- Focused verification passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx src/components/Params/ParamContainer.lightweightLeadingContent.test.tsx`
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamItems/ParamTextLabel.tsx src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx src/components/Params/ParamContainer.tsx src/components/Params/ParamContainer.test.tsx src/components/Params/ParamContainer.lightweightLeadingContent.test.tsx tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-028/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts --reporter=line --workers=1`
    - result: `2 passed (40.9s)` on the live worktree runtime
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-028/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
    - result: `1 passed (44.4s)` on the live worktree runtime with `documentNodeCount: 8647`, `inputCount: 60`, and `buttonCount: 477`
- CDP visual check is done:
  - `http://127.0.0.1:3068/settings` loaded with `All Settings` active
  - no visible crash/error overlay was present
  - exactly one `.react-flow__section-shell-backdrop canvas` was mounted
  - `settings-section__sectionSizingPolicy` was visible on the live surface
  - the `Size Mode Height` row still looked intact at rest with no blank label slot or detached row chrome after the wrapper removal
  - activating the row kept the inline editor in-place with no visible detached jump
  - caveat: the focused editor surfaced as a `cm-content` textbox showing `32` in this headless CDP pass, so the exact affordance was slightly ambiguous even though the row geometry remained stable
- Next action:
  - stay on `settings-section__sectionSizingPolicy` and target the next repeated structural row/container DOM still mounted above the lightweight text/dropdown/resize/label activators before moving to a new dense section lane
LOOP_TERMINAL_MARKER: none

## 2026-04-18 045

- Item: Collapse the repeated `settings-section__sectionSizingPolicy` row resize handles to a lightweight single-node path on the retained-canvas lane.
- Status: `done`
- Details:
  - Kept this slice on the same canonical dense target instead of reopening another closed callable/dict/globalVariables ownership lane.
  - `frontend/src/components/Params/ResizeHandle.tsx` now supports a single-node lightweight handle, and `frontend/src/components/Params/ParamContainer.tsx` only enables it for `settings-section__sectionSizingPolicy` on the `canvas-shell-underlay` path through `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts`.
  - The checked section probe now proves the intended structural cut on the live worktree runtime:
    - `lightweightResizeHandleCount: 168`
    - `lightweightResizeHandleChildCount: 0`
    - `legacyResizeHandleCount: 0`
  - Dense rerun report: `perf/reports/frontend/2026-04-18_settings-all-settings-section-sizing-policy-lightweight-resize-handle-rerun.md`
  - Dense rerun outcome versus the prior `sectionSizingPolicy` dropdown report:
    - `documentNodeCount: 9151 -> 8815`
    - `inputCount: 60 -> 60`
    - `buttonCount: 477 -> 477`
    - `raf.meanMs: 109.59 -> 110.98`
    - `longTasks.totalMs: 17680 -> 17907`
  - Interpretation: this is a meaningful dense DOM reduction on the active sectionSizingPolicy lane, but not a fresh motion win; the next frontier is the next repeated structural row/container subtree still mounted above the lightweight activators.
- Focused verification passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Params/ResizeHandle.test.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - note: adding `src/components/Params/ParamContainer.test.tsx` still hits the pre-existing `html-encoding-sniffer` / `@exodus/bytes` jsdom issue already documented in the handoff
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/ResizeHandle.tsx src/components/Params/ResizeHandle.test.tsx src/components/Params/ParamContainer.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-027/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts --reporter=line --workers=1`
    - result: `2 passed (40.4s)` on the live worktree runtime
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-027/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
    - result: `1 passed (43.4s)` on the live worktree runtime with `documentNodeCount: 8815`, `inputCount: 60`, and `buttonCount: 477`
- CDP visual check: done
  - `http://127.0.0.1:3068/settings` loaded with `All Settings` active
  - no crash/error overlay was visible
  - `.react-flow__section-shell-backdrop canvas` was mounted
  - `settings-section__sectionSizingPolicy` was visible
  - the `Size Mode Height` row still looked intact at rest
  - activating the row focused the inline `Search` combobox/input with value `any` in the same row geometry, with no blank or detached jump observed
  - caveat: the row is visually thin in the fitted headless viewport, so the continuity call is easiest to confirm from the DOM/rect state plus the visual pass together
- Next action:
  - stay on `settings-section__sectionSizingPolicy` and target the next repeated structural row/container DOM still mounted above the lightweight text/dropdown/resize activators before moving to a new dense section
LOOP_TERMINAL_MARKER: none

## 2026-04-18 043

- Item: Move the repeated `sectionSizingPolicy` size-mode meta-control dropdown family to a lightweight canvas-owned resting path and record the dense rerun.
- Status: `done`
- Details:
  - Kept this slice on the same canonical dense target section `settings-section__sectionSizingPolicy` and landed the first repeated non-text inactive-control family there instead of reopening another callable/dict/globalVariables lane.
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now scopes `isCanvasOwnedSectionMetaControlDropdown(...)` to the repeated `metaControlByType__...__sizeModeHeight|sizeModeWidth` rows on that section.
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx` is now the actual ownership boundary for those rows on the active canvas path and passes `canvasOwnedRestingDropdown` into the dropdown renderer.
  - `frontend/src/components/Utils/Combobox/ComboboxParts.tsx` and `IdNameCombobox.tsx` now keep a lightweight resting shell for those dropdowns:
    - zero live `search input` / toggle `button` controls stay mounted at rest
    - first pointer activation swaps to the real inline combobox and opens the menu
    - the resting value/chevron still provide retained-text measurement surfaces
  - `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now measures and paints retained dropdown pill boxes for the hidden resting combobox chrome.
  - Added focused verification coverage at:
    - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - updated `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
    - updated `frontend/src/components/Utils/Combobox/ComboboxParts.test.tsx`
    - new `frontend/tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts`
  - Oracle note:
    - the initial far-fit canvas pixel probe on these deep meta-control rows was untrustworthy because the fitted `All Settings` state leaves them mounted but too tiny/far below the section shell for a reliable direct pixel claim
    - the checked Playwright oracle now proves the real product contract for this lane instead:
      - every repeated size-mode row uses the lightweight resting dropdown path
      - those rows keep zero live `search input` / `search button` controls mounted at rest
      - a row-centered normal-zoom reframe makes the target activator usable
      - first interaction swaps in the live inline combobox/search input
  - Recorded the dense follow-up at `perf/reports/frontend/2026-04-18_settings-all-settings-section-sizing-policy-meta-control-dropdown-rerun.md`.
  - Dense rerun outcome versus the prior section-sizing-policy resting-text report:
    - `documentNodeCount` dropped from `9181` to `9151`
    - `inputCount` dropped from `90` to `60`
    - `buttonCount` dropped from `507` to `477`
    - `raf.meanMs` improved from `114.24ms` to `109.59ms`
    - `longTasks.totalMs` improved from `18839ms` to `17680ms`
- Focused verification passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Utils/Combobox/ComboboxParts.test.tsx src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/ParamUIs/ConfiguredParamInputs.tsx src/components/Params/ParamUIs/DropdownInput.tsx src/components/Params/ParamUIs/ParamUI.tsx src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/components/Section/Layouts/MetaControl/MetaControlNode.tsx src/components/Utils/Combobox/ComboboxParts.tsx src/components/Utils/Combobox/ComboboxParts.test.tsx src/components/Utils/Combobox/IdNameCombobox.tsx src/components/Utils/Combobox/useIdNameCombobox.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-025/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts --reporter=line --workers=1`
    - result: `1 passed (23.3s)` on the live worktree runtime
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-025/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
    - result: `1 passed (42.9s)` on the live worktree runtime with `documentNodeCount: 9151`, `inputCount: 60`, and `buttonCount: 477`
- CDP visual check is done:
  - direct `http://127.0.0.1:3068/settings` was already authenticated in the live DevTools session
  - `All Settings` was active
  - `.react-flow__section-shell-backdrop canvas` was mounted
  - the target `Size Mode Height` row looked intact at rest as compact `any ▾` inline content
  - activating that row surfaced the live inline `Search` combobox populated with `any`, with the menu opening directly beneath the row
  - no blank placeholder area or detached visual jump was visible during activation
- Next action:
  - stay on canonical dense target `settings-section__sectionSizingPolicy` and attack the next repeated inactive non-text control family after the landed size-mode meta-control dropdowns
LOOP_TERMINAL_MARKER: none

## 2026-04-18 030

- Item: Move the dict filter row's static `gg-sort-az` icon to retained canvas ownership on `settings-section__dictSectionDefault`.
- Status: `done`
- Details:
  - Added `isCanvasOwnedSectionParamFilterIcon(...)` in `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` and scoped it to the dict canary only, so this stayed on the active dict-specific filter/search lane instead of reopening shared-family ownership work.
  - Updated `frontend/src/components/Section/SectionParts/KwargsControls.tsx` so the dict filter row now tags its static icon with `data-canvas-owned-filter-icon="true"` and hides only the resting DOM icon with `opacity-0` on the `canvas-shell-underlay` path while leaving the live filter input text/editor behavior unchanged.
  - Updated `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` so the retained scene measures those tagged dict filter icons using the fixed `gg-sort-az` three-bar geometry and paints them into the existing detail-box pass; this slice reused the current retained-scene primitive set instead of adding another renderer branch.
  - Tightened `frontend/tests/e2e/settings/settings-all-settings-dict-canvas-shell-ownership.spec.ts` so the trusted dict probe now asserts the hidden DOM icon marker, samples retained-canvas pixels across the icon's full three-bar bounds, and keeps the existing shell/text/switch/underline/nested-guide checks intact.
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts` to cover the new dict-only filter-icon ownership rule.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/SectionParts/KwargsControls.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-dict-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-dict-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: the trusted dict probe passed on the live worktree runtime with the new retained filter-icon assertions
  - CDP visual check is done:
    - `/settings` loaded with `All Settings` active and no visible crash/error overlay
    - `.react-flow__section-shell-backdrop canvas` was mounted
    - `section[data-section-id="settings-section__dictSectionDefault"]` was present and visible
    - the dict filter/search row looked intact after the static filter icon moved to retained canvas ownership
- Next action:
  - keep `settings-section__dictSectionDefault` as the active named lane, but re-inventory the remaining default-visible non-editor filter/search chrome before doing another ownership slice; if only the live input/editor core remains, close this micro-lane instead of manufacturing another hop
LOOP_TERMINAL_MARKER: none

## 2026-04-18 024

- Item: Close the canary resting-text lane at the ownership boundary by replacing the per-row allowlist with a canary-section text-like rule, using `Style Color` as the new deterministic proof row.
- Status: `done`
- Details:
  - The last few iterations had started to repeat the same explicit-param-id refactor shape (`Config Language` -> `Column Width` -> edge rows), so this slice intentionally stopped that pattern instead of adding another row id.
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` so canvas-owned resting text is now a canary-section rule for text-like params (`CodeParam`, `TextParam`, `TextAreaParam`) rather than a manually expanded param-id set.
  - Updated `frontend/src/components/Params/ParamUIs/ParamUI.tsx` so the canary section now opts any text-like param into the canvas resting-text path through that rule, while non-canary sections and non-text params remain unchanged.
  - Updated `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx` and `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx` so canvas-owned dummy roots carry `data-canvas-owned-resting-text="true"`.
  - Updated `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` so retained-scene text measurement now queries those explicit dummy-root markers inside `settings-section__callableSectionDefault` instead of rebuilding a manual `ParamInput` id list.
  - Result: newly covered canary rows such as `Style Color`, `Tag Color`, and the visible `Size` subfields now flow through the same retained-text path automatically without another ownership-list edit.
  - Updated focused coverage:
    - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
    - `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
  - The e2e oracle now uses `Style Color` as the newly covered deterministic proof row and asserts its dummy root marker, hidden DOM opacity, and retained-canvas text pixels distinct from the body fill.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.tsx src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/components/Utils/CodeMirror/TextInputCodeMirror.tsx src/components/Utils/CodeMirror/DummyCodeMirror.tsx tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - note: the first Playwright attempt in this iteration hit the expected spent-token failure (`401` during global setup on a one-shot bootstrap URL); rerunning with a freshly minted token passed unchanged
  - CDP visual check is done:
    - `/settings` loaded with `All Settings` active and no crash/error overlay visible
    - `settings-section__callableSectionDefault` was visible
    - a retained `canvas` remained mounted inside `.react-flow__section-shell-backdrop`
    - the newly covered `Style Color` row was present and looked intact on the live surface
    - caveat: the fitted headless viewport still leaves `Style Color` small, so this is a technical visual pass backed by the deterministic Playwright probe rather than a strong human-only readability call
- Next action:
  - treat the canary resting-text lane as complete at this ownership boundary and move to the next visible inactive DOM family on `settings-section__callableSectionDefault`, preferably param-label text or another row-chrome family instead of reopening per-row text allowlists
LOOP_TERMINAL_MARKER: none

## 2026-04-18 009

- Item: Clear the `ProjectChatBottomDock` missing-constant runtime crash that was blocking the live Settings baseline.
- Status: `done`
- Details:
  - Added the missing `DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX = 4` local constant back to `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`, matching the dock layout helper and removing the `ReferenceError` thrown on the live route.
  - Focused runtime verification now gets past the previous dock crash:
    - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_PROJECT_URL=http://127.0.0.1:3068/round_lime SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --workers=1`
    - result: the app now reaches `http://127.0.0.1:3068/round_lime` and fails later with `Element type is invalid ... Check the render method of _MiniMapNodes.`
    - result: the prior `DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX is not defined` crash no longer appears in the Playwright failure output
  - CDP visual check is done for this slice and matches the new failure:
    - bootstrap redirected to `http://127.0.0.1:3068/round_lime`
    - the page lands in the React error boundary with `Unexpected Application Error!`
    - the visible blocker is the `_MiniMapNodes` invalid-element-type error, not the old dock-constant reference error
- Next action:
  - fix the `_MiniMapNodes` invalid-element-type runtime crash in the minimap path so the Phase 1 `settings` baseline probe can finish and write the first durable report
LOOP_TERMINAL_MARKER: none

## 2026-04-18 010

- Item: Clear the `_MiniMapNodes` invalid-element-type minimap crash so the live project route can settle again.
- Status: `done`
- Details:
  - Updated `frontend/src/forks/xyflow/minimap/MiniMapNodes.tsx` so optional minimap props with explicit `undefined` values no longer overwrite the default minimap node renderer and other minimap defaults.
  - Added a focused regression test in `frontend/src/forks/xyflow/minimap/MiniMap.test.ts` that renders `MinimapSvg` without a custom `nodeComponent` and expects the default minimap node markup.
  - Focused static verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/minimap/MiniMap.test.ts src/forks/xyflow/minimap/MiniMapNodes.tsx`
  - Focused Vitest execution for the new minimap regression test is still blocked by an existing jsdom dependency/runtime issue before test collection:
    - `Error: require() of ES Module ... @exodus/bytes/encoding-lite.js ... from html-encoding-sniffer`
  - Headless live verification with a fresh bootstrap URL now lands on the normal project surface at `http://127.0.0.1:3068/round_lime`; the prior React error boundary with `_MiniMapNodes` / invalid-element-type text no longer appears.
  - The next blocker is one layer later on the Settings route:
    - final URL: `http://127.0.0.1:3068/settings`
    - visible error boundary text: `Unexpected Application Error!`
    - runtime error: `TypeError: Cannot read properties of undefined (reading 'trim')`
    - stack points at `src/components/Utils/Combobox/ComboboxParts.tsx`
  - CDP visual check is done and matches the live probe:
    - project route is healthy again
    - `/settings` now fails later in `ComboboxParts.tsx`, not in minimap rendering
- Next action:
  - fix the `/settings` `ComboboxParts.tsx` `trim()` runtime crash so the Phase 1 baseline probe can mount the Settings surface and capture the first durable report
LOOP_TERMINAL_MARKER: none

## 2026-04-18 011

- Item: Clear the `/settings` combobox `trim()` crash so the baseline probe can reach `All Settings`.
- Status: `done`
- Details:
  - Updated `frontend/src/components/Utils/Combobox/ComboboxParts.tsx` so fallback background resolution accepts an omitted `bg` prop and uses the variant default classes instead of calling `.trim()` on `undefined`.
  - Added a focused regression test in `frontend/src/components/Utils/Combobox/ComboboxParts.test.tsx` covering `bg={undefined}` for both `pane` and `pill` variants.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Utils/Combobox/ComboboxParts.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line`
  - The live baseline probe now reaches `settings` -> `All Settings` and emits metrics instead of failing in the React error boundary:
    - `flowNodeCount: 46`
    - `documentNodeCount: 9553`
    - `inputCount: 92`
    - `buttonCount: 521`
    - `raf.meanMs: 207.16`
    - `longTasks.totalMs: 36691`
  - CDP visual check is done for this slice and confirms `/settings` loads without the previous `Unexpected Application Error` / `trim` failure; `All Settings` is visible, with the left settings sidebar still occupying a large portion of the viewport.
- Next action:
  - write the first durable `go-rewrite` baseline report under `perf/reports/frontend/` using the now-passing `All Settings` probe output
LOOP_TERMINAL_MARKER: none

## 2026-04-18 012

- Item: Record the first durable `go-rewrite` `settings` -> `All Settings` baseline report.
- Status: `done`
- Details:
  - Added `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md` as the first durable Phase 1 baseline report for this restart.
  - Reran the focused baseline probe on the live worktree runtime with a fresh bootstrap token:
    - `source activate.sh && . scripts/lib/node_tooling.sh && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> PLAYWRIGHT_HEADLESS=1 setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line`
    - result: passed in headless Chromium and emitted the durable baseline payload used in the report
  - Captured metrics from the fresh 2026-04-18 run:
    - `flowNodeCount: 46`
    - `visibleFlowNodeCount: 46`
    - `documentNodeCount: 9553`
    - `inputCount: 92`
    - `textareaCount: 1`
    - `buttonCount: 521`
    - `raf.meanMs: 204.93`
    - `raf.p95Ms: 216.7`
    - `raf.maxMs: 316.7`
    - `longTasks.count: 181`
    - `longTasks.totalMs: 36337`
    - `longTasks.maxMs: 301`
  - The report explicitly records the harness caveat that this probe uses a scripted `.react-flow__viewport` transform loop and is therefore a durable pre-change branch baseline, not a direct apples-to-apples replacement for the older staged March trace benchmark.
  - CDP visual check is done for this slice:
    - `/settings` loads normally
    - `All Settings` is visible and active
    - no React error boundary or crash overlay is visible
    - non-target chrome still visible during the check included the left settings list, right tool rail, bottom tab bar, and a `Chat Window 1` overlay/suggestion panel, but none blocked the graph surface
- Next action:
  - start the first real product slice by identifying the narrowest `settings` canary seam where Pixi can take camera or resting-surface ownership without another pure forwarding seam lift
LOOP_TERMINAL_MARKER: none

## 2026-04-18 013

- Item: Land the first real graph-surface product seam on the `settings` canary path.
- Status: `done`
- Details:
  - Added `frontend/src/forks/xyflow/core/container/GraphSurface.tsx` so `ReactFlow.tsx` now delegates graph-surface composition through one implementation boundary instead of inlining the edge/node renderers directly.
  - Added `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` plus `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.ts` to derive top-level node bounds from `useNodeInternals` and paint one retained canvas shell underlay behind the existing DOM section nodes.
  - Added `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx` covering the scene bounds math and retained-canvas sizing path.
  - Narrow source cleanup in `frontend/src/forks/xyflow/core/container/ReactFlow.tsx` also removed the existing `d3Zoom!` / `d3Selection!` non-null assertions surfaced by the focused lint pass.
  - Focused lint verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/ReactFlow.tsx src/forks/xyflow/core/container/GraphSurface.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx src/forks/xyflow/core/container/sectionShellBackdrop.ts`
  - Focused Vitest execution for the new retained-canvas test is still blocked by the same existing jsdom dependency/runtime issue before test collection:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
    - `Error: require() of ES Module ... @exodus/bytes/encoding-lite.js ... from html-encoding-sniffer`
  - Live runtime verification passed on the worktree canary with a fresh bootstrap token:
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line`
    - result: passed with `canvasCount: 1`, `flowNodeCount: 46`, `documentNodeCount: 9555`, `raf.meanMs: 34.91`, `longTasks.totalMs: 119`
  - Treat that runtime probe as a smoke check that the new retained scene layer is mounted on the live canary, not as a new durable benchmark claim yet.
  - Canonical target section for the next lane is now `settings-section__callableSectionDefault`.
  - CDP visual check is done:
    - `/settings` loads normally
    - `All Settings` is visible and active
    - the graph surface is mounted and usable
    - a `canvas` is visible inside `.react-flow__section-shell-backdrop`
    - no crash overlay or obviously detached/blank section bodies are visible
- Next action:
  - move actual top-level shell chrome authority for `settings-section__callableSectionDefault` into the retained scene layer instead of stopping at the parallel underlay
LOOP_TERMINAL_MARKER: none

## 2026-04-18 014

- Item: Move resting shell chrome authority for `settings-section__callableSectionDefault` into the retained canvas layer.
- Status: `done`
- Details:
  - Added `frontend/src/forks/xyflow/core/container/graphSurfaceImplementation.tsx` so section chrome can read the active graph-surface implementation from the real composition boundary instead of via another forwarding seam.
  - Added `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` plus `sectionShellCanvasOwnership.test.ts` to declare the canonical canvas-owned shell id, resolve default/style-color-aware canvas fill and stroke, and lock that logic with a focused node-environment Vitest file.
  - Updated `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` and `sectionShellBackdrop.ts` so the retained backdrop scene accepts per-frame chrome overrides; the named callable canary now paints its resting shell fill/border from canvas-owned values instead of the generic parallel underlay palette.
  - Updated `frontend/src/components/Section/Container/SectionContainerCore.tsx` and `frontend/src/components/Utils/Resizable/CustomResizable.tsx` so only the canary section opts out of resting DOM shell chrome on the `canvas-shell-underlay` path while the legacy DOM implementation remains unchanged.
  - The first Playwright run exposed a real regression on non-settings project routes: `SectionShellBackdropCanvas.tsx` called `getCurrEffectiveSectionImpl(...)` unconditionally for the canary id and crashed on `/round_lime`.
  - Fixed that crash in the same slice by switching the canary lookup to `getCurrEffectiveSectionImplIfPresent(...)`, so project routes without the settings canary no longer trip the retained-canvas selector.
  - Added a focused live check at `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts` that loads `/settings`, activates `All Settings`, and verifies the canary section shell is canvas-owned while the retained shell canvas is mounted.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/graphSurfaceImplementation.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/GraphSurface.tsx src/forks/xyflow/core/container/sectionShellBackdrop.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/components/Section/Container/SectionContainerCore.tsx src/components/Utils/Resizable/CustomResizable.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line`
  - CDP visual check is done:
    - `/settings` loaded normally
    - `All Settings` was active
    - `settings-section__callableSectionDefault` was visible with no crash/error boundary
    - one retained shell `canvas` was mounted
    - the section shell still looked intact after the DOM shell was made transparent on the canvas path
    - residual risk: this headless pass confirmed shell integrity and mounted-canvas presence, but the transformed canvas content was not centered for a full pixel-level inspection
- Next action:
  - move the next visible static shell primitive for `settings-section__callableSectionDefault` into the retained scene layer, likely the header/body chrome split or another obvious non-editing shell detail, instead of reopening harness or broad DOM work
LOOP_TERMINAL_MARKER: none

## 2026-04-18 015

- Item: Add a retained-canvas header band/divider for `settings-section__callableSectionDefault`.
- Status: `done`
- Details:
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` so the canary shell chrome now resolves `headerFill` and `headerDivider` alongside the existing retained shell fill/stroke, reusing section-style theme colors when present.
  - Updated `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` so the retained scene reads the measured header height from `useTemporaryMiscState` via `getSectionHeaderHeightKey(...)` and passes that height into the canary frame visual.
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.ts` so retained frames can carry header-band metadata and the painter now clips a header band plus divider into the canary shell before the outer border stroke.
  - Added focused node coverage in `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.test.ts` and updated `sectionShellCanvasOwnership.test.ts` to lock the new header-band/header-divider chrome contract.
  - Extended the live canary probe in `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts` so it samples the retained canvas in graph space using the `.react-flow__node` transform instead of transformed screen pixels; this keeps the probe trustworthy even when `All Settings` fits the target section down to only a few on-screen pixels.
  - The first runtime probe for this slice failed because the original screen-space pixel sampling treated the fitted `All Settings` header as roughly `2.2px` tall on screen and could not distinguish the new band from the body fill; the final graph-space version fixed that oracle problem without changing product code.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellBackdrop.ts src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
  - CDP visual check is done:
    - `/settings` loaded normally in the headless worktree session
    - `All Settings` was active
    - the retained shell `canvas` was mounted and `settings-section__callableSectionDefault` remained visible with no crash/error-boundary state
    - the section shell still looked intact on the live surface
    - caveat: the new header-band/header-divider treatment was too tiny in the fitted `All Settings` view for a confident human-only call, so the updated Playwright graph-space pixel probe is the deterministic oracle for that exact detail
- Next action:
  - move one more visible non-editing callable shell detail for `settings-section__callableSectionDefault` into the retained scene layer, likely the next top-level separation beneath the new header band without starting param-row migration
LOOP_TERMINAL_MARKER: none

## 2026-04-18 016

- Item: Add a retained-canvas callable toolbar band for `settings-section__callableSectionDefault`.
- Status: `done`
- Details:
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` so the canary shell chrome now resolves `callableToolbarFill` and `callableToolbarDivider` alongside the existing shell/header colors, reusing section-style theme colors when a style color is present.
  - Updated `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` so the retained scene reads both `getSectionSearchHeightKey(...)` and `getKwargsControlsHeightKey(...)` for the canary section and emits one retained detail band for the callable toolbar beneath the header band.
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.ts` so retained frames now carry normalized `detailBands` metadata and the painter renders rounded retained panel fills plus bottom dividers before the outer shell stroke.
  - Updated `frontend/src/components/Section/SectionParts/KwargsControls.tsx` so only the canary callable toolbar container becomes transparent on the `canvas-shell-underlay` path while the live controls and filter DOM stay mounted and interactive.
  - Added focused node coverage in `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.test.ts` and updated `sectionShellCanvasOwnership.test.ts` to lock the new toolbar-band chrome contract.
  - Extended the live canary probe in `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts` so it now derives graph-space rects from DOM bounds divided by the parent `.react-flow__viewport` transform scale instead of treating the `.react-flow__node` transform as the zoom source.
  - The first runtime probe for this slice failed because the prior helper assumed the node transform carried zoom scale; in the current runtime it stays at scale `1`, so the fitted header/toolbar samples collapsed back to the body pixel. The final viewport-scale version fixed that oracle issue without changing product code.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellBackdrop.ts src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Section/SectionParts/KwargsControls.tsx tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
  - CDP visual check is done:
    - `/settings` loaded cleanly with no crash/error boundary visible
    - the retained shell `canvas` was mounted and the workspace surface remained intact
    - `settings-section__callableSectionDefault` still showed the header, filter input, and the callable toolbar row after the DOM toolbar container was made transparent on the canvas path
    - caveat: the fitted headless view still makes the toolbar row too small for a confident human-only pixel read, so the updated Playwright viewport-scale probe is the deterministic proof for this exact detail
- Next action:
  - move the pinned-params panel chrome for `settings-section__callableSectionDefault` into the retained scene layer while keeping param rows live
LOOP_TERMINAL_MARKER: none

## 2026-04-18 017

- Item: Simplify the worktree tracking system so the append-only log is the canonical progress ledger.
- Status: `done`
- Details:
  - Repurposed `docs/worktrees/go-rewrite-pixijs/checklist.md` into a short guardrails-and-acceptance-gates page instead of a checkbox progress tracker.
  - Documented the intended tracking split:
    - `docs/worktrees/go-rewrite-pixijs/log.md` is the canonical append-only execution history
    - `docs/worktrees/go-rewrite-pixijs/handoff.md` is the current-state summary
    - `docs/worktrees/go-rewrite-pixijs/checklist.md` now holds only stable guardrails and success gates
  - Updated the handoff and plan wording to match that tracking model while keeping the existing file path stable for the worktree doc set.
  - No runtime or product verification was needed because this slice only changes tracking documentation.
- Next action:
  - keep future execution state in the append-only log and reserve checklist edits for actual guardrail or acceptance-gate changes
LOOP_TERMINAL_MARKER: none

## 2026-04-18 018

- Item: Add a retained-canvas pinned-params panel for `settings-section__callableSectionDefault`.
- Status: `done`
- Details:
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` so the canary shell chrome now resolves `pinnedParamsFill` and `pinnedParamsDivider` alongside the existing shell/header/toolbar colors, reusing section-style theme colors when a style color is present.
  - Updated `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` so the retained scene reads `getPinnedParamsAreaHeightKey(...)` for the canary section and emits a second retained detail band below the callable toolbar using the measured pinned-panel height.
  - Updated `frontend/src/components/Params/GroupContainer.tsx` so only the canary pinned-params container becomes transparent on the `canvas-shell-underlay` path while the live pinned param rows and controls stay mounted.
  - Added focused node coverage in `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.test.ts`, updated `sectionShellCanvasOwnership.test.ts`, and added a `GroupContainer.test.tsx` assertion locking the transparent pinned-panel DOM chrome on the canvas path.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/GroupContainer.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/GroupContainer.tsx src/components/Params/GroupContainer.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: the trusted shell/header/toolbar canary smoke still passes unchanged after the pinned-panel product slice
  - Attempted to extend the checked-in Playwright canary into a dedicated pinned-panel oracle in the same iteration, but reverted that oracle change after it hit untrusted settings-route automation shapes:
    - headless param-row replay that missed select mode triggered `POST /api/setActiveIds -> 404`
    - direct `/settings` `useProjectState` reads in that setup appeared empty and could not be trusted as the lane oracle
    - the checked-in Playwright file therefore stays on the previously trusted shell/toolbar lane for now
  - CDP visual check is done:
    - `/settings` loaded normally in the headless worktree session
    - `All Settings` was active with no crash/error overlay visible
    - a retained `canvas` was present inside `.react-flow__section-shell-backdrop`
    - `settings-section__callableSectionDefault` was present on the live surface
    - the pinned-params panel was visible by default on that section and the live surface still looked healthy after the pinned container chrome was made transparent on the canvas path
- Next action:
  - move the unpinned params area chrome for `settings-section__callableSectionDefault` into the retained scene layer while keeping param rows live
LOOP_TERMINAL_MARKER: none

## 2026-04-18 019

- Item: Close the stale callable shell/body-panel lane assumptions for `settings-section__callableSectionDefault`.
- Status: `done`
- Details:
  - Re-probed the live worktree canary on `/settings` -> `All Settings` before continuing the next renderer slice.
  - The retained canvas shell is still mounted and healthy for `settings-section__callableSectionDefault`.
  - The visible canary currently shows the section header, the callable `ARGS` toolbar row, and visible settings rows such as `Aspect Ratio`, `Column Width`, `Config Language`, `Edge Input Params`, `Edge Output Ports`, `Hide Params`, and `Hide Unpinned Params`.
  - The checked live canary does not currently show a separate section search field or a visible pinned-params panel in the viewport, so the old `search / pinned / unpinned body-panel chrome` continuation path is stale for this named target.
  - Started a search-pill canvas ownership spike in this iteration, but reverted it in the same pass once the live canary probe showed that control is not mounted on this target; no product code was kept from that experiment.
  - Result: treat the top-level callable shell/body-panel lane as complete on this canary and move the next product slice to visible param-row or row-group chrome instead of another missing panel band.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
  - CDP visual check is done:
    - the retained shell `canvas` is mounted on the live `All Settings` surface
    - `settings-section__callableSectionDefault` looks healthy and shows the header, callable `ARGS` toolbar, and visible settings rows
    - no separate section search field or visible pinned-params panel was present in the checked viewport
- Next action:
  - start the first visible param-row or row-group canvas-chrome slice for `settings-section__callableSectionDefault` instead of another top-level panel-chrome pass
LOOP_TERMINAL_MARKER: none

## 2026-04-18 020

- Item: Add retained-canvas switch-track chrome for the first visible control family on `settings-section__callableSectionDefault`.
- Status: `done`
- Details:
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.ts` so retained frames now support normalized `detailBoxes`, letting the canvas path paint control-local chrome inside a section frame rather than only full-width shell bands.
  - Updated `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` so the retained scene measures canary switch roots in `settings-section__callableSectionDefault`, converts them into graph-space boxes, and paints switch-track pills into the retained canvas.
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` so the canary chrome palette now resolves default and section-style-aware switch-track colors alongside the existing shell/header/toolbar/pinned-panel colors.
  - Updated `frontend/src/components/Params/ParamUIs/ParamUI.tsx` and `frontend/src/components/Params/ParamUIs/SwitchInput.tsx` so only the canary section's switch tracks become transparent on the `canvas-shell-underlay` path while the live switch buttons/thumbs stay mounted and interactive.
  - Updated `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts` so the trusted live canary probe now samples the `Aspect Ratio` switch track in graph space in addition to the existing shell/header/toolbar checks.
  - Added focused node coverage in `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.test.ts`, updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`, and updated `frontend/src/components/Params/ParamUIs/SwitchInput.test.tsx` to lock the new switch-track chrome contract.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/SwitchInput.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellBackdrop.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/SwitchInput.tsx src/components/Params/ParamUIs/SwitchInput.test.tsx src/components/Params/ParamUIs/ParamUI.tsx src/components/Params/ParamUIs/ParamUI.test.tsx tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
  - The first Playwright attempt in this iteration failed in global setup because the previously issued bootstrap token had already expired/been consumed (`401` on `/__setta__/bootstrap`); refreshed runtime info via `./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-002/worktree-ai.log` provided a fresh bootstrap URL/token and the rerun passed unchanged.
  - CDP visual check is done:
    - `Page 1` in the headless worktree session was bootstrapped, then verified on `http://127.0.0.1:3068/settings`
    - `All Settings` was active with no crash or error-boundary overlay visible
    - a retained `canvas` was present inside `.react-flow__section-shell-backdrop`
    - `settings-section__callableSectionDefault` was visible on the live surface
    - the `Aspect Ratio` row remained visible and its switch still looked intact after the DOM switch track was made transparent on the canvas path
- Next action:
  - move to the first non-switch visible control family on `settings-section__callableSectionDefault`, starting with the `Config Language` dropdown shell/chrome while keeping the live combobox interaction intact
LOOP_TERMINAL_MARKER: none

## 2026-04-18 021

- Item: Add the first retained-canvas resting-text handoff for `settings-section__callableSectionDefault` using the visible `Config Language` row.
- Status: `done`
- Details:
  - Closed the stale `Config Language` dropdown/combobox assumption on this canary after rechecking the live `/settings` -> `All Settings` surface; the mounted row is a text-like `DummyCodeMirror` / CodeMirror-backed value that shows `python` at rest.
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` so the canary lane now owns one exact `Config Language` param info id instead of discovering the row by label or DOM shape.
  - Updated `frontend/src/components/Params/ParamUIs/ParamUI.tsx` so only that canary row's inactive `DummyCodeMirror` becomes transparent on the `canvas-shell-underlay` path while the real CodeMirror editor path remains intact for first-click activation.
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.ts` so retained frames now support normalized `detailTexts`, allowing the retained canvas to paint measured text lines in graph space in addition to shell bands and control boxes.
  - Updated `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` so the retained scene measures the canary `Config Language` dummy text line in graph space and paints the resting `python` text into the retained canvas; that measurement automatically drops out when the live editor mounts.
  - Added/updated focused coverage:
    - updated `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.test.ts`
    - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - new `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
    - updated `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/ParamUIs/ParamUI.tsx src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellBackdrop.ts src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: the trusted canary probe now confirms the retained `Config Language` text pixel on the canvas path and that activating the dummy text node surfaces the live editor inline with no blank/detached jump
  - An intermediate Playwright click attempt on the whole row hit non-target DnD/selection noise (`POST /api/setActiveIds -> 404`); the final checked-in probe dispatches activation directly to the dummy text node and passes without that side effect.
  - CDP visual check is done:
    - `/settings` loaded cleanly with no crash or error overlay visible
    - `All Settings` was active on the live worktree surface
    - a retained `canvas` was present inside `.react-flow__section-shell-backdrop`
    - `settings-section__callableSectionDefault` was visible and the `Config Language` row showed resting `python` text on the canvas path
    - activating the `Config Language` row surfaced the inline editor with no blank or detached visual jump
- Next action:
  - move to the next visible text-like control family on `settings-section__callableSectionDefault`, beginning with `Column Width`, instead of reopening the stale `Config Language` dropdown assumption
LOOP_TERMINAL_MARKER: none

## 2026-04-18 022

- Item: Extend the canary retained-text lane to the visible `Column Width` row on `settings-section__callableSectionDefault`.
- Status: `done`
- Details:
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` so the named canary resting-text lane is now a small explicit param-id set instead of a single row; the lane now owns both `Config Language` and `Column Width`.
  - Updated `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` so the retained scene measures multiple canary `DummyCodeMirror` roots in graph space and paints all matching resting text lines into the same retained canvas pass instead of special-casing one input id.
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts` and `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx` to lock the expanded canary ownership set and the transparent dummy-text handoff for both rows.
  - Updated `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts` so the trusted live canary probe now waits for the `Column Width` dummy input, samples both text rows, and counts pixels inside each measured text rect that differ from the sampled body pixel instead of treating any opaque pixel in that rect as proof.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: the trusted canary probe now confirms both the retained `Config Language` and retained `Column Width` text pixels on the live canvas path while preserving the existing inline `Config Language` activation proof
  - CDP visual check is done:
    - `/settings` loaded with no visible crash/error overlay
    - `All Settings` was active
    - `settings-section__callableSectionDefault` was visible
    - a retained `canvas` was present inside `.react-flow__section-shell-backdrop`
    - the `Column Width` row was visible and looked intact on the canvas path
    - no obvious blank or detached section content was visible
    - caveat: the supplied bootstrap URL had already been rejected during the CDP pass, but the existing authenticated `/settings` session remained healthy and sufficient for the required visual confirmation
- Next action:
  - keep the same named canary section and re-probe the next visible text-like row after `Column Width`; prefer `Edge Input Params` or `Edge Output Ports` over reopening shell-only chrome or stale dropdown assumptions
LOOP_TERMINAL_MARKER: none

## 2026-04-18 023

- Item: Extend the canary retained-text lane to the visible `Edge Input Params` and `Edge Output Ports` rows on `settings-section__callableSectionDefault`.
- Status: `done`
- Details:
  - Re-checked the live `/settings` -> `All Settings` canary before editing and confirmed both rows mount as text-like `DummyCodeMirror` / CodeMirror-backed `[]` values, so this slice stayed in the existing retained-text lane instead of inventing a new control-family path.
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` so the named canary resting-text lane now owns four explicit param ids: `Config Language`, `Column Width`, `Edge Input Params`, and `Edge Output Ports`.
  - Reused the existing shared retained-scene measurement path in `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx`; once the ownership set expanded, the retained canvas picked up both edge rows automatically with no extra special-case renderer branch.
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts` and `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx` to lock the expanded canary ownership set and the transparent dummy-text handoff for both edge rows.
  - Updated `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts` so the trusted live canary probe now waits for the `Edge Input Params` and `Edge Output Ports` dummy inputs, samples both text rects in graph space, and asserts that each row still contributes retained-canvas text pixels distinct from the body fill.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: the trusted canary probe now confirms retained text pixels for `Edge Input Params` and `Edge Output Ports` alongside the previously landed `Config Language` and `Column Width` rows, while preserving the inline `Config Language` activation proof
  - CDP visual check is done:
    - the supplied bootstrap token on `8068` had already been rejected during the visual pass, so verification used the still-authenticated `http://127.0.0.1:3068/settings` session directly
    - `All Settings` was active with no crash/error overlay
    - `settings-section__callableSectionDefault` was visible
    - a retained `canvas` was mounted inside `.react-flow__section-shell-backdrop`
    - both `Edge Input Params` and `Edge Output Ports` were visible and looked intact on the canvas-shell-underlay path
- Next action:
  - keep the same named canary section, but avoid another single-row text drip; if this lane continues, take the next grouped visible family such as `Size` / `Style Color` / `Tag Color` in one bounded product slice
LOOP_TERMINAL_MARKER: none

## 2026-04-18 024

- Item: Move the visible param-label family for `settings-section__callableSectionDefault` onto the retained canvas path.
- Status: `done`
- Details:
  - Started this iteration by targeting `ParamNameInput`, but a timed-out live wait plus source re-check showed the visible canary labels on this lane render through `ParamTextLabel` except for kwargs; no product code from that dead-end was kept.
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` so the canary ownership boundary now exposes `isCanvasOwnedSectionParamLabelRestingText(...)` alongside the existing text-like value rule.
  - Updated `frontend/src/components/Params/ParamItems/ParamTextLabel.tsx` so only the canary section's resting labels become transparent on the `canvas-shell-underlay` path and carry `data-canvas-owned-resting-text="true"` for the retained-scene measurement pass, while preserving the existing click-to-focus handoff into the row input.
  - Added focused coverage in `frontend/src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx` and updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts` to lock the new param-label ownership rule.
  - Updated `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts` so the trusted canary probe now samples the retained `Style Color` label text separately from the retained `Style Color` value text and clicks the `Style Color` label to surface the inline editor on first click.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamItems/ParamTextLabel.tsx src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: the trusted canary probe passed with retained `Style Color` label pixels present and the `Style Color` editor surfacing inline from a label click with no blank/detached jump
  - CDP visual check is done:
    - no crash/error overlay was visible on `/settings` with `All Settings` active
    - a retained `canvas` was mounted inside `.react-flow__section-shell-backdrop`
    - `settings-section__callableSectionDefault` remained present on the live surface
    - the `Style Color` label looked intact on the callable canvas path
    - clicking the `Style Color` label surfaced the inline `Style Color` editor with the `null` value rendered inline and no blank/detached jump
- Next action:
  - keep the same named canary section, but move to the next repeated row-chrome family instead of reopening param-label or value-text coverage
LOOP_TERMINAL_MARKER: none

## 2026-04-18 025

- Item: Move the canary text-row underline chrome for `settings-section__callableSectionDefault` onto the retained canvas path.
- Status: `done`
- Details:
  - Updated `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` so the retained scene now measures `[data-canvas-owned-underline="true"]` spans in graph space, derives underline boxes from each span's computed border-bottom color and width, and paints those underline boxes into the same retained canvas pass as the shell chrome, switch tracks, and resting text.
  - Updated `frontend/src/components/Params/ParamUIs/ParamUI.tsx` so only the canary section's text-like value underline becomes transparent on the `canvas-shell-underlay` path, carries `data-canvas-owned-underline="true"` for measurement, and reappears through the live DOM on `peer-focus-within/textinput` so the active blue focus state still comes from the real editor.
  - Updated `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx` to lock the new underline marker/handoff behavior alongside the existing transparent dummy-text assertions.
  - Updated `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts` so the trusted live canary probe now waits for the `Style Color` underline span, asserts that it is hidden in DOM at rest, and confirms that the retained canvas contributes underline pixels distinct from the shell body fill.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/ParamUIs/ParamUI.tsx src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: the trusted canary probe passed with retained `Style Color` underline pixels present on the live canvas path while preserving the existing inline label-click activation proof
  - CDP visual check is done:
    - `All Settings` was active with no visible crash/error overlay
    - a retained `canvas` was mounted inside `.react-flow__section-shell-backdrop`
    - `section[data-section-id="settings-section__callableSectionDefault"]` was present and visible on the live surface
    - the `Style Color` row inside that exact canary section remained present and looked intact after the underline chrome moved to canvas ownership
- Next action:
  - keep the same named canary section, but move to the next repeated inactive row-decoration family instead of reopening value-text, param-label, or underline coverage
LOOP_TERMINAL_MARKER: none

## 2026-04-18 026

- Item: Move the `Size` nested child-row guide rail for `settings-section__callableSectionDefault` onto the retained canvas path.
- Status: `done`
- Details:
  - The live canary probe on `/settings` -> `All Settings` confirmed the next real row-decoration family was the visible left guide rail inside `article#ParamContainer-settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__size`, with nested child rows for `size__height` and `size__width`; this slice stayed on that exact target instead of reopening value-text or underline work.
  - Updated `frontend/src/components/Params/ParamContainer.tsx` so the canary section's nested child-row container now carries `data-canvas-owned-nested-guide="true"` on the `canvas-shell-underlay` path and hides only the matching DOM `::before` guide rail via `before:opacity-0`.
  - Updated `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` so the retained scene measures those marked nested guide rails from the live DOM `::before` metrics, tracks them through a dedicated measurement hook, and paints them into the existing retained detail-box pass.
  - Updated `frontend/src/components/Params/ParamContainer.test.tsx` to lock the new canary nested-guide DOM marker/hide behavior.
  - Updated `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts` so the trusted live canary probe now waits for the `Size` row, targets its nested guide container explicitly, asserts the DOM pseudo-element is hidden on the canvas path, and samples the retained guide pixel separately from the shell body fill.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/ParamContainer.tsx src/components/Params/ParamContainer.test.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: the trusted canary probe passed with the retained `Size` nested guide pixel present while the DOM pseudo-element stayed hidden on the canvas path
  - Focused Vitest verification is still blocked by the pre-existing jsdom dependency/runtime issue before collection:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Params/ParamContainer.test.tsx`
    - error: `Error: require() of ES Module ... @exodus/bytes/encoding-lite.js ... from html-encoding-sniffer`
  - CDP visual check is done:
    - `settings-section__callableSectionDefault` was mounted on `/settings` -> `All Settings`
    - a retained `canvas` was mounted inside `.react-flow__section-shell-backdrop`
    - no crash/error overlay was visible
    - the nested `Size` subtree remained present and its left guide rail looked intact on the live retained-canvas path
    - the DOM pseudo-element being `opacity: 0` was confirmed as the expected handoff state for this slice rather than a regression
- Next action:
  - re-inventory the same named canary section for any remaining default-visible inactive row chrome; if the only leftovers are hover/selection-only states, close the callable row-decoration lane and pivot to the next param-heavy section family
LOOP_TERMINAL_MARKER: none

## 2026-04-18 027

- Item: Close the callable row-decoration lane and name the next param-heavy canary section.
- Status: `done`
- Details:
  - Ran a focused 1x headless Playwright DOM inventory on `/settings` -> `All Settings` after translating `settings-section__callableSectionDefault` into view.
  - That callable inventory found no new default-visible inactive row chrome beyond the already-moved shell/header/text/underline/nested-guide layers.
  - The remaining visible DOM on `settings-section__callableSectionDefault` is limited to intentional live interactive cores: switch thumbs/buttons plus callable toolbar/menu buttons and icons.
  - Ran a matching 1x headless Playwright DOM inventory on `settings-section__dictSectionDefault` to avoid reopening the same callable micro-lane by inertia.
  - The dict section is visible and already exposes the next reusable row families: `Aspect Ratio`, `Column Width`, `Config Language`, `Edge Input Params`, `Edge Output Ports`, `Size`, `Style Color`, and `Tag Color`.
  - The dict section also adds a real new section-specific surface through `input#settings-section__dictSectionDefault-args-filter` plus adjacent header/menu buttons, so it is the correct next named frontier instead of another callable-only decoration pass.
  - Outcome: close the callable row-decoration lane at this ownership boundary and carry `settings-section__dictSectionDefault` as the canonical next target section.
- Next action:
  - land the first dict-section product slice on `settings-section__dictSectionDefault`, reusing the proven retained shell/text/switch/nested-guide path where it fits and treating the dict search/filter chrome as the first new section-specific surface
LOOP_TERMINAL_MARKER: none

## 2026-04-18 028

- Item: Expand the retained shared-family canvas path from the callable canary to `settings-section__dictSectionDefault`.
- Status: `done`
- Details:
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` so the owned shell lane is now a small explicit set containing both `settings-section__callableSectionDefault` and `settings-section__dictSectionDefault` instead of a single hard-coded callable id.
  - Refactored `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` to build retained measurements per owned section rather than assuming one global canary node, while keeping the callable-only toolbar and pinned-panel bands scoped to `settings-section__callableSectionDefault`.
  - That product change lets `settings-section__dictSectionDefault` inherit the already-proven retained shell/header/text/switch/underline/nested-guide path with no new dict-specific renderer branch yet; the dict filter/search surface remains intentionally DOM-owned for the next slice.
  - Updated focused ownership coverage in `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`, `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`, and `frontend/src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx` so dict now rides the same shared retained-text/label boundary while a truly non-owned section remains the negative control.
  - Added `frontend/tests/e2e/settings/settings-all-settings-dict-canvas-shell-ownership.spec.ts` to prove the dict section picks up the shared retained shell/header/text/switch/underline/nested-guide families and still hands the `Style Color` editor off inline on first click.
  - The multi-section expansion exposed one real oracle issue rather than a renderer regression:
    - the old one-pixel center sample on the tiny `Size` guide rail became brittle once both canary sections shared the same retained scene
    - updated both Playwright probes to count guide-rect pixels distinct from the sampled body pixel instead of trusting one center sample; treat that as the trusted nested-guide oracle for the shared callable/dict lane going forward
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts tests/e2e/settings/settings-all-settings-dict-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts tests/e2e/settings/settings-all-settings-dict-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: both the existing callable canary probe and the new dict probe passed on the live worktree runtime after the guide-oracle normalization
  - CDP visual check is done:
    - `/settings` loaded cleanly in a fresh headless DevTools page with `All Settings` active
    - no crash/error-boundary overlay was visible
    - `.react-flow__section-shell-backdrop canvas` was mounted
    - both `settings-section__callableSectionDefault` and `settings-section__dictSectionDefault` were visible and looked intact on the live canvas path
    - the dict filter/search surface remained present on the live DOM-owned path as expected for this slice
- Next action:
  - keep `settings-section__dictSectionDefault` as the active named lane, but stop expanding the shared-family path there; the next bounded product slice should target the dict filter/search chrome itself
LOOP_TERMINAL_MARKER: none

## 2026-04-18 029

- Item: Move the dict filter input underline to retained canvas ownership on `settings-section__dictSectionDefault`.
- Status: `done`
- Details:
  - Added `isCanvasOwnedSectionParamFilterUnderline(...)` in `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` and scoped that ownership rule to the dict canary only, so the filter surface is now tracked as a real dict-specific lane instead of another shared-family expansion.
  - Updated `frontend/src/components/Section/SectionParts/KwargsControls.tsx` so the dict filter input keeps its live DOM text/editor path but hands its resting underline to canvas ownership on the `canvas-shell-underlay` path:
    - the input border is transparent at rest only on that dict canvas path
    - a sibling underline span tagged with `data-canvas-owned-underline="true"` carries the existing retained-underline measurement
    - the live blue focus underline still hands off through DOM peer-focus styling instead of adding another renderer branch
  - Tightened `frontend/tests/e2e/settings/settings-all-settings-dict-canvas-shell-ownership.spec.ts` so the dict probe now checks the filter underline ownership flag, the transparent resting DOM border, and distinct retained-canvas underline pixels alongside the existing shared-family shell/text/switch/nested-guide assertions.
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts` to cover the new dict-only filter-underline ownership rule.
  - Verification notes:
    - the first Playwright rerun failed on a stale bootstrap token (`401`); refreshed runtime info and reran with a fresh token
    - an attempted direct click/fill interaction add-on for the dict filter triggered `POST /api/setActiveIds -> 404` in the current headless harness, so that extra interaction check was removed from the checked oracle because this slice changed only the visual underline ownership
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/SectionParts/KwargsControls.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-dict-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-dict-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: the trusted dict probe passed on the live worktree runtime with the new retained filter underline assertions
  - CDP visual check is done:
    - `/settings` loaded cleanly in the worktree UI slice with `All Settings` active
    - no crash/error overlay was visible
    - `.react-flow__section-shell-backdrop canvas` was mounted
    - `settings-section__dictSectionDefault` was present on the live surface
    - the dict filter/search row looked intact and its underline remained visible after the resting underline moved to retained canvas ownership
- Next action:
  - keep `settings-section__dictSectionDefault` as the active named lane and target the remaining dict filter/search chrome beyond the underline itself, while keeping filter text/editing DOM-owned until there is a concrete reason to move more of that surface
LOOP_TERMINAL_MARKER: none

## 2026-04-18 031

- Item: Close the dict filter/search micro-lane at its current ownership boundary on `settings-section__dictSectionDefault`.
- Status: `done`
- Details:
  - Re-read `frontend/src/components/Section/SectionParts/KwargsControls.tsx` and used a fresh live inventory on `/settings` -> `All Settings` to avoid opening a third dict filter-row ownership slice by inertia after the underline/icon passes.
  - The current filter row on the `canvas-shell-underlay` path is now reduced to:
    - the live `search` wrapper plus the live `input#settings-section__dictSectionDefault-args-filter` editor core as the only visible DOM for that row
    - the static `i.gg-sort-az` icon and underline `span` still mounted only as hidden handoff surfaces with `opacity: 0`
    - the adjacent `Param Filter` label row already hidden on the DOM side because it rides the shared retained-text lane
  - Outcome: no default-visible non-editor filter/search chrome still remains DOM-owned on this dict lane, so the filter/search micro-lane should be treated as complete at this ownership boundary instead of manufacturing another filter-row hop.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-dict-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: the trusted dict probe still passed on the live worktree runtime after the closure inventory
  - CDP visual check is done:
    - `/settings` loaded with `All Settings` active
    - `.react-flow__section-shell-backdrop canvas` was mounted and healthy
    - `section[data-section-id="settings-section__dictSectionDefault"]` was present on the live surface
    - the visible filter/search row was limited to the live input/editor core; the static icon, underline, and `Param Filter` label remained in DOM only as hidden handoff surfaces on the canvas path
- Next action:
  - keep `settings-section__dictSectionDefault` as the named lane, but move the next pass to any remaining default-visible dict-specific inactive chrome outside the filter row; if only live interactive cores remain there too, close the broader dict lane instead of opening another micro-slice
LOOP_TERMINAL_MARKER: none

## 2026-04-18 032

- Item: Move the dict kwargs-controls `Args` label to retained-canvas resting text ownership and close the broader dict lane.
- Status: `done`
- Details:
  - A fresh normal-zoom live inventory on `settings-section__dictSectionDefault` showed the broader dict lane was not actually done yet: once the section is framed large enough, the kwargs-controls `Args` label becomes visible default-inactive chrome outside the already-closed filter row.
  - Added `isCanvasOwnedSectionArgsLabelRestingText(...)` in `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts`, scoped only to the dict canary so this stayed a dict-lane slice instead of reopening callable/shared-family work by inertia.
  - Updated `frontend/src/components/Section/SectionParts/KwargsControls.tsx` so only that dict `Args` label gets `data-canvas-owned-resting-text="true"` and `opacity-0` on the `canvas-shell-underlay` path while the live toolbar buttons/icons and filter input remain DOM-owned interactive cores.
  - Tightened `frontend/tests/e2e/settings/settings-all-settings-dict-canvas-shell-ownership.spec.ts` with one bounded normal-zoom probe: it now zooms the dict section into view, forces one subtree remeasure, and confirms the visible `Args` label is hidden in DOM and repainted by the retained canvas before continuing the existing dict ownership/editor checks.
  - Outcome: the broader dict lane is now closed at its useful boundary. The remaining visible kwargs-controls DOM at normal dict zoom is only the live interactive core (toolbar buttons/icons inside buttons plus the live filter input editor).
- Focused verification passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/SectionParts/KwargsControls.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-dict-canvas-shell-ownership.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-dict-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
    - result: the trusted dict probe now confirms the hidden DOM `Args` label plus retained-canvas text pixels at normal dict zoom while preserving the existing dict shell/text/switch/underline/nested-guide and inline editor checks
- CDP visual check is done:
  - `/settings` loaded with `All Settings` active and no visible crash/error overlay
  - `.react-flow__section-shell-backdrop canvas` was mounted
  - `settings-section__dictSectionDefault` was visible on the live surface
  - after panning/zooming to frame the dict section, the kwargs-controls row still looked intact once the DOM `Args` label was made transparent on the canvas path
  - caveat: the supplied bootstrap token had already been rejected during the CDP pass, so the visual confirmation reused the still-healthy authenticated frontend session directly at `http://127.0.0.1:3068/settings`
- Next action:
  - keep the callable and dict lanes closed, then inventory the next param-heavy family and name the canonical `GlobalVariables` settings target before opening another section-specific ownership slice
LOOP_TERMINAL_MARKER: none

## 2026-04-18 033

- Item: Expand the retained shared-family canvas path to `settings-section__globalVariablesSectionDefault`.
- Status: `done`
- Details:
  - Added `GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID` in `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` and included that section in the explicit retained-shell id set, so the GlobalVariables canary now rides the same shared-family shell/text/label ownership boundary as the callable and dict canaries.
  - Updated `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` to measure the GlobalVariables node directly and include it in the retained-scene measurement map, while keeping the callable-only toolbar/pinned-panel bands scoped to `settings-section__callableSectionDefault`.
  - That product slice moved the GlobalVariables canary onto the already-proven retained shell/header/text/switch/underline/nested-guide path without introducing a new section-specific renderer branch:
    - shell/header
    - `Aspect Ratio` switch track
    - resting `Config Language` and `Style Color` text
    - the `Style Color` label and underline
    - the `Size` nested guide rail
  - Added focused coverage for the expanded ownership boundary:
    - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - updated `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
    - updated `frontend/src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx`
    - new `frontend/tests/e2e/settings/settings-all-settings-global-variables-canvas-shell-ownership.spec.ts`
  - The first live Playwright probe exposed one oracle mistake, not a product regression:
    - the GlobalVariables filter input already rests with a transparent underline on the DOM path, so checking its border color was not a valid proof that the filter surface stayed DOM-owned
    - tightened the checked oracle to assert the absence of dict-only filter handoff markers instead of relying on that border-color assumption
  - The checked Playwright oracle now proves the intended boundary for `settings-section__globalVariablesSectionDefault`:
    - retained shell canvas pixels are present
    - shared-family switch/text/underline/nested-guide pixels are present on canvas
    - the dict-only filter icon/underline handoff markers are absent on the GlobalVariables filter row
    - clicking the hidden `Style Color` label still surfaces the inline editor on first click
- Focused verification passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx`
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-global-variables-canvas-shell-ownership.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-global-variables-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
    - result: the new GlobalVariables probe passed on the live worktree runtime
- CDP visual check is done:
  - `/settings` loaded on the live worktree runtime with `All Settings` active
  - `.react-flow__section-shell-backdrop canvas` was mounted
  - `section[data-section-id="settings-section__globalVariablesSectionDefault"]` was visible on the live surface
  - the section looked intact after moving its shared shell/text/switch/guide chrome to retained canvas ownership
- Next action:
  - keep the callable and dict lanes closed and continue the active `settings-section__globalVariablesSectionDefault` lane by targeting the remaining default-visible kwargs/filter chrome there, starting with the `Args` label if it is still visible at normal section zoom
LOOP_TERMINAL_MARKER: none

## 2026-04-18 034

- Item: Move the GlobalVariables kwargs-controls `Args` label to retained-canvas resting text ownership on `settings-section__globalVariablesSectionDefault`.
- Status: `done`
- Details:
  - Extended `isCanvasOwnedSectionArgsLabelRestingText(...)` in `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` so the GlobalVariables canary now rides the same `Args` label resting-text handoff already proven on the dict lane.
  - No new renderer primitive or section-specific branch was needed in `frontend/src/components/Section/SectionParts/KwargsControls.tsx`; the existing `data-canvas-owned-resting-text="true"` path already covered the `Args` label once the ownership helper included the GlobalVariables section.
  - Tightened `frontend/tests/e2e/settings/settings-all-settings-global-variables-canvas-shell-ownership.spec.ts` with one bounded normal-zoom probe that:
    - reframes `settings-section__globalVariablesSectionDefault` to normal section zoom
    - forces one retained-scene remeasure
    - confirms the visible `Args` label is hidden on the DOM side and repainted by the retained canvas before continuing the existing inline `Style Color` activation proof
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts` so the ownership helper now treats both dict and GlobalVariables as valid `Args` label canaries.
- Focused verification passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-global-variables-canvas-shell-ownership.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-global-variables-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
    - result: the trusted GlobalVariables probe passed on the live worktree runtime with the new retained `Args` label assertions
- CDP visual check is done:
  - `http://127.0.0.1:3068/settings` loaded cleanly with `All Settings` active and no visible crash/error overlay
  - `.react-flow__section-shell-backdrop canvas` was mounted
  - `settings-section__globalVariablesSectionDefault` was visible on the live surface
  - after reframing the section at normal zoom, the kwargs-controls row still looked intact with the DOM `Args` label transparent on the canvas path
  - caveat: the fresh bootstrap token was rejected during the CDP pass, so the visual confirmation reused the still-healthy direct frontend session instead
- Next action:
  - keep the callable and dict lanes closed and continue the active `settings-section__globalVariablesSectionDefault` lane by targeting the remaining default-visible filter/search chrome there, starting with the resting filter underline if it is still visible at normal section zoom
LOOP_TERMINAL_MARKER: none

## 2026-04-18 035

- Item: Move the GlobalVariables static filter icon to retained-canvas ownership on `settings-section__globalVariablesSectionDefault`.
- Status: `done`
- Details:
  - Ran a fresh normal-zoom live inventory on `/settings` -> `All Settings` before patching this lane and closed the stale handoff assumption: the GlobalVariables filter input's resting underline is not visible at normal section zoom, but the static `gg-sort-az` filter icon is visible default-inactive chrome.
  - Extended `isCanvasOwnedSectionParamFilterIcon(...)` in `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` so the GlobalVariables canary now rides the existing retained filter-icon handoff already proven on the dict lane.
  - No new renderer branch was needed in `frontend/src/components/Section/SectionParts/KwargsControls.tsx`; the existing `data-canvas-owned-filter-icon="true"` plus `opacity-0` handoff now applies to the GlobalVariables icon once the ownership helper includes that section.
  - Tightened `frontend/tests/e2e/settings/settings-all-settings-global-variables-canvas-shell-ownership.spec.ts` so the trusted GlobalVariables probe now:
    - requires the hidden DOM filter icon handoff marker
    - computes the icon pseudo-element union rect
    - confirms distinct retained-canvas icon pixels
    - preserves the existing proof that the filter underline still has no GlobalVariables ownership marker and that the live filter input/editor core remains visible
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts` so the ownership helper now treats both dict and GlobalVariables as valid filter-icon canaries.
- Focused verification passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-global-variables-canvas-shell-ownership.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-global-variables-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
    - result: the trusted GlobalVariables probe passed on the live worktree runtime with the new retained filter-icon assertions
- CDP visual check is done:
  - `/settings` loaded with `All Settings` active and no visible crash/error overlay
  - `.react-flow__section-shell-backdrop canvas` was mounted
  - `settings-section__globalVariablesSectionDefault` was visible on the live surface
  - the filter/search row still looked intact after the static filter icon moved to retained canvas ownership
  - the live filter input/editor core remained visible on the DOM path
- Next action:
  - re-inventory `settings-section__globalVariablesSectionDefault` at normal section zoom; if the remaining visible filter/search DOM is only the live input/editor core, close the broader GlobalVariables lane instead of opening another micro-slice
LOOP_TERMINAL_MARKER: none

## 2026-04-18 036

- Item: Close the broader GlobalVariables lane at its useful ownership boundary.
- Status: `done`
- Details:
  - Re-ran the existing trusted GlobalVariables live probe unchanged on the current worktree runtime to confirm the lane still behaved correctly after the latest retained filter-icon slice.
  - Used a fresh headless CDP inventory on `http://127.0.0.1:3068/settings` with `All Settings` active and `settings-section__globalVariablesSectionDefault` framed at normal section zoom to classify the remaining default-visible kwargs/filter DOM instead of opening another ownership micro-slice by inertia.
  - Inventory result:
    - the retained shell canvas is mounted and the section remains visually intact
    - the `Param Filter` label is still present in DOM but not visibly rendered (`opacity-0`)
    - the only remaining visible kwargs/filter DOM on that row is the live interactive core: the standard action-strip buttons/icons inside buttons plus the live filter `<input>` / editor core
  - Outcome: the broader GlobalVariables lane is now closed at its useful ownership boundary. Do not spend another iteration on GlobalVariables kwargs/filter chrome unless a fresh visible defect appears there.
- Focused verification passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-019/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-global-variables-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
    - result: `1 passed (29.3s)` on the live worktree runtime
- CDP visual check is done:
  - `/settings` had `All Settings` active on the live worktree runtime
  - `.react-flow__section-shell-backdrop canvas` was mounted
  - `settings-section__globalVariablesSectionDefault` was visible and intact at normal section zoom
  - the only remaining visible kwargs/filter row DOM was the live input/editor core plus the standard action-strip controls; no extra default-visible filter/search chrome remained beyond that
- Next action:
  - keep the callable, dict, and GlobalVariables section-specific chrome lanes closed and pivot the next bounded product slice to the first non-forwarding Pixi-owned camera/viewport seam on the `settings` canary path
LOOP_TERMINAL_MARKER: none

## 2026-04-18 037

- Item: Land the first non-forwarding Pixi-owned camera/viewport seam by moving the retained section-shell canvas onto its own sibling camera layer on the `settings` canary path.
- Status: `done`
- Details:
  - Canonical visual target for this camera seam slice: `settings-section__callableSectionDefault`.
  - Moved viewport ownership to the real graph-surface composition boundary in `frontend/src/forks/xyflow/core/container/GraphSurface.tsx`:
    - the active `canvas-shell-underlay` implementation now renders the retained `SectionShellBackdropCanvas` inside a new sibling camera layer
    - the live DOM edge/node path stays inside `ViewportWrapper`, so editing and interaction ownership did not change in this slice
  - Added `frontend/src/forks/xyflow/core/container/GraphSurfaceCameraLayer.tsx`, which applies the shared React Flow transform from store state to the retained canvas layer instead of inheriting camera motion from DOM viewport nesting.
  - Updated `frontend/src/forks/xyflow/core/container/ReactFlow.tsx` so `GraphSurface` now decides how viewport ownership is composed for each implementation rather than receiving an unconditional outer `ViewportWrapper`.
  - Added `.react-flow__graph-surface-camera` in `frontend/src/forks/xyflow/core/styles/init.css` so the retained camera layer stays non-interactive and stacked below the DOM viewport.
  - Added focused boundary coverage in `frontend/src/forks/xyflow/core/container/GraphSurface.test.tsx` to prove the retained canvas camera layer renders as a sibling immediately before `.react-flow__viewport` and shares the same transform string.
  - Focused Vitest execution for the new boundary test is still blocked by the existing jsdom dependency/runtime issue before collection:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/GraphSurface.test.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
    - error: `Error: require() of ES Module ... @exodus/bytes/encoding-lite.js ... from html-encoding-sniffer`
- Focused verification passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/GraphSurface.tsx src/forks/xyflow/core/container/GraphSurfaceCameraLayer.tsx src/forks/xyflow/core/container/GraphSurface.test.tsx src/forks/xyflow/core/container/ReactFlow.tsx`
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
    - result: `1 passed (29.6s)` on the live worktree runtime
- CDP visual check is done:
  - `/settings` loaded cleanly with `All Settings` active and no visible crash/error overlay
  - one retained section-shell canvas was mounted on the live surface
  - `.react-flow__graph-surface-camera` was present as a sibling immediately before `.react-flow__viewport`
  - `settings-section__callableSectionDefault` remained visible and populated with no blank or detached content
  - caveat: the supplied bootstrap token was already rejected during the CDP pass, so the visual confirmation reused the still-healthy direct frontend route instead of the bootstrap URL
- Next action:
  - keep the section-specific callable/dict/GlobalVariables chrome lanes closed and continue the camera/viewport lane by replacing retained-canvas DOM transform readback with shared React Flow transform state in the measurement path
LOOP_TERMINAL_MARKER: none

## 2026-04-18 038

- Item: Progress review checkpoint after runs 011-020.
- Status: `reviewed`
- Details:
  - Recent progress is still worthwhile overall because the loop did eventually pivot from section-specific inactive-chrome harvesting to a real graph-surface architecture move in item `037`, landing the first non-forwarding camera/viewport seam on the `settings` canary path.
  - The stretch before that showed diminishing returns:
    - runs `011` through `019` mostly expanded or closed dict / GlobalVariables micro-lanes
    - those slices were not pure noise, but they were nearing churn because they kept widening existing ownership helpers and trusted probes without producing the next dense-scene architectural proof
  - Durable sequencing is now tightened to prevent another drift back into row-level micro-lanes by default:
    - keep the callable, dict, and GlobalVariables section-specific chrome lanes closed
    - the next must-do slice is shared-transform-state authority in the retained measurement path
    - the pass after that must be a fresh dense `settings` -> `All Settings` measurement/report against `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
  - Only reopen another section-family rollout after that measurement if the inactive DOM/resting-rendering path is still the measured blocker or a fresh visible defect appears on a closed canary lane.
- Next action:
  - continue automatically, but require the next iteration to stay on the camera/viewport lane by replacing retained-canvas DOM transform readback with shared React Flow transform state, then queue a fresh durable dense-scene measurement instead of more section-specific chrome ownership work

## 2026-04-18 039

- Item: Replace retained-canvas DOM transform readback with shared React Flow transform state in the measurement path.
- Status: `done`
- Details:
  - Camera/viewport lane canonical target remains `settings-section__callableSectionDefault`.
  - Removed the retained measurement path's `.react-flow__viewport` computed-style parsing from `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx`; switch-track, underline, filter-icon, nested-guide, and resting-text measurement now all consume shared React Flow zoom state from `useReactFlow((state) => state.transform[2])`.
  - Added `frontend/src/forks/xyflow/core/container/sectionShellBackdropMeasurementMath.ts` so graph-space rect normalization and length scaling live in one helper instead of being re-derived ad hoc from DOM transform strings.
  - Threaded the normalized viewport scale through all retained measurement hooks and added that scale to the retained layout-refresh key, so zoom changes now force a fresh retained measurement pass without relying on unrelated DOM mutations.
  - Added `frontend/src/forks/xyflow/core/container/sectionShellBackdropMeasurementMath.test.ts` with a pure graph-space check proving equivalent `1x` and `2x` viewport measurements normalize to the same section-relative rect.
- Focused verification passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellBackdropMeasurementMath.test.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellBackdropMeasurementMath.ts src/forks/xyflow/core/container/sectionShellBackdropMeasurementMath.test.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-021/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-dict-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
    - result: `1 passed (30.0s)` on the live worktree runtime
- CDP visual check is done:
  - `http://127.0.0.1:3068/settings` loaded with `All Settings` active
  - `.react-flow__section-shell-backdrop canvas` and `.react-flow__graph-surface-camera` were both present
  - `settings-section__dictSectionDefault` was visually checked because that lane exercises the retained shell/text/icon/underline primitives touched by this measurement-authority slice
  - no crash/error overlay, blank/detached content, or obvious shell/text/icon/underline breakage was visible
  - reused the existing authenticated frontend session; the bootstrap URL was not needed
- Next action:
  - keep the callable, dict, and GlobalVariables section-specific chrome lanes closed and rerun the dense `settings` -> `All Settings` measurement/probe flow against `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`, recording the result as the next durable perf report
LOOP_TERMINAL_MARKER: none

## 2026-04-18 040

- Item: Record the first durable dense `settings` -> `All Settings` retained-canvas rerun against the 2026-04-18 `go-rewrite` baseline.
- Status: `done`
- Details:
  - Added `perf/reports/frontend/2026-04-18_settings-all-settings-retained-canvas-dense-rerun.md` as the next durable dense-scene report after the retained-canvas surface seam and transform-authority slice.
  - Tightened `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts` so the probe now clicks the real React Flow `fit view` control before sampling and waits until the mounted graph shows more than `20` visible nodes.
  - The first normalization attempt hit a strict Playwright locator collision on `getByRole("button", { name: "fit view" })`; narrowed that helper to `getByTestId("rf__controls").getByRole("button", { name: "fit view" })` and reran the same probe.
  - The normalized rerun landed back on the same dense baseline start state (`x=759.9`, `y=-51.75`, `zoom=0.1`) and restored the same end state after the scripted transform loop.
  - Durable retained-canvas metrics recorded in the new report:
    - `flowNodeCount: 46`
    - `visibleFlowNodeCount: 46`
    - `documentNodeCount: 9517`
    - `buttonCount: 507`
    - `canvasCount: 1`
    - `raf.meanMs: 111.45`
    - `raf.p95Ms: 216.6`
    - `longTasks.totalMs: 18159`
  - Comparison against `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`:
    - `raf.meanMs` improved from `204.93` to `111.45`
    - `longTasks.totalMs` improved from `36337` to `18159`
    - `documentNodeCount` only moved from `9553` to `9517`, which keeps the remaining blocker pointed at the live inactive row/widget DOM rather than more closed callable/dict/GlobalVariables shell-text micro-lanes
- Focused verification passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint tests/e2e/settings/settings-all-settings-baseline.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-022/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
    - result: `1 passed (43.9s)` on the live worktree runtime
- CDP visual check is done:
  - `/settings` opened successfully in headless Chrome DevTools on the current worktree runtime
  - `All Settings` was activated and the real `fit view` control was clicked
  - the React Flow viewport was normalized (`matrix(0.133509, 0, 0, 0.133509, 2653.05, 62.1818)`)
  - `.react-flow__section-shell-backdrop canvas` was mounted
  - no visible crash/error overlay was present
- Next action:
  - keep the callable, dict, and GlobalVariables section-specific chrome lanes closed and land the next graph-surface product slice that reduces dense inactive row/widget DOM cost, using the new dense report as the current evidence baseline
LOOP_TERMINAL_MARKER: none

## 2026-04-18 041

- Item: Replace hidden canvas-owned `DummyCodeMirror` token trees with a lightweight resting-text activator on the retained graph-surface path.
- Status: `done`
- Details:
  - Kept this slice on the current dense inactive-DOM blocker instead of reopening another closed section-specific ownership lane.
  - `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx` now short-circuits `canvasOwnedRestingText` to a lightweight focusable root with the existing mouse/focus activation handoff intact.
  - Single-line canvas-owned rows now collapse to one lightweight root node, and multiline canvas-owned rows keep only plain `.cm-line` wrappers instead of syntax-highlighted token spans.
  - The lightweight root keeps `data-canvas-owned-resting-text="true"` for retained measurement and now also exposes `data-canvas-owned-resting-text-lightweight="true"` so the live canary probe can prove the lower-DOM path directly.
  - Added focused unit coverage at `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.test.tsx`.
  - Tightened `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts` so the trusted callable canary now requires:
    - zero highlighted `.cm-line span` descendants on owned `Config Language`, `Column Width`, and `Style Color` rows
    - `data-canvas-owned-resting-text-lightweight="true"` on those owned text roots
    - the existing retained-canvas pixel checks plus inline `Style Color` editor activation
  - Recorded the follow-up dense-scene rerun at `perf/reports/frontend/2026-04-18_settings-all-settings-lightweight-resting-text-rerun.md`.
  - Dense rerun outcome versus the prior retained-canvas dense report:
    - `documentNodeCount` dropped from `9517` to `9457`
    - `raf.meanMs` stayed roughly flat (`111.45` -> `113.5`)
    - `longTasks.totalMs` stayed roughly flat (`18159` -> `18520`)
    - interpretation: this slice moved DOM cost in the right direction without claiming a new motion win yet
- Focused verification passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Utils/CodeMirror/DummyCodeMirror.test.tsx`
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Utils/CodeMirror/DummyCodeMirror.tsx src/components/Utils/CodeMirror/DummyCodeMirror.test.tsx tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-023/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
    - result: `1 passed (29.7s)` on the live worktree runtime
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-023/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
    - result: `1 passed (44.2s)` on the live worktree runtime with `documentNodeCount: 9457`
- CDP visual check is done:
  - `All Settings` mounted cleanly on the live worktree runtime
  - `settings-section__callableSectionDefault` remained visible on the retained canvas path
  - the canary text rows still looked intact after the dummy text DOM became lightweight
  - activating the `Style Color` row surfaced the inline editor (`#ff0000`) with no blank or detached canvas jump
- Next action:
  - keep the callable, dict, and GlobalVariables section-specific chrome lanes closed and target the next heavy inactive row/widget subtree above these text leaves on the retained graph-surface path
LOOP_TERMINAL_MARKER: none

## 2026-04-18 042

- Item: Extend the retained resting-text path into `settings-section__sectionSizingPolicy` without reopening another shell-owned section lane.
- Status: `done`
- Details:
  - Kept this slice on the dense inactive-DOM blocker instead of reopening another callable/dict/GlobalVariables chrome lane.
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now separates shell-owned sections from resting-text-owned sections, with `settings-section__sectionSizingPolicy` added only to the resting-text set.
  - `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now measures and paints retained detail text/underline visuals for that dense section while leaving its shell/header/toolbar DOM-owned.
  - Added focused verification coverage at:
    - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - updated `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
    - new `frontend/tests/e2e/settings/settings-all-settings-section-sizing-policy-resting-text.spec.ts`
  - Recorded the follow-up dense rerun at `perf/reports/frontend/2026-04-18_settings-all-settings-section-sizing-policy-resting-text-rerun.md`.
  - Dense rerun outcome versus the prior lightweight-text report:
    - `documentNodeCount` dropped from `9457` to `9181`
    - `documentNodeCount` is now down `372` from the durable `go-rewrite` baseline (`9553` -> `9181`)
    - motion stayed effectively flat (`raf.meanMs 113.5 -> 114.24`, `longTasks.totalMs 18520 -> 18839`), so this is a dense DOM-cost reduction slice rather than a new motion win
- Focused verification passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-section-sizing-policy-resting-text.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-024/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-section-sizing-policy-resting-text.spec.ts --reporter=line --workers=1`
    - result: `1 passed (24.1s)` on the live worktree runtime
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-024/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
    - result: `1 passed (44.4s)` on the live worktree runtime with `documentNodeCount: 9181`
- CDP visual check is done:
  - `/settings` loaded with no visible crash/error overlay
  - `All Settings` was active
  - `.react-flow__section-shell-backdrop canvas` was mounted
  - `settings-section__sectionSizingPolicy` was present on the live surface
  - the Browser `maxHeight` row looked intact after the resting text DOM was hidden on the canvas path
  - focusing `settings-section__sectionSizingPolicy-settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__byType__Browser__maxHeight-ParamInput` surfaced the inline editor with no obvious blank/detached jump or layout shift
- Next action:
  - keep the callable, dict, and GlobalVariables shell/text lanes closed and stay on canonical dense target `settings-section__sectionSizingPolicy` for the next slice, targeting the first repeated non-text inactive control subtree there
LOOP_TERMINAL_MARKER: none

## 2026-04-18 044

- Item: Close the `settings-section__sectionSizingPolicy` repeated inactive-control lane with a whole-section at-rest inventory probe.
- Status: `done`
- Details:
  - Kept this slice bounded to the active dense target section instead of inventing another speculative micro-control ownership pass.
  - `frontend/tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts` now includes a second test that inventories the whole section at rest and attributes each lightweight dropdown activator to its owning row.
  - The checked probe now proves the current ownership boundary on the live worktree runtime:
    - `rowCount: 211`
    - `restingTextRootCount: 198`
    - `lightweightDropdownRows: 30`
    - `liveInteractiveRows: []`
  - Every attributed lightweight dropdown row still matches `__sizeModeHeight|Width`, so there is no second repeated inactive non-text control family left to chase on this section right now.
  - Interpretation: the `sectionSizingPolicy` inactive-control lane is closed at its useful ownership boundary, and the next real blocker is the heavier structural row/container DOM still mounted above those lightweight activators.
- Focused verification passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-026/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts --reporter=line --workers=1`
    - result: `2 passed (39.5s)` on the live worktree runtime
- CDP visual check is done:
  - a fresh headless DevTools pass bootstrapped the current worktree runtime and used `http://127.0.0.1:3068/settings?__setta_backend_origin=http%3A%2F%2F127.0.0.1%3A8068`
  - `All Settings` was active
  - `.react-flow__section-shell-backdrop` contained exactly one retained `canvas`
  - `settings-section__sectionSizingPolicy` was visible with no crash/error overlay
  - the `Size Mode Height` row still looked intact at rest as compact inline content with no visible live search input or blank placeholder
  - caveat: because this is a dense retained-canvas surface, the CDP pass paired the visual read with a targeted DOM check for the absence of visible live search input on that row
- Next action:
  - keep the `sectionSizingPolicy` micro control-family lane closed and target the heavier structural row/container DOM still mounted above these lightweight activators instead of reopening another dropdown micro-slice by inertia
LOOP_TERMINAL_MARKER: none

## 2026-04-18 045

- Item: Remove the extra nested child-row wrapper from the dense `settings-section__sectionSizingPolicy` lane.
- Status: `done`
- Details:
  - Kept this slice on the active dense structural blocker instead of reopening another closed control-family lane.
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now marks `settings-section__sectionSizingPolicy` as the lightweight nested-children lane while leaving the closed callable/dict/globalVariables lanes unchanged.
  - `frontend/src/components/Params/ParamContainer.tsx` now lets nested child rows mount directly under their owning row on the `canvas-shell-underlay` path and marks the owning nested row as the lightweight retained-guide root instead of keeping the extra `.section-args-nested.section-key-value...` wrapper div.
  - `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now measures those lightweight nested-guide roots by unioning their direct child rows, so the retained guide still paints after the wrapper node disappears.
  - Added focused coverage at:
    - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - updated `frontend/src/components/Params/ParamContainer.lightweightLeadingContent.test.tsx`
    - new `frontend/src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx`
    - updated `frontend/tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts`
  - The live `sectionSizingPolicy` subtree now proves the new structural contract:
    - `legacyNestedChildWrapperCount: 0`
    - `lightweightNestedGuideRootCount: 43`
    - `rowCount: 211`
  - Recorded the follow-up dense rerun at `perf/reports/frontend/2026-04-18_settings-all-settings-section-sizing-policy-lightweight-nested-children-rerun.md`.
  - Dense rerun outcome versus the prior lightweight param-label report:
    - `documentNodeCount` dropped from `8647` to `8604`
    - `inputCount` stayed at `60`
    - `buttonCount` stayed at `477`
    - `raf.meanMs` improved from `112.38ms` to `110.24ms`
    - `raf.p95Ms` improved from `216.7ms` to `216.6ms`
    - `longTasks.totalMs` improved from `18184ms` to `17832ms`
- Focused verification passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamContainer.lightweightLeadingContent.test.tsx src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx`
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/components/Params/ParamContainer.tsx src/components/Params/ParamContainer.test.tsx src/components/Params/ParamContainer.lightweightLeadingContent.test.tsx src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-029/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts --reporter=line --workers=1`
    - result: `2 passed (37.7s)` on the live worktree runtime
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.dh94U6/loop-001/run-029/worktree-ai.log)" && PLAYWRIGHT_BASE_URL="$(node -pe 'JSON.parse(process.argv[1]).frontendUrl' "$RUNTIME_JSON")" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
    - result: `1 passed (43.3s)` on the live worktree runtime with `documentNodeCount: 8604`, `inputCount: 60`, and `buttonCount: 477`
- CDP visual check is done:
  - `/settings` loaded with `All Settings` active
  - no crash/error overlay was visible
  - exactly one `.react-flow__section-shell-backdrop canvas` was mounted
  - `settings-section__sectionSizingPolicy` remained visible on the live surface
  - the sampled `Size` branch still showed the expected `Height` and `Width` rows with no blank slot or obviously detached row/guide chrome after the nested wrapper removal
  - caveat: the headless fitted viewport made the deeper guide details hard to inspect pixel-for-pixel, so this was a best-effort visual pass on the visible subtree rather than a microscopic guide-fidelity call
- Next action:
  - stay on `settings-section__sectionSizingPolicy` and target the next repeated structural row/container DOM still mounted above the lightweight text/dropdown/resize/label/nested-child activators before opening a new dense section lane
LOOP_TERMINAL_MARKER: none
