# Minimap Iterative Optimization Ladder

Date: 2026-03-06
Area: frontend
Code paths touched:
- `frontend/src/forks/xyflow/minimap/MiniMap.tsx`
- `frontend/src/components/ProjectConfigs/ProjectConfigPreview.tsx`
- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`

## Goal

- Build a commit-by-commit optimization ladder for the live project minimap.
- Keep stage 1 feature-preserving, then remove one concrete minimap behavior at a time in later stages.
- Record enough data at each step that the final tradeoff can be chosen after the work is done.

## Current Preference

- 2026-03-07: the preferred stopping point is stage 1 (`388af6b12`), because it improves minimap performance without removing visible minimap features.

## Historical Baseline (Original 2026-03-06 Capture)

- Page: `/settings` -> `All Settings`
- Visible nodes: `42`
- Viewport: `1600x1000`
- Browser: Chrome via `chrome-devtools-mcp`
- Settings:
  - no CPU throttling
  - no network throttling
  - one warm-up run, then three measured runs per configuration
- Interaction:
  1. fit view
  2. repeated wheel pan
  3. `Ctrl` + wheel zoom in
  4. more pan
  5. `Ctrl` + wheel zoom out
  6. more pan

| Config | Median scenario ms | Avg frame gap ms | P95 frame gap ms | Frames >33 ms | Est. dropped frames | Trace `RunTask` total ms | Trace paint+layout ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| With minimap + grid | 2125.8 | 20.76 | 34.2 | 14 | 14 | 5874.60 | 171.41 |
| No minimap + grid | 1975.0 | 19.36 | 33.3 | 5 | 4 | 5387.26 | 70.35 |
| No minimap + no grid | 1960.9 | 19.16 | 33.4 | 5 | 5 | 5312.99 | 2.50 |

This historical baseline is the motivation for the minimap work. The remaining stages in this document use the same screen and browser session, but a more explicit scripted wheel sequence so each cumulative commit can be re-run quickly and consistently.

## Iterative Harness (Used For Stage 1+)

- Page: `http://127.0.0.1:3008/settings`
- Screen state:
  - `All Settings` tab selected
  - viewport resized to `1600x1000`
  - no CPU throttling
  - no network throttling
- Input sequence per run:
  1. fit view
  2. run two cycles of:
     - `18` wheel-pan events (`deltaX=64`, `deltaY=20`)
     - `10` `Ctrl` + wheel zoom-in events (`deltaY=-8`)
     - `14` wheel-pan events (`deltaX=-56`, `deltaY=28`)
     - `10` `Ctrl` + wheel zoom-out events (`deltaY=8`)
     - `14` wheel-pan events (`deltaX=56`, `deltaY=-28`)
- Sampling:
  - one warm-up run, then three measured runs
  - in-page `requestAnimationFrame` tracking during the scripted interaction
  - one DevTools trace per stage for the `minimap + grid` configuration

## Stage 1: Feature-Preserving Canvas Node Layer

Change:
- Replace the default live minimap node layer with a single canvas draw pass.
- Keep the interactive SVG overlay for click-to-center, viewport mask, and optional node hit-testing.
- Keep the generic `MinimapSvg` path usable by `ProjectConfigPreview`.
- Add renderer-agnostic test hooks so E2E coverage no longer assumes one SVG `<rect>` per minimap node.

Behavior kept:
- click-to-center still works
- live viewport mask still updates during pan/zoom
- minimap remains visible and interactive
- `ProjectConfigPreview` still renders through `MinimapSvg`

Scenario medians from the iterative harness:

| Config | Median scenario ms | Avg frame gap ms | P95 frame gap ms | Frames >33 ms | Est. dropped frames | Max frame gap ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| With minimap + grid | 2791.6 | 19.27 | 25.10 | 0 | 13 | 26.0 |
| No minimap + grid | 2683.3 | 18.52 | 25.10 | 0 | 16 | 25.7 |
| No minimap + no grid | 2589.6 | 17.88 | 25.10 | 0 | 9 | 25.3 |

Trace sample for `with minimap + grid`:
- Main renderer thread `RunTask`: `3827.03ms`
- Main renderer thread paint + layout: `60.46ms`
- Main renderer thread pre-paint: `14.34ms`
- Main renderer thread style recalc (`UpdateLayoutTree`): `15.53ms`

