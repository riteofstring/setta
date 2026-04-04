# Graph Substrate Rewrite Log

Date started: 2026-04-02
Worktree: `pixijs-graph`
Related plan: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-plan.md`
Research source worktree: `setta.pixijs-rewrite`

## Usage

Append-only execution log for the graph substrate rewrite effort.

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
- substrate/runtime milestones
- benchmark evidence
- visual verification
- drag/pan/zoom regressions
- DOM overlay ownership decisions

## 2026-04-02 001

- Item: Initialize the `pixijs-graph` worktree with the latest Ralph loop files and a fresh graph-substrate rewrite plan.
- Status: `done`
- Details:
  - This worktree starts from `main`.
  - The latest Ralph loop infrastructure was ported in from `setta.pixijs-rewrite`:
    - `RALPH.md`
    - `scripts/ralph-default-prompt.md`
    - `scripts/run-codex-loop.sh`
    - `tests/start/test_run_codex_loop_script.py`
  - A fresh durable plan set was created under `docs/plans/worktrees/pixijs-graph/`.
  - Architectural reset for this worktree:
    - do not keep investing in the old shared-page-runtime/DOM-sync renderer lane
    - replace the graph substrate first
    - keep DOM section bodies/editors initially
    - add Pixi ownership only after the custom substrate proves drag/pan/zoom correctness
- Verification:
  - `bash -n scripts/run-codex-loop.sh`
    - result: passed
  - `./ralph.sh --help`
    - result: passed
  - `./ralph.sh --print-prompt`
    - result: passed
    - note: the rendered prompt resolved the new `pixijs-graph` plan, handoff, and history files rather than the old `setta.pixijs-rewrite` docs
  - `source activate.sh && pytest tests/start/test_run_codex_loop_script.py -q`
    - result: passed (`8 passed`, about `45s`)
  - `pnpm -C frontend exec prettier --check ../RALPH.md ../scripts/ralph-default-prompt.md ../docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-plan.md ../docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-handoff.md ../docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log.md ../docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log-index.md ../docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-completed.md`
    - result: passed
- Conclusion:
  - this worktree is now the clean execution base for the graph substrate rewrite
  - the next Ralph slice should start implementing the custom graph-runtime canary instead of reopening the old shared-runtime renderer path
- Next action:
  - introduce the first custom graph/runtime seam for `settings` and render one normal-zoom section body through it with DOM content and custom drag ownership

LOOP_TERMINAL_MARKER: none

## 2026-04-02 016

- Item: Fix Ralph's headless lifecycle/browser launcher path so CDP can stay up long enough to retry the blocked `All Settings` oracle compare.
- Status: `done`
- Details:
  - `scripts/start-browser-mcp.sh` now launches background devtools Chrome through a detached Python subprocess (`start_new_session=True`, with `nohup` fallback) instead of tying the headless browser to the short-lived launcher shell.
  - The same script now builds Chrome argv arrays without forwarding the empty `CHROME_ARGS` placeholder, which was causing the detached Python launch path to exit immediately.
  - `scripts/run-codex-loop.sh` now detects `--browser-mode` support through the repo-root `ai.sh` wrapper by checking the sibling `scripts/ai.sh`, so modern launchers get the explicit `--browser-mode headless` flag instead of falling back to the wrapper hack.
  - Updated script-wiring coverage:
    - `tests/start/test_start_browser_mcp_script.py` now includes a behavioral check that the headless browser process stays alive after `start-browser-mcp.sh` exits.
    - `tests/start/test_run_codex_loop_script.py` now proves the wrapper-style `ai.sh -> scripts/ai.sh` layout still receives the explicit browser-mode flag.
- Verification:
  - `source activate.sh && pytest tests/start/test_dev_script_wiring_ai.py tests/start/test_dev_script_wiring_aireset.py tests/start/test_run_codex_loop_script.py tests/start/test_start_browser_mcp_script.py`
    - result: passed (`36 passed`, about `86s`)
  - isolated live smoke
    - command:
      - `DEBUG_PORT=9692 MCP_RUN_DIR=/tmp/setta-mcp-live12 PROFILE_DIR=/tmp/setta-profile-live12 BOOTSTRAP_ENABLED=0 ./scripts/start-browser-mcp.sh --devtools --browser-mode headless`
      - `sleep 1`
      - `curl -fsS --max-time 3 http://127.0.0.1:9692/json/version`
    - result: passed (returned the Chrome DevTools JSON payload)
- Conclusion:
  - the previously repeated lifecycle blocker now has a concrete script-level fix instead of more retry churn
  - this iteration intentionally stopped at launcher health; it did not yet rerun the blocked worktree-vs-`main` cleared-viewport compare
- Next action:
  - rerun the normal Ralph-managed worktree and `main` `ai` lifecycles with the patched scripts, then retry the strict `All Settings` cleared-viewport CDP compare before touching more canary fit/bounds code

LOOP_TERMINAL_MARKER: none

## 2026-04-02 015

