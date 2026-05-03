# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-06T09:11:48.310Z

## Summary

- Browser: Google Chrome for Testing 149.0.7827.2
- Browser executable: /Users/kevin/Library/Caches/setta/chrome-for-testing/Canary/149.0.7827.2/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
- Compared: baseline-primary vs candidate
- Fixtures compared: 174
- Pass: 36
- Blocking regression: 138
- Capture blocked: 0
- Runtime page error groups: 0

## Iteration Notes

- Inspected real Settings `All Settings` baseline/candidate/diff images for
  `gui`, `dateParamCodeObjDefault`, and `switchParamCodeObjDefault` after the
  retained display-row divider slice. The remaining common blocker set is real
  Settings only; synthetic/general GpuFlow fixtures remain green.
- Found a retained switch owner mismatch in dark Settings rows: unchecked
  switches in the canvas candidate used a light thumb, while the baseline DOM
  switch used a dark thumb on the dark off track. The retained switch canvas
  renderer now uses the dark row thumb color for enabled row-text switches in
  both checked and unchecked states.
- Reran the full checkpoint with Chrome for Testing 149 after the switch fix.
  Counts remain 36 pass, 138 blocking regressions, 0 capture-blocked fixtures,
  and 0 runtime page-error groups.
- Representative targeted movements vs the prior checkpoint:
  `switchParamCodeObjDefault` desktop `0.0446 / 2.39 -> 0.0445 / 2.34`,
  `dateParamCodeObjDefault` desktop `0.0610 / 3.53 -> 0.0609 / 3.47`, and
  `backend` desktop `0.1181 / 6.16 -> 0.1180 / 6.08` for changed pixels /
  mean delta.
- The remaining blocking Settings diffs are not accepted differences. Common
  remaining owners appear to be row text/value rasterization, text-like control
  geometry, and other specialized idle control states.

## Runtime Signals

- baseline-primary: 174 captures, 0 page errors, 18 console warnings/errors.
  - console x12: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x4: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x2: Failed to load resource: the server responded with a status of 404 (Not Found)
- candidate: 174 captures, 0 page errors, 18 console warnings/errors.
  - console x12: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x4: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x2: Failed to load resource: the server responded with a status of 404 (Not Found)

## Fixture Results

