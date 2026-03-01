# Settings All Settings Pan/Zoom DOM Flattening

Date: 2026-03-04
Area: frontend
Branch/Commit: frontend-performance-6 @ 414a63c38 (baseline capture)
Related PR: n/a

## Goal

Improve zoom/pan responsiveness in the React Flow canvas for `/settings` -> `All Settings` by flattening DOM structure without changing behavior.

## Scenario

- Entry point (URL/route/screen): `http://127.0.0.1:3006/settings`
- Steps to reproduce (deterministic):
  1. Open `/settings`.
  2. Ensure `All Settings` tab is active.
  3. Record trace while running scripted pan/zoom interaction:
     - repeated wheel-pan phases;
     - 8x zoom out via toolbar control;
     - repeated wheel-pan phases;
     - 8x zoom in via toolbar control.
- Data set / project used: built-in Settings project (`All Settings` view mode).
- Browser + OS: Chrome (DevTools MCP), macOS.
- Notes: no CPU/network throttling.

## Before (baseline)

- Measurement method:
  - Chrome DevTools MCP trace (`performance_start_trace` / `performance_stop_trace`).
  - In-page DOM metric sampling via `evaluate_script` on `.react-flow__viewport` and `.react-flow__node`.
- Key metrics:
  - DOM:
    - React Flow nodes: `42`
    - Viewport descendants: `8619`
    - Param rows (`[data-param-row="true"]`): `697`
    - Per-node descendants: `avg 204.05`, `p95 314`, `max 1854`
    - Per-node max depth: `avg 12.74`, `p95 13`, `max 17`
  - Trace window (derived from `TracingStartedInBrowser` to trace end):
    - Duration: `22,943.57 ms`
    - Renderer main `RunTask` count: `5861`
    - Renderer main long tasks (`>=50ms`): `2`
    - Renderer main tasks over frame budget (`>=16.67ms`): `114`
    - Renderer main max task duration: `557.64 ms`
    - Frame signals:
      - `BeginFrame`: `530` (`23.1/s`)
      - `DrawFrame`: `163` (`7.1/s`)
      - `DroppedFrame`: `304` (`57.36%` of BeginFrame)
    - Main-thread rendering work:
      - `Layout`: `71.84 ms`
      - `UpdateLayoutTree`: `16.2 ms`
      - `Paint`: `79.05 ms`
      - `PrePaint`: `16.3 ms`
- Observations:
  - DOM size is high for this view, with one section node reaching `1854` descendants.
  - Dropped-frame count is substantial in the measured interaction window.

## After

### Phase 1 (wrapper flattening pass)

- Scope:
  - `frontend/src/components/Params/GroupContainer.tsx`
  - `frontend/src/components/Params/ParamContainer.tsx`
  - `frontend/src/components/Params/ParamItems/ParamTextLabel.tsx`
  - `frontend/src/components/Section/Container/ManyNestedSections.tsx`
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `7838` (down from `8619`, `-781`, `-9.1%`)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Per-node descendants: `avg 185.45` (down from `204.05`)
  - Per-node descendants p95: `290` (down from `314`)
  - Per-node descendants max: `1656` (down from `1854`)
  - Per-node max depth: `avg 11.74` / `max 16` (down from `12.74` / `17`)
- Trace artifact:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase1.trace.json`
- Trace signals from this phase run:
  - Duration: `18,026.11 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `4`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `325` (`18.03/s`)
  - `DrawFrame`: `171` (`9.49/s`)
  - `DroppedFrame`: `21` (`6.46%`)
  - Main-thread work: `Layout 82.67 ms`, `UpdateLayoutTree 18.22 ms`, `Paint 139.61 ms`
- Notes:
  - DOM-shape improvements are clear and stable in this pass.
  - Trace-window duration differs from baseline, so final comparison should be re-run once after all flattening passes land.

## Conclusion

- Pending refactor and post-change measurements.

## Raw Artifacts (local-only)

- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_baseline.trace.json`

## Automated Perf Tests

- Planned:
  - Add a Playwright settings pan/zoom DOM-structure guardrail under `frontend/tests/e2e/settings/`.

## After (continued)

### Phase 2 (resize-handle flattening)

- Scope:
  - `frontend/src/components/Params/ResizeHandle.tsx`
- Change:
  - Flattened each resize handle from nested wrapper structure to a single interactive element with pseudo-elements.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `6584` (down from `7838`, `-1254`, `-16.0%` vs phase 1)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Per-node descendants: `avg 155.6`, `p95 198`, `max 1344`
  - Per-node max depth: `avg 11.74`, `max 16` (unchanged vs phase 1)
- Trace artifact:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase2.trace.json`
- Trace signals from this phase run:
  - Duration: `15,017.26 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `3`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `223` (`14.85/s`)
  - `DrawFrame`: `96` (`6.39/s`)
  - `DroppedFrame`: `17` (`7.62%`)
  - Main-thread work: `Layout 33.56 ms`, `UpdateLayoutTree 8.06 ms`, `Paint 55.48 ms`, `PrePaint 7.72 ms`

### Phase 3 (text/password border-span flattening)

- Scope:
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
- Change:
  - Removed dedicated border `<span>` nodes for text/password params.
  - Moved equivalent border/focus styles onto existing input wrapper elements.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `6158` (down from `6584`, `-426`, `-6.5%` vs phase 2)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Per-node descendants: `avg 145.45`, `p95 186`, `max 1218`
  - Per-node max depth: `avg 11.74`, `max 16` (unchanged)
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase3.trace.json`
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase3b.trace.json`
- Notes on trace reliability:
  - Initial phase 3 run (`phase3`) started from a fit-view state where zoom controls differed; use `phase3b` for normalized comparison.
- Trace signals from normalized run (`phase3b`):
  - Duration: `15,575.42 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `8`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `350` (`22.47/s`)
  - `DrawFrame`: `98` (`6.29/s`)
  - `DroppedFrame`: `72` (`20.57%`)
  - Main-thread work: `Layout 27.8 ms`, `UpdateLayoutTree 7.11 ms`, `Paint 35.73 ms`, `PrePaint 7.42 ms`

## Conclusion (update)

