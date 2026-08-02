# frontend performance profiling

This doc is a pragmatic workflow for finding and fixing frontend rendering and performance problems in the React/Vite UI. The goal is to turn "feels slow" into a concrete cause you can measure and fix.

## quick triage

1) Reproduce the slowdown with one repeatable interaction (click, scroll, type). Keep it consistent.
2) Profile in dev first, then verify in a production build once you have a lead.
3) Reduce noise: close other tabs, disable extensions, and keep your device on a stable power mode.

## primary tool: react devtools profiler

The React Profiler is usually the fastest path to root cause for rendering issues.

1) Open React DevTools, go to the Profiler tab, click Record, perform the slow interaction, then Stop.
2) Sort by "Commit duration" and "Wasted renders".
3) Click the slow commit and inspect the component list and "Why did this render?" section.

Signals to watch:
- Many components re-rendering with small commit times: state or context updates propagating too far.
- Few components with very long commits: heavy render work, expensive calculations, or large lists.

## isolating react rerenders

Target the biggest offenders first, then confirm the change has a measurable impact.

- Unstable props: inline objects, arrays, or functions passed as props will change identity every render.
  - Fix by extracting objects, or using `useMemo` / `useCallback` only where it reduces rerenders.
- Context updates: a single context provider can trigger large rerender cascades.
  - Split context or move state closer to the component that needs it.
- Derived data: expensive calculations in render can dominate commit time.
  - Move to memoized selectors or precompute outside of render.

## chrome devtools performance tab

Use Chrome's Performance tab once you have a suspect area and want to drill into JavaScript or layout work.

1) Record a trace while reproducing the slow interaction.
2) Use "Bottom-Up" to find hot functions.
3) Inspect the Main thread for:
   - Long "Scripting" blocks: heavy JS, expensive render/effects, or large state updates.
   - Long "Rendering" / "Painting": layout or paint issues, often CSS or DOM size related.

Tip: enable Web Vitals and Screenshots so you can correlate the timeline with the exact visual stutter.

## layout and paint issues

If the slowdowns feel like janky scrolling or delayed animations, check for:
- Large DOM trees or deeply nested layout containers.
- Expensive CSS effects (filters, box-shadows, or large fixed-position layers).
- Frequent layout thrash from reading and writing layout in the same frame.

## quick signal boosters

- Enable "Highlight updates" in React DevTools to visualize rerenders.
- Add temporary timing logs around suspicious logic, then remove them after confirming.
- If you suspect wasted renders, `why-did-you-render` can help during a short, dev-only session.

## common root causes

- State changes at too high a level in the tree.
- Inline props causing referential churn.
- Large lists rendered without virtualization.
- Effects that run too often or do heavy work.
- Expensive layout or paint on every frame.

## confirm the fix

Re-run the same profiler session and compare:
- Commit duration before/after.
- Number of components rerendered.
- User-visible improvement in the original interaction.

If the improvement only appears in dev, double-check with a production build to confirm the actual user impact.

## repo reporting workflow

When performance work changes production code, keep the measurements in-repo:

- Write the baseline and follow-up results under `perf/reports/<area>/...`.
- Keep traces, screenshots, and other heavy artifacts under `perf/artifacts/`
  instead of committing them.
- Append reruns or corrections instead of rewriting earlier measurements.

Concrete example:

- `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`
  shows a full Settings `All Settings` pan/zoom investigation, including DOM
  stage breakdowns, activation measurements, and the follow-up validation for
  the split `useActiveSectionUI` selection path that this repo uses for
  immediate active-section UI state.
