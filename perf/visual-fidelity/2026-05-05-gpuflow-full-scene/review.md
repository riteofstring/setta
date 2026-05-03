# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-06T08:38:33.928Z

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

- Inspected the Settings `shortcuts` and `switchParamCodeObjDefault` desktop
  baseline/candidate/diff images. A broader retained text-like font experiment
  made the Settings value text blurrier and worsened broad Settings metrics, so
  it was narrowed before this checkpoint.
- Retained text-like primitive values now use the existing GitHub CodeMirror
  literal colors for exact JSON-style atoms and numbers while preserving the
  prior retained canvas font geometry. This matches the baseline `false`
  literal color in Settings value rows without reopening synthetic fixtures.
- The checkpoint preserved 36 synthetic and general fixture passes and kept the
  same 138 remaining real Settings blockers. Representative Settings mean
  deltas changed slightly in the intended direction: `gui` desktop
  `4.87 -> 4.86`, `backend` desktop `6.41 -> 6.40`, and
  `switchParamCodeObjDefault` desktop `2.59 -> 2.58`.

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

| Fixture                                                                        | Viewport        | Status              | Reason                                               | Changed Pixels | Mean Delta |
| ------------------------------------------------------------------------------ | --------------- | ------------------- | ---------------------------------------------------- | -------------: | ---------: |
| project-surface                                                                | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0052 |       0.29 |
| param-controls-closed                                                          | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0052 |       0.29 |
| dense-param-dict                                                               | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0099 |       0.24 |
| nested-param-tree                                                              | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0190 |       0.68 |
| callable-edge-handles                                                          | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0138 |       0.52 |
| selection-resize                                                               | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0053 |       0.29 |
| dropdown-open                                                                  | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0040 |       0.24 |
| color-picker-open                                                              | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0035 |       0.22 |
| date-calendar-open                                                             | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0027 |       0.18 |
| native-text-island                                                             | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0026 |       0.18 |
| drag-preview                                                                   | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0048 |       0.28 |
| project-surface                                                                | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0051 |       0.33 |
| param-controls-closed                                                          | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0051 |       0.33 |
| dense-param-dict                                                               | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0075 |       0.18 |
| nested-param-tree                                                              | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0167 |       0.62 |
| callable-edge-handles                                                          | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0119 |       0.47 |
| selection-resize                                                               | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0073 |       0.42 |
| dropdown-open                                                                  | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0051 |       0.33 |
| color-picker-open                                                              | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0051 |       0.33 |
| date-calendar-open                                                             | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0044 |       0.29 |
| native-text-island                                                             | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0044 |       0.29 |
| drag-preview                                                                   | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0061 |       0.38 |
| project-surface                                                                | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0106 |       0.69 |
| param-controls-closed                                                          | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0106 |       0.69 |
| dense-param-dict                                                               | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| nested-param-tree                                                              | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| callable-edge-handles                                                          | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| selection-resize                                                               | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0104 |       0.69 |
| dropdown-open                                                                  | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0104 |       0.69 |
| color-picker-open                                                              | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0104 |       0.69 |
| date-calendar-open                                                             | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0104 |       0.69 |
| native-text-island                                                             | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0104 |       0.69 |
| drag-preview                                                                   | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0104 |       0.69 |
| settings-all-settings-pane                                                     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0426 |       1.93 |
| settings-all-settings-section-settings-section-shortcuts                       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1027 |       5.93 |
| settings-all-settings-section-settings-section-gui                             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1099 |       4.86 |
| settings-all-settings-section-settings-section-backend                         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1339 |       6.40 |
| settings-all-settings-section-settings-section-chatwindowing                   | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1310 |       6.48 |
| settings-all-settings-section-settings-section-sectionsizingpolicy             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0883 |       3.97 |
| settings-all-settings-section-settings-section-languageserver                  | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0530 |       2.49 |
| settings-all-settings-section-settings-section-browsersectiondefault           | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0858 |       3.43 |
| settings-all-settings-section-settings-section-callablesectiondefault          | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0880 |       3.82 |
| settings-all-settings-section-settings-section-chartsectiondefault             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0851 |       3.27 |
| settings-all-settings-section-settings-section-chatsectiondefault              | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0934 |       4.00 |
| settings-all-settings-section-settings-section-codesectiondefault              | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0977 |       4.52 |
| settings-all-settings-section-settings-section-dictsectiondefault              | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0900 |       4.04 |
| settings-all-settings-section-settings-section-drawsectiondefault              | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0827 |       3.79 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0888 |       3.67 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0888 |       3.67 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault   | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0900 |       4.04 |
| settings-all-settings-section-settings-section-groupsectiondefault             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1005 |       4.17 |
| settings-all-settings-section-settings-section-iframesectiondefault            | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0841 |       3.21 |
| settings-all-settings-section-settings-section-imagesectiondefault             | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0857 |       3.33 |
| settings-all-settings-section-settings-section-listrootsectiondefault          | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0940 |       3.90 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0916 |       3.53 |
| settings-all-settings-section-settings-section-pluginsectiondefault            | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0952 |       3.94 |
| settings-all-settings-section-settings-section-promptsectiondefault            | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0942 |       4.00 |
| settings-all-settings-section-settings-section-socialsectiondefault            | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0871 |       3.27 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0915 |       3.81 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault   | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0900 |       3.70 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault  | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0967 |       3.94 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0913 |       3.83 |
| settings-all-settings-section-settings-section-taskboardsectiondefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0908 |       3.55 |
| settings-all-settings-section-settings-section-terminalsectiondefault          | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0875 |       3.32 |
| settings-all-settings-section-settings-section-textblocksectiondefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0954 |       3.95 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0714 |       3.74 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault      | desktop         | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0546 |       2.46 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault  | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0740 |       3.36 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0758 |       3.76 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0541 |       2.42 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0632 |       3.05 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0564 |       2.57 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0612 |       2.63 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0513 |       2.19 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0515 |       2.21 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault       | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0566 |       2.58 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault     | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0546 |       2.46 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0552 |       2.50 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault         | desktop         | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0784 |       3.95 |
| settings-all-settings-pane                                                     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0294 |       1.71 |
| settings-all-settings-section-settings-section-shortcuts                       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1003 |       5.87 |
| settings-all-settings-section-settings-section-gui                             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0960 |       4.37 |
| settings-all-settings-section-settings-section-backend                         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1250 |       6.17 |
| settings-all-settings-section-settings-section-chatwindowing                   | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1211 |       6.31 |
| settings-all-settings-section-settings-section-sectionsizingpolicy             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0845 |       3.88 |
| settings-all-settings-section-settings-section-languageserver                  | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0493 |       2.41 |
| settings-all-settings-section-settings-section-browsersectiondefault           | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0792 |       3.31 |
| settings-all-settings-section-settings-section-callablesectiondefault          | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0831 |       3.72 |
| settings-all-settings-section-settings-section-chartsectiondefault             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0771 |       3.12 |
| settings-all-settings-section-settings-section-chatsectiondefault              | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0856 |       3.86 |
| settings-all-settings-section-settings-section-codesectiondefault              | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0919 |       4.41 |
| settings-all-settings-section-settings-section-dictsectiondefault              | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0855 |       3.94 |
| settings-all-settings-section-settings-section-drawsectiondefault              | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0761 |       3.57 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0818 |       3.54 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0818 |       3.54 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault   | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0855 |       3.94 |
| settings-all-settings-section-settings-section-groupsectiondefault             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0927 |       4.03 |
| settings-all-settings-section-settings-section-iframesectiondefault            | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0761 |       3.06 |
| settings-all-settings-section-settings-section-imagesectiondefault             | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0777 |       3.19 |
| settings-all-settings-section-settings-section-listrootsectiondefault          | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0856 |       3.75 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0831 |       3.38 |
| settings-all-settings-section-settings-section-pluginsectiondefault            | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0861 |       3.78 |
| settings-all-settings-section-settings-section-promptsectiondefault            | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0860 |       3.85 |
| settings-all-settings-section-settings-section-socialsectiondefault            | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0782 |       3.11 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0857 |       3.70 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault   | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0820 |       3.53 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault  | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0871 |       3.71 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0839 |       3.67 |
| settings-all-settings-section-settings-section-taskboardsectiondefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0822 |       3.40 |
| settings-all-settings-section-settings-section-terminalsectiondefault          | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0790 |       3.17 |
| settings-all-settings-section-settings-section-textblocksectiondefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0884 |       3.82 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0689 |       3.67 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault      | compact-desktop | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0517 |       2.39 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault  | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0659 |       3.05 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0729 |       3.68 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0513 |       2.35 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0605 |       2.98 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0531 |       2.49 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0577 |       2.55 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0487 |       2.12 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0489 |       2.14 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault       | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0537 |       2.50 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault     | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0517 |       2.39 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0524 |       2.43 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault         | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0755 |       3.88 |
| settings-all-settings-pane                                                     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0369 |       1.78 |
| settings-all-settings-section-settings-section-shortcuts                       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1452 |       6.32 |
| settings-all-settings-section-settings-section-gui                             | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1072 |       4.59 |
| settings-all-settings-section-settings-section-backend                         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1648 |       7.26 |
| settings-all-settings-section-settings-section-chatwindowing                   | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1351 |       5.95 |
| settings-all-settings-section-settings-section-sectionsizingpolicy             | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1244 |       4.68 |
| settings-all-settings-section-settings-section-languageserver                  | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0629 |       2.36 |
| settings-all-settings-section-settings-section-browsersectiondefault           | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0925 |       3.94 |
| settings-all-settings-section-settings-section-callablesectiondefault          | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1046 |       4.47 |
| settings-all-settings-section-settings-section-chartsectiondefault             | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0867 |       3.66 |
| settings-all-settings-section-settings-section-chatsectiondefault              | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1038 |       4.93 |
| settings-all-settings-section-settings-section-codesectiondefault              | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1250 |       5.63 |
| settings-all-settings-section-settings-section-dictsectiondefault              | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1109 |       4.83 |
| settings-all-settings-section-settings-section-drawsectiondefault              | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0969 |       4.11 |
| settings-all-settings-section-settings-section-genpythoncodesectiondefault     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0987 |       4.24 |
| settings-all-settings-section-settings-section-genpythonmetadatasectiondefault | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0987 |       4.24 |
| settings-all-settings-section-settings-section-globalvariablessectiondefault   | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1109 |       4.83 |
| settings-all-settings-section-settings-section-groupsectiondefault             | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1049 |       4.60 |
| settings-all-settings-section-settings-section-iframesectiondefault            | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0848 |       3.55 |
| settings-all-settings-section-settings-section-imagesectiondefault             | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0877 |       3.74 |
| settings-all-settings-section-settings-section-listrootsectiondefault          | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0955 |       4.26 |
| settings-all-settings-section-settings-section-metacontrolsectiondefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0906 |       3.85 |
| settings-all-settings-section-settings-section-pluginsectiondefault            | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0991 |       4.68 |
| settings-all-settings-section-settings-section-promptsectiondefault            | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1068 |       5.07 |
| settings-all-settings-section-settings-section-socialsectiondefault            | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0843 |       3.55 |
| settings-all-settings-section-settings-section-spreadsheetsectiondefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0988 |       4.22 |
| settings-all-settings-section-settings-section-statemachineendsectiondefault   | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0870 |       3.77 |
| settings-all-settings-section-settings-section-statemachinegatesectiondefault  | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0904 |       3.86 |
| settings-all-settings-section-settings-section-statemachinestartsectiondefault | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0916 |       3.92 |
| settings-all-settings-section-settings-section-taskboardsectiondefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0896 |       3.89 |
| settings-all-settings-section-settings-section-terminalsectiondefault          | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0862 |       3.71 |
| settings-all-settings-section-settings-section-textblocksectiondefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1020 |       4.37 |
| settings-all-settings-section-settings-section-buttonparamcodeobjdefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1022 |       4.31 |
| settings-all-settings-section-settings-section-codecallablecodeobjdefault      | narrow          | pass                | Automated pixel diff is within checkpoint tolerance. |         0.0000 |       0.00 |
| settings-all-settings-section-settings-section-codeparamcodeobjdefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0781 |       3.17 |
| settings-all-settings-section-settings-section-colorpickerparamcodeobjdefault  | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0834 |       3.28 |
| settings-all-settings-section-settings-section-dateparamcodeobjdefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1097 |       4.53 |
| settings-all-settings-section-settings-section-dropdownparamcodeobjdefault     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0794 |       3.07 |
| settings-all-settings-section-settings-section-dropzoneparamcodeobjdefault     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0828 |       3.38 |
| settings-all-settings-section-settings-section-nestedparamcodeobjdefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0815 |       3.27 |
| settings-all-settings-section-settings-section-passwordparamcodeobjdefault     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0799 |       3.14 |
| settings-all-settings-section-settings-section-rotaryparamcodeobjdefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0690 |       2.70 |
| settings-all-settings-section-settings-section-sliderparamcodeobjdefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0690 |       2.70 |
| settings-all-settings-section-settings-section-switchparamcodeobjdefault       | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0781 |       3.17 |
| settings-all-settings-section-settings-section-textareaparamcodeobjdefault     | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0781 |       3.17 |
| settings-all-settings-section-settings-section-textparamcodeobjdefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.0769 |       3.02 |
| settings-all-settings-section-settings-section-timeparamcodeobjdefault         | narrow          | blocking-regression | Automated pixel diff exceeds checkpoint tolerance.   |         0.1102 |       4.61 |

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
