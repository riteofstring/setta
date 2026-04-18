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
