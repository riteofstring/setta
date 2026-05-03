# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-06T09:49:10.751Z

## Summary

- Browser: Google Chrome for Testing 149.0.7827.2
- Browser executable: /Users/kevin/Library/Caches/setta/chrome-for-testing/Canary/149.0.7827.2/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
- Compared: baseline-primary vs candidate
- Fixtures compared: 174
- Pass: 37
- Blocking regression: 137
- Capture blocked: 0
- Runtime page error groups: 0

## Iteration Notes

- Inspected real Settings `All Settings` baseline/candidate/diff images for
  `dropdownParamCodeObjDefault`, `textParamCodeObjDefault`, and `gui` after the
  retained row presentation slice. Synthetic/general GpuFlow fixtures remained
  green; the remaining blockers are still real Settings fixtures.
- Found a common retained text-like row mismatch: inactive DOM
  `TextInputCodeMirror` value cells render as `font-mono text-xs` row text,
  while the retained text-like canvas owner was drawing smaller mixed
  10px/11px control fonts. The first font-size-only pass showed the glyph scale
  was closer but still sat roughly three pixels high and one pixel left in the
  Settings crop.
- Updated the retained text-like canvas owner to use the same 12px monospace
  value font for text/code/textarea rows and aligned row-text value glyphs to
  the shared visual value inset/baseline used by the row divider.
- Reran the full checkpoint with Chrome for Testing 149. Counts moved from 36
  pass / 138 blocking to 37 pass / 137 blocking, with 0 capture-blocked
  fixtures and 0 runtime page-error groups. `settings-all-settings-pane` now
  passes at compact-desktop.
- Representative targeted movements vs the prior checkpoint:
  `textParamCodeObjDefault` desktop `0.0402 / 1.99 -> 0.0366 / 1.74`,
  `dropdownParamCodeObjDefault` desktop `0.0389 / 1.87 -> 0.0371 / 1.72`,
  `buttonParamCodeObjDefault` desktop `0.0536 / 3.06 -> 0.0440 / 2.36`, and
  `gui` desktop `0.0927 / 4.42 -> 0.0909 / 4.30` for changed pixels / mean
  delta.
