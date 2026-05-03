# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-05T20:05:47.443Z

## Summary

- Browser: Google Chrome for Testing 149.0.7827.2
- Browser executable: /Users/kevin/Library/Caches/setta/chrome-for-testing/Canary/149.0.7827.2/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
- Compared: baseline-primary vs candidate
- Fixtures compared: 33
- Pass: 33
- Blocking regression: 0
- Capture blocked: 0
- Runtime page error groups: 0

## Runtime Signals

- baseline-primary: 33 captures, 0 page errors, 11 console warnings/errors.
  - console x6: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x3: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x1: Failed to load resource: the server responded with a status of 404 (Not Found)
- candidate: 33 captures, 0 page errors, 14 console warnings/errors.
  - console x9: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x3: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x2: Failed to load resource: the server responded with a status of 404 (Not Found)

## Fixture Results

| Fixture | Viewport | Status | Reason | Changed Pixels | Mean Delta |
| --- | --- | --- | --- | ---: | ---: |
| project-surface | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0036 | 0.23 |
| param-controls-closed | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0036 | 0.23 |
| dense-param-dict | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0052 | 0.25 |
| nested-param-tree | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0042 | 0.18 |
| callable-edge-handles | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| selection-resize | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0035 | 0.23 |
| dropdown-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0033 | 0.22 |
| color-picker-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0032 | 0.22 |
| date-calendar-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0027 | 0.19 |
| native-text-island | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0027 | 0.19 |
| drag-preview | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0032 | 0.22 |
| project-surface | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0054 | 0.36 |
| param-controls-closed | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0054 | 0.36 |
| dense-param-dict | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0052 | 0.25 |
| nested-param-tree | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0042 | 0.18 |
| callable-edge-handles | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| selection-resize | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0056 | 0.37 |
| dropdown-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0054 | 0.36 |
| color-picker-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0054 | 0.36 |
| date-calendar-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0045 | 0.31 |
| native-text-island | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0045 | 0.31 |
| drag-preview | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0054 | 0.36 |
| project-surface | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0109 | 0.75 |
| param-controls-closed | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0109 | 0.75 |
| dense-param-dict | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0025 | 0.11 |
| nested-param-tree | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0015 | 0.07 |
| callable-edge-handles | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0000 | 0.00 |
| selection-resize | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0108 | 0.75 |
| dropdown-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0108 | 0.75 |
| color-picker-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0108 | 0.75 |
| date-calendar-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0108 | 0.75 |
| native-text-island | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0108 | 0.75 |
| drag-preview | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0108 | 0.75 |

## Prioritized Visual-Fix List

- None from automated checkpoint.

## Notes

- `pass` means the automated pixel diff is within the temporary tolerance.
- `blocking-regression` means the candidate needs human review or a visual fix before the refactor loop resumes.
- `capture-blocked` means the screenshot path failed and must be fixed or replaced with another reliable capture method.