- DOM flattening delivered a large structural reduction in the benchmark view.
- Baseline to latest DOM deltas (`/settings` -> `All Settings`):
  - Viewport descendants: `8619 -> 6158` (`-2461`, `-28.6%`)
  - Per-node descendants avg: `204.05 -> 145.45` (`-28.7%`)
  - Per-node descendants max: `1854 -> 1218` (`-34.3%`)
  - Per-node depth avg/max: `12.74/17 -> 11.74/16`
- Runtime traces remain somewhat variable run-to-run, but main-thread layout/paint totals dropped materially vs baseline.

## Raw Artifacts (additional local-only)

- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase1.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase2.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase3.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase3b.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase2.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase2_fitview.png`

## After (continued)

### Phase 4 (nested param wrapper flattening)

- Scope:
  - `frontend/src/components/Params/ParamContainer.tsx`
- Change:
  - Removed the always-rendered nested-child wrapper around `GetParamSwitch` in the nested-param branch.
  - Moved connector pseudo-element styling onto the parent nested article row.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `6088` (down from `6158`, `-70`, `-1.1%` vs phase 3)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Per-node descendants: `avg 143.79`, `p95 183`, `max 1178`
  - Per-node max depth: `avg 11.38`, `max 14`
  - Nested connector wrappers (previous class pattern): `0` (down from `70`)
- Trace artifact:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase4.trace.json`
- Trace signals from this phase run:
  - Duration: `18,703.01 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `5`
  - Renderer main long tasks (`>=50ms`): `3`
  - `BeginFrame`: `429` (`22.94/s`)
  - `DrawFrame`: `122` (`6.52/s`)
  - `DroppedFrame`: `42` (`9.79%`)
  - Main-thread work: `Layout 28.21 ms`, `UpdateLayoutTree 7.47 ms`, `Paint 82.24 ms`, `PrePaint 7.19 ms`

### Phase 5 (combobox wrapper flattening)

- Scope:
  - `frontend/src/components/Utils/Combobox/IdNameCombobox.tsx`
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - `frontend/src/components/App/appRegistry.tsx`
- Change:
  - Removed `IdNameCombobox`'s dedicated outer wrapper `<div>`.
  - Merged the wrapper classes into the existing combobox input container (`<search>`), preserving layout/theme classes.
  - Updated dropdown caller classes to remove descendant-selector styling that depended on the removed wrapper.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `6012` (down from `6088`, `-76`, `-1.2%` vs phase 4)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `7108`
  - Per-node descendants: `avg 141.98`, `p95 235`, `max 1148`
  - Per-node max depth: `avg 10.69`, `p95 11`, `max 13`
  - Legacy combobox wrapper divs (removed pattern): `0`
  - Combobox search containers (new flattened host): `76`
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase5.trace.json`
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase5b.trace.json`
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase5c.trace.json`
- Notes on trace reliability:
  - Phase 5 traces were run multiple times because interaction-window behavior varied significantly.
  - Use `phase5c` as the normalized capture (closest duration to phase 4).
- Trace signals from normalized run (`phase5c`):
  - Duration: `17,953.04 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `5`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `331` (`18.44/s`)
  - `DrawFrame`: `88` (`4.90/s`)
  - `DroppedFrame`: `153` (`46.22%`)
  - Main-thread work: `Layout 33.66 ms`, `UpdateLayoutTree 7.68 ms`, `Paint 55.64 ms`, `PrePaint 8.32 ms`

### Phase 6 (switch wrapper flattening)

- Scope:
  - `frontend/src/components/Params/ParamUIs/SwitchInput.tsx`
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - `frontend/src/components/App/appRegistry.tsx`
  - `frontend/src/components/Section/Layouts/MetaControl/MetaControlNode.tsx`
- Change:
  - Added a wrapperless path in `SwitchInput` so switch layout classes can be applied directly on `Switch.Root`.
  - Updated settings-oriented switch callsites to use root-level classes and avoid rendering the extra wrapper `<div>`.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `5893` (down from `6012`, `-119`, `-2.0%` vs phase 5)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `6989` (down from `7108`, `-119`)
  - Per-node descendants: `avg 139.14`, `p95 228`, `max 1148`
  - Per-node max depth: `avg 10.69`, `p95 11`, `max 13`
  - Legacy switch wrappers (`div.section-value.flex.justify-self-start.self-center`): `0`
  - Flattened switch roots (`button.section-value.justify-self-start.self-center`): `119`
- Trace artifact:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase6.trace.json`
- Trace signals from this phase run:
  - Duration: `18,630.93 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `6`
  - Renderer main long tasks (`>=50ms`): `1`
  - `BeginFrame`: `327` (`17.55/s`)
  - `DrawFrame`: `96` (`5.15/s`)
  - `DroppedFrame`: `135` (`41.28%`)
  - Main-thread work: `Layout 29.1 ms`, `UpdateLayoutTree 8.64 ms`, `Paint 92.15 ms`, `PrePaint 8.62 ms`

### Phase 7 (DummyCodeMirror line-wrapper flattening)

- Scope:
  - `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx`
- Change:
  - Added inline rendering paths so single-line content avoids creating `.cm-line` child wrappers.
  - Applied the same flattening to one-line highlighted code even when multiline mode is enabled.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `5467` (down from `5893`, `-426`, `-7.2%` vs phase 6)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `6563` (down from `6989`, `-426`)
  - Per-node descendants: `avg 129`, `p95 162`, `max 1022`
  - Per-node max depth: `avg 10.4`, `p95 11`, `max 13`
  - `.cm-line` wrappers: `0` (down from `426`)
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase7.trace.json`
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase7b.trace.json`
- Notes on trace reliability:
  - `phase7` was captured during a longer interaction window with more background task noise.
  - `phase7b` is a shorter normalization rerun and is used for the numbers below.
- Trace signals from normalized rerun (`phase7b`):
  - Duration: `11,920.89 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `16`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `424` (`35.57/s`)
  - `DrawFrame`: `120` (`10.07/s`)
  - `DroppedFrame`: `78` (`18.40%`)
  - Main-thread work: `Layout 30.19 ms`, `UpdateLayoutTree 8.42 ms`, `Paint 43.38 ms`, `PrePaint 8.03 ms`