| Fixture                                                                        | Viewport        | Status              | Reason                                               | Changed Pixels | Mean Delta |
| ------------------------------------------------------------------------------ | --------------- | ------------------- | ---------------------------------------------------- | -------------: | ---------: |
| project-surface                                                                | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0050 |       0.31 |
| param-controls-closed                                                          | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0050 |       0.31 |
| dense-param-dict                                                               | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0099 |       0.24 |
| nested-param-tree                                                              | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0190 |       0.68 |
| callable-edge-handles                                                          | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0105 |       0.47 |
| selection-resize                                                               | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0051 |       0.31 |
| dropdown-open                                                                  | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0042 |       0.27 |
| color-picker-open                                                              | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0038 |       0.25 |
| date-calendar-open                                                             | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0030 |       0.20 |
| native-text-island                                                             | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0030 |       0.20 |
| drag-preview                                                                   | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0047 |       0.30 |
| project-surface                                                                | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0057 |       0.38 |
| param-controls-closed                                                          | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0057 |       0.38 |
| dense-param-dict                                                               | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0075 |       0.18 |
| nested-param-tree                                                              | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0167 |       0.62 |
| callable-edge-handles                                                          | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0086 |       0.42 |
| selection-resize                                                               | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0070 |       0.45 |
| dropdown-open                                                                  | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0057 |       0.38 |
| color-picker-open                                                              | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0057 |       0.38 |
| date-calendar-open                                                             | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0049 |       0.33 |
| native-text-island                                                             | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0049 |       0.33 |
| drag-preview                                                                   | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0066 |       0.42 |
| project-surface                                                                | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0119 |       0.79 |
| param-controls-closed                                                          | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0119 |       0.79 |
| dense-param-dict                                                               | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| nested-param-tree                                                              | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| callable-edge-handles                                                          | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| selection-resize                                                               | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0117 |       0.79 |
| dropdown-open                                                                  | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0117 |       0.79 |
| color-picker-open                                                              | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0117 |       0.79 |
| date-calendar-open                                                             | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0117 |       0.79 |
| native-text-island                                                             | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0117 |       0.79 |
| drag-preview                                                                   | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0117 |       0.79 |
| settings-all-settings-pane                                                     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0426 |       1.87 |
| settings-all-settings-section-settings-section-shortcuts                       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0868 |       5.69 |
| settings-all-settings-section-settings-section-gui                             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0940 |       4.62 |
| settings-all-settings-section-settings-section-backend                         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1180 |       6.08 |
| settings-all-settings-section-settings-section-chatwindowing                   | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1160 |       6.23 |
| settings-all-settings-section-settings-section-sectionsizingpolicy             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0696 |       3.68 |
| settings-all-settings-section-settings-section-languageserver                  | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0413 |       2.31 |
| settings-all-settings-section-settings-section-browsersectiondefault           | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0686 |       3.04 |
| settings-all-settings-section-settings-section-callablesectiondefault          | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0705 |       3.39 |
| settings-all-settings-section-settings-section-chartsectiondefault             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0692 |       2.91 |
| settings-all-settings-section-settings-section-chatsectiondefault              | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0760 |       3.63 |
| settings-all-settings-section-settings-section-codesectiondefault              | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0789 |       4.10 |
| settings-all-settings-section-settings-section-dictsectiondefault              | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0739 |       3.63 |
| settings-all-settings-section-settings-section-drawsectiondefault              | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0667 |       3.47 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0717 |       3.31 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0717 |       3.31 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault   | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0739 |       3.63 |
| settings-all-settings-section-settings-section-groupsectiondefault             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0833 |       3.75 |
| settings-all-settings-section-settings-section-iframesectiondefault            | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0682 |       2.85 |
| settings-all-settings-section-settings-section-imagesectiondefault             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0697 |       2.97 |
| settings-all-settings-section-settings-section-listrootsectiondefault          | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0778 |       3.55 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0756 |       3.14 |
| settings-all-settings-section-settings-section-pluginsectiondefault            | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0767 |       3.56 |
| settings-all-settings-section-settings-section-promptsectiondefault            | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0756 |       3.62 |
| settings-all-settings-section-settings-section-socialsectiondefault            | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0711 |       2.91 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0740 |       3.39 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault   | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0738 |       3.34 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault  | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0796 |       3.58 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0742 |       3.46 |
| settings-all-settings-section-settings-section-taskboardsectiondefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0737 |       3.19 |
| settings-all-settings-section-settings-section-terminalsectiondefault          | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0718 |       2.96 |
| settings-all-settings-section-settings-section-textblocksectiondefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0782 |       3.53 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0565 |       3.48 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault      | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0425 |       2.23 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault  | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0611 |       3.12 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0609 |       3.47 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0413 |       2.18 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0491 |       2.80 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0468 |       2.36 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0483 |       2.34 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0372 |       1.94 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0375 |       1.96 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0445 |       2.34 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0425 |       2.23 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0424 |       2.26 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0635 |       3.66 |
| settings-all-settings-pane                                                     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0251 |       1.64 |
| settings-all-settings-section-settings-section-shortcuts                       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0844 |       5.63 |
| settings-all-settings-section-settings-section-gui                             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0802 |       4.13 |
| settings-all-settings-section-settings-section-backend                         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1090 |       5.84 |
| settings-all-settings-section-settings-section-chatwindowing                   | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1066 |       6.07 |
| settings-all-settings-section-settings-section-sectionsizingpolicy             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0672 |       3.62 |
| settings-all-settings-section-settings-section-languageserver                  | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0389 |       2.25 |
| settings-all-settings-section-settings-section-browsersectiondefault           | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0625 |       2.92 |
| settings-all-settings-section-settings-section-callablesectiondefault          | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0660 |       3.30 |
| settings-all-settings-section-settings-section-chartsectiondefault             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0617 |       2.77 |
| settings-all-settings-section-settings-section-chatsectiondefault              | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0686 |       3.50 |
| settings-all-settings-section-settings-section-codesectiondefault              | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0740 |       4.01 |
| settings-all-settings-section-settings-section-dictsectiondefault              | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0695 |       3.54 |
| settings-all-settings-section-settings-section-drawsectiondefault              | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0602 |       3.25 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0652 |       3.18 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0652 |       3.18 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault   | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0695 |       3.54 |
| settings-all-settings-section-settings-section-groupsectiondefault             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0760 |       3.62 |
| settings-all-settings-section-settings-section-iframesectiondefault            | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0607 |       2.71 |
| settings-all-settings-section-settings-section-imagesectiondefault             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0622 |       2.84 |
| settings-all-settings-section-settings-section-listrootsectiondefault          | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0699 |       3.40 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0676 |       3.00 |
| settings-all-settings-section-settings-section-pluginsectiondefault            | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0685 |       3.41 |
| settings-all-settings-section-settings-section-promptsectiondefault            | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0682 |       3.49 |
| settings-all-settings-section-settings-section-socialsectiondefault            | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0627 |       2.76 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0687 |       3.28 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault   | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0663 |       3.18 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault  | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0704 |       3.35 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0672 |       3.31 |
| settings-all-settings-section-settings-section-taskboardsectiondefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0656 |       3.04 |
| settings-all-settings-section-settings-section-terminalsectiondefault          | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0638 |       2.82 |
| settings-all-settings-section-settings-section-textblocksectiondefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0717 |       3.40 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0540 |       3.42 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault      | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0396 |       2.16 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault  | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0530 |       2.81 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0580 |       3.40 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0385 |       2.11 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0465 |       2.73 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0435 |       2.28 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0448 |       2.27 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0346 |       1.88 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0349 |       1.90 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0416 |       2.27 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0396 |       2.16 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0396 |       2.19 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0606 |       3.59 |
| settings-all-settings-pane                                                     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0314 |       1.69 |
| settings-all-settings-section-settings-section-shortcuts                       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1233 |       5.87 |
| settings-all-settings-section-settings-section-gui                             | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0852 |       4.14 |
| settings-all-settings-section-settings-section-backend                         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1428 |       6.81 |
| settings-all-settings-section-settings-section-chatwindowing                   | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1159 |       5.61 |
| settings-all-settings-section-settings-section-sectionsizingpolicy             | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1047 |       4.28 |
| settings-all-settings-section-settings-section-languageserver                  | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0494 |       2.15 |
| settings-all-settings-section-settings-section-browsersectiondefault           | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0714 |       3.51 |
| settings-all-settings-section-settings-section-callablesectiondefault          | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0827 |       4.03 |
| settings-all-settings-section-settings-section-chartsectiondefault             | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0658 |       3.27 |
| settings-all-settings-section-settings-section-chatsectiondefault              | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0828 |       4.52 |
| settings-all-settings-section-settings-section-codesectiondefault              | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1041 |       5.25 |
| settings-all-settings-section-settings-section-dictsectiondefault              | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0889 |       4.39 |
| settings-all-settings-section-settings-section-drawsectiondefault              | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0749 |       3.67 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0777 |       3.81 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0777 |       3.81 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault   | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0889 |       4.39 |
| settings-all-settings-section-settings-section-groupsectiondefault             | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0838 |       4.18 |
| settings-all-settings-section-settings-section-iframesectiondefault            | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0639 |       3.16 |
| settings-all-settings-section-settings-section-imagesectiondefault             | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0669 |       3.36 |
| settings-all-settings-section-settings-section-listrootsectiondefault          | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0759 |       3.86 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0697 |       3.46 |
| settings-all-settings-section-settings-section-pluginsectiondefault            | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0790 |       4.30 |
| settings-all-settings-section-settings-section-promptsectiondefault            | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0864 |       4.68 |
| settings-all-settings-section-settings-section-socialsectiondefault            | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0632 |       3.16 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0772 |       3.79 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault   | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0676 |       3.37 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault  | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0693 |       3.44 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0705 |       3.49 |
| settings-all-settings-section-settings-section-taskboardsectiondefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0682 |       3.48 |
| settings-all-settings-section-settings-section-terminalsectiondefault          | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0665 |       3.34 |
| settings-all-settings-section-settings-section-textblocksectiondefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0809 |       3.94 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0803 |       3.89 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault      | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0603 |       2.83 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault  | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0637 |       2.92 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0878 |       4.11 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0597 |       2.70 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0634 |       2.98 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0639 |       3.00 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0601 |       2.77 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0496 |       2.30 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0496 |       2.30 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0603 |       2.83 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0603 |       2.83 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0572 |       2.66 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0883 |       4.19 |

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
- settings-all-settings-section-settings-section-nestedparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-passwordparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-rotaryparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-sliderparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-switchparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-textareaparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-textparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-timeparamcodeobjdefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-pane / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
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
- settings-all-settings-section-settings-section-nestedparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-passwordparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-rotaryparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-sliderparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-switchparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-textareaparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-textparamcodeobjdefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
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
