# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-06T05:25:41.176Z

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

- baseline-primary: 174 captures, 0 page errors, 17 console warnings/errors.
  - console x12: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x4: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x1: Failed to load resource: the server responded with a status of 404 (Not Found)
- candidate: 174 captures, 0 page errors, 18 console warnings/errors.
  - console x12: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x4: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x2: Failed to load resource: the server responded with a status of 404 (Not Found)

## Fixture Results

| Fixture | Viewport | Status | Reason | Changed Pixels | Mean Delta |
| --- | --- | --- | --- | ---: | ---: |
| project-surface | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0050 | 0.29 |
| param-controls-closed | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0050 | 0.29 |
| dense-param-dict | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0099 | 0.43 |
| nested-param-tree | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0190 | 0.78 |
| callable-edge-handles | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0138 | 0.55 |
| selection-resize | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0052 | 0.30 |
| dropdown-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0038 | 0.24 |
| color-picker-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0033 | 0.21 |
| date-calendar-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0025 | 0.17 |
| native-text-island | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0025 | 0.17 |
| drag-preview | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0046 | 0.27 |
| project-surface | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0048 | 0.32 |
| param-controls-closed | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0048 | 0.32 |
| dense-param-dict | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0075 | 0.34 |
| nested-param-tree | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0168 | 0.70 |
| callable-edge-handles | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0119 | 0.50 |
| selection-resize | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0071 | 0.42 |
| dropdown-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0048 | 0.32 |
| color-picker-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0048 | 0.32 |
| date-calendar-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0042 | 0.28 |
| native-text-island | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0042 | 0.28 |
| drag-preview | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0059 | 0.37 |
| project-surface | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0100 | 0.68 |
| param-controls-closed | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0100 | 0.68 |
| dense-param-dict | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| nested-param-tree | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| callable-edge-handles | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| selection-resize | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0099 | 0.68 |
| dropdown-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0099 | 0.68 |
| color-picker-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0099 | 0.68 |
| date-calendar-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0099 | 0.68 |
| native-text-island | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0099 | 0.68 |
| drag-preview | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0099 | 0.68 |
| settings-all-settings-pane | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2282 | 5.56 |
| settings-all-settings-section-settings-section-shortcuts | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1027 | 6.11 |
| settings-all-settings-section-settings-section-gui | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1811 | 15.92 |
| settings-all-settings-section-settings-section-backend | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1805 | 14.59 |
| settings-all-settings-section-settings-section-chatwindowing | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-sectionsizingpolicy | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0874 | 3.98 |
| settings-all-settings-section-settings-section-languageserver | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-browsersectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1165 | 5.99 |
| settings-all-settings-section-settings-section-callablesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1073 | 5.18 |
| settings-all-settings-section-settings-section-chartsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-chatsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0905 | 4.78 |
| settings-all-settings-section-settings-section-codesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1169 | 5.53 |
| settings-all-settings-section-settings-section-dictsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1043 | 5.46 |
| settings-all-settings-section-settings-section-drawsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1270 | 7.81 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1125 | 5.00 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0888 | 4.60 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1043 | 5.46 |
| settings-all-settings-section-settings-section-groupsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1211 | 5.21 |
| settings-all-settings-section-settings-section-iframesectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-imagesectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-listrootsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-pluginsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1028 | 5.18 |
| settings-all-settings-section-settings-section-promptsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2773 | 25.53 |
| settings-all-settings-section-settings-section-socialsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1086 | 6.05 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1228 | 8.52 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1011 | 5.21 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2661 | 25.40 |
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
| settings-all-settings-pane | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1877 | 4.41 |
| settings-all-settings-section-settings-section-shortcuts | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1003 | 6.02 |
| settings-all-settings-section-settings-section-gui | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1410 | 11.83 |
| settings-all-settings-section-settings-section-backend | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1441 | 10.75 |
| settings-all-settings-section-settings-section-chatwindowing | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-sectionsizingpolicy | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0844 | 4.07 |
| settings-all-settings-section-settings-section-languageserver | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-browsersectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1052 | 4.92 |
| settings-all-settings-section-settings-section-callablesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1051 | 5.28 |
| settings-all-settings-section-settings-section-chartsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-chatsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0828 | 3.97 |
| settings-all-settings-section-settings-section-codesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1104 | 5.64 |
| settings-all-settings-section-settings-section-dictsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0847 | 4.21 |
| settings-all-settings-section-settings-section-drawsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1015 | 6.23 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1080 | 5.34 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0813 | 3.78 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0847 | 4.21 |
| settings-all-settings-section-settings-section-groupsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1179 | 5.78 |
| settings-all-settings-section-settings-section-iframesectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-imagesectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-listrootsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-pluginsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0833 | 3.88 |
| settings-all-settings-section-settings-section-promptsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2004 | 19.87 |
| settings-all-settings-section-settings-section-socialsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0847 | 4.02 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0980 | 6.22 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0833 | 3.91 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1985 | 19.55 |
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
| settings-all-settings-pane | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1619 | 4.17 |
| settings-all-settings-section-settings-section-shortcuts | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1492 | 6.65 |
| settings-all-settings-section-settings-section-gui | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1144 | 4.73 |
| settings-all-settings-section-settings-section-backend | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1700 | 8.63 |
| settings-all-settings-section-settings-section-chatwindowing | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-sectionsizingpolicy | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1267 | 5.36 |
| settings-all-settings-section-settings-section-languageserver | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-browsersectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1469 | 6.80 |
| settings-all-settings-section-settings-section-callablesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1399 | 7.08 |
| settings-all-settings-section-settings-section-chartsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-chatsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1128 | 5.52 |
| settings-all-settings-section-settings-section-codesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1518 | 7.93 |
| settings-all-settings-section-settings-section-dictsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1225 | 5.77 |
| settings-all-settings-section-settings-section-drawsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1288 | 6.18 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1424 | 7.32 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1120 | 5.04 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1247 | 5.82 |
| settings-all-settings-section-settings-section-groupsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1474 | 7.61 |
| settings-all-settings-section-settings-section-iframesectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-imagesectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-listrootsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-pluginsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1067 | 5.18 |
| settings-all-settings-section-settings-section-promptsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1525 | 8.28 |
| settings-all-settings-section-settings-section-socialsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1120 | 5.12 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1042 | 4.59 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1058 | 4.65 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1419 | 7.42 |
| settings-all-settings-section-settings-section-terminalsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-textblocksectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1140 | 5.20 |
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
- Manual inspection for this slice: `dense-param-dict` and `nested-param-tree`
  now pass at desktop and compact-desktop after aligning retained row label
  appearance with the DOM param name/display label owners. Remaining blockers
  are concentrated in Settings real-project fixtures and section-specific
  screenshot dimension mismatches.