### Phase 8 (combobox right-wrapper flattening)

- Scope:
  - `frontend/src/components/Utils/atoms/search/StandardSearch.tsx`
  - `frontend/src/components/Utils/Combobox/ComboboxParts.tsx`
- Change:
  - Added a wrapperless right-element path in `StandardSearch`.
  - Moved combobox toggle positioning onto `StandardSearchRightBtn` so the extra right-side wrapper `<div>` is no longer rendered in settings comboboxes.
  - Cleaned class assembly so missing style props no longer emit `undefined` class tokens.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `5391` (down from `5467`, `-76`, `-1.4%` vs phase 7)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `6487` (down from `6563`, `-76`)
  - Per-node descendants: `avg 127.19`, `p95 160`, `max 992`
  - Per-node max depth: `avg 9.71`, `p95 10`, `max 12`
  - Legacy combobox right wrappers (`div.absolute.inset-y-0.right-0.grid.select-none.place-items-center`): `0` (down from `76`)
  - Flattened combobox right buttons (`button.absolute.inset-y-0.right-1`): `76`
- Trace artifact:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase8.trace.json`
- Trace signals from this phase run:
  - Duration: `12,945.18 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `5`
  - Renderer main long tasks (`>=50ms`): `3`
  - `BeginFrame`: `382` (`29.51/s`)
  - `DrawFrame`: `125` (`9.66/s`)
  - `DroppedFrame`: `11` (`2.88%`)
  - Main-thread work: `Layout 31.0 ms`, `UpdateLayoutTree 8.13 ms`, `Paint 51.14 ms`, `PrePaint 6.55 ms`

### Phase 9 (section title-wrapper flattening)

- Scope:
  - `frontend/src/components/Section/Header/SectionTitle.tsx`
  - `frontend/src/components/Section/Header/SectionHeader.tsx`
  - `frontend/src/components/Section/Container/ContainerCore.tsx`
- Change:
  - Added a wrapperless render path for editable section titles in normal (no-validation-error) state.
  - Enabled the wrapperless path for section headers and group headers in the settings canvas.
  - Kept the wrapper only when validation tooltip positioning is needed.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `5349` (down from `5391`, `-42`, `-0.8%` vs phase 8)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `6445` (down from `6487`, `-42`)
  - Per-node descendants: `avg 126.19`, `p95 159`, `max 991`
  - Per-node max depth: `avg 9.71`, `p95 10`, `max 12`
  - Legacy section title wrappers (`header.section-title > div.relative.flex.min-w-0.flex-1.flex-col`): `0` (down from `42`)
  - Flattened section title hosts (`header.section-title > p/input` with `min-w-0 flex-1`): `42`
- Trace artifact:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase9.trace.json`
- Trace signals from this phase run:
  - Duration: `13,019.90 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `4`
  - Renderer main long tasks (`>=50ms`): `3`
  - `BeginFrame`: `385` (`29.57/s`)
  - `DrawFrame`: `126` (`9.68/s`)
  - `DroppedFrame`: `9` (`2.34%`)
  - Main-thread work: `Layout 31.17 ms`, `UpdateLayoutTree 8.18 ms`, `Paint 51.53 ms`, `PrePaint 6.58 ms`

### Phase 10 (non-group container-wrapper flattening)

- Scope:
  - `frontend/src/components/Section/Container/SectionContainer.tsx`
  - `frontend/src/components/Section/Container/ContainerSwitch.tsx`
  - `frontend/src/components/Section/Container/TopLevelContainer.tsx`
  - `frontend/src/components/Section/Container/ContainerWrappers.tsx`
  - `frontend/src/components/Section/Container/ContainerCore.tsx`
  - `frontend/src/components/Section/Container/SectionContainerCore.tsx`
- Change:
  - Flattened the non-group `ContainerCore` wrapper (`div.focus-visible:outline-none`) when the section has no nested sections.
  - Moved ref/listener/style/tabIndex responsibilities onto `SectionContainerCore` in the flattened path.
  - Kept the wrapper path for grouped/nested layouts to preserve behavior.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `5307` (down from `5349`, `-42`, `-0.8%` vs phase 9)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `6403` (down from `6445`, `-42`)
  - Per-node descendants: `avg 125.19`, `p95 158`, `max 990`
  - Per-node max depth: `avg 8.71`, `p95 9`, `max 11`
  - Legacy focus-outline wrappers (`div.focus-visible:outline-none`): `0` (down from `42`)
  - Flattened section hosts (`section.focus-visible:outline-none`): `42`
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase10.trace.json`
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase10b.trace.json`
- Notes on trace reliability:
  - Initial phase 10 run (`phase10`) had high dropped-frame noise.
  - Use `phase10b` as the normalized rerun.
- Trace signals from normalized rerun (`phase10b`):
  - Duration: `16,100.56 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `2`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `219` (`13.60/s`)
  - `DrawFrame`: `101` (`6.27/s`)
  - `DroppedFrame`: `9` (`4.11%`)
  - Main-thread work: `Layout 30.35 ms`, `UpdateLayoutTree 8.16 ms`, `Paint 47.33 ms`, `PrePaint 7.35 ms`

### Phase 11 (DummyCodeMirror single-token wrapper flattening)

- Scope:
  - `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx`
  - `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Change:
  - Flattened the highlighted single-line `div -> span` case when syntax highlighting resolves to one token span.
  - Merged the token class onto the existing host and rendered text directly to remove the extra wrapper node.
  - Added automated guardrail coverage for the removed DummyCodeMirror single-span wrapper pattern.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `4900` (down from `5307`, `-407`, `-7.7%` vs phase 10)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `5996` (down from `6403`, `-407`)
  - Per-node descendants: `avg 115.5`, `p95 209`, `max 864`
  - Per-node max depth: `avg 8.45`, `p95 9`, `max 11`
  - Legacy DummyCodeMirror single-span wrappers: `0` (down from `407`)
  - Flattened DummyCodeMirror text hosts: `407`
- Trace artifact:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase11.trace.json`
- Trace signals from this phase run:
  - Duration: `16,509.1 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `2`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `409` (`24.77/s`)
  - `DrawFrame`: `239` (`14.48/s`)
  - `DroppedFrame`: `11` (`2.69%`)
  - Main-thread work: `Layout 49.96 ms`, `UpdateLayoutTree 22.58 ms`, `Paint 134.77 ms`, `PrePaint 18.64 ms`

