# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-05T17:53:48.860Z

## Summary

- Browser: Google Chrome for Testing 149.0.7827.2
- Browser executable: /Users/kevin/Library/Caches/setta/chrome-for-testing/Canary/149.0.7827.2/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
- Compared: baseline-primary vs candidate
- Fixtures compared: 30
- Pass: 30
- Blocking regression: 0
- Capture blocked: 0
- Runtime page error groups: 0

## Runtime Signals

- baseline-primary: 30 captures, 0 page errors, 13 console warnings/errors.
  - console x9: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x3: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x1: Failed to load resource: the server responded with a status of 404 (Not Found)
- candidate: 30 captures, 0 page errors, 14 console warnings/errors.
  - console x9: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x3: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x2: Failed to load resource: the server responded with a status of 404 (Not Found)

## Fixture Results

| Fixture | Viewport | Status | Reason | Changed Pixels | Mean Delta |
| --- | --- | --- | --- | ---: | ---: |
| project-surface | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0033 | 0.20 |
| param-controls-closed | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0033 | 0.20 |
| dense-param-dict | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0052 | 0.25 |
| callable-edge-handles | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| selection-resize | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0031 | 0.20 |
| dropdown-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0030 | 0.19 |
| color-picker-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0029 | 0.19 |
| date-calendar-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0025 | 0.16 |
| native-text-island | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0025 | 0.16 |
| drag-preview | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0029 | 0.19 |
| project-surface | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0048 | 0.31 |
| param-controls-closed | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0048 | 0.31 |
| dense-param-dict | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0052 | 0.25 |
| callable-edge-handles | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| selection-resize | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0050 | 0.32 |
| dropdown-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0048 | 0.31 |
| color-picker-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0048 | 0.31 |
| date-calendar-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0041 | 0.27 |
| native-text-island | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0041 | 0.27 |
| drag-preview | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0048 | 0.31 |
| project-surface | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0098 | 0.65 |
| param-controls-closed | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0098 | 0.65 |
| dense-param-dict | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0025 | 0.11 |
| callable-edge-handles | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| selection-resize | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0097 | 0.65 |
| dropdown-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0097 | 0.65 |
| color-picker-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0097 | 0.65 |
| date-calendar-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0097 | 0.65 |
| native-text-island | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0097 | 0.65 |
| drag-preview | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0097 | 0.65 |

## Prioritized Visual-Fix List

- None from automated checkpoint.

## Notes

- `pass` means the automated pixel diff is within the temporary tolerance.
- `blocking-regression` means the candidate needs human review or a visual fix before the refactor loop resumes.
- `capture-blocked` means the screenshot path failed and must be fixed or replaced with another reliable capture method.
