# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-06T04:38:02.020Z

## Summary

- Browser: Google Chrome for Testing 149.0.7827.2
- Browser executable: /Users/kevin/Library/Caches/setta/chrome-for-testing/Canary/149.0.7827.2/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
- Compared: baseline-primary vs candidate
- Fixtures compared: 174
- Pass: 29
- Blocking regression: 145
- Capture blocked: 0
- Runtime page error groups: 0

## Runtime Signals

- baseline-primary: 174 captures, 0 page errors, 17 console warnings/errors.
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
| project-surface | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0055 | 0.32 |
| param-controls-closed | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0055 | 0.32 |
| dense-param-dict | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0229 | 0.83 |
| nested-param-tree | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0223 | 1.03 |
| callable-edge-handles | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0143 | 0.61 |
| selection-resize | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0056 | 0.33 |
| dropdown-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0042 | 0.27 |
| color-picker-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0037 | 0.24 |
| date-calendar-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0028 | 0.19 |
| native-text-island | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0028 | 0.19 |
| drag-preview | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0051 | 0.31 |
| project-surface | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0054 | 0.35 |
| param-controls-closed | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0054 | 0.35 |
| dense-param-dict | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0206 | 0.74 |
| nested-param-tree | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0200 | 0.95 |
| callable-edge-handles | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0124 | 0.55 |
| selection-resize | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0082 | 0.50 |
| dropdown-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0054 | 0.35 |
| color-picker-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0054 | 0.35 |
| date-calendar-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0047 | 0.31 |
| native-text-island | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0047 | 0.31 |
| drag-preview | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0062 | 0.38 |
| project-surface | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0112 | 0.74 |
| param-controls-closed | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0112 | 0.74 |
| dense-param-dict | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| nested-param-tree | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| callable-edge-handles | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| selection-resize | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0111 | 0.74 |
| dropdown-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0111 | 0.74 |
| color-picker-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0111 | 0.74 |
| date-calendar-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0111 | 0.74 |
| native-text-island | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0111 | 0.74 |
| drag-preview | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0111 | 0.74 |
| settings-all-settings-pane | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2347 | 8.02 |
| settings-all-settings-section-settings-section-shortcuts | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1000 | 6.04 |
| settings-all-settings-section-settings-section-gui | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2440 | 25.91 |
| settings-all-settings-section-settings-section-backend | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2052 | 19.10 |
| settings-all-settings-section-settings-section-chatwindowing | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-sectionsizingpolicy | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0772 | 3.97 |
| settings-all-settings-section-settings-section-languageserver | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-browsersectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1078 | 5.65 |
| settings-all-settings-section-settings-section-callablesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0972 | 4.99 |
| settings-all-settings-section-settings-section-chartsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-chatsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0864 | 4.95 |
| settings-all-settings-section-settings-section-codesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1022 | 5.08 |
| settings-all-settings-section-settings-section-dictsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0985 | 5.76 |
| settings-all-settings-section-settings-section-drawsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1376 | 10.50 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0980 | 4.61 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0846 | 4.79 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0985 | 5.76 |
| settings-all-settings-section-settings-section-groupsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1070 | 4.94 |
| settings-all-settings-section-settings-section-iframesectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-imagesectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-listrootsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-pluginsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1016 | 5.10 |
| settings-all-settings-section-settings-section-promptsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.3624 | 39.44 |
| settings-all-settings-section-settings-section-socialsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1096 | 6.21 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1405 | 11.30 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1030 | 5.47 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.3546 | 39.26 |
| settings-all-settings-section-settings-section-terminalsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-textblocksectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1105 | 6.05 |
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
| settings-all-settings-pane | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1875 | 4.06 |
| settings-all-settings-section-settings-section-shortcuts | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0976 | 5.95 |
| settings-all-settings-section-settings-section-gui | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2039 | 21.83 |
| settings-all-settings-section-settings-section-backend | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1687 | 15.27 |
| settings-all-settings-section-settings-section-chatwindowing | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-sectionsizingpolicy | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0812 | 3.82 |
| settings-all-settings-section-settings-section-languageserver | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-browsersectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0997 | 4.48 |
| settings-all-settings-section-settings-section-callablesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1019 | 4.87 |
| settings-all-settings-section-settings-section-chartsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-chatsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0827 | 4.02 |
| settings-all-settings-section-settings-section-codesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1054 | 5.09 |
| settings-all-settings-section-settings-section-dictsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0850 | 4.31 |
| settings-all-settings-section-settings-section-drawsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1168 | 8.75 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1035 | 4.80 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0812 | 3.86 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0850 | 4.31 |
| settings-all-settings-section-settings-section-groupsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1142 | 5.34 |
| settings-all-settings-section-settings-section-iframesectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-imagesectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-listrootsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-pluginsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0821 | 3.80 |
| settings-all-settings-section-settings-section-promptsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2815 | 33.83 |
| settings-all-settings-section-settings-section-socialsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0856 | 4.18 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1157 | 9.00 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0852 | 4.17 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2787 | 33.35 |
| settings-all-settings-section-settings-section-terminalsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-textblocksectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0879 | 4.22 |
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
| settings-all-settings-pane | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1638 | 3.76 |
| settings-all-settings-section-settings-section-shortcuts | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1657 | 7.77 |
| settings-all-settings-section-settings-section-gui | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2239 | 21.21 |
| settings-all-settings-section-settings-section-backend | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2141 | 15.69 |
| settings-all-settings-section-settings-section-chatwindowing | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-sectionsizingpolicy | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1302 | 5.42 |
| settings-all-settings-section-settings-section-languageserver | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-browsersectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1321 | 6.18 |
| settings-all-settings-section-settings-section-callablesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1400 | 6.80 |
| settings-all-settings-section-settings-section-chartsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-chatsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1158 | 5.83 |
| settings-all-settings-section-settings-section-codesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1501 | 7.41 |
| settings-all-settings-section-settings-section-dictsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1259 | 6.01 |
| settings-all-settings-section-settings-section-drawsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1571 | 10.32 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1405 | 6.85 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1167 | 5.44 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1282 | 6.06 |
| settings-all-settings-section-settings-section-groupsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1473 | 7.32 |
| settings-all-settings-section-settings-section-iframesectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-imagesectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-listrootsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-pluginsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1082 | 5.27 |
| settings-all-settings-section-settings-section-promptsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2856 | 31.07 |
| settings-all-settings-section-settings-section-socialsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1174 | 5.52 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1402 | 9.49 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1166 | 5.50 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2735 | 30.02 |
| settings-all-settings-section-settings-section-terminalsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-textblocksectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1192 | 5.62 |
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

- dense-param-dict / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- nested-param-tree / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- dense-param-dict / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- nested-param-tree / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
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

## Inspection Notes

- 2026-05-05 iteration: inspected `settings-all-settings-section-settings-section-shortcuts__desktop` baseline/candidate/diff after fixing retained param auto-height ownership. The previous 80px candidate crop is resolved: both images are now 552x352, and the full row set is visible.
- Remaining shortcuts diff is real rendering drift, not fixture instability: retained canvas labels are visibly smaller/narrower than the DOM baseline while value text and row count are present.
- Inspected `dense-param-dict__desktop` candidate after the same checkpoint. Dimensions match the baseline at 562x422, but retained row label text is still missing or too small to read; this is a separate retained label rendering blocker.
- Current checkpoint has no capture-blocked fixtures and no runtime page-error groups. Remaining `Screenshot dimensions do not match` groups are still blocking and require follow-up inspection/fixes before plan completion.
