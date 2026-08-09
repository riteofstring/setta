# UI Polish Phase 7 File Browser + Chat Activity Verification

Date: 2026-03-12
Area: frontend
Branch/Commit: misc-fixes @ `3bf4b2672`

## Goal

Validate that the completed UI-polish work did not introduce obvious interaction regressions in the two highest-risk surfaces from the plan:

- home/workspace file-browser interaction on the new narrow-desktop focused-pane path
- project chat activity accordion toggle + message-list scroll behavior

## Scenario

- Browser + OS: Chrome via `chrome-devtools-mcp` on macOS, no CPU or network throttling
- Dev instance: existing worktree dev browser at `http://127.0.0.1:3026`
- Notes:
  - This was a verification/profiling pass, not a before/after refactor benchmark
  - Raw traces were saved locally under `perf/artifacts/` and are gitignored

## Home File Browser

- Entry point: `http://127.0.0.1:3026/home`
- Viewport: `1120x900`
- Setup:
  - forced the home workspace pane open at the new focused full-width width (`1080px`)
  - right home pane closed
- Interaction measured:
  - repeated `frontend` folder expand/collapse + `docs` folder expand/collapse 5 times each (20 toggle actions total)
- Measurement method:
  - DevTools Performance trace (`performance_start_trace` / `performance_stop_trace`)
  - in-page `performance.now()` around the scripted interaction loop
- Key metrics:
  - interaction loop elapsed: **1949.9ms** total for 20 folder toggles
  - average: **97.5ms per folder toggle**
  - trace insight summary: **CLS 0.02**
- Observations:
  - No navigation or network churn occurred during the loop
  - DevTools surfaced only a small CLS cluster during row expansion/collapse, with no concrete culprit frame attributed
  - The focused full-width narrow-home pane behavior did not show a new catastrophic layout/paint regression in this trace

## Project Chat Activity

- Entry point: `http://127.0.0.1:3026/branch_showing`
- Surface: existing Project AI chat history on the canvas page
- Interaction measured:
  - toggle the first visible activity accordion open/closed 5 times (10 toggle actions)
  - then run 3 down/up message-list scroll jumps on the chat scroll container
- Measurement method:
  - DevTools Performance trace (`performance_start_trace` / `performance_stop_trace`)
  - in-page `performance.now()` around the toggle loop and scroll loop
- Key metrics:
  - activity toggle loop elapsed: **707.8ms** total for 10 toggles
  - average: **70.8ms per toggle**
  - scroll loop elapsed: **199.9ms** total for 6 scroll jumps
  - combined interaction elapsed: **907.7ms**
  - trace insight summary: **CLS 0.00**
- Observations:
  - DevTools flagged one forced-reflow insight totaling **44ms**, attributed mainly to Radix accordion measurement in `@radix-ui/react-accordion`
  - A much smaller secondary reflow (`0.2ms`) came from `checkScrollable` in `frontend/src/state/hooks/sectionSizes.ts`
  - The forced reflow appears bounded to explicit accordion toggles rather than passive chat scrolling

## Conclusion

- What looked good:
  - The new narrow-home focused-pane behavior stayed visually stable enough for a low CLS trace on repeated file-browser interaction
  - Chat activity scrolling stayed at **0.00 CLS** in the sampled project and did not reveal a broad scroll-path regression
- What still deserves attention:
  - Chat activity toggles still incur a measurable Radix accordion forced reflow during open/close
  - The current trace does not prove this is user-visible in normal usage, but it is the clearest remaining hotspot from this verification pass
- Follow-ups:
  - If chat activity sections become heavier again, revisit accordion measurement cost before adding more per-row chrome
  - If file-browser row expansion becomes more animated or more nested, re-run the same home trace on a larger folder tree

## Raw Artifacts (local-only)

- `perf/artifacts/2026-03-12-phase7-home-file-browser-trace.json.gz`
- `perf/artifacts/2026-03-12-phase7-chat-activity-trace.json.gz`

## Automated Perf / Regression Guardrails

- Playwright:
  - `frontend/tests/e2e/home/home-file-manager.spec.ts`
  - `frontend/tests/e2e/chat/chat-tool-calls.spec.ts`
- Vitest:
  - `frontend/src/components/Panes/paneLayout.test.ts`
  - `frontend/src/components/Chat/ChatMessages.test.tsx`
- Budgets/assertions added:
  - narrow-home rail clicks now have explicit browser + state regression coverage for focused full-width reopen behavior
