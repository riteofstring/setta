# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-05T16:49:43.633Z

## Summary

- Browser: Google Chrome for Testing 149.0.7827.2
- Browser executable: /Users/kevin/Library/Caches/setta/chrome-for-testing/Canary/149.0.7827.2/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
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
- candidate: 30 captures, 0 page errors, 10 console warnings/errors.
  - console x6: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x2: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x2: Failed to load resource: the server responded with a status of 404 (Not Found)

## Fixture Results

| Fixture | Viewport | Status | Reason | Changed Pixels | Mean Delta |
| --- | --- | --- | --- | ---: | ---: |
| project-surface | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0270 | 2.77 |
| param-controls-closed | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0270 | 2.77 |
| dense-param-dict | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2822 | 46.47 |
| callable-edge-handles | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0199 | 1.60 |
| selection-resize | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0552 | 7.30 |
| dropdown-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0194 | 1.88 |
| color-picker-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0043 | 0.33 |
| date-calendar-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0038 | 0.31 |
| native-text-island | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0038 | 0.31 |
| drag-preview | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0043 | 0.33 |
| project-surface | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0110 | 1.20 |
| param-controls-closed | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0110 | 1.20 |
| dense-param-dict | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.2822 | 46.47 |
| callable-edge-handles | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0199 | 1.60 |
| selection-resize | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0455 | 4.16 |
| dropdown-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0071 | 0.55 |
| color-picker-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0071 | 0.55 |
| date-calendar-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0063 | 0.51 |
| native-text-island | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0063 | 0.51 |
| drag-preview | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0071 | 0.55 |
| project-surface | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0191 | 1.90 |
| param-controls-closed | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0191 | 1.90 |
| dense-param-dict | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0537 | 6.56 |
| callable-edge-handles | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0287 | 2.31 |
| selection-resize | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0264 | 3.14 |
| dropdown-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0174 | 1.61 |
| color-picker-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0150 | 1.21 |
| date-calendar-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0150 | 1.21 |
| native-text-island | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0150 | 1.21 |
| drag-preview | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0150 | 1.21 |

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