### Phase 12 (switch-thumb flattening)

- Scope:
  - `frontend/src/components/Params/ParamUIs/SwitchInput.tsx`
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - `frontend/src/components/App/appRegistry.tsx`
  - `frontend/src/components/Section/Layouts/MetaControl/MetaControlNode.tsx`
  - `frontend/src/components/Params/ParamUIs/SwitchInput.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Change:
  - Added an opt-in `SwitchInput` thumbless path that renders the knob via root `before:` pseudo-element classes.
  - Enabled this path for settings switch rows to remove `Switch.Thumb` span nodes while preserving the same visual state transitions.
  - Extended guardrails to assert zero legacy switch-thumb span wrappers and positive flattened pseudo-element switch roots.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `4781` (down from `4900`, `-119`, `-2.4%` vs phase 11)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `5877` (down from `5996`, `-119`)
  - Per-node descendants: `avg 112.67`, `p95 202`, `max 864`
  - Per-node max depth: `avg 8.45`, `p95 9`, `max 11`
  - Legacy switch-thumb span wrappers: `0` (down from `119`)
  - Flattened switch pseudo-element roots: `119`
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase12.trace.json`
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase12b.trace.json`
- Notes on trace reliability:
  - `phase12b` ran with a longer interaction window; use `phase12` as the normalized comparison run (closest duration to phase 11).
- Trace signals from normalized run (`phase12`):
  - Duration: `16,499.02 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `3`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `428` (`25.94/s`)
  - `DrawFrame`: `240` (`14.55/s`)
  - `DroppedFrame`: `18` (`4.21%`)
  - Main-thread work: `Layout 52.47 ms`, `UpdateLayoutTree 24.62 ms`, `Paint 146.09 ms`, `PrePaint 18.85 ms`

### Phase 13 (param-group outer-wrapper flattening)

- Scope:
  - `frontend/src/components/Params/GroupContainer.tsx`
  - `frontend/src/components/Params/GroupContainer.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Change:
  - Added a conditional wrapperless path for unpinned-only param groups (no spinner, no pinned area, no edge strip).
  - Moved `section-row-pin-main` host classes onto the existing unpinned params container in that path and forwarded outer refs there.
  - Extended guardrails to assert zero legacy param-group outer wrappers and positive flattened param-group hosts.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `4739` (down from `4781`, `-42`, `-0.9%` vs phase 12)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `5835` (down from `5877`, `-42`)
  - Per-node descendants: `avg 111.67`, `p95 201`, `max 863`
  - Per-node max depth: `avg 7.5`, `p95 8`, `max 10`
  - Legacy param-group outer wrappers: `0` (down from `42`)
  - Flattened param-group hosts: `42`
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase13.trace.json`
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase13b.trace.json`
- Notes on trace reliability:
  - `phase13` showed a long/noisy interaction window.
  - `phase13b` reduced long-task noise but still ran longer than phase 12; treat trace deltas as directional only.
- Trace signals from lower-noise rerun (`phase13b`):
  - Duration: `18,232.41 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `2`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `474` (`26.00/s`)
  - `DrawFrame`: `230` (`12.62/s`)
  - `DroppedFrame`: `25` (`5.27%`)
  - Main-thread work: `Layout 92.37 ms`, `UpdateLayoutTree 21.18 ms`, `Paint 129.86 ms`, `PrePaint 21.12 ms`

### Phase 14 (kwargs add/remove icon-wrapper flattening)

- Scope:
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
  - `frontend/src/components/Section/Layouts/DictArea.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Change:
  - Flattened kwargs "Remove arg" and "Add arg" buttons from `button > i` to icon-host buttons (`gg-math-minus` / `gg-math-plus`) with no icon child node.
  - Reused a shared base button class string for kwargs icon controls to keep style parity while reducing wrappers.
  - Extended unit + E2E guardrails to assert zero legacy kwargs add/remove icon wrappers and positive flattened icon-host counts.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `4655` (down from `4739`, `-84`, `-1.8%` vs phase 13)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `5751` (down from `5835`, `-84`)
  - Per-node descendants: `avg 109.67`, `p95 199`, `max 861`
  - Per-node max depth: `avg 7.5`, `p95 8`, `max 10`
  - Legacy kwargs add/remove icon wrappers: `0` (down from `84`)
  - Flattened kwargs add/remove icon hosts: `84`
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase14.trace.json`
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase14b.trace.json`
- Notes on trace reliability:
  - `phase14` and `phase14b` used the same scripted path but showed variable dropped-frame behavior; treat trace deltas as directional.
  - Structural DOM reduction is stable and guardrailed despite trace-window variability.
- Trace signals (`phase14`):
  - Duration: `19,754.28 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `6`
  - Renderer main long tasks (`>=50ms`): `3`
  - `BeginFrame`: `758` (`38.37/s`)
  - `DrawFrame`: `281` (`14.22/s`)
  - `DroppedFrame`: `107` (`14.12%`)
  - Main-thread work: `Layout 51.13 ms`, `UpdateLayoutTree 24.34 ms`, `Paint 146.37 ms`, `PrePaint 18.4 ms`
- Trace signals (rerun `phase14b`):
  - Duration: `17,561.89 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `4`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `572` (`32.57/s`)
  - `DrawFrame`: `252` (`14.35/s`)
  - `DroppedFrame`: `156` (`27.27%`)
  - Main-thread work: `Layout 63.83 ms`, `UpdateLayoutTree 21.93 ms`, `Paint 127.7 ms`, `PrePaint 18.95 ms`

### Phase 15 (kwargs convert/delete icon-wrapper flattening)

- Scope:
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
  - `frontend/src/components/Section/Layouts/DictArea.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Change:
  - Flattened kwargs `Convert to edge connectors` / `Convert selected edge args back to params` and `Delete selected args` buttons from `button > i` to icon-host buttons.
  - Kept existing aria-label behavior and icon state switching (`gg-link` / `gg-unlink`) while removing icon child nodes.
  - Extended guardrails to assert zero legacy wrappers and positive flattened-host counts for kwargs convert/delete action buttons.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `4571` (down from `4655`, `-84`, `-1.8%` vs phase 14)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `5667` (down from `5751`, `-84`)
  - Per-node descendants: `avg 107.67`, `p95 197`, `max 859`
  - Per-node max depth: `avg 7.5`, `p95 8`, `max 10`
  - Legacy kwargs convert/delete icon wrappers: `0` (down from `84`)
  - Flattened kwargs convert/delete icon hosts: `84`
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase15.trace.json`
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase15b.trace.json`
- Notes on trace reliability:
  - `phase15`/`phase15b` were captured with the same scripted zoom/pan interaction and remained variable run-to-run.
  - Structural DOM reduction is stable and guardrailed; use trace values as directional signals only.
