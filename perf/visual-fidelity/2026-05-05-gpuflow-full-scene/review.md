# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-06T05:51:29.650Z

## Summary

- Browser: Google Chrome for Testing 149.0.7827.2
- Browser executable: /Users/kevin/Library/Caches/setta/chrome-for-testing/Canary/149.0.7827.2/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
- Compared: baseline-primary vs candidate
- Fixtures compared: 174
- Pass: 33
- Blocking regression: 141
- Capture blocked: 0
- Runtime page error groups: 0

## Runtime Signals

- baseline-primary: 174 captures, 0 page errors, 19 console warnings/errors.
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
| project-surface | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0053 | 0.30 |
| param-controls-closed | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0053 | 0.30 |
| dense-param-dict | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0099 | 0.43 |
| nested-param-tree | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0190 | 0.78 |
| callable-edge-handles | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0138 | 0.55 |
| selection-resize | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0054 | 0.31 |
| dropdown-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0040 | 0.26 |
| color-picker-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0035 | 0.23 |
| date-calendar-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0026 | 0.18 |
| native-text-island | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0026 | 0.18 |
| drag-preview | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0048 | 0.29 |
| project-surface | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0052 | 0.35 |
| param-controls-closed | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0052 | 0.35 |
| dense-param-dict | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0075 | 0.34 |
| nested-param-tree | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0168 | 0.70 |
| callable-edge-handles | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0119 | 0.50 |
| selection-resize | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0074 | 0.45 |
| dropdown-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0052 | 0.35 |
| color-picker-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0052 | 0.35 |
| date-calendar-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0042 | 0.29 |
| native-text-island | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0042 | 0.29 |
| drag-preview | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0063 | 0.40 |
| project-surface | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0102 | 0.70 |
| param-controls-closed | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0102 | 0.70 |
| dense-param-dict | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| nested-param-tree | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| callable-edge-handles | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| selection-resize | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0101 | 0.70 |
| dropdown-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0101 | 0.70 |
| color-picker-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0101 | 0.70 |
| date-calendar-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0101 | 0.70 |
| native-text-island | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0101 | 0.70 |
| drag-preview | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0101 | 0.70 |
| settings-all-settings-pane | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0464 | 2.51 |
| settings-all-settings-section-settings-section-shortcuts | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1027 | 6.11 |
| settings-all-settings-section-settings-section-gui | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1811 | 15.92 |
| settings-all-settings-section-settings-section-backend | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1805 | 14.59 |
| settings-all-settings-section-settings-section-chatwindowing | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-sectionsizingpolicy | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0882 | 4.19 |
| settings-all-settings-section-settings-section-languageserver | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-browsersectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0981 | 5.11 |
| settings-all-settings-section-settings-section-callablesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1028 | 5.78 |
| settings-all-settings-section-settings-section-chartsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-chatsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1010 | 5.25 |
| settings-all-settings-section-settings-section-codesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1066 | 5.98 |
| settings-all-settings-section-settings-section-dictsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1048 | 6.00 |
| settings-all-settings-section-settings-section-drawsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1045 | 7.20 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0987 | 5.05 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0987 | 5.05 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1048 | 6.00 |
| settings-all-settings-section-settings-section-groupsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1153 | 6.13 |
| settings-all-settings-section-settings-section-iframesectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-imagesectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-listrootsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-pluginsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1028 | 5.18 |
| settings-all-settings-section-settings-section-promptsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1018 | 5.25 |
| settings-all-settings-section-settings-section-socialsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1086 | 6.05 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1228 | 8.52 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1011 | 5.21 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1006 | 4.93 |
| settings-all-settings-section-settings-section-terminalsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-textblocksectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1102 | 5.91 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-textparamcodeobjdefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-pane | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0302 | 1.84 |
| settings-all-settings-section-settings-section-shortcuts | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1003 | 6.02 |
| settings-all-settings-section-settings-section-gui | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1410 | 11.83 |
| settings-all-settings-section-settings-section-backend | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1441 | 10.75 |
| settings-all-settings-section-settings-section-chatwindowing | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-sectionsizingpolicy | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0844 | 4.07 |
| settings-all-settings-section-settings-section-languageserver | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-browsersectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0785 | 3.56 |
| settings-all-settings-section-settings-section-callablesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0823 | 3.98 |
| settings-all-settings-section-settings-section-chartsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-chatsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0828 | 3.97 |
| settings-all-settings-section-settings-section-codesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0878 | 4.45 |
| settings-all-settings-section-settings-section-dictsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0847 | 4.21 |
| settings-all-settings-section-settings-section-drawsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0860 | 5.45 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0813 | 3.78 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0813 | 3.78 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0847 | 4.21 |
| settings-all-settings-section-settings-section-groupsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0918 | 4.30 |
| settings-all-settings-section-settings-section-iframesectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-imagesectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-listrootsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-pluginsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0833 | 3.88 |
| settings-all-settings-section-settings-section-promptsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0832 | 3.96 |
| settings-all-settings-section-settings-section-socialsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0847 | 4.02 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0980 | 6.22 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0833 | 3.91 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0816 | 3.64 |
| settings-all-settings-section-settings-section-terminalsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-textblocksectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0876 | 4.08 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-textparamcodeobjdefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-pane | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0378 | 1.84 |
| settings-all-settings-section-settings-section-shortcuts | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1525 | 6.48 |
| settings-all-settings-section-settings-section-gui | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1145 | 4.75 |
| settings-all-settings-section-settings-section-backend | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1721 | 7.42 |
| settings-all-settings-section-settings-section-chatwindowing | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-sectionsizingpolicy | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1308 | 4.82 |
| settings-all-settings-section-settings-section-languageserver | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-browsersectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0998 | 4.10 |
| settings-all-settings-section-settings-section-callablesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1120 | 4.64 |
| settings-all-settings-section-settings-section-chartsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-chatsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1110 | 5.08 |
| settings-all-settings-section-settings-section-codesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1308 | 5.78 |
| settings-all-settings-section-settings-section-dictsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1182 | 5.00 |
| settings-all-settings-section-settings-section-drawsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1042 | 4.28 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1060 | 4.40 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1060 | 4.40 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1182 | 5.00 |
| settings-all-settings-section-settings-section-groupsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1121 | 4.76 |
| settings-all-settings-section-settings-section-iframesectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-imagesectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-listrootsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-pluginsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1065 | 4.83 |
| settings-all-settings-section-settings-section-promptsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1141 | 5.21 |
| settings-all-settings-section-settings-section-socialsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1061 | 4.39 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0976 | 4.02 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0988 | 4.07 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0963 | 4.05 |
| settings-all-settings-section-settings-section-terminalsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-textblocksectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1093 | 4.53 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-textparamcodeobjdefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |

