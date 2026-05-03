# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-06T16:20:17.810Z

## Summary

- Browser: Google Chrome for Testing 149.0.7827.2
- Browser executable: /Users/kevin/Library/Caches/setta/chrome-for-testing/Canary/149.0.7827.2/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
- Compared: baseline-primary vs candidate
- Fixtures compared: 174
- Pass: 121
- Blocking regression: 53
- Capture blocked: 0
- Runtime page error groups: 0
- Renderer-aware masked comparisons: 174

## Runtime Signals

- baseline-primary: 174 captures, 0 page errors, 17 console warnings/errors.
  - console x12: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x4: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x1: Failed to load resource: the server responded with a status of 404 (Not Found)
- candidate: 174 captures, 0 page errors, 20 console warnings/errors.
  - console x12: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x4: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x3: OpenAPI request error: TypeError: Failed to fetch at fetchOpenAPIRequest (http://127.0.0.1:3077/src/openapi/http/client.ts:25:16) at async request (http://127.0.0.1:3077/src/openapi/http/generated/client/client.gen.ts:59:20) at async callOpenAPI (http://127.0.0.1:3077/plugin-sdk/app-subsystem/src/openapi/ht

## Fixture Results

| Fixture | Viewport | Status | Reason | Masked Pixels | Changed Pixels | Mean Delta |
| --- | --- | --- | --- | ---: | ---: | ---: |
| project-surface | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0309 | 0.0041 | 0.26 |
| param-controls-closed | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0309 | 0.0041 | 0.26 |
| dense-param-dict | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0061 | 0.0055 | 0.11 |
| nested-param-tree | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0098 | 0.0040 | 0.11 |
| callable-edge-handles | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0061 | 0.0042 | 0.18 |
| selection-resize | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0309 | 0.0040 | 0.25 |
| dropdown-open | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0309 | 0.0036 | 0.23 |
| color-picker-open | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0309 | 0.0035 | 0.23 |
| date-calendar-open | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0309 | 0.0029 | 0.20 |
| native-text-island | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0309 | 0.0029 | 0.20 |
| drag-preview | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0309 | 0.0039 | 0.25 |
| project-surface | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0442 | 0.0055 | 0.37 |
| param-controls-closed | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0442 | 0.0055 | 0.37 |
| dense-param-dict | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0061 | 0.0051 | 0.10 |
| nested-param-tree | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0098 | 0.0038 | 0.11 |
| callable-edge-handles | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0061 | 0.0042 | 0.18 |
| selection-resize | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0442 | 0.0057 | 0.37 |
| dropdown-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0442 | 0.0055 | 0.37 |
| color-picker-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0442 | 0.0055 | 0.37 |
| date-calendar-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0442 | 0.0049 | 0.34 |
| native-text-island | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0442 | 0.0049 | 0.34 |
| drag-preview | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0442 | 0.0064 | 0.42 |
| project-surface | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1145 | 0.0126 | 0.86 |
| param-controls-closed | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1145 | 0.0126 | 0.86 |
| dense-param-dict | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0117 | 0.0000 | 0.00 |
| nested-param-tree | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0188 | 0.0000 | 0.00 |
| callable-edge-handles | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0117 | 0.0000 | 0.00 |
| selection-resize | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1145 | 0.0126 | 0.86 |
| dropdown-open | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1145 | 0.0126 | 0.86 |
| color-picker-open | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1145 | 0.0126 | 0.86 |
| date-calendar-open | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1145 | 0.0126 | 0.86 |
| native-text-island | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1145 | 0.0126 | 0.86 |
| drag-preview | narrow | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1145 | 0.0126 | 0.86 |
| settings-all-settings-pane | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.0755 | 0.0372 | 1.24 |
| settings-all-settings-section-settings-section-shortcuts | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0044 | 0.11 |
| settings-all-settings-section-settings-section-gui | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0356 | 1.58 |
| settings-all-settings-section-settings-section-backend | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0147 | 0.45 |
| settings-all-settings-section-settings-section-chatwindowing | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0069 | 0.46 |
| settings-all-settings-section-settings-section-sectionsizingpolicy | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0240 | 1.00 |
| settings-all-settings-section-settings-section-languageserver | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2304 | 0.0204 | 1.49 |
| settings-all-settings-section-settings-section-browsersectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0057 | 0.23 |
| settings-all-settings-section-settings-section-callablesectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0039 | 0.16 |
| settings-all-settings-section-settings-section-chartsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0059 | 0.26 |
| settings-all-settings-section-settings-section-chatsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0062 | 0.34 |
| settings-all-settings-section-settings-section-codesectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0125 | 0.82 |
| settings-all-settings-section-settings-section-dictsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0029 | 0.08 |
| settings-all-settings-section-settings-section-drawsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0107 | 0.58 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0058 | 0.25 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0058 | 0.25 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0029 | 0.08 |
| settings-all-settings-section-settings-section-groupsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0051 | 0.24 |
| settings-all-settings-section-settings-section-iframesectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0051 | 0.24 |
| settings-all-settings-section-settings-section-imagesectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0051 | 0.24 |
| settings-all-settings-section-settings-section-listrootsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2607 | 0.0049 | 0.23 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0052 | 0.24 |
| settings-all-settings-section-settings-section-pluginsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0073 | 0.46 |
| settings-all-settings-section-settings-section-promptsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0081 | 0.47 |
| settings-all-settings-section-settings-section-socialsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0045 | 0.22 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0076 | 0.26 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2607 | 0.0056 | 0.26 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0118 | 0.47 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0058 | 0.26 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0058 | 0.25 |
| settings-all-settings-section-settings-section-terminalsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2479 | 0.0057 | 0.25 |
| settings-all-settings-section-settings-section-textblocksectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0050 | 0.22 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2575 | 0.0022 | 0.07 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2220 | 0.0000 | 0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2407 | 0.0019 | 0.05 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2341 | 0.0157 | 0.92 |
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
| settings-all-settings-section-settings-section-gui | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0250 | 1.05 |
| settings-all-settings-section-settings-section-backend | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0103 | 0.28 |
| settings-all-settings-section-settings-section-chatwindowing | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0068 | 0.46 |
| settings-all-settings-section-settings-section-sectionsizingpolicy | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0233 | 0.99 |
| settings-all-settings-section-settings-section-languageserver | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2304 | 0.0202 | 1.49 |
| settings-all-settings-section-settings-section-browsersectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0056 | 0.23 |
| settings-all-settings-section-settings-section-callablesectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0039 | 0.16 |
| settings-all-settings-section-settings-section-chartsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0058 | 0.25 |
| settings-all-settings-section-settings-section-chatsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0061 | 0.34 |
| settings-all-settings-section-settings-section-codesectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0124 | 0.82 |
| settings-all-settings-section-settings-section-dictsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0028 | 0.07 |
| settings-all-settings-section-settings-section-drawsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0078 | 0.39 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0057 | 0.25 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0057 | 0.25 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0028 | 0.07 |
| settings-all-settings-section-settings-section-groupsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0050 | 0.23 |
| settings-all-settings-section-settings-section-iframesectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0050 | 0.24 |
| settings-all-settings-section-settings-section-imagesectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0050 | 0.24 |
| settings-all-settings-section-settings-section-listrootsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2607 | 0.0048 | 0.23 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0051 | 0.24 |
| settings-all-settings-section-settings-section-pluginsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0072 | 0.46 |
| settings-all-settings-section-settings-section-promptsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0080 | 0.47 |
| settings-all-settings-section-settings-section-socialsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2581 | 0.0044 | 0.22 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0075 | 0.25 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2607 | 0.0055 | 0.26 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0093 | 0.38 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0057 | 0.26 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0057 | 0.24 |
| settings-all-settings-section-settings-section-terminalsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2479 | 0.0056 | 0.25 |
| settings-all-settings-section-settings-section-textblocksectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2624 | 0.0049 | 0.22 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2575 | 0.0021 | 0.06 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2220 | 0.0000 | 0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2407 | 0.0018 | 0.05 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2341 | 0.0112 | 0.64 |
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
| settings-all-settings-pane | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.1419 | 0.0204 | 0.59 |
| settings-all-settings-section-settings-section-shortcuts | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.1067 | 2.53 |
| settings-all-settings-section-settings-section-gui | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0738 | 1.82 |
| settings-all-settings-section-settings-section-backend | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.1070 | 2.61 |
| settings-all-settings-section-settings-section-chatwindowing | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3107 | 0.0729 | 2.21 |
| settings-all-settings-section-settings-section-sectionsizingpolicy | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0900 | 2.82 |
| settings-all-settings-section-settings-section-languageserver | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.2951 | 0.0558 | 2.66 |
| settings-all-settings-section-settings-section-browsersectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0561 | 1.55 |
| settings-all-settings-section-settings-section-callablesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0708 | 1.80 |
| settings-all-settings-section-settings-section-chartsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3107 | 0.0494 | 1.40 |
| settings-all-settings-section-settings-section-chatsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0605 | 1.78 |
| settings-all-settings-section-settings-section-codesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0820 | 2.69 |
| settings-all-settings-section-settings-section-dictsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0756 | 1.85 |
| settings-all-settings-section-settings-section-drawsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0615 | 1.54 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0601 | 1.61 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0601 | 1.61 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0756 | 1.85 |
| settings-all-settings-section-settings-section-groupsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0641 | 1.71 |
| settings-all-settings-section-settings-section-iframesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3107 | 0.0480 | 1.38 |
| settings-all-settings-section-settings-section-imagesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3107 | 0.0503 | 1.42 |
| settings-all-settings-section-settings-section-listrootsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3101 | 0.0565 | 1.55 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3107 | 0.0519 | 1.45 |
| settings-all-settings-section-settings-section-pluginsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0543 | 1.81 |
| settings-all-settings-section-settings-section-promptsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0627 | 1.99 |
| settings-all-settings-section-settings-section-socialsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3107 | 0.0439 | 1.23 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0631 | 1.69 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3101 | 0.0529 | 1.50 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0530 | 1.49 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0542 | 1.51 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0471 | 1.30 |
| settings-all-settings-section-settings-section-terminalsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3085 | 0.0504 | 1.45 |
| settings-all-settings-section-settings-section-textblocksectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks. | 0.3097 | 0.0648 | 1.73 |
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
- settings-all-settings-section-settings-section-gui / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-sectionsizingpolicy / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-languageserver / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-gui / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-sectionsizingpolicy / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
- settings-all-settings-section-settings-section-languageserver / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance after renderer-aware inactive-editor masks.
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

## Iteration Notes - 2026-05-06 Retained Row Gaps

- Inspected the baseline, candidate, and diff images for `settings-all-settings-section-settings-section-chatwindowing` after the prior checkpoint showed screenshot-dimension mismatches and upward drift in the nested `Shortcuts` block.
- Implemented retained-canvas row-level vertical gaps for nested top-level group starts, plus the retained gap between pinned and unpinned param surfaces. The retained scene now lays out, culls, hits, and reports content height from row metrics instead of assuming every retained row starts at `index * rowHeight`.
- Re-ran `node scripts/gpuflow-visual-fidelity-checkpoint.mjs`: 174 fixtures, 121 pass, 53 blocking regression, 0 capture blocked, 0 runtime page error groups. `chatWindowing` now passes for desktop and compact desktop; the remaining `chatWindowing` narrow diff is still a blocking regression and is not accepted.

## Iteration Notes - 2026-05-06 Native Color Glyph

- Inspected `settings-all-settings-section-settings-section-gui` desktop/compact baseline, candidate, and diff images. The retained native color swatches were a real contributor to the Settings drift: the retained glyph drew a full eyedropper outline while the browser baseline shows a slim contrast mark inside the native color field.
- Updated the canvas-owned native color glyph to draw a narrow diagonal browser-like mark while keeping native color picker activation as a DOM/native island only when explicitly selected. A broader persistent swatch border match was tested and rejected because it increased `gui` drift and made `colorPickerParamCodeObjDefault` desktop a blocker.
- Re-ran `node scripts/gpuflow-visual-fidelity-checkpoint.mjs`: 174 fixtures, 121 pass, 53 blocking regression, 0 capture blocked, 0 runtime page error groups. The glyph change slightly improved `settings-section-gui` desktop and compact metrics; remaining Settings blockers are not accepted differences.
