# Shared Section-Shell S0 Baseline

Date: 2026-03-16
Area: frontend
Branch/Commit: frontend-performance-11
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Lock the first shared section-shell baseline after the callable pilot so the next pass starts from section-level evidence instead of callable-only assumptions.

This baseline explicitly uses Chrome DevTools `Performance` profiling for the touched interaction paths:

- section resize
- coupled canvas pan/zoom

Automated tests remain useful later, but they are not the evidence source for this S0 read.

## Representative Scenes

- Untouched `main`: `http://127.0.0.1:3087/falling_wood`
- Worktree: `http://127.0.0.1:3011/kite_hiding`
- Locked sections on both branches:
  - `S0 Code`
  - `S0 Dict`
- Shared setup:
  - project chat windowing state cleared before capture
  - one editor-backed section (`Code`)
  - one non-editor shared-shell section (`Dict`)
- Locked `Dict` shape:
  - args: `alpha`, `beta`, `gamma`, `delta`
  - `alpha` pinned
  - `beta` edge input
  - `delta` indented under `gamma`

## Measurement Method

- Chrome DevTools DOM audit via live page script on the mounted section roots.
- Chrome DevTools element screenshots on both branches for `S0 Code` and `S0 Dict`.
- Chrome DevTools `Performance` traces for:
  - `Code` section resize
  - `Dict` section resize
  - shared pan/zoom path
- Local trace parsing for:
  - coarse shared-owner string hits
  - aggregate `UpdateLayoutTree` / `Layout` / `Commit` event totals

Notes:

- The raw trace string scan is only an ownership hint. It is not used as a timing budget.
- DevTools trace summaries for these six runs did not surface a `ForcedReflow` insight. CLS stayed `0.00`.

## DOM Audit

| Section | Branch | Nodes | Max depth | Grid | Subgrid | Wrapper-only |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Code | `main` | 101 | 12 | 3 | 0 | 4 |
| Code | worktree | 101 | 12 | 3 | 0 | 4 |
| Dict | `main` | 97 | 14 | 13 | 0 | 6 |
| Dict | worktree | 84 | 12 | 12 | 0 | 6 |

Key read:

- `Dict` is already flatter on the worktree than on untouched `main`.
- `Code` is effectively unchanged, which makes it a good control for the shared resize/editor shell.
- The deepest surviving non-editor shared-shell cluster is still the `Dict` param-row subtree, not the top-level section frame.

## Trace Read

### Aggregate layout/style event totals

Durations below are aggregated from `traceEvents` with `dur` values and reported in milliseconds.

| Trace | Branch | `UpdateLayoutTree` | `Layout` | `Commit` |
| --- | --- | ---: | ---: | ---: |
| Code resize | `main` | 22.1 | 7.9 | 2.7 |
| Code resize | worktree | 30.0 | 4.6 | 7.1 |
| Dict resize | `main` | 21.6 | 4.2 | 2.4 |
| Dict resize | worktree | 33.2 | 7.9 | 6.9 |
| Pan/zoom | `main` | 8.6 | 2.0 | 3.5 |
| Pan/zoom | worktree | 9.3 | 1.2 | 8.5 |

Interpretation:

- Even with the flatter `Dict` DOM, the shared resize path is still paying meaningful section-shell style/layout work on the worktree.
- The signal is not isolated to the `Dict` rows. The editor-backed `Code` control also routes through the same shared resize/container path.

### Coarse owner scan from raw trace text

These counts are raw string hits across the saved trace JSON. They are used only to identify which shared modules stay present on the path.

| Trace | `eq` | `ProjectChatBottomDock` | `CustomResizable` | `GroupContainer` | `CodeMirror` | `scheduleMeasure` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| main code resize | 571 | 87 | 9 | 3 | 19 | 0 |
| worktree code resize | 1999 | 84 | 9 | 1 | 15 | 0 |
| main dict resize | 850 | 87 | 9 | 57 | 14 | 22 |
| worktree dict resize | 2377 | 89 | 8 | 56 | 21 | 22 |
| main pan/zoom | 519 | 6 | 3 | 0 | 3 | 0 |
| worktree pan/zoom | 1400 | 6 | 2 | 0 | 5 | 0 |

Key read:

- The remaining ownership is still shared-shell/editor work, not a callable-only seam.
- `Dict` traces continue to expose the shared param shell through `GroupContainer` and `scheduleMeasure`.
- `Code` stays useful as the resize/editor control because `CustomResizable`, `CodeMirror`, and `ProjectChatBottomDock` remain visible there even without the `Dict` row tree.

## Deepest-First Attack Order

1. Start with the `Dict` unpinned shared param-row subtree:
   - `ParamDndList`
   - `GetParamSwitch`
   - `ParamSwitch`
   - `ParamContainer`
2. Re-measure the same `Dict` and `Code` resize traces after that inner-shell pass.
3. Only then move outward/upward into:
   - `GroupContainer`
   - `SectionContainerCoreResizabe`
   - `CustomResizable`
   - `sectionChrome`

Why this order:

- `Dict` is the deepest shared non-editor shell that is already showing a real DOM win on the branch.
- `Code` did not flatten, so it should remain the control for deciding whether later gains come from the inner param shell or from the outer resize/editor shell.

## Conclusion

- `Phase S0: Shared Section-Shell Baseline` is complete.
- The active representative scene set is now locked to `S0 Code` plus `S0 Dict`.
- The next justified implementation target is the shared `Dict` param-row shell, not the top-level section frame.
- Chrome DevTools `Performance` profiling is now explicitly part of the plan for resize/pan/zoom performance tests, not an implied extra.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s0/main-code-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s0/worktree-code-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s0/main-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s0/worktree-dict-section.png`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s0/main-code-resize.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s0/worktree-code-resize.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s0/main-dict-resize.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s0/worktree-dict-resize.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s0/main-pan-zoom.trace.json`
- `perf/reports/frontend/artifacts/2026-03-16_section-shell-s0/worktree-pan-zoom.trace.json`