- Item: Retry the deferred post-item-013 bootstrap-first cleared-viewport `All Settings` compare after the one allowed local lifecycle recovery.
- Status: `blocked`
- Details:
  - No product-code changes landed in this pass; the iteration stayed on blocker resolution because the handoff explicitly said not to continue the fit/bounds lane until the compare could run against a trustworthy oracle.
  - Fresh-context CDP verification failed immediately before any browser actions:
    - sub-agent report: `Chrome DevTools MCP could not connect to Chrome; http://127.0.0.1:9297/json/version was unreachable`
  - One allowed local worktree self-recovery ran with `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`:
    - terminal output reported frontend `http://127.0.0.1:3076/`, backend `http://127.0.0.1:8076`, debug port `9298`, bootstrap session `c80b97`
    - follow-up checks still showed no reachable debug Chrome and no live Setta connect info:
      - `curl -fsS --max-time 3 http://127.0.0.1:9298/json/version` failed with connection refused
      - `lsof -nP -iTCP:9298 -sTCP:LISTEN` returned no listener
      - `pnpm -C frontend cdp-port` still reported stale port `9297`
      - `source activate.sh && setta status --connect-info --latest --json --workspace /Users/jeff/Documents/_projects/setta.pixijs-graph` returned `Error: No matching Setta sessions found.`
  - The allowed fallback retry also failed: `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./ai.sh`
    - terminal output reported frontend `http://127.0.0.1:3077/`, backend `http://127.0.0.1:8077`, debug port `9299`, bootstrap session `752acc`
    - `curl -fsS --max-time 3 http://127.0.0.1:9299/json/version` failed with connection refused
    - `lsof -nP -iTCP:9299 -sTCP:LISTEN` returned no listener
    - `pnpm -C frontend cdp-port` still reported `9297`
    - `source activate.sh && setta status --connect-info --latest --json --workspace /Users/jeff/Documents/_projects/setta.pixijs-graph` still returned `Error: No matching Setta sessions found.`
  - The read-only `main` reference remained untrustworthy too:
    - `source activate.sh && setta status --connect-info --latest --json --workspace /Users/jeff/Documents/_projects/setta` returned `Error: No matching Setta sessions found.`
    - `curl -I --max-time 5 http://127.0.0.1:3087/settings` still returned `200 OK`
  - That leaves the actual blocker as lifecycle/bootstrap availability, not a newly observed renderer mismatch.
- Verification:
  - CDP visual check
    - result: blocked
    - note:
      - fresh sub-agent could not reach the worktree debug Chrome at `9297`
      - both allowed local recovery launches (`./aireset.sh`, then fallback `./ai.sh`) still failed to produce a reachable Chrome listener or a live Setta connect-info session
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
    - result: launched frontend/backend but did not restore a reachable debug Chrome
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./ai.sh`
    - result: launched frontend/backend but did not restore a reachable debug Chrome
  - `curl -fsS --max-time 3 http://127.0.0.1:9298/json/version`
    - result: failed (`connection refused`)
  - `curl -fsS --max-time 3 http://127.0.0.1:9299/json/version`
    - result: failed (`connection refused`)
  - `source activate.sh && setta status --connect-info --latest --json --workspace /Users/jeff/Documents/_projects/setta.pixijs-graph`
    - result: failed (`Error: No matching Setta sessions found.`)
  - `source activate.sh && setta status --connect-info --latest --json --workspace /Users/jeff/Documents/_projects/setta`
    - result: failed (`Error: No matching Setta sessions found.`)
  - `curl -I --max-time 5 http://127.0.0.1:3087/settings`
    - result: passed (`200 OK`)
- Conclusion:
  - the blocked compare is now clearly a lifecycle/debug-browser problem, not another reason to keep changing canary bounds code
  - do not continue the `All Settings` fit/bounds lane until a fresh iteration restores a reachable CDP target and a valid bootstrap/connect-info session
- Next action:
  - start the next Ralph iteration from a fresh lifecycle bootstrap; if `json/version` or `setta status --connect-info` are still missing afterward, inspect the loop/browser launcher wiring instead of the graph canary

LOOP_TERMINAL_MARKER: none

## 2026-04-02 014

- Item: Retry the deferred post-item-013 cleared-viewport `All Settings` CDP oracle compare from a fresh loop session before landing any more fit/bounds changes.
- Status: `blocked`
- Details:
  - No product-code changes landed in this iteration; the work stayed on verification because the handoff explicitly said not to continue the fit/bounds lane until the compare was retried from a fresh session.
  - Fresh CDP sub-agent attempt `1` reached the worktree and produced measurements, but the run was not trustworthy because the `main` side reported `5` visible nodes, which matches `Core` rather than `All Settings`, and the sub-agent also mentioned the wrong main port.
  - Fresh CDP sub-agent attempt `2` re-ran the compare with stricter guardrails and validated the worktree side successfully:
    - URL `http://127.0.0.1:3075/settings`
    - `All Settings` tab active
    - `graph-substrate-canary` present
    - `.react-flow__pane` absent
  - The same strict run could not validate the read-only `main` side:
    - URL `http://127.0.0.1:3087/settings`
    - `All Settings` control absent
    - `canaryCount = 0`
    - `paneCount = 0`
    - `rootChildren = 0`
    - reload surfaced `Error: Search engine null is not supported.`
  - Repo-side runtime checks agree that the `main` reference app is not healthy enough to use as an oracle right now:
    - `source activate.sh && setta status --connect-info --latest --json --workspace /Users/jeff/Documents/_projects/setta`
      - result: `Error: No matching Setta sessions found.`
    - `curl -I --max-time 5 http://127.0.0.1:3087/settings`
      - result: `200 OK`
  - That leaves the reference frontend shell up but the actual `main` app/bootstrap session unavailable or broken, so the side-by-side compare is invalid.
