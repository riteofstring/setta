# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-06T19:05:50.103Z

## Summary

- Browser: Google Chrome for Testing 149.0.7827.2
- Browser executable: /Users/kevin/Library/Caches/setta/chrome-for-testing/Canary/149.0.7827.2/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
- Compared: baseline-primary vs candidate
- Fixtures compared: 174
- Pass: 127
- Blocking regression: 47
- Capture blocked: 0
- Runtime page error groups: 0
- Renderer-aware masked comparisons: 174

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

| Fixture | Viewport | Status | Reason | Masked Pixels | Changed Pixels | Mean Delta |
| --- | --- | --- | --- | ---: | ---: | ---: |
| project-surface | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0309 | 0.0036 | 0.22 |
| param-controls-closed | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0309 | 0.0036 | 0.22 |
| dense-param-dict | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0061 | 0.0055 | 0.11 |
| nested-param-tree | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0098 | 0.0025 | 0.09 |
| callable-edge-handles | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0061 | 0.0042 | 0.18 |
| selection-resize | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0309 | 0.0036 | 0.22 |
| dropdown-open | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0309 | 0.0031 | 0.20 |
| color-picker-open | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0309 | 0.0031 | 0.20 |
| date-calendar-open | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0309 | 0.0024 | 0.17 |
| native-text-island | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0309 | 0.0024 | 0.17 |
| drag-preview | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0309 | 0.0034 | 0.22 |
| project-surface | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0442 | 0.0047 | 0.31 |
| param-controls-closed | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0442 | 0.0047 | 0.31 |
| dense-param-dict | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0061 | 0.0051 | 0.10 |
| nested-param-tree | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0098 | 0.0024 | 0.08 |
| callable-edge-handles | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0061 | 0.0042 | 0.18 |
| selection-resize | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0442 | 0.0049 | 0.32 |
| dropdown-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0442 | 0.0047 | 0.31 |
| color-picker-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0442 | 0.0047 | 0.31 |
| date-calendar-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0442 | 0.0041 | 0.28 |
| native-text-island | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0442 | 0.0041 | 0.28 |
| drag-preview | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0442 | 0.0056 | 0.36 |
| project-surface | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1145 | 0.0106 | 0.72 |
| param-controls-closed | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1145 | 0.0106 | 0.72 |
| dense-param-dict | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0117 | 0.0000 | 0.00 |
| nested-param-tree | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0188 | 0.0000 | 0.00 |
| callable-edge-handles | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0117 | 0.0000 | 0.00 |
| selection-resize | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1145 | 0.0106 | 0.72 |
| dropdown-open | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1145 | 0.0106 | 0.72 |
| color-picker-open | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1145 | 0.0106 | 0.72 |
| date-calendar-open | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1145 | 0.0106 | 0.72 |
| native-text-island | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1145 | 0.0106 | 0.72 |
| drag-preview | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1145 | 0.0106 | 0.72 |
| settings-all-settings-pane | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0755 | 0.0353 | 1.19 |
| settings-all-settings-section-settings-section-shortcuts | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0044 | 0.11 |
| settings-all-settings-section-settings-section-gui | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0188 | 0.49 |
| settings-all-settings-section-settings-section-backend | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0096 | 0.26 |
| settings-all-settings-section-settings-section-chatwindowing | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0061 | 0.45 |
| settings-all-settings-section-settings-section-sectionsizingpolicy | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0144 | 0.90 |
| settings-all-settings-section-settings-section-languageserver | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2304 | 0.0197 | 1.47 |
| settings-all-settings-section-settings-section-browsersectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0054 | 0.23 |
| settings-all-settings-section-settings-section-callablesectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0039 | 0.16 |
| settings-all-settings-section-settings-section-chartsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0056 | 0.25 |
| settings-all-settings-section-settings-section-chatsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0062 | 0.34 |
| settings-all-settings-section-settings-section-codesectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0123 | 0.82 |
| settings-all-settings-section-settings-section-dictsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0029 | 0.08 |
| settings-all-settings-section-settings-section-drawsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0064 | 0.18 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0056 | 0.24 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0056 | 0.24 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0029 | 0.08 |
| settings-all-settings-section-settings-section-groupsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0049 | 0.23 |
| settings-all-settings-section-settings-section-iframesectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0048 | 0.23 |
| settings-all-settings-section-settings-section-imagesectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0048 | 0.23 |
| settings-all-settings-section-settings-section-listrootsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2607 | 0.0047 | 0.23 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0049 | 0.24 |
| settings-all-settings-section-settings-section-pluginsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0070 | 0.46 |
| settings-all-settings-section-settings-section-promptsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0079 | 0.47 |
| settings-all-settings-section-settings-section-socialsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0042 | 0.21 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0051 | 0.22 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2607 | 0.0054 | 0.25 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0088 | 0.32 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0055 | 0.25 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0056 | 0.24 |
| settings-all-settings-section-settings-section-terminalsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2479 | 0.0054 | 0.24 |
| settings-all-settings-section-settings-section-textblocksectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0048 | 0.22 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2575 | 0.0022 | 0.07 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2220 | 0.0000 | 0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2407 | 0.0019 | 0.05 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2341 | 0.0079 | 0.22 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2575 | 0.0023 | 0.06 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2341 | 0.0021 | 0.06 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2376 | 0.0021 | 0.06 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2364 | 0.0018 | 0.05 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2341 | 0.0020 | 0.06 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2376 | 0.0020 | 0.06 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2376 | 0.0020 | 0.06 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2407 | 0.0019 | 0.05 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2407 | 0.0019 | 0.05 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2341 | 0.0020 | 0.06 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2575 | 0.0021 | 0.07 |
| settings-all-settings-pane | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1157 | 0.0007 | 0.02 |
| settings-all-settings-section-settings-section-shortcuts | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0038 | 0.10 |
| settings-all-settings-section-settings-section-gui | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0130 | 0.35 |
| settings-all-settings-section-settings-section-backend | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0061 | 0.19 |
| settings-all-settings-section-settings-section-chatwindowing | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0060 | 0.44 |
| settings-all-settings-section-settings-section-sectionsizingpolicy | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0138 | 0.88 |
| settings-all-settings-section-settings-section-languageserver | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2304 | 0.0195 | 1.47 |
| settings-all-settings-section-settings-section-browsersectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0053 | 0.23 |
| settings-all-settings-section-settings-section-callablesectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0039 | 0.16 |
| settings-all-settings-section-settings-section-chartsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0055 | 0.25 |
| settings-all-settings-section-settings-section-chatsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0061 | 0.34 |
| settings-all-settings-section-settings-section-codesectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0122 | 0.81 |
| settings-all-settings-section-settings-section-dictsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0028 | 0.07 |
| settings-all-settings-section-settings-section-drawsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0051 | 0.14 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0055 | 0.24 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0055 | 0.24 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0028 | 0.07 |
| settings-all-settings-section-settings-section-groupsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0048 | 0.23 |
| settings-all-settings-section-settings-section-iframesectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0047 | 0.23 |
| settings-all-settings-section-settings-section-imagesectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0047 | 0.23 |
| settings-all-settings-section-settings-section-listrootsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2607 | 0.0046 | 0.22 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0048 | 0.23 |
| settings-all-settings-section-settings-section-pluginsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0070 | 0.45 |
| settings-all-settings-section-settings-section-promptsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0078 | 0.46 |
| settings-all-settings-section-settings-section-socialsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0041 | 0.21 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0050 | 0.22 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2607 | 0.0053 | 0.25 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0073 | 0.28 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0054 | 0.25 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0055 | 0.24 |
| settings-all-settings-section-settings-section-terminalsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2479 | 0.0054 | 0.24 |
| settings-all-settings-section-settings-section-textblocksectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0047 | 0.21 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2575 | 0.0021 | 0.06 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2220 | 0.0000 | 0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2407 | 0.0018 | 0.05 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2341 | 0.0059 | 0.16 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2575 | 0.0022 | 0.06 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2341 | 0.0019 | 0.05 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2376 | 0.0020 | 0.06 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2364 | 0.0016 | 0.04 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2341 | 0.0019 | 0.05 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2376 | 0.0019 | 0.05 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2376 | 0.0019 | 0.05 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2407 | 0.0018 | 0.05 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2407 | 0.0018 | 0.05 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2341 | 0.0018 | 0.05 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2575 | 0.0021 | 0.06 |
| settings-all-settings-pane | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1419 | 0.0201 | 0.58 |
| settings-all-settings-section-settings-section-shortcuts | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.1067 | 2.53 |
| settings-all-settings-section-settings-section-gui | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0738 | 1.82 |
| settings-all-settings-section-settings-section-backend | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.1070 | 2.61 |
| settings-all-settings-section-settings-section-chatwindowing | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3107 | 0.0723 | 2.20 |
| settings-all-settings-section-settings-section-sectionsizingpolicy | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0708 | 2.61 |
| settings-all-settings-section-settings-section-languageserver | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2951 | 0.0543 | 2.62 |
| settings-all-settings-section-settings-section-browsersectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0556 | 1.54 |
| settings-all-settings-section-settings-section-callablesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0708 | 1.80 |
| settings-all-settings-section-settings-section-chartsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3107 | 0.0488 | 1.39 |
| settings-all-settings-section-settings-section-chatsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0605 | 1.78 |
| settings-all-settings-section-settings-section-codesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0814 | 2.67 |
| settings-all-settings-section-settings-section-dictsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0756 | 1.85 |
| settings-all-settings-section-settings-section-drawsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0615 | 1.54 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0596 | 1.60 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0596 | 1.60 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0756 | 1.85 |
| settings-all-settings-section-settings-section-groupsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0636 | 1.70 |
| settings-all-settings-section-settings-section-iframesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3107 | 0.0474 | 1.36 |
| settings-all-settings-section-settings-section-imagesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3107 | 0.0497 | 1.41 |
| settings-all-settings-section-settings-section-listrootsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3101 | 0.0560 | 1.54 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3107 | 0.0513 | 1.43 |
| settings-all-settings-section-settings-section-pluginsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0538 | 1.80 |
| settings-all-settings-section-settings-section-promptsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0622 | 1.98 |
| settings-all-settings-section-settings-section-socialsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3107 | 0.0432 | 1.22 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0626 | 1.67 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3101 | 0.0524 | 1.49 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0525 | 1.48 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0537 | 1.49 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0465 | 1.29 |
| settings-all-settings-section-settings-section-terminalsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3085 | 0.0498 | 1.43 |
| settings-all-settings-section-settings-section-textblocksectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0642 | 1.72 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3107 | 0.0684 | 1.67 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2849 | 0.0000 | 0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3117 | 0.0539 | 1.37 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3122 | 0.0553 | 1.35 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3107 | 0.0771 | 1.85 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3122 | 0.0513 | 1.27 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3069 | 0.0536 | 1.32 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3019 | 0.0571 | 1.55 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3122 | 0.0515 | 1.25 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3069 | 0.0403 | 0.99 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3069 | 0.0403 | 0.99 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3117 | 0.0539 | 1.37 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3117 | 0.0539 | 1.37 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3122 | 0.0498 | 1.20 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3107 | 0.0746 | 1.82 |

