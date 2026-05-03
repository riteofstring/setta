# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-05T17:13:47.408Z

## Summary

- Browser: Google Chrome for Testing 149.0.7827.2
- Browser executable: /Users/kevin/Library/Caches/setta/chrome-for-testing/Canary/149.0.7827.2/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
- Compared: baseline-primary vs candidate
- Fixtures compared: 30
- Pass: 26
- Blocking regression: 4
- Capture blocked: 0
- Runtime page error groups: 0

## Runtime Signals

- baseline-primary: 30 captures, 0 page errors, 9 console warnings/errors.
  - console x3: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x2: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x2: Failed to load resource: the server responded with a status of 404 (Not Found)
- candidate: 30 captures, 0 page errors, 10 console warnings/errors.
  - console x6: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x2: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x2: Failed to load resource: the server responded with a status of 404 (Not Found)

## Fixture Results

| Fixture | Viewport | Status | Reason | Changed Pixels | Mean Delta |
| --- | --- | --- | --- | ---: | ---: |
| project-surface | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0047 | 0.28 |
| param-controls-closed | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0047 | 0.28 |
| dense-param-dict | desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0358 | 1.51 |
| callable-edge-handles | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0157 | 1.16 |
| selection-resize | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0067 | 0.31 |
| dropdown-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0042 | 0.26 |
| color-picker-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0035 | 0.25 |
| date-calendar-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0030 | 0.22 |
| native-text-island | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0030 | 0.22 |
| drag-preview | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0035 | 0.25 |
| project-surface | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0063 | 0.43 |
| param-controls-closed | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0063 | 0.43 |
| dense-param-dict | compact-desktop | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0358 | 1.51 |
| callable-edge-handles | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0157 | 1.16 |
| selection-resize | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0071 | 0.44 |
| dropdown-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0059 | 0.42 |
| color-picker-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0059 | 0.42 |
| date-calendar-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0050 | 0.37 |
| native-text-island | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0050 | 0.37 |
| drag-preview | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0059 | 0.42 |
| project-surface | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.88 |
| param-controls-closed | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.88 |
| dense-param-dict | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0245 | 1.70 |
| callable-edge-handles | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0226 | 1.67 |
| selection-resize | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0127 | 0.89 |
| dropdown-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0120 | 0.88 |
| color-picker-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0118 | 0.87 |
| date-calendar-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0118 | 0.87 |
| native-text-island | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0118 | 0.87 |
| drag-preview | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0118 | 0.87 |

## Prioritized Visual-Fix List

- dense-param-dict / desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- dense-param-dict / compact-desktop: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- dense-param-dict / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- callable-edge-handles / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.

## Notes

- `pass` means the automated pixel diff is within the temporary tolerance.
- `blocking-regression` means the candidate needs human review or a visual fix before the refactor loop resumes.
- `capture-blocked` means the screenshot path failed and must be fixed or replaced with another reliable capture method.

## Manual Review Notes

- 2026-05-05 retained row palette fix: `dense-param-dict` no longer paints the
  large light retained canvas surface. This also cleared the prior
  `project-surface`, `param-controls-closed`, and `selection-resize` desktop/
  compact blockers.
- Remaining `dense-param-dict` blockers are narrow residual line/order diffs in
  the section crop, plus randomized fixture names/order in the overview list.
  They are still marked `blocking-regression` for the next loop slice rather
  than accepted.