- Verification:
  - CDP visual check
    - result: blocked / invalid
    - note:
      - worktree side validated on the canary `All Settings` surface
      - read-only `main` never mounted the comparable settings graph, so no trusted visual verdict was possible
  - `source activate.sh && setta status --connect-info --latest --json --workspace /Users/jeff/Documents/_projects/setta`
    - result: failed (`Error: No matching Setta sessions found.`)
  - `curl -I --max-time 5 http://127.0.0.1:3087/settings`
    - result: passed (`200 OK`)
- Conclusion:
  - the active blocker is the unhealthy read-only `main` oracle session, not a newly identified product-code defect in the worktree
  - do not continue the `All Settings` fit/bounds lane until the next iteration restores a valid `main` reference runtime and reruns the strict compare
- Next action:
  - start the next Ralph iteration with a fresh reference lifecycle/bootstrap, then rerun the strict cleared-viewport `All Settings` CDP compare before changing more viewport or bounds code

LOOP_TERMINAL_MARKER: none

## 2026-04-02 013

- Item: Move the `All Settings` canary auto-fit onto measured DOM bounds and retry the cleared-viewport oracle compare.
- Status: `blocked_on_cdp`
- Details:
  - Added `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryBounds.ts` and `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryBounds.test.ts`.
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx` now waits for measured DOM sizes from every visible canary section before computing the first auto-fit scene bounds.
  - The same canary now records observed section sizes with `offsetWidth` / `offsetHeight`, matching legacy `fitView` instead of using `ResizeObserver.contentRect`.
  - `frontend/tests/e2e/settings/settings-view-modes.spec.ts` now checks the cleared-viewport `All Settings` fit by comparing the live canary zoom against the measured visible-section fit instead of relying on a loose zoom threshold.
  - One allowed local CDP recovery ran after the first fresh sub-agent reported `chrome-devtools-mcp` unavailable:
    - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
    - restarted runtime from terminal output: frontend `http://127.0.0.1:3077/`, backend `http://127.0.0.1:8077`, bootstrap session `e5ff30`
  - After that restart, a second fresh CDP sub-agent still reported that `chrome-devtools-mcp` was inaccessible in this Codex session, so the side-by-side `main` oracle compare could not run.
- Verification:
  - `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryBounds.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewport.test.ts`
    - result: passed (`8 passed`)
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary preserves the All Settings multi-column spread on first render'`
    - result: passed (`1 passed`, about `18s`)
  - CDP visual check
    - result: blocked
    - note:
      - first fresh sub-agent: `chrome-devtools-mcp` inaccessible before the restart
      - second fresh sub-agent after `./aireset.sh`: `chrome-devtools-mcp` still inaccessible
      - no visual verdict yet on whether the tighter worktree framing versus `main` is resolved
- Conclusion:
  - the canary fit now uses measured DOM size readiness and the same box model as legacy `fitView`
  - the remaining blocker for this slice is tool access, not another identified product-code change
- Next action:
  - start the next Ralph iteration with a fresh worktree/bootstrap session and retry the cleared-viewport `All Settings` CDP compare against read-only `main` before landing more bounds or viewport tweaks

LOOP_TERMINAL_MARKER: none

## 2026-04-02 011

- Item: Stop the `All Settings` canary from treating its own `{48,48,1}` fallback seed as an authoritative shared viewport when no saved camera exists.
- Status: `blocked`
- Details:
  - A controlled worktree-vs-`main` CDP compare with `viewport: null` on both sides exposed the real initial-fit bug:
    - worktree stayed at `matrix(1, 0, 0, 1, 48, 48)`
    - `main` fit the same route to `matrix(0.428082, 0, 0, 0.428082, 1458.36, 774.733)`
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewport.ts` now separates:
    - the fallback top-left seed
    - the authoritative shared viewport source
    - the final resolved viewport
  - The canary now ignores a `useReactFlow` viewport when it only mirrors that fallback seed and no saved project viewport exists, so the later auto-fit is still allowed to run.
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx` now computes fallback/shared/resolved viewport state separately and gates auto-fit against the authoritative shared viewport rather than the fallback echo.
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewport.test.ts` now covers the fallback-echo rejection plus the still-authoritative non-fallback shared viewport case.
  - `frontend/tests/e2e/settings/settings-view-modes.spec.ts` now clears the saved viewport before entering `All Settings` and asserts the canary auto-fits (`zoom < 0.95`) instead of sticking at the fallback; the persisted-viewport restore path still passes.
- Verification:
  - `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewport.test.ts`
    - result: passed (`5 passed`)
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary preserves the All Settings multi-column spread on first render|settings graph substrate canary restores the persisted shared viewport on All Settings'`
    - result: passed (`2 passed`, about `46s`)
  - CDP visual check before the code change
    - result: passed and exposed the bug
    - note:
      - worktree cleared-viewport transform: `matrix(1, 0, 0, 1, 48, 48)`
      - `main` cleared-viewport transform: `matrix(0.428082, 0, 0, 0.428082, 1458.36, 774.733)`
  - CDP visual check after the code change
    - result: blocked
    - note:
      - one allowed self-recovery ran: `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
      - the restarted worktree came up on frontend `http://127.0.0.1:3077/` and backend `http://127.0.0.1:8077/`
      - fresh CDP sub-agents still could not invoke browser page actions (`navigate_page` / `evaluate_script` / `take_snapshot`) or reported the browser tools as not invokable, so the post-fix live compare never completed