## Prioritized Visual-Fix List

- settings-all-settings-pane / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-pane / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-shortcuts / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-gui / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-backend / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-chatwindowing / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-sectionsizingpolicy / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-languageserver / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-browsersectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-callablesectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-chartsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-chatsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-codesectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-dictsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-drawsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-genpythoncodesectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-genpythonmetadatasectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-globalvariablessectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-groupsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-iframesectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-imagesectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-listrootsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-metacontrolsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-pluginsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-promptsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-socialsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-spreadsheetsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-statemachineendsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-statemachinegatesectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-statemachinestartsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-taskboardsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-terminalsectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-textblocksectiondefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-buttonparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-codeparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-dateparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-dropdownparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-nestedparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-passwordparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-rotaryparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-sliderparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-switchparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-textareaparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-textparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-timeparamcodeobjdefault / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.

## Notes

- `pass` means the automated pixel diff is within the temporary tolerance.
- Renderer-aware masks only cover inactive CodeMirror preview glyph/token pixels; active CodeMirror DOM and surrounding layout remain compared.
- Changed-pixel and mean-delta ratios are computed over unmasked comparable pixels.
- `blocking-regression` means the candidate needs human review or a visual fix before the refactor loop resumes.
- `capture-blocked` means the screenshot path failed and must be fixed or replaced with another reliable capture method.
