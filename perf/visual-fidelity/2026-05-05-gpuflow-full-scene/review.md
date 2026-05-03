# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-06T09:00:20.391Z

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

- Inspected real Settings `All Settings` baseline/candidate/diff images after
  the retained primitive value-color slice. Display-label rows in the retained
  scene still drew label-column dividers that the old DOM Settings rows did not
  draw; the baseline only underlined the value/control cell for those rows.
- Rejected a scoped row-text `font-mono text-xs` canvas experiment because the
  full checkpoint kept the same pass/blocking counts but worsened representative
  Settings metrics, including `shortcuts` desktop `5.93 -> 6.19` mean delta and
  `gui` desktop `4.86 -> 4.88`.
- Retained row divider ownership now follows existing label appearance
  metadata: mono editable/placeholder labels keep label dividers, while
  display-label rows only draw value/control dividers. This preserves all 36
  synthetic/general fixture passes and improves common real Settings blockers.
- Representative Settings improvements vs the prior retained primitive-value
  checkpoint: `shortcuts` desktop changed pixels `0.1027 -> 0.0868`, `gui`
  desktop `0.1099 -> 0.0940`, `backend` desktop `0.1339 -> 0.1181`,
  `switchParamCodeObjDefault` desktop `0.0566 -> 0.0446`, and narrow
  `shortcuts` `0.1452 -> 0.1233`.

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
| date-calendar-open                                                             | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0031 |       0.21 |
| native-text-island                                                             | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0030 |       0.21 |
| drag-preview                                                                   | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0047 |       0.30 |
| project-surface                                                                | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0058 |       0.39 |
| param-controls-closed                                                          | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0058 |       0.39 |
| dense-param-dict                                                               | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0075 |       0.18 |
| nested-param-tree                                                              | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0167 |       0.62 |
| callable-edge-handles                                                          | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0086 |       0.42 |
| selection-resize                                                               | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0071 |       0.46 |
| dropdown-open                                                                  | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0058 |       0.39 |
| color-picker-open                                                              | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0058 |       0.39 |
| date-calendar-open                                                             | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0051 |       0.35 |
| native-text-island                                                             | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0051 |       0.35 |
| drag-preview                                                                   | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0066 |       0.43 |
| project-surface                                                                | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0122 |       0.83 |
| param-controls-closed                                                          | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0122 |       0.83 |
| dense-param-dict                                                               | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| nested-param-tree                                                              | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| callable-edge-handles                                                          | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| selection-resize                                                               | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0120 |       0.82 |
| dropdown-open                                                                  | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0120 |       0.82 |
| color-picker-open                                                              | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0120 |       0.82 |
| date-calendar-open                                                             | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0120 |       0.82 |
| native-text-island                                                             | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0120 |       0.82 |
| drag-preview                                                                   | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0120 |       0.82 |
| settings-all-settings-pane                                                     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0426 |       1.87 |
| settings-all-settings-section-settings-section-shortcuts                       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0868 |       5.69 |
| settings-all-settings-section-settings-section-gui                             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0940 |       4.62 |
| settings-all-settings-section-settings-section-backend                         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1181 |       6.16 |
| settings-all-settings-section-settings-section-chatwindowing                   | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1160 |       6.26 |
| settings-all-settings-section-settings-section-sectionsizingpolicy             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0696 |       3.68 |
| settings-all-settings-section-settings-section-languageserver                  | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0413 |       2.31 |
| settings-all-settings-section-settings-section-browsersectiondefault           | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0688 |       3.18 |
| settings-all-settings-section-settings-section-callablesectiondefault          | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0707 |       3.55 |
| settings-all-settings-section-settings-section-chartsectiondefault             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0693 |       3.03 |
| settings-all-settings-section-settings-section-chatsectiondefault              | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0764 |       3.74 |
| settings-all-settings-section-settings-section-codesectiondefault              | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0797 |       4.26 |
| settings-all-settings-section-settings-section-dictsectiondefault              | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0742 |       3.80 |
| settings-all-settings-section-settings-section-drawsectiondefault              | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0668 |       3.55 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0719 |       3.42 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0719 |       3.42 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault   | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0742 |       3.80 |
| settings-all-settings-section-settings-section-groupsectiondefault             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0835 |       3.92 |
| settings-all-settings-section-settings-section-iframesectiondefault            | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0683 |       2.97 |
| settings-all-settings-section-settings-section-imagesectiondefault             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0699 |       3.10 |
| settings-all-settings-section-settings-section-listrootsectiondefault          | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0780 |       3.66 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0758 |       3.30 |
| settings-all-settings-section-settings-section-pluginsectiondefault            | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0771 |       3.67 |
| settings-all-settings-section-settings-section-promptsectiondefault            | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0760 |       3.73 |
| settings-all-settings-section-settings-section-socialsectiondefault            | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0712 |       3.03 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0743 |       3.55 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault   | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0739 |       3.46 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault  | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0797 |       3.69 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0743 |       3.57 |
| settings-all-settings-section-settings-section-taskboardsectiondefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0739 |       3.30 |
| settings-all-settings-section-settings-section-terminalsectiondefault          | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0720 |       3.09 |
| settings-all-settings-section-settings-section-textblocksectiondefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0785 |       3.69 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0565 |       3.51 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault      | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0426 |       2.28 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault  | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0612 |       3.16 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0610 |       3.53 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0413 |       2.23 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0492 |       2.84 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0468 |       2.42 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0484 |       2.43 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0373 |       1.98 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0375 |       2.00 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0446 |       2.39 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0426 |       2.28 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0424 |       2.31 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0636 |       3.72 |
| settings-all-settings-pane                                                     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0251 |       1.64 |
| settings-all-settings-section-settings-section-shortcuts                       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0844 |       5.63 |
| settings-all-settings-section-settings-section-gui                             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0802 |       4.13 |
| settings-all-settings-section-settings-section-backend                         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1091 |       5.93 |
| settings-all-settings-section-settings-section-chatwindowing                   | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1067 |       6.10 |
| settings-all-settings-section-settings-section-sectionsizingpolicy             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0672 |       3.62 |
| settings-all-settings-section-settings-section-languageserver                  | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0389 |       2.25 |
| settings-all-settings-section-settings-section-browsersectiondefault           | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0627 |       3.06 |
| settings-all-settings-section-settings-section-callablesectiondefault          | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0662 |       3.46 |
| settings-all-settings-section-settings-section-chartsectiondefault             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0618 |       2.89 |
| settings-all-settings-section-settings-section-chatsectiondefault              | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0690 |       3.61 |
| settings-all-settings-section-settings-section-codesectiondefault              | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0748 |       4.16 |
| settings-all-settings-section-settings-section-dictsectiondefault              | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0697 |       3.70 |
| settings-all-settings-section-settings-section-drawsectiondefault              | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0603 |       3.33 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0653 |       3.29 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0653 |       3.29 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault   | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0697 |       3.70 |
| settings-all-settings-section-settings-section-groupsectiondefault             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0762 |       3.78 |
| settings-all-settings-section-settings-section-iframesectiondefault            | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0608 |       2.83 |
| settings-all-settings-section-settings-section-imagesectiondefault             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0624 |       2.96 |
| settings-all-settings-section-settings-section-listrootsectiondefault          | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0700 |       3.52 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0678 |       3.15 |
| settings-all-settings-section-settings-section-pluginsectiondefault            | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0689 |       3.52 |
| settings-all-settings-section-settings-section-promptsectiondefault            | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0686 |       3.60 |
| settings-all-settings-section-settings-section-socialsectiondefault            | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0628 |       2.88 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0690 |       3.45 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault   | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0664 |       3.29 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault  | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0706 |       3.46 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0674 |       3.42 |
| settings-all-settings-section-settings-section-taskboardsectiondefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0657 |       3.15 |
| settings-all-settings-section-settings-section-terminalsectiondefault          | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0640 |       2.95 |
| settings-all-settings-section-settings-section-textblocksectiondefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0719 |       3.57 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0540 |       3.45 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault      | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0397 |       2.21 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault  | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0530 |       2.86 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0580 |       3.46 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0385 |       2.16 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0465 |       2.77 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0436 |       2.35 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0449 |       2.35 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0347 |       1.91 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0349 |       1.93 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0417 |       2.32 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0397 |       2.21 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0396 |       2.24 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0607 |       3.65 |
| settings-all-settings-pane                                                     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0314 |       1.70 |
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