- Trace signals (`phase15`):
  - Duration: `13,858.44 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `6`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `148` (`10.68/s`)
  - `DrawFrame`: `40` (`2.89/s`)
  - `DroppedFrame`: `65` (`43.92%`)
  - Main-thread work: `Layout 15.69 ms`, `UpdateLayoutTree 4.4 ms`, `Paint 32.07 ms`, `PrePaint 4.03 ms`
- Trace signals (rerun `phase15b`):
  - Duration: `19,222.41 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `6`
  - Renderer main long tasks (`>=50ms`): `1`
  - `BeginFrame`: `162` (`8.43/s`)
  - `DrawFrame`: `45` (`2.34/s`)
  - `DroppedFrame`: `72` (`44.44%`)
  - Main-thread work: `Layout 17.2 ms`, `UpdateLayoutTree 5.28 ms`, `Paint 19.21 ms`, `PrePaint 4.52 ms`

### Phase 16 (section header minimize/delete icon-wrapper flattening)

- Scope:
  - `frontend/src/components/Section/Header/MinimizeButton.tsx`
  - `frontend/src/components/Section/Header/DeleteOrHideButton.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Change:
  - Flattened section header minimize icon rendering from `button > i` to icon-host button classes (`gg-math-minus` / `gg-maximize`) in `MinimizeButton`.
  - Flattened the default non-view-mode delete/hide close icon path from `button > i` to host-class rendering in `DeleteOrHideButton`.
  - Extended E2E guardrails to assert zero legacy wrappers and positive flattened-host counts for both minimize and delete/hide header icon buttons.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `4487` (down from `4571`, `-84`, `-1.8%` vs phase 15)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `5583` (down from `5667`, `-84`)
  - Per-node descendants: `avg 105.67`, `p95 195`, `max 857`
  - Per-node max depth: `avg 7.5`, `p95 8`, `max 10`
  - Legacy minimize icon wrappers: `0` (down from `42`)
  - Flattened minimize icon hosts: `42`
  - Legacy delete/hide icon wrappers: `0` (down from `42`)
  - Flattened delete/hide icon hosts: `42`
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase16.trace.json`
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase16b.trace.json`
- Notes on trace reliability:
  - `phase16`/`phase16b` remained noisy with variable frame cadence despite identical scripted interactions.
  - Structural DOM reduction and guardrail counters are stable; use trace deltas directionally.
- Trace signals (`phase16`):
  - Duration: `15,159.08 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `4`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `163` (`10.75/s`)
  - `DrawFrame`: `54` (`3.56/s`)
  - `DroppedFrame`: `65` (`39.88%`)
  - Main-thread work: `Layout 14.83 ms`, `UpdateLayoutTree 4.45 ms`, `Paint 30.93 ms`, `PrePaint 3.96 ms`
- Trace signals (rerun `phase16b`):
  - Duration: `14,300.35 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `5`
  - Renderer main long tasks (`>=50ms`): `1`
  - `BeginFrame`: `159` (`11.12/s`)
  - `DrawFrame`: `45` (`3.15/s`)
  - `DroppedFrame`: `71` (`44.65%`)
  - Main-thread work: `Layout 16.03 ms`, `UpdateLayoutTree 4.58 ms`, `Paint 16.58 ms`, `PrePaint 4.33 ms`

### Phase 17 (section header lock icon-wrapper flattening)

- Scope:
  - `frontend/src/components/Section/Header/LockPositionButton.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Change:
  - Flattened section header lock/unlock icon rendering from `button > i` to icon-host button classes (`gg-lock` / `gg-lock-unlock`) in `LockPositionButton`.
  - Migrated icon offset/scale tweaks from child-target selectors (`[&>i]`) to host pseudo-element selectors (`[&::before]` / `[&::after]`) to preserve visual offsets without extra DOM nodes.
  - Extended E2E guardrails to assert zero legacy lock wrappers and positive flattened lock host counts.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `4445` (down from `4487`, `-42`, `-0.9%` vs phase 16)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `5541` (down from `5583`, `-42`)
  - Per-node descendants: `avg 104.67`, `p95 194`, `max 856`
  - Per-node max depth: `avg 7.5`, `p95 8`, `max 10`
  - Legacy lock icon wrappers: `0` (down from `42`)
  - Flattened lock icon hosts: `42`
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase17.trace.json`
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase17b.trace.json`
- Notes on trace reliability:
  - `phase17` and `phase17b` remained variable in frame cadence and dropped-frame rates.
  - Structural DOM reduction and wrapper guardrails remain the stable signal.
- Trace signals (`phase17`):
  - Duration: `15,554.65 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `6`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `150` (`9.64/s`)
  - `DrawFrame`: `40` (`2.57/s`)
  - `DroppedFrame`: `66` (`44.0%`)
  - Main-thread work: `Layout 14.8 ms`, `UpdateLayoutTree 4.24 ms`, `Paint 34.42 ms`, `PrePaint 3.97 ms`
- Trace signals (rerun `phase17b`):
  - Duration: `15,577.56 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `9`
  - Renderer main long tasks (`>=50ms`): `1`
  - `BeginFrame`: `161` (`10.34/s`)
  - `DrawFrame`: `45` (`2.89/s`)
  - `DroppedFrame`: `72` (`44.72%`)
  - Main-thread work: `Layout 16.89 ms`, `UpdateLayoutTree 5.17 ms`, `Paint 19.24 ms`, `PrePaint 4.61 ms`

