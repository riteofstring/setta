# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-05T15:45:39.794Z

## Summary

- Browser: Google Chrome for Testing 149.0.7827.0
- Browser executable: /Users/kevin/Library/Caches/setta/chrome-for-testing/Canary/149.0.7827.0/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
- Compared: baseline-primary vs candidate
- Fixtures compared: 30
- Pass: 21
- Blocking regression: 9
- Capture blocked: 0
- Runtime page error groups: 0

## Runtime Signals

- baseline-primary: 30 captures, 0 page errors, 10 console warnings/errors.
  - console x6: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x2: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x2: Failed to load resource: the server responded with a status of 404 (Not Found)
- candidate: 30 captures, 0 page errors, 12 console warnings/errors.
  - console x6: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x2: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x2: Failed to load resource: the server responded with a status of 403 (Forbidden)

## Fixture Results

| Fixture | Viewport | Status | Reason | Changed Pixels | Mean Delta |
| --- | --- | --- | --- | ---: | ---: |
| project-surface | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0262 | 2.71 |
| param-controls-closed | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0262 | 2.71 |
| dense-param-dict | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2782 | 46.18 |
| callable-edge-handles | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0159 | 1.32 |
| selection-resize | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0544 | 7.24 |
| dropdown-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0186 | 1.82 |
| color-picker-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0034 | 0.27 |
| date-calendar-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0030 | 0.25 |
| native-text-island | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0030 | 0.25 |
| drag-preview | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0034 | 0.27 |
| project-surface | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0095 | 1.10 |
| param-controls-closed | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0095 | 1.10 |
| dense-param-dict | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2782 | 46.18 |
| callable-edge-handles | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0159 | 1.32 |
| selection-resize | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0440 | 4.06 |
| dropdown-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0056 | 0.45 |
| color-picker-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0056 | 0.45 |
| date-calendar-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0050 | 0.42 |
| native-text-island | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0050 | 0.42 |
| drag-preview | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0056 | 0.45 |
| project-surface | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0161 | 1.68 |
| param-controls-closed | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0161 | 1.68 |
| dense-param-dict | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0479 | 6.15 |
| callable-edge-handles | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0229 | 1.90 |
| selection-resize | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0234 | 2.93 |
| dropdown-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0144 | 1.39 |
| color-picker-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.99 |
| date-calendar-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.99 |
| native-text-island | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.99 |
| drag-preview | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.99 |

## Prioritized Visual-Fix List

- project-surface / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- param-controls-closed / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- dense-param-dict / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- selection-resize / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- dense-param-dict / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- selection-resize / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- dense-param-dict / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- callable-edge-handles / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- selection-resize / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.

## Notes

- `pass` means the automated pixel diff is within the temporary tolerance.
- `blocking-regression` means the candidate needs human review or a visual fix before the refactor loop resumes.
- `capture-blocked` means the screenshot path failed and must be fixed or replaced with another reliable capture method.
