# Settings view switch performance

## 2026-02-20 - Run 1 (baseline)
- Environment:
  - Frontend: dev server at `http://127.0.0.1:3011/settings`
  - Browser profiling: chrome-devtools-mcp
- Scenario:
  - Switch tabs in the settings project bottom tab bar.
  - Measured from click to "active tab + stable `.react-flow__node` count".
- Method:
  - In-page script executed via CDP (`evaluate_script`).
  - Stability check: node count unchanged for 3 samples (40ms interval).

| Switch target | Duration (ms) | Node count |
| --- | ---: | ---: |
| Core | 727.8 | 5 |
| Section Defaults Structure and Code | 1029.4 | 9 |
| Section Defaults Content and Media | 841.9 | 10 |
| Param Defaults | 905.2 | 13 |
| All Settings | 1841.9 | 42 |

Notes:
- Largest observed cost was switching into `All Settings`.
- Most non-`All Settings` transitions were ~0.8s-1.0s.

## 2026-02-20 - Run 2 (after optimistic active view-mode switching)
- Change set:
  - Frontend optimistic active-view-mode updates added for:
    - bottom tab bar (`ViewModeTabs`)
    - overview view-mode list (`ViewingEditingMode`)
    - URL-driven mode switching (`useViewModeUrlSync`)
  - Local store/node/viewport sync now happens immediately before backend websocket reconciliation.

| Switch target | Duration (ms) | Node count |
| --- | ---: | ---: |
| Core | 606.7 | 5 |
| Section Defaults Structure and Code | 679.3 | 9 |
| Section Defaults Content and Media | 682.7 | 10 |
| Param Defaults | 656.1 | 13 |
| All Settings | 1885.6 | 42 |

## Delta summary (Run 2 vs Run 1)
- Core: -121.1 ms
- Section Defaults Structure and Code: -350.1 ms
- Section Defaults Content and Media: -159.2 ms
- Param Defaults: -249.1 ms
- All Settings: +43.7 ms (within run-to-run variance)

Interpretation:
- This change improved perceived latency for most tab switches by updating UI state immediately.
- `All Settings` remains the dominant expensive transition and still needs deeper optimization (render/reconcile/payload cost).
