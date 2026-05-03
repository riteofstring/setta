# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-06T12:56:24.780Z

## Summary

- Browser: Google Chrome for Testing 149.0.7827.2
- Browser executable: /Users/kevin/Library/Caches/setta/chrome-for-testing/Canary/149.0.7827.2/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
- Compared: baseline-primary vs candidate
- Fixtures compared: 174
- Pass: 46
- Blocking regression: 128
- Capture blocked: 0
- Runtime page error groups: 0

## Iteration Notes

- Inspected real Settings `settings-all-settings-section-settings-section-chatwindowing`
  baseline/candidate/diff crops. The retained candidate used root-row value
  column geometry for nested shortcut rows, while the DOM baseline shifts
  nested child values right by the extra leading gutter and renders an inset
  nested rail.
- Updated retained row layout so nested controls, control hit records, popup
  anchors, and DOM-island rects apply the depth gutter from the shared row
  layout. The Setta project adapter now passes the same `0.75rem` nested
  gutter used by the old param grid into generic `GpuFlow` retained content.
- Updated the retained nested guide from a thin dashed edge marker to an inset
  6px rail. This also reduced synthetic `nested-param-tree` deltas without
  changing the retained label font, weight, or root-row origin.
- Reran the full Chrome-for-Testing 149 checkpoint. Counts improved from
  44 pass / 130 blocking to 46 pass / 128 blocking, with 0 capture-blocked
  fixtures and 0 runtime page-error groups. Targeted Settings improvements:
  `chatwindowing` desktop `0.1057 -> 0.0926` changed pixels and
  `6.07 -> 5.38` mean delta, compact desktop `0.0993 -> 0.0861` and
  `5.98 -> 5.28`, narrow `0.1103 -> 0.0964` and `5.41 -> 5.00`.
- `languageserver` desktop and compact desktop now pass; `sectionsizingpolicy`
  improved substantially across all viewports but remains blocking. Remaining
  Settings blockers are not accepted differences.

## Runtime Signals

- baseline-primary: 174 captures, 0 page errors, 16 console warnings/errors.
  - console x9: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x4: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x2: Failed to load resource: the server responded with a status of 404 (Not Found)
- candidate: 174 captures, 0 page errors, 18 console warnings/errors.
  - console x12: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x4: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x2: Failed to load resource: the server responded with a status of 404 (Not Found)

## Fixture Results

