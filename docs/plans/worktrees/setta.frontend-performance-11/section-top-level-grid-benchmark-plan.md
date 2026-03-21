# Section Top-Level Grid Benchmark Plan

Date: 2026-03-20
Worktree: `setta.frontend-performance-11`
Current branch: `frontend-performance-11`
Current HEAD at start: `189ba8211`
Comparison target: `bf6487690`
Related log: `docs/plans/worktrees/setta.frontend-performance-11/section-top-level-grid-benchmark-log.md`

## Goal

Determine whether removing the top-level section grid from `sectionChrome` was actually worth it, or whether the codebase should keep grid at the top-level section surface while continuing to flatten nested layout shells.

## Question

Compare the current branch state against `bf6487690`, which is the last commit before top-level section grid removal started, and measure whether the current `windowFlow` top-level section surface performs better, worse, or about the same on a dense settings canvas.

## Scenario

- Primary screen: `/settings`
- Primary tab/view: `All Settings`
- Why this screen:
  - it is a dense settings canvas with many top-level dict-style sections
  - it exercises the same section surface ownership that the `sectionChrome` top-level grid/windowFlow change touched
  - it is a better “complex layout” representative than a tiny isolated section

## Interactions To Measure

Use the same interaction loop on both commits:

1. Sweep horizontally across the full visible project width at a zoomed-in pan scale, then reset.
2. Sweep vertically across the full visible project height at the same pan scale, then reset.
3. Zoom from a fit-to-project overview into a close detail scale in one continuous pass, then return toward the overview scale.
4. Run a smaller detail zoom pulse near the close scale.
5. Resize one representative settings section by a calibrated visible-width delta, then return it near the original size.

## What To Compare

- DevTools `Performance` trace summaries for pan, zoom, and resize
- obvious differences in long tasks, scripting, layout, and paint cost
- any visible smoothness differences during the same interaction loop
- whether the current branch meaningfully beats `bf6487690`

## Success Criteria

- If the current branch is clearly better on the settings canvas, keep the top-level removal direction.
- If it is flat or worse, treat that as evidence that removing top-level section grid was not worth the churn.
- Nested shell flattening is a separate question and should not be conflated with the top-level grid decision.

## Execution Notes

- Use Chrome DevTools MCP only.
- Use the existing Chrome DevTools browser windows, not other browsers.
- Keep the benchmark log append-only.
- Reusable replay helper:
  - `perf/scripts/settingsTopLevelGridBenchmarkReplay.js`
- Reusable trace summarizer:
  - `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`
- Treat the authoritative current-branch trace as the post-`ai.sh` rerun captured from `http://127.0.0.1:3011/settings`.
- The earlier pre-restart current trace on `http://127.0.0.1:3111/settings` stays as a superseded artifact only.
- If machine-load noise is suspected, rerun the same settings loop with the user idle and record whether the current branch paint totals stay materially above the baseline.
- For geometry-matched resize probes, note the synthetic drag delta needed to expand `groupSectionDefault` from about `55.7px` to about `73.7px` visible width on each commit.
- Record:
  - exact URLs
  - exact commit ids
  - any viewport/zoom normalization notes
  - before/after interpretation
