# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-06T14:06:48.944Z

## Summary

- Browser: Google Chrome for Testing 149.0.7827.2
- Browser executable: /Users/kevin/Library/Caches/setta/chrome-for-testing/Canary/149.0.7827.2/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
- Compared: baseline-primary vs candidate
- Fixtures compared: 174
- Pass: 85
- Blocking regression: 89
- Capture blocked: 0
- Runtime page error groups: 0

## Iteration Notes

- Inspected real Settings `backend`, `shortcuts`, and `chatWindowing`
  baseline/candidate/diff crops for the remaining shared typography drift.
  The retained canvas label text was still using an `Inter`-first stack and an
  internal label padding model that did not match the old DOM `font-sans`
  label box.
- Updated retained row label drawing so sans labels use the system sans stack,
  begin at the same 15px visual origin as the DOM rows, and measure against the
  full DOM text-container width rather than subtracting that visual origin from
  the available label width.
- Reran the full Chrome-for-Testing 149 checkpoint after the visible renderer
  change. Overall counts improved from the previous committed 46 pass / 128
  blocking review to 85 pass / 89 blocking, with 0 capture-blocked fixtures and
  0 runtime page-error groups. Required synthetic fixtures remain passing across
  all required viewports.
- Remaining real Settings blockers are not accepted differences. The largest
  remaining shared blocker is now `chatWindowing` plus section-specific row
  chrome/control geometry in `gui`, `backend`, and several section-default
  groups, especially at the narrow viewport.

## Runtime Signals

- baseline-primary: 174 captures, 0 page errors, 18 console warnings/errors.
  - console x12: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x4: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x2: Failed to load resource: the server responded with a status of 404 (Not Found)
