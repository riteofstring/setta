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

### Guardrail Automation

- Added automated structural benchmark guardrail:
  - `frontend/tests/e2e/settings/settings-all-settings-dom-guardrail.spec.ts`
- Guardrails enforced in test:
  - viewport descendant budget
  - total element budget
  - per-node descendant budgets
  - max node depth budget
  - zero count for known removed wrapper patterns (`focus-visible` container wrappers, `group/resize`, value-border spans, legacy combobox wrapper divs, legacy combobox right wrappers, legacy section title wrappers, legacy switch wrappers, `.cm-line` wrappers, and DummyCodeMirror single-span wrappers in this benchmark view)

## Conclusion (latest)

- Baseline to latest DOM deltas (`/settings` -> `All Settings`):
  - Viewport descendants: `8619 -> 4900` (`-3719`, `-43.1%`)
  - Per-node descendants avg: `204.05 -> 115.5` (`-43.4%`)
  - Per-node descendants max: `1854 -> 864` (`-53.4%`)
  - Per-node depth avg/max: `12.74/17 -> 8.45/11`
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
