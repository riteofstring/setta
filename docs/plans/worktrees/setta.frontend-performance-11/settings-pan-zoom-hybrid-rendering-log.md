# Settings Pan/Zoom Hybrid Rendering Log

Date started: 2026-03-20
Worktree: `setta.frontend-performance-11`
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/settings-pan-zoom-hybrid-rendering-plan.md`

## Usage

Append-only execution log for the settings pan/zoom hybrid rendering effort.

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

- scope decisions
- benchmark-standardization changes
- scene-fixture changes
- perf measurements
- visual parity checks
- regressions and fixes
- accepted layout restores
- Tier 1 / Tier 2 status changes

## 2026-03-20 001

- Item: Initialize the settings pan/zoom hybrid rendering plan and create an append-only execution log.
- Status: `done`
- Details:
  - Created the plan:
    - `docs/plans/worktrees/setta.frontend-performance-11/settings-pan-zoom-hybrid-rendering-plan.md`
  - Locked the main architecture direction:
    - keep `xyflow`
    - restore the paint-friendlier top-level shell behavior
    - keep the Tier 1 top-level grid-style shell
    - add section-body LOD / preview behavior instead of relying on per-widget canvas conversion
  - Locked section-family scope:
    - Tier 1:
      - `Callable`
      - `Dict`
      - param-heavy dict variants
      - list/object-style param sections
      - `GlobalVariables` when it shares the same heavy param/body stack
    - Tier 2:
      - `Code`
      - CodeMirror/editor-side work for `Prompt`
      - CodeMirror/editor-side work for `TextBlock`
    - Explicitly excluded:
      - `Terminal`
  - Locked sparse local-layout restore policy:
    - `Browser`
    - `Draw`
    - `Chart`
    - surrounding layout for `Prompt`
    - surrounding layout for `TextBlock`
    - avoid reopening shared `subgrid` by default
  - Locked benchmark requirements:
    - standardized CDP-only replay and trace-summary flow
    - mandatory `settings` benchmark on untouched `main` and the worktree
    - reproducible synthetic scene suite for Tier 1, then Tier 2, then combined Tier 1 + Tier 2
  - Locked verification requirements:
    - untouched-`main` vs worktree pixel-level comparisons remain a hard gate
    - traces must capture and summarize at least:
      - `Paint`
      - `UpdateLayoutTree`
      - `Layout`
      - `RunTask`
      - `Commit`
      - `FireAnimationFrame`
- Next action:
  - Create the standardized benchmark scene suite and wire it into the shared CDP replay / trace-summary workflow before implementation work begins.

## 2026-03-20 002

- Item: Start benchmark standardization by adding a shared scene manifest and generic section pan/zoom replay path.
- Status: `done`
- Details:
  - Created a shared benchmark scene manifest:
    - `perf/scripts/sectionBenchmarkScenes.js`
  - Added a generic reusable replay helper:
    - `perf/scripts/sectionPanZoomBenchmarkReplay.js`
  - Expanded the benchmark coverage shape to match the agreed standard more closely:
    - slow and fast overview horizontal pans
    - slow and fast overview vertical pans
    - slow and fast close-zoom horizontal pans
    - slow and fast close-zoom vertical pans
    - slow and fast overview-to-detail zoom passes
    - slow and fast detail-to-overview zoom passes
  - Kept the old settings benchmark script as a compatibility entry point while delegating to the shared replay logic:
    - `perf/scripts/settingsTopLevelGridBenchmarkReplay.js`
  - Updated the trace summarizer so it can read both:
    - legacy `section-grid-*` marks
    - new generic `section-benchmark-*` phase marks
  - Added focused script tests for:
    - scene manifest behavior
    - legacy and new trace mark summarization
- Next action:
  - Add the first checked-in canonical benchmark scene fixtures and a deterministic scene-loading path so the benchmark no longer depends on ad hoc runtime `setta_files`.