### Phase 18 (kwargs pin icon-wrapper flattening)

- Scope:
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
  - `frontend/src/components/Section/Layouts/DictArea.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Change:
  - Flattened kwargs pin action from `button > i` to icon-host button class (`gg-pin-alt`) while preserving existing label and disabled behavior.
  - Extended unit and E2E guardrails to assert zero legacy kwargs pin wrappers and positive flattened pin-host counts.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `4403` (down from `4445`, `-42`, `-0.9%` vs phase 17)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `5499` (down from `5541`, `-42`)
  - Per-node descendants: `avg 103.67`, `p95 193`, `max 855`
  - Per-node max depth: `avg 7.5`, `p95 8`, `max 10`
  - Legacy kwargs pin icon wrappers: `0` (down from `42`)
  - Flattened kwargs pin icon hosts: `42`
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase18.trace.json`
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase18b.trace.json`
- Notes on trace reliability:
  - `phase18` used a longer interaction window while `phase18b` was closer to prior phase durations.
  - Structural DOM reductions and guardrail counters remain the primary stable signal.
- Trace signals (`phase18`):
  - Duration: `21,236.14 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `5`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `194` (`9.14/s`)
  - `DrawFrame`: `64` (`3.01/s`)
  - `DroppedFrame`: `69` (`35.57%`)
  - Main-thread work: `Layout 14.76 ms`, `UpdateLayoutTree 4.59 ms`, `Paint 32 ms`, `PrePaint 4.11 ms`
- Trace signals (rerun `phase18b`):
  - Duration: `16,122.67 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `5`
  - Renderer main long tasks (`>=50ms`): `1`
  - `BeginFrame`: `162` (`10.05/s`)
  - `DrawFrame`: `44` (`2.73/s`)
  - `DroppedFrame`: `74` (`45.68%`)
  - Main-thread work: `Layout 15.38 ms`, `UpdateLayoutTree 4.72 ms`, `Paint 16.89 ms`, `PrePaint 4.28 ms`

### Phase 19 (section menu default icon-wrapper flattening)

- Scope:
  - `frontend/src/components/Section/Header/HeaderIcon.tsx`
  - `frontend/src/components/Section/Header/MenuButton/MenuButton.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Change:
  - Flattened default section menu trigger icon rendering from `button > i.gg-menu` to host-class rendering on the menu trigger button for section types that use the default menu glyph in `HeaderIcon`.
  - Added helper exports in `HeaderIcon` to detect default-menu icon usage and to share default menu icon class composition between icon-node and host-icon paths.
  - Extended E2E guardrails to assert zero legacy section-menu icon wrappers and positive flattened section-menu host counts.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `4361` (down from `4403`, `-42`, `-1.0%` vs phase 18)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `5457` (down from `5499`, `-42`)
  - Per-node descendants: `avg 102.67`, `p95 192`, `max 854`
  - Per-node max depth: `avg 7.45`, `p95 8`, `max 10`
  - Legacy section-menu icon wrappers: `0` (down from `42`)
  - Flattened section-menu icon hosts: `42`
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase19.trace.json`
- Notes on trace reliability:
  - DevTools MCP transport disconnected immediately after phase-19 trace stop; the trace file was written successfully, but no phase-19 rerun/screenshot pair was captured in this step.
  - Structural DOM reductions and guardrail counters remain the primary stable signal.
- Trace signals (`phase19`):
  - Duration: `16,864.56 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `5`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `224` (`13.28/s`)
  - `DrawFrame`: `65` (`3.85/s`)
  - `DroppedFrame`: `67` (`29.91%`)
  - Main-thread work: `Layout 15.21 ms`, `UpdateLayoutTree 4.71 ms`, `Paint 31.05 ms`, `PrePaint 4.27 ms`

### Phase 20 (section menu root-wrapper flattening)

- Scope:
  - `frontend/src/components/Section/Header/MenuButton/MenuButton.tsx`
  - `frontend/src/components/Utils/atoms/menubar/menudropdownitem.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Change:
  - Migrated section header menu trigger/content from `Menubar.Root` wrapper rendering to `DropdownMenu.Root` wrapperless rendering in `MenuButton`, moving `setta-prevent-section-active-css` onto the trigger button.
  - Added a shared `MenuItemPrimitiveProvider` in `menudropdownitem` so existing menu-action components can render against either `Menubar` or `DropdownMenu` primitives without duplicating item logic.
  - Extended E2E guardrails to assert zero legacy section-menu root wrappers (`div.setta-prevent-section-active-css > button`) and positive flattened rootless trigger counts.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `4319` (down from `4361`, `-42`, `-1.0%` vs phase 19)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `5415` (down from `5457`, `-42`)
  - Per-node descendants: `avg 101.67`, `p95 191`, `max 853`
  - Per-node max depth: `avg 7.45`, `p95 8`, `max 10`
  - Legacy section-menu root wrappers (`div.setta-prevent-section-active-css > button`): `0` (down from `42`)
  - Flattened section-menu rootless triggers: `42`
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase20.trace.json`
- Trace signals (`phase20`):
  - Duration: `14,278.7 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `6`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `163` (`11.42/s`)
  - `DrawFrame`: `64` (`4.48/s`)
  - `DroppedFrame`: `31` (`19.02%`)
  - Main-thread work: `Layout 31.01 ms`, `UpdateLayoutTree 6.78 ms`, `Paint 27.12 ms`, `PrePaint 7.36 ms`

### Phase 21 (combobox chevron icon-wrapper flattening)

- Scope:
  - `frontend/src/components/Utils/Combobox/ComboboxParts.tsx`
  - `frontend/src/components/Utils/atoms/search/StandardSearchRightBtn.tsx`
  - `frontend/src/components/Utils/Combobox/ComboboxParts.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Change:
  - Flattened combobox toggle chevrons from `button > svg > path` rendering to host pseudo-element rendering on `StandardSearchRightBtn`, removing child icon nodes while preserving open/closed orientation transitions.
  - Added `data-combobox-chevron-host="true"` markers on combobox toggle buttons to enforce structural guardrails and simplify benchmark counting.
  - Updated combobox unit coverage for host-chevron rendering and open/closed direction classes.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `4167` (down from `4319`, `-152`, `-3.5%` vs phase 20)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `5263` (down from `5415`, `-152`)
  - Per-node descendants: `avg 98.05`, `p95 185`, `max 793`
  - Per-node max depth: `avg 6.07`, `p95 7`, `max 8`
  - Legacy combobox right-icon wrappers (`button[data-combobox-chevron-host="true"] > svg`): `0` (down from `76`)
  - Flattened combobox right-icon hosts: `76`
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase21.trace.json`
- Trace signals (`phase21`):
  - Duration: `18,023.19 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `4`
  - Renderer main long tasks (`>=50ms`): `3`
  - `BeginFrame`: `371` (`20.58/s`)
  - `DrawFrame`: `113` (`6.27/s`)
  - `DroppedFrame`: `10` (`2.7%`)
  - Main-thread work: `Layout 26.82 ms`, `UpdateLayoutTree 7.21 ms`, `Paint 46.11 ms`, `PrePaint 6.69 ms`