Takeaways:
- In this harness, the feature-preserving canvas renderer leaves `minimap + grid` about `4.0%` slower than `no minimap + grid`.
- Grid cost is still real even after the minimap is off: `no minimap + grid` is about `3.6%` slower than `no minimap + no grid`.
- The remaining gap is now small enough that stronger tradeoff stages can focus on the last live-update behaviors instead of the basic node renderer.
- Current preference: stage 1 is the accepted version, even though later stages benchmark faster.

Raw artifact:
- `perf/artifacts/2026-03-06_minimap-iterative/stage1-feature-preserving.trace.json`

## Automated Coverage

- Vitest:
  - `frontend/src/forks/xyflow/minimap/MiniMap.test.ts`
- Playwright:
  - `frontend/tests/e2e/settings/settings-view-modes.spec.ts`
  - Added a minimap click-to-center assertion and made node counting renderer-agnostic.

## Stage 2: Clamp Minimap Bounds To Content

Change:
- Stop expanding the minimap world bounds to include the live viewport.
- Compute minimap scale from the visible node bounds only, then draw the live viewport mask inside that fixed content-bounds coordinate system.

Behavior removed:
- When the viewport drifts outside the actual section layout, the minimap no longer preserves that extra whitespace in its own coordinate system.
- In practice, this means the viewport mask can pin against the minimap edge or clip away once the canvas is panned far enough beyond the nodes.

Behavior kept:
- click-to-center still works
- minimap nodes still stay live after layout changes
- viewport mask still updates live during pan/zoom

Scenario medians from the iterative harness (`with minimap + grid`):
- Median scenario: `2725.1ms`
- Avg frame gap: `18.81ms`
- P95 frame gap: `25.10ms`
- Frames `>33ms`: `0`
- Estimated dropped frames: `13`
- Max frame gap: `26.4ms`

Trace sample for `with minimap + grid`:
- Main renderer thread `RunTask`: `3284.91ms`
- Main renderer thread paint + layout: `59.82ms`
- Main renderer thread pre-paint: `8.73ms`
- Main renderer thread style recalc (`UpdateLayoutTree`): `15.02ms`

Delta vs stage 1:
- Scenario median: `-66.5ms` (`-2.4%`)
- Avg frame gap: `-0.46ms` (`-2.4%`)
- Main renderer `RunTask`: `-542.12ms` (`-14.2%`)

Takeaway:
- This is the first feature tradeoff that clearly reduces main-thread work without changing the visible minimap at rest.
- Most of the gain comes from making pan-only movement stop invalidating the node projection math.

Raw artifact:
- `perf/artifacts/2026-03-06_minimap-iterative/stage2-content-bounds-only.trace.json`

## Stage 3: Static Thumbnail, No Viewport Mask

Change:
- Remove the viewport mask entirely.
- Keep the minimap node thumbnail and click-to-center interaction, but stop subscribing the minimap to live viewport changes.

Behavior removed:
- No live viewport box or mask is shown.
- The minimap becomes a static thumbnail plus click target rather than a live viewport preview.

Behavior kept:
- minimap stays visible
- click-to-center still works
- node geometry still refreshes after layout changes

Scenario medians from the iterative harness (`with minimap + grid`):
- Median scenario: `2674.9ms`
- Avg frame gap: `18.46ms`
- P95 frame gap: `25.00ms`
- Frames `>33ms`: `0`
- Estimated dropped frames: `9`
- Max frame gap: `25.8ms`

Trace sample for `with minimap + grid`:
- Main renderer thread `RunTask`: `3197.65ms`
- Main renderer thread paint + layout: `53.87ms`
- Main renderer thread pre-paint: `7.57ms`
- Main renderer thread style recalc (`UpdateLayoutTree`): `9.30ms`

Delta vs stage 2:
- Scenario median: `-50.2ms` (`-1.8%`)
- Avg frame gap: `-0.35ms` (`-1.8%`)
- Main renderer `RunTask`: `-87.26ms` (`-2.7%`)

Delta vs the stage-1 no-minimap reference:
- Compared to `no minimap + grid` (`2683.3ms`), this stage is within noise at `-8.4ms` (`-0.3%`).
- Compared to `no minimap + no grid` (`2589.6ms`), the remaining gap is basically the grid itself plus normal trace variance.

Takeaway:
- Removing the viewport mask is the first tradeoff stage that effectively erases the remaining minimap tax in this harness.
- If live viewport context is important, stage 2 is the better stopping point.
- If performance parity with `showMinimap=false` matters more than live viewport feedback, this stage is the strongest minimap-on option.

Raw artifact:
- `perf/artifacts/2026-03-06_minimap-iterative/stage3-static-thumbnail-no-mask.trace.json`