- Conclusion:
  - the fallback-echo ownership bug is fixed in code and covered by automated tests
  - the remaining blocker for this iteration is the required live CDP compare after the fix, not another code-path hypothesis
- Next action:
  - start the next iteration from a fresh lifecycle bootstrap and retry the controlled cleared-viewport worktree-vs-`main` CDP compare before landing more viewport logic changes

LOOP_TERMINAL_MARKER: none

## 2026-04-02 009

- Item: Stop stale `nodeInternals` from choosing the multi-section canary layout and add seeded coverage for the initial `All Settings` spread.
- Status: `done`
- Details:
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.ts` now takes canary section positions and `zIndex` from the active view-mode layout instead of preferring stale `nodeInternals` positions.
  - The same selector still preserves live measured widths and heights from `nodeInternals`, so interaction geometry stays current without letting old route state decide where the visible `All Settings` cards render.
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.test.ts` now locks down that active-layout positions win over stale `nodeInternals` positions while measured dimensions still win.
  - `frontend/tests/e2e/settings/settings-view-modes.spec.ts` now includes a focused initial-layout guard proving the seeded `All Settings` canary does not collapse all visible sections into one screen x-column on first render.
  - The same E2E file now finds pan/zoom background points by probing the real canary pane background instead of assuming empty space from section bounding-box math, which keeps the drag/pan/title checks valid after the broader visible layout changed.
- Verification:
  - `source activate.sh && cd frontend && pnpm exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.test.ts`
    - result: passed (`4 passed`)
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary preserves the All Settings multi-column spread on first render'`
    - result: passed (`1 passed`, about `15s`)
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary drags one section and persists the top-level layout'`
    - result: passed (`1 passed`, about `19s`)
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary pans and zooms one section on the custom surface|settings graph substrate canary keeps title editing working after pan and zoom'`
    - result: passed (`2 passed`, about `27s`)
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings view tabs filter sections and minimap'`
    - result: passed (`1 passed`, about `17s`)
  - CDP visual check
    - result: deferred for the side-by-side oracle compare
    - note:
      - a worktree-only probe on `http://127.0.0.1:3075/settings` confirmed `graph-substrate-canary` is present, `48` canary sections are in the DOM, the live transform is `matrix(0.1, 0, 0, 0.1, 632.4, -51.7)`, and the first visible section headers occupy multiple screen x-buckets (`shortcuts`, `gui`, `backend` around `x≈644`, `692`, `752`)
      - a fresh-profile side-by-side compare against `main` was not trustworthy because the loop-context bootstrap tokens had expired, and a fallback existing-tab compare did not have a working DevTools bridge in that sub-agent session
- Conclusion:
  - the stale-position ownership fix is landed and covered in the seeded E2E path
  - the remaining uncertainty is whether the live worktree’s saved `All Settings` viewport at `zoom 0.1` is a real Gate 1 drift versus `main`, which still needs a trustworthy authenticated oracle compare before more product churn
- Next action:
  - restore a trustworthy authenticated `main` oracle compare on the existing lifecycle tabs or with freshly minted bootstrap tokens, then decide whether the next product slice must change the canary’s initial/shared viewport strategy

LOOP_TERMINAL_MARKER: none

## 2026-04-02 008

- Item: Re-check the multi-section `All Settings` canary against the read-only `main` oracle and decide whether to continue or stop for replan.
- Status: `blocked`
- Details:
  - No production code changed in this pass.
  - The current worktree runtime remains healthy:
    - `http://127.0.0.1:3075/settings` responds
    - `pnpm -C frontend cdp-port` still reports `9297`
  - A fresh-context CDP sub-agent could not call chrome-devtools-mcp tools, so the visual compare could not be offloaded there this iteration.
  - The decisive blocker is still the read-only `main` oracle being down:
    - `curl -I --max-time 5 http://127.0.0.1:3087/settings`
      - result: failed with connection refused
    - `/var/folders/h8/yx9s_2gs37d50mktlw56975m0000gn/T//codex-loop.vpSQx2/run-007/main-ai.log`
      - result: `main` backend/frontend startup still aborts on a `ProjectStateSingleConfig` validation failure while loading the settings project
      - salient errors: missing `projectConfig`; extra `schemaVersion`, `defaultProjectId`, and `projects`
  - Item `007` already ended with the same dead-`main` oracle, so this is now a repeated external blocker rather than a transient verification miss.
