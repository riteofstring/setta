# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-06T11:43:49.825Z

## Summary

- Browser: Google Chrome for Testing 149.0.7827.2
- Browser executable: /Users/kevin/Library/Caches/setta/chrome-for-testing/Canary/149.0.7827.2/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
- Compared: baseline-primary vs candidate
- Fixtures compared: 174
- Pass: 44
- Blocking regression: 130
- Capture blocked: 0
- Runtime page error groups: 0

## Iteration Notes

- Inspected real Settings `settings-all-settings-section-settings-section-gui`,
  `settings-all-settings-section-settings-section-backend`, and
  `settings-all-settings-section-settings-section-shortcuts` desktop
  baseline/candidate/diff images. A separate drift from the previously rejected
  sans label origin work was visible in long display labels: retained canvas
  labels clipped raw text, while the DOM baseline used ellipsis.
- Updated retained row label drawing to measure canvas text and draw a
  CSS-like ellipsis before the text reaches the label/control boundary.
- Reran the full Chrome-for-Testing 149 checkpoint. Counts remained 44 pass /
  130 blocking, with 0 capture-blocked fixtures and 0 runtime page-error groups.
  The targeted backend Settings crops improved in all viewports:
  desktop mean delta 4.12 -> 3.84, compact desktop 3.99 -> 3.71, and narrow
  4.95 -> 4.47. No fixture changed status.
- Remaining Settings blockers are not accepted differences. The largest shared
  drift is still real Settings row text/control presentation and control
  geometry in dense display-label sections.

## Runtime Signals

- baseline-primary: 174 captures, 0 page errors, 18 console warnings/errors.
  - console x12: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x4: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x2: Failed to load resource: the server responded with a status of 404 (Not Found)
- candidate: 174 captures, 0 page errors, 17 console warnings/errors.
  - console x12: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x4: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x1: Failed to load resource: the server responded with a status of 404 (Not Found)

## Fixture Results