- candidate: 174 captures, 0 page errors, 20 console warnings/errors.
  - console x12: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x4: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x3: OpenAPI request error: TypeError: Failed to fetch at fetchOpenAPIRequest (http://127.0.0.1:3077/src/openapi/http/client.ts:25:16) at async request (http://127.0.0.1:3077/src/openapi/http/generated/client/client.gen.ts:59:20) at async callOpenAPI (http://127.0.0.1:3077/plugin-sdk/app-subsystem/src/openapi/ht

## Fixture Results

| Fixture | Viewport | Status | Reason | Changed Pixels | Mean Delta |
| --- | --- | --- | --- | ---: | ---: |
| project-surface | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0043 | 0.27 |
| param-controls-closed | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0043 | 0.27 |
| dense-param-dict | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0055 | 0.11 |
| nested-param-tree | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0040 | 0.11 |
| callable-edge-handles | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0042 | 0.18 |
| selection-resize | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0043 | 0.27 |
| dropdown-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0038 | 0.25 |
| color-picker-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0038 | 0.25 |
| date-calendar-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0030 | 0.21 |
| native-text-island | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0030 | 0.21 |
| drag-preview | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0041 | 0.26 |
| project-surface | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0058 | 0.39 |
| param-controls-closed | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0058 | 0.39 |
| dense-param-dict | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0050 | 0.10 |
| nested-param-tree | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0038 | 0.11 |
| callable-edge-handles | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0041 | 0.18 |
| selection-resize | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0060 | 0.39 |
| dropdown-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0058 | 0.39 |
| color-picker-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0058 | 0.39 |
| date-calendar-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0050 | 0.34 |
| native-text-island | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0050 | 0.34 |
| drag-preview | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0067 | 0.43 |
| project-surface | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.82 |
| param-controls-closed | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.82 |
| dense-param-dict | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| nested-param-tree | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| callable-edge-handles | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| selection-resize | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.82 |
| dropdown-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.82 |
| color-picker-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.82 |
| date-calendar-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.82 |
| native-text-island | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.82 |
| drag-preview | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.82 |
| settings-all-settings-pane | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0398 | 1.37 |
| settings-all-settings-section-settings-section-shortcuts | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0036 | 0.12 |
| settings-all-settings-section-settings-section-gui | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0360 | 1.55 |
| settings-all-settings-section-settings-section-backend | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0264 | 0.84 |
| settings-all-settings-section-settings-section-chatwindowing | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0789 | 4.58 |
| settings-all-settings-section-settings-section-sectionsizingpolicy | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0154 | 0.69 |
| settings-all-settings-section-settings-section-languageserver | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0157 | 1.16 |
| settings-all-settings-section-settings-section-browsersectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0197 | 0.88 |
| settings-all-settings-section-settings-section-callablesectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0048 | 0.17 |
| settings-all-settings-section-settings-section-chartsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0287 | 1.26 |
| settings-all-settings-section-settings-section-chatsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0469 | 2.46 |
| settings-all-settings-section-settings-section-codesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0386 | 2.35 |
| settings-all-settings-section-settings-section-dictsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0038 | 0.09 |
| settings-all-settings-section-settings-section-drawsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0096 | 0.51 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0257 | 1.14 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0257 | 1.14 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0038 | 0.09 |
| settings-all-settings-section-settings-section-groupsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0251 | 1.15 |
| settings-all-settings-section-settings-section-iframesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0288 | 1.29 |
| settings-all-settings-section-settings-section-imagesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0288 | 1.29 |
| settings-all-settings-section-settings-section-listrootsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0341 | 1.59 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0290 | 1.29 |
| settings-all-settings-section-settings-section-pluginsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0548 | 2.99 |
| settings-all-settings-section-settings-section-promptsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0507 | 2.82 |
| settings-all-settings-section-settings-section-socialsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0326 | 1.40 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0110 | 0.43 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0264 | 1.16 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0310 | 1.37 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0247 | 1.11 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0363 | 1.65 |
| settings-all-settings-section-settings-section-terminalsectiondefault | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0307 | 1.35 |
| settings-all-settings-section-settings-section-textblocksectiondefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0195 | 0.90 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0018 | 0.06 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0018 | 0.05 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0139 | 0.79 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0020 | 0.06 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0022 | 0.06 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0024 | 0.07 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0017 | 0.05 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0020 | 0.06 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0018 | 0.05 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0018 | 0.05 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0018 | 0.05 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0018 | 0.05 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0018 | 0.05 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0020 | 0.06 |
| settings-all-settings-pane | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0010 | 0.03 |
| settings-all-settings-section-settings-section-shortcuts | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0032 | 0.11 |
| settings-all-settings-section-settings-section-gui | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0281 | 1.17 |
| settings-all-settings-section-settings-section-backend | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0231 | 0.72 |
| settings-all-settings-section-settings-section-chatwindowing | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0724 | 4.48 |
| settings-all-settings-section-settings-section-sectionsizingpolicy | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0150 | 0.68 |
| settings-all-settings-section-settings-section-languageserver | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0155 | 1.15 |
| settings-all-settings-section-settings-section-browsersectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0176 | 0.85 |
| settings-all-settings-section-settings-section-callablesectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0047 | 0.17 |
| settings-all-settings-section-settings-section-chartsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0250 | 1.20 |
| settings-all-settings-section-settings-section-chatsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0432 | 2.41 |
| settings-all-settings-section-settings-section-codesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0377 | 2.34 |
| settings-all-settings-section-settings-section-dictsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0037 | 0.09 |
| settings-all-settings-section-settings-section-drawsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0075 | 0.38 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0227 | 1.10 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0227 | 1.10 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0037 | 0.09 |
| settings-all-settings-section-settings-section-groupsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0222 | 1.11 |
| settings-all-settings-section-settings-section-iframesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0251 | 1.24 |
| settings-all-settings-section-settings-section-imagesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0251 | 1.24 |
| settings-all-settings-section-settings-section-listrootsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0298 | 1.53 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0253 | 1.24 |
| settings-all-settings-section-settings-section-pluginsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0502 | 2.92 |
| settings-all-settings-section-settings-section-promptsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0469 | 2.76 |
| settings-all-settings-section-settings-section-socialsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0280 | 1.34 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0106 | 0.42 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0229 | 1.11 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0262 | 1.26 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0218 | 1.06 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0317 | 1.58 |
| settings-all-settings-section-settings-section-terminalsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0267 | 1.29 |
| settings-all-settings-section-settings-section-textblocksectiondefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0173 | 0.86 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0017 | 0.06 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0016 | 0.05 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0104 | 0.57 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0019 | 0.06 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0021 | 0.06 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0023 | 0.06 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0016 | 0.05 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0019 | 0.05 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0017 | 0.05 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0017 | 0.05 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0016 | 0.05 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0016 | 0.05 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0017 | 0.05 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0019 | 0.06 |
| settings-all-settings-pane | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0216 | 0.67 |
| settings-all-settings-section-settings-section-shortcuts | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0748 | 1.77 |
| settings-all-settings-section-settings-section-gui | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0510 | 1.26 |
| settings-all-settings-section-settings-section-backend | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0840 | 2.03 |
| settings-all-settings-section-settings-section-chatwindowing | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0865 | 4.23 |
| settings-all-settings-section-settings-section-sectionsizingpolicy | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0621 | 1.95 |
| settings-all-settings-section-settings-section-languageserver | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0393 | 1.88 |
| settings-all-settings-section-settings-section-browsersectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0473 | 1.77 |
| settings-all-settings-section-settings-section-callablesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0495 | 1.29 |
| settings-all-settings-section-settings-section-chartsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0468 | 2.01 |
| settings-all-settings-section-settings-section-chatsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0699 | 3.64 |
| settings-all-settings-section-settings-section-codesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0838 | 4.00 |
| settings-all-settings-section-settings-section-dictsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0522 | 1.28 |
| settings-all-settings-section-settings-section-drawsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0424 | 1.06 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0529 | 2.06 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0529 | 2.06 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0522 | 1.28 |
| settings-all-settings-section-settings-section-groupsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0556 | 2.12 |
| settings-all-settings-section-settings-section-iframesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0459 | 1.99 |
| settings-all-settings-section-settings-section-imagesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0474 | 2.02 |
| settings-all-settings-section-settings-section-listrootsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0542 | 2.36 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0485 | 2.04 |
| settings-all-settings-section-settings-section-pluginsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0710 | 3.95 |
| settings-all-settings-section-settings-section-promptsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0768 | 4.14 |
| settings-all-settings-section-settings-section-socialsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0441 | 1.99 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0472 | 1.40 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0484 | 2.01 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0479 | 1.97 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0487 | 1.98 |
| settings-all-settings-section-settings-section-taskboardsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0488 | 2.31 |
| settings-all-settings-section-settings-section-terminalsectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0486 | 2.13 |
| settings-all-settings-section-settings-section-textblocksectiondefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0533 | 1.90 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0471 | 1.15 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0371 | 0.95 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0380 | 0.94 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0531 | 1.28 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0353 | 0.88 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0371 | 0.92 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0399 | 1.09 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0354 | 0.87 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0279 | 0.69 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0279 | 0.69 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0371 | 0.95 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0371 | 0.95 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0343 | 0.83 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0514 | 1.26 |

## Prioritized Visual-Fix List

- settings-all-settings-pane / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-gui / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-backend / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chatwindowing / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chartsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chatsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-codesectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-genpythoncodesectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-genpythonmetadatasectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-groupsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-iframesectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-imagesectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-listrootsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-metacontrolsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-pluginsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-promptsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-socialsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachineendsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachinegatesectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachinestartsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-taskboardsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-terminalsectiondefault / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-gui / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-backend / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chatwindowing / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chartsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-chatsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-codesectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-genpythoncodesectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-genpythonmetadatasectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-groupsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-iframesectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-imagesectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-listrootsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-metacontrolsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-pluginsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-promptsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-socialsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachineendsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachinegatesectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-statemachinestartsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-taskboardsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- settings-all-settings-section-settings-section-terminalsectiondefault / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
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