- Verification:
  - `curl -I --max-time 5 http://127.0.0.1:3075/settings`
    - result: passed (`HTTP/1.1 200 OK`)
  - `curl -I --max-time 5 http://127.0.0.1:3087/settings`
    - result: failed (`curl: (7) Failed to connect to 127.0.0.1 port 3087`)
  - `pnpm -C frontend cdp-port`
    - result: passed (`9297`)
  - CDP visual check
    - result: not run
    - note: the required staged Gate 1 side-by-side compare cannot proceed without a healthy `main` oracle session
- Conclusion:
  - the next planned frontier still depends on a working read-only `main` reference session
  - continuing with unrelated canary refactors would violate the sequencing rules because the same oracle blocker has now repeated
- Next action:
  - stop for replan or restore the read-only `main` oracle session before resuming Gate 1 comparison work

LOOP_TERMINAL_MARKER: replan_required

## 2026-04-02 007

- Item: Expand the `settings` graph-substrate canary from one visible section to the visible `All Settings` top-level section set.
- Status: `done`
- Details:
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.ts` now returns the visible top-level canary section list instead of a single preferred section and includes each section's `positionAndSizeLocked` state for drag ownership decisions.
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx` now renders that visible section set on the custom surface, fits the initial viewport to the shared section bounds, and routes drag ownership to the section that was actually grabbed.
  - The canary now keeps local per-section DOM size observations so multi-section viewport fitting uses the visible section field without handing ownership back to `xyflow`.
  - `frontend/tests/e2e/settings/settings-view-modes.spec.ts` now proves:
    - more than one canary section is visible on `All Settings`
    - a runtime-discovered draggable section can move without pulling a different visible section with it
    - shared pan/zoom moves multiple visible sections together
    - title editing still works on the broader canary surface
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.test.ts` now locks down the plural visible-section selector and lock-state contract.
- Verification:
  - `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.test.ts`
    - result: passed (`4 passed`)
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings view tabs filter sections and minimap|settings graph substrate canary drags one section and persists the top-level layout|settings graph substrate canary pans and zooms one section on the custom surface|settings graph substrate canary keeps title editing working after pan and zoom'`
    - result: passed (`4 passed`, about `44s`)
  - CDP visual check
    - result: partial pass
    - note: on `http://127.0.0.1:3075/settings`, `All Settings` showed more than one visible canary section and no gross blank/detached-body issue in the normal visible field
    - note: side-by-side gross-drift comparison against the read-only `main` reference did not run because `http://127.0.0.1:3087/settings` returned `ERR_CONNECTION_REFUSED`; `run-006/main-ai.log` shows the reference app died during startup on a settings-project validation error
- Conclusion:
  - the custom graph-substrate canary now covers the visible `All Settings` top-level section field instead of a single representative section
  - the next useful frontier is the staged Gate 1 gross-drift comparison against a healthy `main` oracle session, then any concrete multi-section visual/perf issue that compare exposes
- Next action:
  - restore or refresh the read-only `main` reference session and do the normal-zoom Gate 1 gross-drift compare for the new multi-section canary surface

LOOP_TERMINAL_MARKER: none

## 2026-04-02 005

- Item: Add custom pan/zoom ownership to the `settings` graph-substrate canary and prove the checked section stays attached on the custom surface.
- Status: `done`
- Details:
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx` now owns background pan on the canary root instead of depending on legacy `xyflow` pane ownership.
  - The same canary root now owns anchored wheel zoom for the checked `settings` / `All Settings` slice.
  - The canary syncs pan/zoom interaction state back into shared `useReactFlow` and `useMisc` flags so DOM-backed section internals still receive the expected viewport-interaction signals.
  - Added a stable `graph-substrate-canary-viewport` test target so automated checks can read the live transform directly.
  - Updated `frontend/tests/e2e/settings/settings-view-modes.spec.ts` with a focused canary pan/zoom proof on the custom surface while keeping the existing drag proof on the same slice.
- Verification:
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary (drags one section and persists the top-level layout|pans and zooms one section on the custom surface)'`
    - result: passed (`2 passed`, about `26s`)
  - CDP visual check
    - result: passed
    - note: on `http://127.0.0.1:3075/settings`, `All Settings` showed `graph-substrate-canary`, `.react-flow__pane` stayed absent, background pan changed the live viewport transform while the DOM-backed section remained attached, wheel zoom changed the viewport scale from `1.94099` to `2.70719`, and no error boundary/crash surfaced
- Conclusion:
  - the checked canary now owns drag, pan, and zoom on the new substrate for one normal-zoom `settings` section
  - Gate 0 no longer lacks viewport ownership on this slice; the remaining near-term risk is DOM interaction/editing handoff on the same custom surface
- Next action:
  - prove one representative DOM-backed interaction/editing path still works correctly after the custom substrate takes drag/pan/zoom ownership, then expand canary coverage only if that handoff is stable

LOOP_TERMINAL_MARKER: none

## 2026-04-02 002

- Item: Add the first shared graph-substrate viewport transform helpers and route existing viewport math through them.
- Status: `done`
- Details:
  - Added `frontend/src/components/Pages/Project/graphSubstrate/viewportTransform.ts` as a pure source of truth for:
    - world-to-screen and screen-to-world point conversion
    - world/screen delta conversion
    - anchored zoom around a screen point
    - fit-to-bounds viewport resolution
  - Added focused Vitest coverage in `frontend/src/components/Pages/Project/graphSubstrate/viewportTransform.test.ts`.
  - Routed existing `xyflow` point conversion and fit-to-bounds math through the new helper in `frontend/src/forks/xyflow/core/utils/graph.ts`.
  - Routed `setCenter` through the same helper in `frontend/src/forks/xyflow/core/hooks/useViewportHelper.ts` so the current app path already shares the new transform contract.
  - This is still foundation work only:
    - no custom graph/runtime seam yet
    - no custom drag ownership yet
    - no Pixi body rendering