| Fixture | Viewport | Status | Reason | Changed Pixels | Mean Delta |
| --- | --- | --- | --- | ---: | ---: |
| project-surface | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0045 | 0.27 |
| param-controls-closed | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0045 | 0.27 |
| dense-param-dict | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0055 | 0.11 |
| nested-param-tree | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0040 | 0.11 |
| callable-edge-handles | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0068 | 0.30 |
| selection-resize | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0044 | 0.27 |
| dropdown-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0038 | 0.24 |
| color-picker-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0036 | 0.23 |
| date-calendar-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0028 | 0.19 |
| native-text-island | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0028 | 0.19 |
| drag-preview | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0043 | 0.26 |
| project-surface | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0053 | 0.35 |
| param-controls-closed | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0053 | 0.35 |
| dense-param-dict | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0050 | 0.10 |
| nested-param-tree | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0038 | 0.11 |
| callable-edge-handles | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0067 | 0.30 |
| selection-resize | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0063 | 0.39 |
| dropdown-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0053 | 0.35 |
| color-picker-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0053 | 0.35 |
| date-calendar-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0046 | 0.32 |
| native-text-island | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0046 | 0.32 |
| drag-preview | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0062 | 0.40 |
| project-surface | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0110 | 0.76 |
| param-controls-closed | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0110 | 0.76 |
| dense-param-dict | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| nested-param-tree | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| callable-edge-handles | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| selection-resize | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0110 | 0.76 |
| dropdown-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0110 | 0.76 |
| color-picker-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0110 | 0.76 |
| date-calendar-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0110 | 0.76 |
| native-text-island | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0110 | 0.76 |
| drag-preview | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0110 | 0.76 |
| settings-all-settings-pane | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0390 | 1.45 |
| settings-all-settings-section-settings-section-shortcuts | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0455 | 2.20 |
| settings-all-settings-section-settings-section-gui | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0660 | 3.08 |
| settings-all-settings-section-settings-section-backend | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0785 | 3.84 |
| settings-all-settings-section-settings-section-chatwindowing | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0926 | 5.38 |
| settings-all-settings-section-settings-section-sectionsizingpolicy | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0376 | 1.90 |
| settings-all-settings-section-settings-section-languageserver | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0188 | 1.19 |
| settings-all-settings-section-settings-section-browsersectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0361 | 1.62 |
| settings-all-settings-section-settings-section-callablesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0307 | 1.37 |
| settings-all-settings-section-settings-section-chartsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0405 | 1.79 |
| settings-all-settings-section-settings-section-chatsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0565 | 2.96 |
| settings-all-settings-section-settings-section-codesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0531 | 3.10 |
| settings-all-settings-section-settings-section-dictsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0327 | 1.43 |
| settings-all-settings-section-settings-section-drawsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0339 | 1.62 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0436 | 2.03 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0436 | 2.03 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0327 | 1.43 |
| settings-all-settings-section-settings-section-groupsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0456 | 2.21 |
| settings-all-settings-section-settings-section-iframesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0402 | 1.83 |
| settings-all-settings-section-settings-section-imagesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0408 | 1.83 |
| settings-all-settings-section-settings-section-listrootsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0484 | 2.29 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0422 | 1.89 |
| settings-all-settings-section-settings-section-pluginsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0588 | 3.19 |
| settings-all-settings-section-settings-section-promptsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0554 | 3.04 |
| settings-all-settings-section-settings-section-socialsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0430 | 1.88 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0347 | 1.57 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0399 | 1.80 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0458 | 2.07 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0400 | 1.84 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0474 | 2.19 |
| settings-all-settings-section-settings-section-terminalsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0418 | 1.85 |
| settings-all-settings-section-settings-section-textblocksectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0395 | 1.87 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0281 | 1.27 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0206 | 0.94 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0343 | 1.76 |
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
| settings-all-settings-section-settings-section-gui | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0582 | 2.69 |
| settings-all-settings-section-settings-section-backend | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0752 | 3.71 |
| settings-all-settings-section-settings-section-chatwindowing | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0861 | 5.28 |
| settings-all-settings-section-settings-section-sectionsizingpolicy | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0372 | 1.89 |
| settings-all-settings-section-settings-section-languageserver | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0186 | 1.19 |
| settings-all-settings-section-settings-section-browsersectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0340 | 1.59 |
| settings-all-settings-section-settings-section-callablesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0306 | 1.36 |
| settings-all-settings-section-settings-section-chartsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0368 | 1.74 |
| settings-all-settings-section-settings-section-chatsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0527 | 2.91 |
| settings-all-settings-section-settings-section-codesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0522 | 3.09 |
| settings-all-settings-section-settings-section-dictsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0326 | 1.43 |
| settings-all-settings-section-settings-section-drawsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0318 | 1.49 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0406 | 1.98 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0406 | 1.98 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0326 | 1.43 |
| settings-all-settings-section-settings-section-groupsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0426 | 2.17 |
| settings-all-settings-section-settings-section-iframesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0365 | 1.77 |
| settings-all-settings-section-settings-section-imagesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0371 | 1.77 |
| settings-all-settings-section-settings-section-listrootsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0441 | 2.23 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0385 | 1.83 |
| settings-all-settings-section-settings-section-pluginsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0542 | 3.12 |
| settings-all-settings-section-settings-section-promptsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0517 | 2.98 |
| settings-all-settings-section-settings-section-socialsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0384 | 1.81 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0342 | 1.56 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0365 | 1.75 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0411 | 1.96 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0371 | 1.80 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0428 | 2.12 |
| settings-all-settings-section-settings-section-terminalsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0377 | 1.80 |
| settings-all-settings-section-settings-section-textblocksectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0373 | 1.84 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0281 | 1.26 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0205 | 0.94 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0308 | 1.55 |
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
| settings-all-settings-pane | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0244 | 0.97 |
| settings-all-settings-section-settings-section-shortcuts | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0972 | 3.30 |
| settings-all-settings-section-settings-section-gui | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0682 | 2.45 |
| settings-all-settings-section-settings-section-backend | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1161 | 4.47 |
| settings-all-settings-section-settings-section-chatwindowing | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0964 | 5.00 |
| settings-all-settings-section-settings-section-sectionsizingpolicy | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0757 | 2.91 |
| settings-all-settings-section-settings-section-languageserver | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0384 | 1.78 |
| settings-all-settings-section-settings-section-browsersectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0566 | 2.33 |
| settings-all-settings-section-settings-section-callablesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0632 | 2.20 |
| settings-all-settings-section-settings-section-chartsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0541 | 2.43 |
| settings-all-settings-section-settings-section-chatsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0772 | 4.14 |
| settings-all-settings-section-settings-section-codesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0943 | 4.68 |
| settings-all-settings-section-settings-section-dictsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0675 | 2.28 |
| settings-all-settings-section-settings-section-drawsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0562 | 1.91 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0643 | 2.79 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0643 | 2.79 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0675 | 2.28 |
| settings-all-settings-section-settings-section-groupsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0694 | 3.02 |
| settings-all-settings-section-settings-section-iframesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0530 | 2.43 |
| settings-all-settings-section-settings-section-imagesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0540 | 2.42 |
| settings-all-settings-section-settings-section-listrootsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0637 | 2.94 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0569 | 2.52 |
| settings-all-settings-section-settings-section-pluginsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0733 | 4.12 |
| settings-all-settings-section-settings-section-promptsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0788 | 4.33 |
| settings-all-settings-section-settings-section-socialsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0525 | 2.43 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0623 | 2.34 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0556 | 2.50 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0573 | 2.55 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0582 | 2.59 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0584 | 2.82 |
| settings-all-settings-section-settings-section-terminalsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0542 | 2.50 |
| settings-all-settings-section-settings-section-textblocksectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0646 | 2.65 |
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