| Fixture | Viewport | Status | Reason | Changed Pixels | Mean Delta |
| --- | --- | --- | --- | ---: | ---: |
| project-surface | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0042 | 0.25 |
| param-controls-closed | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0042 | 0.25 |
| dense-param-dict | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0055 | 0.11 |
| nested-param-tree | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0139 | 0.53 |
| callable-edge-handles | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0068 | 0.30 |
| selection-resize | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0042 | 0.25 |
| dropdown-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0035 | 0.22 |
| color-picker-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0033 | 0.21 |
| date-calendar-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0024 | 0.16 |
| native-text-island | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0024 | 0.16 |
| drag-preview | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0040 | 0.25 |
| project-surface | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0048 | 0.32 |
| param-controls-closed | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0048 | 0.32 |
| dense-param-dict | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0050 | 0.10 |
| nested-param-tree | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0137 | 0.53 |
| callable-edge-handles | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0067 | 0.30 |
| selection-resize | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0058 | 0.36 |
| dropdown-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0048 | 0.32 |
| color-picker-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0048 | 0.32 |
| date-calendar-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0040 | 0.27 |
| native-text-island | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0040 | 0.27 |
| drag-preview | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0057 | 0.37 |
| project-surface | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0096 | 0.65 |
| param-controls-closed | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0096 | 0.65 |
| dense-param-dict | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| nested-param-tree | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| callable-edge-handles | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| selection-resize | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0096 | 0.65 |
| dropdown-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0096 | 0.65 |
| color-picker-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0096 | 0.65 |
| date-calendar-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0096 | 0.65 |
| native-text-island | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0096 | 0.65 |
| drag-preview | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0096 | 0.65 |
| settings-all-settings-pane | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0406 | 1.56 |
| settings-all-settings-section-settings-section-shortcuts | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0455 | 2.20 |
| settings-all-settings-section-settings-section-gui | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0697 | 3.08 |
| settings-all-settings-section-settings-section-backend | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0785 | 3.84 |
| settings-all-settings-section-settings-section-chatwindowing | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1057 | 6.07 |
| settings-all-settings-section-settings-section-sectionsizingpolicy | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0664 | 3.66 |
| settings-all-settings-section-settings-section-languageserver | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0340 | 2.27 |
| settings-all-settings-section-settings-section-browsersectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0379 | 1.68 |
| settings-all-settings-section-settings-section-callablesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0306 | 1.36 |
| settings-all-settings-section-settings-section-chartsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0427 | 1.88 |
| settings-all-settings-section-settings-section-chatsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0565 | 2.96 |
| settings-all-settings-section-settings-section-codesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0561 | 3.21 |
| settings-all-settings-section-settings-section-dictsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0327 | 1.43 |
| settings-all-settings-section-settings-section-drawsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0364 | 1.65 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0454 | 2.10 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0454 | 2.10 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0327 | 1.43 |
| settings-all-settings-section-settings-section-groupsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0474 | 2.28 |
| settings-all-settings-section-settings-section-iframesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0422 | 1.90 |
| settings-all-settings-section-settings-section-imagesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0429 | 1.90 |
| settings-all-settings-section-settings-section-listrootsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0503 | 2.36 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0443 | 1.96 |
| settings-all-settings-section-settings-section-pluginsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0600 | 3.21 |
| settings-all-settings-section-settings-section-promptsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0567 | 3.08 |
| settings-all-settings-section-settings-section-socialsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0451 | 1.95 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0351 | 1.60 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0418 | 1.87 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0477 | 2.14 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0419 | 1.91 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0492 | 2.25 |
| settings-all-settings-section-settings-section-terminalsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0438 | 1.92 |
| settings-all-settings-section-settings-section-textblocksectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0413 | 1.94 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0281 | 1.27 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0206 | 0.94 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0383 | 1.80 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0311 | 1.41 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0215 | 1.01 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0237 | 1.11 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0199 | 0.88 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0212 | 0.95 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0188 | 0.91 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0188 | 0.91 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0206 | 0.94 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0206 | 0.94 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0201 | 0.91 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0317 | 1.50 |
| settings-all-settings-pane | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0135 | 0.66 |
| settings-all-settings-section-settings-section-shortcuts | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0451 | 2.19 |
| settings-all-settings-section-settings-section-gui | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0606 | 2.68 |
| settings-all-settings-section-settings-section-backend | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0752 | 3.71 |
| settings-all-settings-section-settings-section-chatwindowing | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0993 | 5.98 |
| settings-all-settings-section-settings-section-sectionsizingpolicy | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0659 | 3.65 |
| settings-all-settings-section-settings-section-languageserver | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0339 | 2.27 |
| settings-all-settings-section-settings-section-browsersectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0358 | 1.65 |
| settings-all-settings-section-settings-section-callablesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0305 | 1.36 |
| settings-all-settings-section-settings-section-chartsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0390 | 1.82 |
| settings-all-settings-section-settings-section-chatsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0527 | 2.91 |
| settings-all-settings-section-settings-section-codesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0552 | 3.20 |
| settings-all-settings-section-settings-section-dictsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0326 | 1.43 |
| settings-all-settings-section-settings-section-drawsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0335 | 1.51 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0425 | 2.05 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0425 | 2.05 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0326 | 1.43 |
| settings-all-settings-section-settings-section-groupsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0445 | 2.24 |
| settings-all-settings-section-settings-section-iframesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0385 | 1.85 |
| settings-all-settings-section-settings-section-imagesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0391 | 1.85 |
| settings-all-settings-section-settings-section-listrootsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0460 | 2.30 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0406 | 1.91 |
| settings-all-settings-section-settings-section-pluginsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0554 | 3.14 |
| settings-all-settings-section-settings-section-promptsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0530 | 3.02 |
| settings-all-settings-section-settings-section-socialsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0405 | 1.89 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0347 | 1.59 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0384 | 1.82 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0429 | 2.03 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0389 | 1.87 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0446 | 2.18 |
| settings-all-settings-section-settings-section-terminalsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0398 | 1.86 |
| settings-all-settings-section-settings-section-textblocksectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0392 | 1.91 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0281 | 1.26 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0205 | 0.94 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0335 | 1.57 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0310 | 1.41 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0214 | 1.01 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0236 | 1.11 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0198 | 0.88 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0211 | 0.94 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0187 | 0.91 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0187 | 0.91 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0205 | 0.94 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0205 | 0.94 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0200 | 0.91 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0317 | 1.50 |
| settings-all-settings-pane | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0245 | 0.97 |
| settings-all-settings-section-settings-section-shortcuts | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0972 | 3.30 |
| settings-all-settings-section-settings-section-gui | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0682 | 2.45 |
| settings-all-settings-section-settings-section-backend | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1161 | 4.47 |
| settings-all-settings-section-settings-section-chatwindowing | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1103 | 5.41 |
| settings-all-settings-section-settings-section-sectionsizingpolicy | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1028 | 4.18 |
| settings-all-settings-section-settings-section-languageserver | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0433 | 2.11 |
| settings-all-settings-section-settings-section-browsersectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0591 | 2.39 |
| settings-all-settings-section-settings-section-callablesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0631 | 2.19 |
| settings-all-settings-section-settings-section-chartsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0568 | 2.49 |
| settings-all-settings-section-settings-section-chatsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0772 | 4.14 |
| settings-all-settings-section-settings-section-codesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0967 | 4.77 |
| settings-all-settings-section-settings-section-dictsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0675 | 2.28 |
| settings-all-settings-section-settings-section-drawsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0562 | 1.91 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0668 | 2.84 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0668 | 2.84 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0675 | 2.28 |
| settings-all-settings-section-settings-section-groupsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0719 | 3.07 |
| settings-all-settings-section-settings-section-iframesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0558 | 2.49 |
| settings-all-settings-section-settings-section-imagesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0568 | 2.48 |
| settings-all-settings-section-settings-section-listrootsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0661 | 3.00 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0596 | 2.58 |
| settings-all-settings-section-settings-section-pluginsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0753 | 4.15 |
| settings-all-settings-section-settings-section-promptsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0807 | 4.35 |
| settings-all-settings-section-settings-section-socialsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0552 | 2.49 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0627 | 2.36 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0581 | 2.56 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0597 | 2.61 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0607 | 2.64 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0608 | 2.88 |
| settings-all-settings-section-settings-section-terminalsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0571 | 2.56 |
| settings-all-settings-section-settings-section-textblocksectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0671 | 2.70 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0624 | 2.10 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0469 | 1.65 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0494 | 1.73 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0690 | 2.31 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0469 | 1.70 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0507 | 1.82 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0453 | 1.57 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0475 | 1.63 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0409 | 1.53 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0409 | 1.53 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0469 | 1.65 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0469 | 1.65 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0451 | 1.57 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0692 | 2.45 |