- Verification:
  - `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/viewportTransform.test.ts src/forks/xyflow/core/utils/graph.test.ts`
    - result: passed (`19 passed`)
  - CDP visual check
    - result: passed
    - note: fresh sub-agent bootstrap smoke opened the worktree bootstrap URL, observed redirects to `/home` and `/settings`, and saw no blank-screen regression on the settings surface
  - `pnpm -C frontend exec eslint src/components/Pages/Project/graphSubstrate/viewportTransform.ts src/components/Pages/Project/graphSubstrate/viewportTransform.test.ts src/forks/xyflow/core/hooks/useViewportHelper.ts src/forks/xyflow/core/utils/graph.ts`
    - result: not run cleanly
    - note: existing frontend eslint config failed to resolve `@eslint/js` in this environment; no dependency changes were made
- Conclusion:
  - the rewrite now has a reusable transform contract that is already exercised by the current app path
  - the next slice should stop at the nearest real composition boundary and introduce a `settings`-only custom viewport/runtime seam rather than another utility-only hop
- Next action:
  - add a stable custom viewport state model plus the first `settings` canary seam that consumes `viewportTransform.ts`

LOOP_TERMINAL_MARKER: none

## 2026-04-02 003

- Item: Land the first `UIPage`-level `settings` graph-substrate canary that renders one DOM-backed section outside `xyflow`.
- Status: `done`
- Details:
  - Added `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx`.
  - Added `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.ts` plus focused model coverage.
  - `frontend/src/components/Pages/Project/UiPage.tsx` now makes the first real implementation choice in this rewrite:
    - `settings` project + `All Settings` view mode uses the custom graph-substrate canary
    - all other routes/view modes still use legacy `ReactFlow`
  - The canary currently renders one visible top-level section with the existing DOM `SectionContainer` on a custom transformed surface.
  - The canary mirrors the current custom viewport into `useReactFlow` state so section internals that still read shared zoom continue to see the right transform on this slice.
  - Updated `frontend/tests/e2e/settings/settings-view-modes.spec.ts` so the `All Settings` expectation now checks for the custom canary rather than assuming the old all-`ReactFlow` path.
  - This intentionally stops the seam-lift lane at `UIPage`; the next useful work is interaction ownership inside the canary, not forwarding the same contract through more wrappers.
- Verification:
  - `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.test.ts`
    - result: passed (`3 passed`)
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts`
    - result: passed (`2 passed`, about `22s`)
  - CDP visual check
    - result: passed
    - note: the inherited bootstrap token/session was stale at first; one allowed `./aireset.sh` recovery started a fresh session and the follow-up CDP check on `http://127.0.0.1:3076/settings` verified:
      - `graph-substrate-canary` visible
      - exactly one `graph-substrate-canary-section` visible
      - surface not blank
      - `.react-flow__pane` absent on `All Settings`
- Conclusion:
  - the rewrite now has its first real product seam and no longer depends on `xyflow` ownership for the checked `UIPage` canary route selection
  - Gate 0 still is not complete because drag/pan/zoom ownership has not moved onto the new surface yet
- Next action:
  - implement top-level section drag on `SettingsGraphSubstrateCanary` and prove the DOM body stays attached while moving

LOOP_TERMINAL_MARKER: none

## 2026-04-02 004

- Item: Add custom top-level drag ownership to the `settings` graph-substrate canary and harden the shared viewport helpers for non-`xyflow` routes.
- Status: `done`
- Details:
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx` now owns drag on the checked canary slice instead of falling back to `xyflow` drag ownership.
  - The canary keeps a preferred visible section selected while dragging so the rendered card does not swap to another top-left candidate mid-move.
  - The canary uses a local position override during drag, then commits the final top-level position through the existing top-level layout persistence path on release.
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.ts` now prefers live `nodeInternals` geometry and supports preferred-section selection.
  - `frontend/src/forks/xyflow/core/hooks/useViewportHelper.ts` now no-ops when `d3Zoom` / `d3Selection` are absent, which fixes the canary-route crash that CDP found after the first drag implementation.
  - Added `frontend/src/forks/xyflow/core/hooks/useViewportHelper.test.ts` to lock down the null-d3 guard.
  - Updated `frontend/tests/e2e/settings/settings-view-modes.spec.ts` so the drag proof:
    - finds a real draggable point inside the canary section
    - verifies drag activation and movement
    - restores both top-level layout and the original active view mode afterward
- Verification:
  - `pnpm -C frontend exec vitest run src/forks/xyflow/core/hooks/useViewportHelper.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.test.ts src/components/Pages/Project/graphSubstrate/viewportTransform.test.ts`
    - result: passed (`14 passed`)
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts`
    - result: passed (`3 passed`, about `32s`)
  - CDP visual check
    - result: passed
    - note: on `http://127.0.0.1:3075/settings`, `graph-substrate-canary` was visible, `.react-flow__pane` stayed absent on `All Settings`, the canary section body remained attached to its shell/header during drag and after release, and no route crash/error boundary appeared after drop
