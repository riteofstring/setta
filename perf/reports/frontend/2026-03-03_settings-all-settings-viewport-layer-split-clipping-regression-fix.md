# Settings All Settings Viewport Layer Split Clipping Regression Fix

Date: 2026-03-03
Area: frontend
Implementation status: **Kept (correctness fix), previous throughput claim corrected**.

## Goal

Fix a rendering regression reported in `Settings -> All Settings` where only a subset of sections rendered in the main canvas and some visible sections were clipped.

## User-Visible Regression

- In some projects/view states, the viewport showed only a few section cards while minimap still showed the full graph.
- Visible cards could appear cut off by an internal clipping boundary.

## Root Cause

- `.setta-viewport-dom-layer` used `contain: paint` while the parent viewport was transform-scaled.
- Paint containment clips descendants to the wrapper's local bounds.
- Under pan/zoom/fit-view, this became a world-coordinate clip window rather than a stable screen-space viewport clip.
- Result: sections outside that local clip window were not painted.

## Code Changes

- Removed paint containment from the split wrapper:
  - `frontend/src/forks/xyflow/core/styles/style.css`
  - `.setta-viewport-dom-layer` no longer uses `contain: paint`.
- Kept existing split wrapper structure (no behavior rewrite).
- Strengthened guardrail coverage:
  - `frontend/tests/e2e/settings/settings-all-settings-viewport-layer-split-guardrail.spec.ts`
  - Added `visibleSectionCount` metric and assertion (`>= 30`) to catch clipping regressions.
  - Lowered throughput assertions to realistic non-artifact bounds (`pan/zoom > 25`) for this corrected implementation.

## Verification

- Vitest:
  - `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/viewportLayerSplitFlag.test.ts`
  - Result: `1 passed`, `4 tests`.

- Playwright guardrail:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-viewport-layer-split-guardrail.spec.ts`
  - Result sample:
    - `pan=36.4`, `zoom=35.5`
    - `viewportLayerSplitEnabled=true`
    - `topLevelSectionCount=42`
    - `visibleSectionCount=42`

- Playwright baseline A/B:
  - Default path (split enabled by default-on):
    - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
    - sample: `pan=36.3`, `zoom=34.8`, `visibleSectionCount=42`
  - Control forced off:
    - `PLAYWRIGHT_ENABLE_VIEWPORT_LAYER_SPLIT=0 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
    - sample: `pan=37.1`, `zoom=35.3`, `visibleSectionCount=42`

- CDP visual validation:
  - `perf/artifacts/frontend/2026-03-03_viewport-layer-split-clipping-fix_visual-check.png`
  - Verified that All Settings renders a broad section set without the prior internal clip/cutoff artifact.

## Correction To Earlier Interpretation

- Earlier high pan/zoom measurements tied to this split path were not robust.
- The apparent large gain depended on clipping behavior from paint containment and did not generalize safely across project/layout states.
- After removing clipping behavior, split-on and split-off throughput are near parity in this benchmark.

## Conclusion

- The clipping regression is fixed.
- This path should no longer be treated as a validated high-throughput pan/zoom optimization in its current form.
- It remains a structural hook, but additional fundamental work is still required for real pan/zoom wins.