### Phase 22 (param filter icon-wrapper flattening)

- Scope:
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
  - `frontend/src/components/Section/Layouts/DictArea.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Change:
  - Flattened section param-filter icon rendering from `search > i.gg-sort-az` to host rendering on the existing `search` element using pseudo-elements and a currentColor background stripe.
  - Added `data-param-filter-icon-host="true"` on param-filter hosts and removed icon child nodes in the settings benchmark path.
  - Extended unit + E2E guardrails to assert zero legacy param-filter icon wrappers and positive flattened host counts.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `4125` (down from `4167`, `-42`, `-1.0%` vs phase 21)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `5221` (down from `5263`, `-42`)
  - Per-node descendants: `avg 97.05`, `p95 184`, `max 792`
  - Per-node max depth: `avg 6.07`, `p95 7`, `max 8`
  - Legacy param-filter icon wrappers (`search[data-param-filter-icon-host="true"] > i.gg-sort-az`): `0` (down from `42`)
  - Flattened param-filter icon hosts: `42`
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase22.trace.json`
- Trace signals (`phase22`):
  - Duration: `13,703.63 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `3`
  - Renderer main long tasks (`>=50ms`): `3`
  - `BeginFrame`: `346` (`25.25/s`)
  - `DrawFrame`: `69` (`5.04/s`)
  - `DroppedFrame`: `59` (`17.05%`)
  - Main-thread work: `Layout 34.72 ms`, `UpdateLayoutTree 7.68 ms`, `Paint 36.59 ms`, `PrePaint 4.56 ms`

### Guardrail Automation

- Added automated structural benchmark guardrail:
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Guardrails enforced in test:
  - viewport descendant budget
  - total element budget
  - per-node descendant budgets
  - max node depth budget
  - zero count for known removed wrapper patterns (`focus-visible` container wrappers, `group/resize`, value-border spans, legacy combobox wrapper divs, legacy combobox right wrappers, legacy combobox right-icon wrappers, legacy param-filter icon wrappers, legacy section title wrappers, legacy switch wrappers, legacy switch-thumb span wrappers, legacy param-group outer wrappers, kwargs add/remove icon child wrappers, kwargs pin icon child wrappers, kwargs convert/delete icon child wrappers, section-header minimize icon child wrappers, section-header delete/hide icon child wrappers, section-header lock icon child wrappers, section-menu default icon child wrappers, section-menu root wrappers, `.cm-line` wrappers, and DummyCodeMirror single-span wrappers in this benchmark view)

## Conclusion (latest)

- Baseline to latest DOM deltas (`/settings` -> `All Settings`):
  - Viewport descendants: `8619 -> 4125` (`-4494`, `-52.1%`)
  - Per-node descendants avg: `204.05 -> 97.05` (`-52.4%`)
  - Per-node descendants max: `1854 -> 792` (`-57.3%`)
  - Per-node depth avg/max: `12.74/17 -> 6.07/8`
- DOM flattening now has both manual profiling artifacts and automated E2E structural guardrails for both earlier and newly removed wrapper patterns.
- Runtime traces in later phases remained noisy; DOM-shape gains are clear, but per-trace frame-drop rates were variable.

## Raw Artifacts (additional local-only)

- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase4.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase4.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase4_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase5.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase5b.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase5c.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase5.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase5_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase5b.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase5b_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase6.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase6.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase6_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase7.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase7.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase7_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase7b.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase7b.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase7b_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase8.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase8.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase8_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase9.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase9.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase9_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase10.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase10.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase10_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase10b.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase11.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase11.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase11_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase12.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase12b.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase12.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase12_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase13.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase13b.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase13.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase13_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase14.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase14b.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase14.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase14_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase15.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase15b.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase15.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase15_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase16.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase16b.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase16.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase16_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase17.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase17b.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase17.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase17_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase18.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase18b.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase18.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase18_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase19.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase20.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase20.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase20_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase21.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase21.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase21_fitview.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase22.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase22.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase22_fitview.png`

## After (continued)

### Phase 23 (param filter host-wrapper flattening)

- Scope:
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Change:
  - Flattened section param-filter structure from `search > input` to a single `input` host node.
  - Moved param-filter sort-icon rendering onto the `input` host using layered background gradients and host color variables.
  - Updated E2E guardrails to assert zero legacy `search[data-param-filter-icon-host="true"]` hosts and positive flattened `input[data-param-filter-icon-host="true"]` hosts.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `4083` (down from `4125`, `-42`, `-1.0%` vs phase 22)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `5179` (down from `5221`, `-42`)
  - Per-node descendants: `avg 96.05`, `p95 183`, `max 791`
  - Per-node max depth: `avg 6.07`, `p95 7`, `max 8`
  - Legacy param-filter search hosts (`search[data-param-filter-icon-host="true"]`): `0` (down from `42`)
  - Flattened param-filter input hosts (`input[data-param-filter-icon-host="true"]`): `42`
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase23.trace.json`
- Trace signals (`phase23`):
  - Duration: `17,528.77 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `2`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `341` (`19.45/s`)
  - `DrawFrame`: `190` (`10.84/s`)
  - `DroppedFrame`: `14` (`4.11%`)
  - Main-thread work: `Layout 52.02 ms`, `UpdateLayoutTree 18.62 ms`, `Paint 124.69 ms`, `PrePaint 16.37 ms`

