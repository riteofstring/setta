# Settings All-Settings Render Transform Coalescing

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-7 @ 1a2f277ac
Related PR: n/a

## Goal

Reduce pan/zoom jank in the Settings project `All Settings` canvas by cutting non-critical render work tied to high-frequency viewport transform updates.

## Scenario

- Entry point (URL/route/screen): `/settings` -> `All Settings` tab.
- Steps to reproduce (keep deterministic):
  - Reload page.
  - Click `All Settings`.
  - Click `reset zoom`.
  - Run CDP-evaluated script that emits 180 wheel events (`deltaY=-17`) spaced by `1ms`.
  - Observe mutation counts on:
    - `.react-flow__viewport` style attribute
    - `.react-flow__minimap-mask` (`d` attribute)
    - `#ReactFlowBackground` pattern attrs (`x/y/width/height/patternTransform`)
- Data set / project used: built-in Settings project (`All Settings`, 42 nodes in this run).
- Browser + OS: Chrome via `chrome-devtools-mcp` on macOS.
- Notes (extensions, throttling, dev/prod build, etc): dev build, no CPU/network throttling.

## Before (baseline)

- Measurement method (DevTools panels used, settings): CDP `evaluate_script` DOM-mutation microbenchmark; baseline captured by stashing this change and rerunning same script.
- Key metrics:
  - `totalMs`: `976.1ms`
  - `viewportStyleMutations`: `180`
  - `minimapMaskMutations`: `180`
  - `backgroundPatternMutations`: `180`
- Observations:
  - Non-critical consumers (minimap/background) updated once per wheel tick, matching core viewport update frequency.

## After

(Append this section after the refactor, using the same scenario + method.)

- Key metrics:
  - Run A:
    - `totalMs`: `976.4ms`
    - `viewportStyleMutations`: `180`
    - `minimapMaskMutations`: `44`
    - `backgroundPatternMutations`: `44`
  - Run B:
    - `totalMs`: `948ms`
    - `viewportStyleMutations`: `180`
    - `minimapMaskMutations`: `39`
    - `backgroundPatternMutations`: `39`
- Observations:
  - Core viewport transform path remained fully responsive (`180` updates).
  - Non-critical render-transform consumers were coalesced to ~`39-44` updates.
  - This is a `4.1x-4.6x` reduction in minimap/background update churn under the same input stream.

## Conclusion

- What improved:
  - Significant reduction in secondary pan/zoom repaint work without reducing primary viewport transform update cadence.
  - Added selector/equality fixes on heavy edge renderers to avoid unrelated rerenders.
- What regressed (if any) + why it is acceptable:
  - No behavior regression observed in targeted tests and manual Settings interaction checks.
- Follow-ups:
  - Add Playwright perf guard that asserts minimap/background mutation counts stay bounded under scripted pan/zoom input.
  - Collect a DevTools trace artifact for this same benchmark once trace automation for this scenario is added.

## Raw Artifacts (local-only)

- None saved for this run.

## Automated Perf Tests

(Optional but preferred: link automated guardrails added/updated as part of the work.)

- Playwright spec(s): none added in this change.
- Vitest test(s) / bench(es):
  - `frontend/src/forks/xyflow/core/store/renderTransformScheduler.test.ts`
- Budgets/assertions added:
  - Scheduler now enforces `maxFps` coalescing behavior with dedicated unit coverage.