## Prioritized Visual-Fix List

- settings-all-settings-pane / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-shortcuts / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-gui / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-backend / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chatwindowing / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-sectionsizingpolicy / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-languageserver / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-browsersectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-callablesectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chartsectiondefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-chatsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-codesectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-dictsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-drawsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-genpythoncodesectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-genpythonmetadatasectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-globalvariablessectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-groupsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-iframesectiondefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-imagesectiondefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-listrootsectiondefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-metacontrolsectiondefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-pluginsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-promptsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-socialsectiondefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-spreadsheetsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachineendsectiondefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-statemachinegatesectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachinestartsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-taskboardsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-terminalsectiondefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-textblocksectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-buttonparamcodeobjdefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-codecallablecodeobjdefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-codeparamcodeobjdefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-dateparamcodeobjdefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-dropdownparamcodeobjdefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-nestedparamcodeobjdefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-passwordparamcodeobjdefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-rotaryparamcodeobjdefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-sliderparamcodeobjdefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-switchparamcodeobjdefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-textareaparamcodeobjdefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-textparamcodeobjdefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-timeparamcodeobjdefault / desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-pane / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-shortcuts / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-gui / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-backend / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chatwindowing / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-sectionsizingpolicy / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-languageserver / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-browsersectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-callablesectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chartsectiondefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-chatsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-codesectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-dictsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-drawsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-genpythoncodesectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-genpythonmetadatasectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-globalvariablessectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-groupsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-iframesectiondefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-imagesectiondefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-listrootsectiondefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-metacontrolsectiondefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-pluginsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-promptsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-socialsectiondefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-spreadsheetsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachineendsectiondefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-statemachinegatesectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachinestartsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-taskboardsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-terminalsectiondefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-textblocksectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-buttonparamcodeobjdefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-codecallablecodeobjdefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-codeparamcodeobjdefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-dateparamcodeobjdefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-dropdownparamcodeobjdefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-nestedparamcodeobjdefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-passwordparamcodeobjdefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-rotaryparamcodeobjdefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-sliderparamcodeobjdefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-switchparamcodeobjdefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-textareaparamcodeobjdefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-textparamcodeobjdefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-timeparamcodeobjdefault / compact-desktop: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-pane / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-shortcuts / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-gui / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-backend / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chatwindowing / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-sectionsizingpolicy / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-languageserver / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-browsersectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-callablesectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chartsectiondefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-chatsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-codesectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-dictsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-drawsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-genpythoncodesectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-genpythonmetadatasectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-globalvariablessectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-groupsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-iframesectiondefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-imagesectiondefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-listrootsectiondefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-metacontrolsectiondefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-pluginsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-promptsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-socialsectiondefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-spreadsheetsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachineendsectiondefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-statemachinegatesectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachinestartsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-taskboardsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-terminalsectiondefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-textblocksectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-buttonparamcodeobjdefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-codecallablecodeobjdefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-codeparamcodeobjdefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-dateparamcodeobjdefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-dropdownparamcodeobjdefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-nestedparamcodeobjdefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-passwordparamcodeobjdefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-rotaryparamcodeobjdefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-sliderparamcodeobjdefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-switchparamcodeobjdefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-textareaparamcodeobjdefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-textparamcodeobjdefault / narrow: blocking-regression - Screenshot dimensions do not match.
- settings-all-settings-section-settings-section-timeparamcodeobjdefault / narrow: blocking-regression - Screenshot dimensions do not match.

## Notes

- `pass` means the automated pixel diff is within the temporary tolerance.
- `blocking-regression` means the candidate needs human review or a visual fix before the refactor loop resumes.
- `capture-blocked` means the screenshot path failed and must be fixed or replaced with another reliable capture method.

## Iteration Review

- Fixed retained Settings row overdraw by clipping retained content source
  geometry to the renderer clip rect and by capping scene-owned auto-height
  sections through the same section sizing policy used by intrinsic sizing.
- Inspected the desktop Settings pane and `chatWindowing` section captures
  after the rerun. The `shortcuts` rows no longer bleed into lower sections;
  `chatWindowing` now captures from its own header.
- Remaining Settings blockers are narrower row/control visual drift and
  section height mismatches. The desktop `settings-all-settings-pane` diff
  dropped from `0.2282` changed pixels / `5.56` mean delta to `0.0464` /
  `2.51`.
