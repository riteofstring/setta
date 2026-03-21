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

## 2026-03-20 003

- Item: Add the first checked-in canonical benchmark scene fixture and deterministic installer path.
- Status: `done`
- Details:
  - Added the shared scene manifest:
    - `perf/fixtures/section-benchmarks/scene-manifest.json`
  - Added the first ready canonical scene fixture:
    - `perf/fixtures/section-benchmarks/settings.settings-project.json`
  - Added a Python installer for checked-in benchmark scenes:
    - `perf/scripts/installSectionBenchmarkScene.py`
  - Added backend helper logic for resolving and materializing scene fixtures:
    - `backend/setta/perf/section_benchmark_scenes.py`
  - `settings` now has a deterministic install path into a target state root:
    - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py settings --state-root <target-state-root>`
  - Verified this with:
    - Python unit coverage for the installer and manifest
    - Node tests for the shared scene manifest module
    - a temp-directory smoke install that wrote `setta-settings-project.json`
  - Locked an important scene-model distinction:
    - `settings` is a special `setta-settings-project.json` fixture path
    - future synthetic Tier 1 / Tier 2 scenes should remain canonical checked-in fixtures too, but they may use a different storage seam than the special settings route
- Next action:
  - Define and build the first deterministic Tier 1 synthetic benchmark scene fixture so the benchmark suite covers the dense param families beyond `settings`.

## 2026-03-20 004

- Item: Add the first ready canonical Tier 1 synthetic benchmark scene fixture and install path.
- Status: `done`
- Details:
  - Added the checked-in Tier 1 synthetic fixture:
    - `perf/fixtures/section-benchmarks/tier1-synthetic.project.json`
  - Promoted `tier1Synthetic` from planned to ready in:
    - `perf/fixtures/section-benchmarks/scene-manifest.json`
  - Locked its benchmark focal point to:
    - `callable_00`
  - The current Tier 1 fixture composition is:
    - 8 `Callable` sections
    - 12 top-level `Dict` sections
    - 1 `GlobalVariables` section
    - 4 `ListRoot` sections with nested `Dict` children for list/object-style coverage
    - 25 top-level sections and 45 total sections overall
  - Added benchmark-scene tests covering:
    - ready Tier 1 manifest shape
    - Tier 1 install into `project.json`
    - resulting installed section counts
    - rejection of the still-planned Tier 2 and combined scenes
  - Updated the plan so the current ready canonical scene set now includes:
    - `settings`
    - `tier1Synthetic`
- Next action:
  - Wire a reproducible benchmark runner around `tier1Synthetic` on untouched `main` and this worktree, then start the top-level shell restoration work against both ready scenes.

## 2026-03-20 005

- Item: Replace the earlier Tier 1 synthetic scene draft with the final canonical fixture generated from checked-in builder logic.
- Status: `done`
- Details:
  - Added a checked-in Tier 1 builder seam:
    - `backend/setta/perf/section_benchmark_scene_builders.py`
    - `perf/scripts/buildSectionBenchmarkScene.py`
  - Rebuilt and checked in the canonical Tier 1 fixture:
    - `perf/fixtures/section-benchmarks/tier1-synthetic.project.json`
  - Corrected the Tier 1 manifest and benchmark target to the final builder-backed scene shape:
    - `perf/fixtures/section-benchmarks/scene-manifest.json`
    - target section pattern:
      - `callable_00`
  - Locked the final Tier 1 composition to:
    - 8 `Callable` sections
    - 12 top-level `Dict` sections
    - 1 `GlobalVariables` section
    - 4 `ListRoot` sections with 5 `Dict` children each
    - 25 top-level sections and 45 total sections overall
  - Updated focused coverage to match the final canonical scene:
    - `perf/scripts/sectionBenchmarkScenes.test.js`
    - `tests/perf/test_section_benchmark_scenes.py`
  - Verification:
    - `source activate.sh && python -m py_compile backend/setta/perf/section_benchmark_scene_builders.py perf/scripts/buildSectionBenchmarkScene.py`
    - `node --test perf/scripts/sectionBenchmarkScenes.test.js perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.test.js`
      - result: `6` passed
    - `source activate.sh && pytest tests/perf/test_section_benchmark_scenes.py`
      - result: `6` passed
- Next action:
  - Install `settings` and `tier1Synthetic` into reproducible state roots for untouched `main` and this worktree, then record the first paired CDP benchmark reruns against both ready scenes before touching section rendering again.

## 2026-03-20 005

- Item: Remove relative state-root ambiguity from the benchmark scene installer CLI.
- Status: `done`
- Details:
  - Added an explicit state-root resolver in:
    - `backend/setta/perf/section_benchmark_scenes.py`
  - Updated the installer CLI to resolve relative `--state-root` paths against the caller's working directory before handing them to `DBE`:
    - `perf/scripts/installSectionBenchmarkScene.py`
  - Added focused coverage for:
    - relative-path resolution
    - absolute-path passthrough
  - Verified the CLI with a temp-directory smoke run from outside the repo root:
    - `python perf/scripts/installSectionBenchmarkScene.py settings --state-root setta_files_dev`
    - result target path now resolves to `<cwd>/setta_files_dev/...` instead of the broader normalized Setta state root
- Next action:
  - Install `settings` and `tier1Synthetic` into reproducible state roots for untouched `main` and this worktree, then record the first paired CDP benchmark reruns against both ready scenes before touching section rendering again.
