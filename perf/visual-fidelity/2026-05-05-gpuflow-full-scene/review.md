# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-06T05:02:38.406Z

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
| project-surface | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0058 | 0.34 |
| param-controls-closed | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0058 | 0.34 |
| dense-param-dict | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0318 | 1.65 |
| nested-param-tree | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0227 | 1.08 |
| callable-edge-handles | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0145 | 0.61 |
| selection-resize | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0059 | 0.35 |
| dropdown-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0045 | 0.29 |
| color-picker-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0039 | 0.26 |
| date-calendar-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0030 | 0.21 |
| native-text-island | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0030 | 0.21 |
| drag-preview | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0054 | 0.33 |
| project-surface | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0058 | 0.39 |
| param-controls-closed | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0058 | 0.39 |
| dense-param-dict | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0294 | 1.56 |
| nested-param-tree | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0205 | 1.00 |
| callable-edge-handles | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0126 | 0.55 |
| selection-resize | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0083 | 0.51 |
| dropdown-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0058 | 0.39 |
| color-picker-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0058 | 0.39 |
| date-calendar-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0050 | 0.35 |
| native-text-island | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0050 | 0.35 |
| drag-preview | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0069 | 0.45 |
| project-surface | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.82 |
| param-controls-closed | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.82 |
| dense-param-dict | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| nested-param-tree | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| callable-edge-handles | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| selection-resize | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0119 | 0.82 |
| dropdown-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0119 | 0.82 |
| color-picker-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0119 | 0.82 |
| date-calendar-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0119 | 0.82 |
| native-text-island | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0119 | 0.82 |
| drag-preview | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0119 | 0.82 |
| settings-all-settings-pane | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2294 | 5.72 |
| settings-all-settings-section-settings-section-shortcuts | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1087 | 6.74 |
| settings-all-settings-section-settings-section-gui | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1865 | 16.48 |
| settings-all-settings-section-settings-section-backend | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1863 | 15.21 |
| settings-all-settings-section-settings-section-chatwindowing | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-sectionsizingpolicy | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0897 | 4.21 |
| settings-all-settings-section-settings-section-languageserver | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-browsersectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1183 | 6.29 |
| settings-all-settings-section-settings-section-callablesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1059 | 5.16 |
| settings-all-settings-section-settings-section-chartsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-chatsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0929 | 5.15 |
| settings-all-settings-section-settings-section-codesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1150 | 5.52 |
| settings-all-settings-section-settings-section-dictsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1077 | 5.90 |
| settings-all-settings-section-settings-section-drawsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1294 | 8.20 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1085 | 4.90 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0912 | 4.92 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1077 | 5.90 |
| settings-all-settings-section-settings-section-groupsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1163 | 5.14 |
| settings-all-settings-section-settings-section-iframesectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-imagesectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-listrootsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-pluginsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1045 | 5.34 |
| settings-all-settings-section-settings-section-promptsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2742 | 25.47 |
| settings-all-settings-section-settings-section-socialsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1123 | 6.43 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1260 | 8.87 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1044 | 5.57 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2661 | 25.39 |
| settings-all-settings-section-settings-section-terminalsectiondefault | desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-textblocksectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1138 | 6.29 |
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
| settings-all-settings-pane | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1895 | 4.59 |
| settings-all-settings-section-settings-section-shortcuts | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1063 | 6.65 |
| settings-all-settings-section-settings-section-gui | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1463 | 12.40 |
| settings-all-settings-section-settings-section-backend | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1499 | 11.38 |
| settings-all-settings-section-settings-section-chatwindowing | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-sectionsizingpolicy | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0860 | 4.20 |
| settings-all-settings-section-settings-section-languageserver | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-browsersectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1082 | 5.25 |
| settings-all-settings-section-settings-section-callablesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1052 | 5.30 |
| settings-all-settings-section-settings-section-chartsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-chatsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0857 | 4.25 |
| settings-all-settings-section-settings-section-codesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1107 | 5.67 |
| settings-all-settings-section-settings-section-dictsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0896 | 4.70 |
| settings-all-settings-section-settings-section-drawsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1054 | 6.60 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1080 | 5.32 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0848 | 4.16 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0896 | 4.70 |
| settings-all-settings-section-settings-section-groupsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1182 | 5.81 |
| settings-all-settings-section-settings-section-iframesectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-imagesectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-listrootsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-pluginsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0849 | 4.04 |
| settings-all-settings-section-settings-section-promptsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2008 | 19.94 |
| settings-all-settings-section-settings-section-socialsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0884 | 4.40 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1012 | 6.57 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0865 | 4.27 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1987 | 19.58 |
| settings-all-settings-section-settings-section-terminalsectiondefault | compact-desktop | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-textblocksectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0912 | 4.47 |
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
| settings-all-settings-pane | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1643 | 4.37 |
| settings-all-settings-section-settings-section-shortcuts | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1653 | 7.92 |
| settings-all-settings-section-settings-section-gui | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1285 | 5.81 |
| settings-all-settings-section-settings-section-backend | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1829 | 9.74 |
| settings-all-settings-section-settings-section-chatwindowing | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-sectionsizingpolicy | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1304 | 5.56 |
| settings-all-settings-section-settings-section-languageserver | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-browsersectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1519 | 7.36 |
| settings-all-settings-section-settings-section-callablesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1403 | 7.14 |
| settings-all-settings-section-settings-section-chartsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-chatsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1187 | 6.11 |
| settings-all-settings-section-settings-section-codesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1522 | 7.97 |
| settings-all-settings-section-settings-section-dictsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1324 | 6.64 |
| settings-all-settings-section-settings-section-drawsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1364 | 6.82 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1422 | 7.30 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1189 | 5.72 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1347 | 6.68 |
| settings-all-settings-section-settings-section-groupsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1484 | 7.73 |
| settings-all-settings-section-settings-section-iframesectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-imagesectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-listrootsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-pluginsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1100 | 5.49 |
| settings-all-settings-section-settings-section-promptsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1533 | 8.41 |
| settings-all-settings-section-settings-section-socialsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1198 | 5.79 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1110 | 5.21 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1125 | 5.29 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1421 | 7.49 |
| settings-all-settings-section-settings-section-terminalsectiondefault | narrow | blocking-regression | Screenshot dimensions do not match. | 1.0000 |  |
| settings-all-settings-section-settings-section-textblocksectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.1210 | 5.85 |
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

- 2026-05-05 retained label geometry slice: inspected
  `dense-param-dict__desktop` and
  `settings-all-settings-section-settings-section-shortcuts__desktop` after
  rerunning the checkpoint with Chrome for Testing 149.
- Candidate retained rows now use the existing param column-width contract
  instead of the previous fixed 65px label column. Settings shortcut labels are
  readable and no longer horizontally compressed.
- Candidate dense dict rows now render the same blank-name `Add Key`
  placeholder that the active param name editor uses.
- Remaining dense/settings blockers are still real rendering drift: retained
  row text starts farther left and higher than the DOM baseline, and many
  Settings section fixtures still report screenshot dimension mismatches.