## Conclusion (latest update)

- Baseline to latest DOM deltas (`/settings` -> `All Settings`):
  - Viewport descendants: `8619 -> 4083` (`-4536`, `-52.6%`)
  - Per-node descendants avg: `204.05 -> 96.05` (`-52.9%`)
  - Per-node descendants max: `1854 -> 791` (`-57.3%`)
  - Per-node depth avg/max: `12.74/17 -> 6.07/8`
- DOM flattening now includes full removal of param-filter host wrappers in this benchmark path (`search` host count `42 -> 0`) while preserving existing behavior and guardrails.
- Runtime traces remain run-to-run variable, but this phase showed a lower dropped-frame ratio than phase 22 alongside continued DOM-shape reduction.

## Raw Artifacts (additional local-only)

- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase23.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase23.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase23_fitview.png`

## After (continued)

### Phase 24 (section header controls-wrapper flattening)

- Scope:
  - `frontend/src/components/Section/Header/SectionHeader.tsx`
  - `frontend/src/components/Section/Header/SectionHeader.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Change:
  - Flattened section header trailing controls from `header > div.z-10.ml-auto.flex.items-center > controls` to direct `header > controls` rendering.
  - Removed the dedicated per-header controls wrapper while preserving the existing controls and interaction behavior.
  - Extended unit + E2E guardrails to assert zero legacy section header controls wrappers and positive flattened direct-host counts.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `4041` (down from `4083`, `-42`, `-1.0%` vs phase 23)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `5137` (down from `5179`, `-42`)
  - Per-node descendants: `avg 95.05`, `p95 182`, `max 790`
  - Per-node max depth: `avg 6.07`, `p95 7`, `max 8`
  - Legacy section-header controls wrappers (`header.section-title > div.z-10.ml-auto.flex.items-center`): `0` (down from `42`)
  - Flattened section-header control hosts (`header.section-title` with direct lock button hosts): `42`
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase24.trace.json`
- Trace signals (`phase24`):
  - Duration: `15,976.81 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `3`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `356` (`22.28/s`)
  - `DrawFrame`: `202` (`12.64/s`)
  - `DroppedFrame`: `17` (`4.78%`)
  - Main-thread work: `Layout 46.51 ms`, `UpdateLayoutTree 18.96 ms`, `Paint 108.97 ms`, `PrePaint 15.18 ms`

## Conclusion (latest update)

- Baseline to latest DOM deltas (`/settings` -> `All Settings`):
  - Viewport descendants: `8619 -> 4041` (`-4578`, `-53.1%`)
  - Per-node descendants avg: `204.05 -> 95.05` (`-53.4%`)
  - Per-node descendants max: `1854 -> 790` (`-57.4%`)
  - Per-node depth avg/max: `12.74/17 -> 6.07/8`
- DOM flattening now includes full removal of section-header controls wrappers in the benchmark path (`42 -> 0`) with automated unit + E2E guardrails for the new direct-host structure.
- Runtime traces remain variable run-to-run, but DOM-shape reduction continues and frame-drop ratios in the latest passes remain materially lower than baseline.

## Raw Artifacts (additional local-only)

- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase24.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase24.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase24_fitview.png`

## After (continued)

### Phase 25 (agentic safe-zone wrapper flattening)

- Scope:
  - `frontend/src/components/Section/Container/AgenticEdgeHandles.tsx`
  - `frontend/src/forks/xyflow/core/styles/style.css`
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Change:
  - Flattened agentic safe zones by removing dedicated `div.agentic-handle-safe-zone` wrapper nodes from `AgenticEdgeHandles`.
  - Replaced wrapper-based safe-zone rendering with handle-host `::before` pseudo-elements on the existing left/right agentic handles.
  - Extended E2E guardrails to assert zero legacy safe-zone wrappers and positive pseudo-host counts.
- DOM metrics (same `/settings` -> `All Settings` sample):
  - React Flow nodes: `42` (unchanged)
  - Viewport descendants: `3957` (down from `4041`, `-84`, `-2.1%` vs phase 24)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Total elements: `5053` (down from `5137`, `-84`)
  - Per-node descendants: `avg 93.05`, `p95 180`, `max 788`
  - Per-node max depth: `avg 6.07`, `p95 7`, `max 8`
  - Legacy agentic safe-zone wrappers (`div.agentic-handle-safe-zone`): `0` (down from `84`)
  - Flattened agentic safe-zone pseudo hosts (`.react-flow__handle.agentic-handle::before`): `84`
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase25.trace.json`
- Trace signals (`phase25`):
  - Duration: `15,585.58 ms`
  - Renderer main tasks over frame budget (`>=16.67ms`): `2`
  - Renderer main long tasks (`>=50ms`): `2`
  - `BeginFrame`: `342` (`21.94/s`)
  - `DrawFrame`: `189` (`12.13/s`)
  - `DroppedFrame`: `15` (`4.39%`)
  - Main-thread work: `Layout 48.22 ms`, `UpdateLayoutTree 18.5 ms`, `Paint 116.41 ms`, `PrePaint 15.09 ms`

## Conclusion (latest update)

- Baseline to latest DOM deltas (`/settings` -> `All Settings`):
  - Viewport descendants: `8619 -> 3957` (`-4662`, `-54.1%`)
  - Per-node descendants avg: `204.05 -> 93.05` (`-54.4%`)
  - Per-node descendants max: `1854 -> 788` (`-57.5%`)
  - Per-node depth avg/max: `12.74/17 -> 6.07/8`
- DOM flattening now includes full removal of standalone agentic safe-zone wrappers (`84 -> 0`) while preserving agentic edge behavior in targeted E2E coverage.
- Runtime traces remain variable run-to-run, but later-phase dropped-frame ratios remain materially below baseline while DOM-shape reduction continues.

## Raw Artifacts (additional local-only)

- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase25.trace.json`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase25.png`
- `perf/artifacts/frontend/2026-03-04_settings-all-settings_dom-flattening_phase25_fitview.png`