- Conclusion:
  - Gate 0 drag ownership now exists on the new substrate for the checked `settings` canary slice
  - the next useful frontier is custom pan/zoom ownership on the same surface, not more seam lifting or harness-only cleanup
- Next action:
  - implement custom pan/zoom on `SettingsGraphSubstrateCanary` and prove the DOM-backed section stays attached and visually stable during pan/zoom as well

LOOP_TERMINAL_MARKER: none

## 2026-04-02 006

- Item: Fix and prove section-title editing on the `settings` graph-substrate canary after custom pan/zoom ownership.
- Status: `done`
- Details:
  - `frontend/src/components/Section/Header/SectionTitle.tsx` now wraps editable section titles in both `nodrag` and `setta-prevent-section-on-click-trigger`.
  - This stops the custom canary section container from treating title double-clicks as drag starts and also avoids parent section activation consuming the same interaction.
  - `frontend/tests/e2e/settings/settings-view-modes.spec.ts` now includes a focused canary test that:
    - opens `All Settings`
    - pans and zooms the custom surface
    - double-clicks the visible section title into edit mode
    - renames the section through the DOM header input
    - restores the original section name afterward
- Verification:
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary (drags one section and persists the top-level layout|pans and zooms one section on the custom surface|keeps title editing working after pan and zoom)'`
    - result: passed (`3 passed`, about `37s`)
  - CDP visual check
    - result: passed
    - note: on `http://127.0.0.1:3075/settings`, `All Settings` showed the `gui` canary section title inside a `nodrag setta-prevent-section-on-click-trigger` wrapper, and double-clicking that title converted it into a focused header `input` on the live custom surface
- Conclusion:
  - the one-section `settings` graph-substrate canary now has a proven DOM-backed editing handoff after custom drag/pan/zoom ownership
  - the active Gate 0 interaction/editing gap on the checked slice is closed
- Next action:
  - expand the custom substrate beyond one top-level `All Settings` section while keeping DOM-backed bodies attached, interactive, and not obviously worse than the DOM baseline

LOOP_TERMINAL_MARKER: none

## 2026-04-02 010

- Item: Restore saved `All Settings` viewport handoff on the graph-substrate canary instead of always falling back to a fresh fit during view-mode remount.
- Status: `done`
- Details:
  - Added `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewport.ts` with focused Vitest coverage in `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewport.test.ts`.
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx` now resolves its initial viewport from the authoritative shared camera state before using the top-left fallback seed.
  - The canary now also adopts the shared `useReactFlow` / project viewport when that saved state arrives after an initial auto-fit during view-mode handoff, while still preserving user-owned pan and wheel zoom once interaction begins.
  - `frontend/tests/e2e/settings/settings-view-modes.spec.ts` now proves the checked restore path by saving an `All Settings` viewport, switching `All Settings -> Core -> All Settings`, and asserting that the canary restores the persisted transform.
- Verification:
  - `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewport.test.ts`
    - result: passed (`3 passed`)
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary restores the persisted shared viewport on All Settings'`
    - result: passed (`1 passed`, about `41s`)
  - CDP visual check
    - result: passed for the viewport-restore question, with remaining drift explicitly noted
    - note:
      - worktree after `Core -> All Settings`: restored non-fit camera state with viewport transform `translate(435.661px, 104.839px) scale(0.187602)`
      - `main` after `Core -> All Settings`: restored a more zoomed-out camera state with viewport transform `translate(779.9px, -51.7px) scale(0.1)`
      - the canary no longer appears to be blindly re-fitting on this path, but the restored framing still does not match `main`
- Conclusion:
  - this closes the bounded persistence bug where the canary could lose the saved `All Settings` camera state during remount handoff
  - the next blocker is no longer "restore is broken"; it is the remaining Gate 1 framing drift versus `main`
- Next action:
  - inspect why the worktree’s saved/restored `All Settings` camera state still differs from `main`, then land the narrowest viewport-alignment fix rather than more restore plumbing

LOOP_TERMINAL_MARKER: none

## 2026-04-02 012

- Item: Align the `All Settings` canary's first auto-fit with legacy visible-center and initial max-zoom semantics, then re-run the cleared-viewport oracle compare.
- Status: `done`
- Details:
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewport.ts` now exports `fitSettingsGraphSubstrateCanaryViewport(...)` to keep the canary's first fit rules explicit and testable.
  - That helper now:
    - shifts the fit center by `overviewTrueWidth` instead of centering inside the raw wrapper
    - caps the initial fit zoom to `defaultZoomLevel`, matching legacy `fitView({ initial: true })`
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx` now uses that helper for its initial `All Settings` auto-fit.
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewport.test.ts` now locks down the overview-offset + initial-zoom-cap behavior.
  - Because CDP was still inaccessible at the start of this iteration, one allowed local self-recovery ran:
    - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
    - the restarted worktree came back on frontend `http://127.0.0.1:3077/` and backend `http://127.0.0.1:8077`
  - A fresh CDP compare after that restart showed the remaining product blocker clearly:
    - worktree `All Settings`: still framed much tighter, with only a few larger cards centered in the canvas
    - `main` `All Settings`: more zoomed out, with a denser vertical field of smaller cards
  - This means the remaining drift is not explained by the old fallback echo, the missing overview offset, or the missing initial zoom cap.