- The remaining blocking Settings diffs are not accepted differences. Common
  remaining owners appear to be control-specific idle geometry and residual
  canvas/DOM text rasterization differences outside the text-like value
  baseline fixed here.

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
| project-surface                                                                | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0049 |       0.30 |
| param-controls-closed                                                          | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0049 |       0.30 |
| dense-param-dict                                                               | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0093 |       0.21 |
| nested-param-tree                                                              | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0191 |       0.67 |
| callable-edge-handles                                                          | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0107 |       0.44 |
| selection-resize                                                               | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0051 |       0.30 |
| dropdown-open                                                                  | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0041 |       0.26 |
| color-picker-open                                                              | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0038 |       0.25 |
| date-calendar-open                                                             | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0029 |       0.19 |
| native-text-island                                                             | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0028 |       0.19 |
| drag-preview                                                                   | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0047 |       0.29 |
| project-surface                                                                | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0057 |       0.38 |
| param-controls-closed                                                          | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0057 |       0.38 |
| dense-param-dict                                                               | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0070 |       0.15 |
| nested-param-tree                                                              | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0169 |       0.61 |
| callable-edge-handles                                                          | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0088 |       0.39 |
| selection-resize                                                               | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0069 |       0.44 |
| dropdown-open                                                                  | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0057 |       0.38 |
| color-picker-open                                                              | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0057 |       0.38 |
| date-calendar-open                                                             | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0047 |       0.32 |
| native-text-island                                                             | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0047 |       0.32 |
| drag-preview                                                                   | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0067 |       0.43 |
| project-surface                                                                | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0113 |       0.76 |
| param-controls-closed                                                          | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0113 |       0.76 |
| dense-param-dict                                                               | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| nested-param-tree                                                              | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| callable-edge-handles                                                          | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| selection-resize                                                               | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0112 |       0.76 |
| dropdown-open                                                                  | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0112 |       0.76 |
| color-picker-open                                                              | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0112 |       0.76 |
| date-calendar-open                                                             | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0112 |       0.76 |
| native-text-island                                                             | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0112 |       0.76 |
| drag-preview                                                                   | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0112 |       0.76 |
| settings-all-settings-pane                                                     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0427 |       1.72 |
| settings-all-settings-section-settings-section-shortcuts                       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0616 |       3.71 |
| settings-all-settings-section-settings-section-gui                             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0909 |       4.30 |
| settings-all-settings-section-settings-section-backend                         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1149 |       5.73 |
| settings-all-settings-section-settings-section-chatwindowing                   | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1192 |       6.66 |
| settings-all-settings-section-settings-section-sectionsizingpolicy             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0719 |       3.87 |
| settings-all-settings-section-settings-section-languageserver                  | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0419 |       2.39 |
| settings-all-settings-section-settings-section-browsersectiondefault           | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0668 |       2.77 |
| settings-all-settings-section-settings-section-callablesectiondefault          | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0663 |       2.90 |
| settings-all-settings-section-settings-section-chartsectiondefault             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0687 |       2.83 |
| settings-all-settings-section-settings-section-chatsectiondefault              | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0752 |       3.55 |
| settings-all-settings-section-settings-section-codesectiondefault              | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0773 |       3.93 |
| settings-all-settings-section-settings-section-dictsectiondefault              | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0695 |       3.11 |
| settings-all-settings-section-settings-section-drawsectiondefault              | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0602 |       2.80 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0704 |       3.12 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0704 |       3.12 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault   | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0695 |       3.11 |
| settings-all-settings-section-settings-section-groupsectiondefault             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0805 |       3.51 |
| settings-all-settings-section-settings-section-iframesectiondefault            | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0677 |       2.80 |
| settings-all-settings-section-settings-section-imagesectiondefault             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0691 |       2.88 |
| settings-all-settings-section-settings-section-listrootsectiondefault          | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0755 |       3.36 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0750 |       3.05 |
| settings-all-settings-section-settings-section-pluginsectiondefault            | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0778 |       3.70 |
| settings-all-settings-section-settings-section-promptsectiondefault            | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0755 |       3.66 |
| settings-all-settings-section-settings-section-socialsectiondefault            | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0707 |       2.87 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0698 |       2.88 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault   | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0660 |       2.75 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault  | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0727 |       3.04 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0659 |       2.82 |
| settings-all-settings-section-settings-section-taskboardsectiondefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0725 |       3.05 |
| settings-all-settings-section-settings-section-terminalsectiondefault          | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0713 |       2.90 |
| settings-all-settings-section-settings-section-textblocksectiondefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0748 |       3.23 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0440 |       2.36 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault      | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0382 |       1.78 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault  | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0566 |       2.62 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0524 |       2.80 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0371 |       1.72 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0380 |       1.81 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0425 |       1.92 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0441 |       1.91 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0319 |       1.47 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0319 |       1.47 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0382 |       1.78 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0382 |       1.78 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0366 |       1.74 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0513 |       2.65 |
| settings-all-settings-pane                                                     | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0182 |       1.09 |
| settings-all-settings-section-settings-section-shortcuts                       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0592 |       3.65 |
| settings-all-settings-section-settings-section-gui                             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0771 |       3.82 |
| settings-all-settings-section-settings-section-backend                         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1060 |       5.50 |
| settings-all-settings-section-settings-section-chatwindowing                   | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1099 |       6.50 |
| settings-all-settings-section-settings-section-sectionsizingpolicy             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0694 |       3.81 |
| settings-all-settings-section-settings-section-languageserver                  | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0395 |       2.33 |
| settings-all-settings-section-settings-section-browsersectiondefault           | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0607 |       2.66 |
| settings-all-settings-section-settings-section-callablesectiondefault          | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0619 |       2.81 |
| settings-all-settings-section-settings-section-chartsectiondefault             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0612 |       2.70 |
| settings-all-settings-section-settings-section-chatsectiondefault              | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0679 |       3.42 |
| settings-all-settings-section-settings-section-codesectiondefault              | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0724 |       3.83 |
| settings-all-settings-section-settings-section-dictsectiondefault              | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0650 |       3.02 |
| settings-all-settings-section-settings-section-drawsectiondefault              | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0536 |       2.58 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0638 |       3.00 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0638 |       3.00 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault   | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0650 |       3.02 |
| settings-all-settings-section-settings-section-groupsectiondefault             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0731 |       3.38 |
| settings-all-settings-section-settings-section-iframesectiondefault            | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0602 |       2.66 |
| settings-all-settings-section-settings-section-imagesectiondefault             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0616 |       2.75 |
| settings-all-settings-section-settings-section-listrootsectiondefault          | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0676 |       3.22 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0670 |       2.91 |
| settings-all-settings-section-settings-section-pluginsectiondefault            | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0696 |       3.56 |
| settings-all-settings-section-settings-section-promptsectiondefault            | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0682 |       3.53 |
| settings-all-settings-section-settings-section-socialsectiondefault            | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0623 |       2.72 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0645 |       2.78 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault   | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0589 |       2.63 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault  | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0639 |       2.85 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0594 |       2.70 |
| settings-all-settings-section-settings-section-taskboardsectiondefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0644 |       2.91 |
| settings-all-settings-section-settings-section-terminalsectiondefault          | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0633 |       2.76 |
| settings-all-settings-section-settings-section-textblocksectiondefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0683 |       3.11 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0415 |       2.30 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault      | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0353 |       1.71 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault  | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0485 |       2.32 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0495 |       2.73 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0343 |       1.66 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0354 |       1.75 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0392 |       1.85 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0407 |       1.84 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0293 |       1.41 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0293 |       1.41 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0353 |       1.71 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0353 |       1.71 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0338 |       1.67 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0483 |       2.58 |
| settings-all-settings-pane                                                     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0288 |       1.44 |
| settings-all-settings-section-settings-section-shortcuts                       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1206 |       5.43 |
| settings-all-settings-section-settings-section-gui                             | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0841 |       3.94 |
| settings-all-settings-section-settings-section-backend                         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1403 |       6.54 |
| settings-all-settings-section-settings-section-chatwindowing                   | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1195 |       6.08 |
| settings-all-settings-section-settings-section-sectionsizingpolicy             | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1081 |       4.44 |
| settings-all-settings-section-settings-section-languageserver                  | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0513 |       2.33 |
| settings-all-settings-section-settings-section-browsersectiondefault           | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0710 |       3.31 |
| settings-all-settings-section-settings-section-callablesectiondefault          | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0807 |       3.65 |
| settings-all-settings-section-settings-section-chartsectiondefault             | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0665 |       3.24 |
| settings-all-settings-section-settings-section-chatsectiondefault              | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0847 |       4.69 |
| settings-all-settings-section-settings-section-codesectiondefault              | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1051 |       5.37 |
| settings-all-settings-section-settings-section-dictsectiondefault              | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0868 |       4.01 |
| settings-all-settings-section-settings-section-drawsectiondefault              | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0722 |       3.20 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0770 |       3.71 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0770 |       3.71 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault   | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0868 |       4.01 |
| settings-all-settings-section-settings-section-groupsectiondefault             | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0841 |       4.12 |
| settings-all-settings-section-settings-section-iframesectiondefault            | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0645 |       3.16 |
| settings-all-settings-section-settings-section-imagesectiondefault             | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0674 |       3.30 |
| settings-all-settings-section-settings-section-listrootsectiondefault          | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0768 |       3.89 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0698 |       3.37 |
| settings-all-settings-section-settings-section-pluginsectiondefault            | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0821 |       4.63 |
| settings-all-settings-section-settings-section-promptsectiondefault            | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0896 |       4.99 |
| settings-all-settings-section-settings-section-socialsectiondefault            | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0636 |       3.13 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0755 |       3.35 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault   | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0679 |       3.32 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault  | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0690 |       3.33 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0701 |       3.37 |
| settings-all-settings-section-settings-section-taskboardsectiondefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0683 |       3.41 |
| settings-all-settings-section-settings-section-terminalsectiondefault          | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0673 |       3.35 |
| settings-all-settings-section-settings-section-textblocksectiondefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0810 |       3.80 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0783 |       3.39 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault      | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0592 |       2.55 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault  | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0613 |       2.54 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0870 |       3.86 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0578 |       2.38 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0615 |       2.60 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0633 |       2.83 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0586 |       2.45 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0482 |       2.03 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0482 |       2.03 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0592 |       2.55 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0592 |       2.55 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0563 |       2.38 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0849 |       3.72 |

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