## Prioritized Visual-Fix List

- settings-all-settings-pane / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-shortcuts / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-gui / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-backend / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chatwindowing / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-sectionsizingpolicy / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-languageserver / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-browsersectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-callablesectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chartsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chatsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-codesectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-dictsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-drawsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-genpythoncodesectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-genpythonmetadatasectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-globalvariablessectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-groupsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-iframesectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-imagesectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-listrootsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-metacontrolsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-pluginsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-promptsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-socialsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-spreadsheetsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachineendsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachinegatesectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachinestartsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-taskboardsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-terminalsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-textblocksectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-buttonparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-codeparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-dateparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-dropdownparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-passwordparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-switchparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-textareaparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-textparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-timeparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-shortcuts / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-gui / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-backend / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chatwindowing / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-sectionsizingpolicy / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-languageserver / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-browsersectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-callablesectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chartsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chatsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-codesectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-dictsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-drawsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-genpythoncodesectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-genpythonmetadatasectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-globalvariablessectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-groupsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-iframesectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-imagesectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-listrootsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-metacontrolsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-pluginsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-promptsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-socialsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-spreadsheetsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachineendsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachinegatesectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachinestartsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-taskboardsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-terminalsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-textblocksectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-buttonparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-codeparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-dateparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-dropdownparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-passwordparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-switchparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-textareaparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-timeparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-pane / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-shortcuts / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-gui / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-backend / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chatwindowing / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-sectionsizingpolicy / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-languageserver / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-browsersectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-callablesectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chartsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chatsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-codesectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-dictsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-drawsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-genpythoncodesectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-genpythonmetadatasectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-globalvariablessectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-groupsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-iframesectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-imagesectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-listrootsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-metacontrolsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-pluginsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-promptsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-socialsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-spreadsheetsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachineendsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachinegatesectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachinestartsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-taskboardsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-terminalsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-textblocksectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-buttonparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-codeparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-dateparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-dropdownparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-nestedparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-passwordparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-rotaryparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-sliderparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-switchparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-textareaparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-textparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-timeparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.

## Notes

- `pass` means the automated pixel diff is within the temporary tolerance.
- `blocking-regression` means the candidate needs human review or a visual fix before the refactor loop resumes.
- `capture-blocked` means the screenshot path failed and must be fixed or replaced with another reliable capture method.