- Verification:
  - `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewport.test.ts`
    - result: passed (`6 passed`)
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary preserves the All Settings multi-column spread on first render|settings graph substrate canary restores the persisted shared viewport on All Settings'`
    - result: passed (`2 passed`, about `50s`)
  - CDP visual check
    - result: done
    - note:
      - after the restart, a fresh side-by-side compare against read-only `main` succeeded
      - the worktree still fits `All Settings` noticeably tighter than `main`, so the Gate 1 drift remains active
- Conclusion:
  - the canary now matches legacy visible-center and initial max-zoom semantics for its first fit
  - the remaining mismatch is now more likely in scene bounds / measured section sizes than in raw viewport-center math or saved-viewport ownership
- Next action:
  - inspect the canary's cleared-viewport bounds inputs versus the legacy visible-section fit inputs on `All Settings`, and fix whichever size/source mismatch is undercounting the visible field

LOOP_TERMINAL_MARKER: none

## 2026-04-02 017

- Item: Make `start-browser-mcp.sh` compatible with macOS `/bin/bash` so Ralph's headless lifecycle can actually launch DevTools Chrome on this worktree.
- Status: `done`
- Details:
  - The live `run-003/worktree-ai.log` failure was not another generic bootstrap miss; the launcher itself was crashing before Chrome started:
    - `/Users/jeff/Documents/_projects/setta.pixijs-graph/scripts/start-browser-mcp.sh: line 102: local: -n: invalid option`
  - `scripts/start-browser-mcp.sh` no longer uses the Bash-4-only `local -n` nameref helper when building Chrome argv arrays.
  - The same script now appends optional headless/custom Chrome args with explicit array concatenation, which preserves the item-016 empty-arg fix while remaining compatible with macOS `/bin/bash` 3.2.
  - `tests/start/test_start_browser_mcp_script.py` now invokes the launcher through `/bin/bash` when it exists, so the direct script coverage matches the shell Ralph actually used in the failing lifecycle run.
- Verification:
  - `source activate.sh && pytest tests/start/test_start_browser_mcp_script.py`
    - result: passed (`3 passed`, about `2s`)
  - isolated live smoke
    - command:
      - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 DEBUG_PORT=9693 MCP_RUN_DIR=<tmp> PROFILE_DIR=<tmp> /bin/bash ./scripts/start-browser-mcp.sh --devtools --browser-mode headless`
      - `curl -fsS --max-time 3 http://127.0.0.1:9693/json/version`
    - result: passed (returned the Chrome DevTools JSON payload after two short retry polls)
- Conclusion:
  - the headless launcher now works on the system Bash that the Ralph lifecycle actually used
  - this iteration intentionally stopped at the launcher fix; it did not yet rerun the fresh worktree-vs-`main` strict cleared-viewport compare
- Next action:
  - rerun the normal Ralph-managed worktree and `main` `ai` lifecycles with the updated launcher, then retry the strict `All Settings` cleared-viewport CDP compare before touching more canary bounds/state code

LOOP_TERMINAL_MARKER: none

## 2026-04-02 018

- Item: Align the `All Settings` canary fit inputs with the selector's section-size contract so the initial normal-zoom framing no longer undercounts the visible field.
- Status: `done`
- Details:
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryBounds.ts` now merges selector-provided section sizes with observed DOM sizes instead of requiring observed sizes alone for every visible section.
  - The bounds helper now uses the larger available width/height per section, which preserves legacy node-internal fit geometry while still expanding to larger real DOM boxes when fallback sizing lags.
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryBounds.test.ts` now covers:
    - waiting until each section has some usable size source
    - preferring larger observed sizes when they exceed fallback values
    - preserving larger selector sizes when the observed DOM box is smaller
  - A fresh-context CDP compare then checked worktree `http://127.0.0.1:3075/settings` against read-only `main` `http://127.0.0.1:3087/settings`; after minimizing the worktree chat surface, the normal-zoom `All Settings` framing no longer looked materially tighter than `main`.
- Verification:
  - `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryBounds.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewport.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.test.ts`
    - result: passed (`13 passed`)
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary preserves the All Settings multi-column spread on first render'`
    - result: passed (`1 passed`, about `24s`)
  - CDP visual check
    - result: done
    - note:
      - fresh-context sub-agent inspected worktree and `main` `/settings` directly
      - worktree chat surface minimized before the compare
      - no material remaining tightness difference seen at normal zoom
- Conclusion:
  - the canary bounds lane is no longer the active blocker for the checked normal-zoom `All Settings` path
  - the next iteration should move to the next earliest visible parity or interaction defect instead of continuing fit-math churn
- Next action:
  - use CDP on the same `All Settings` normal-zoom canary to identify the next Gate 1 / Gate 2 product defect, with priority on text/chrome drift, zoom artifacts, or interaction-state behavior

LOOP_TERMINAL_MARKER: none
