# Phase 4 accepted-output visual baseline

This bundle is the regression lock for the Phase 4 output the developer explicitly approved on
2026-08-11 (approval recorded in the plan at commit `dbd2dae35`). Baselines follow developer
acceptance; this bundle records already-accepted output and is not evidence of a new approval.

## Provenance

- Extraction branch: `workspace-extraction` at
  `dbd2dae359a9fd8a6dea1c7f30f0babdb8f9616a` (the last rendering-relevant code change is
  `91576b741`, the value-font correction; the two later commits are plan-status records).
- Captured surface: the playground production dist (`pnpm --filter @setta/playground run build`
  against the freshly built `@setta/workspace` package), served by `vite preview` at
  `http://127.0.0.1:4173/`.
- Browser: headless Google Chrome 151.0.7922.110 driven over the Chrome DevTools Protocol at a
  1492 x 696 CSS-pixel viewport with device-pixel ratio 2 — the supervised exit-gate comparison
  context.
- State: the boot state of the shipped fixture document. The camera stayed at the document
  viewport `{x: 0, y: 0, zoom: 1}`; no sections, rows, or controls were interacted with before
  the dark captures. The light captures follow one click of the host header's appearance toggle.
- Capture date: 2026-08-11 in `America/Los_Angeles`.
- The main-side comparison values below are the supervised 2026-08-11 exit-gate measurements of
  live frozen main (`../setta-main` at `043d3b2e9`, the `/settings` Dict) recorded in the plan
  status; the frozen reference was not relaunched for this post-acceptance recording, and its
  worktree was untouched.

## Screenshot manifest

| File                                                                                                     | State                                                          |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`01-playground-item-panel-dark-1492x696.png`](screenshots/01-playground-item-panel-dark-1492x696.png)   | Full viewport, dark appearance, boot state                     |
| [`02-playground-item-panel-light-1492x696.png`](screenshots/02-playground-item-panel-light-1492x696.png) | Full viewport, light appearance via the host toggle            |
| [`03-item-panel-crop-dark.png`](screenshots/03-item-panel-crop-dark.png)                                 | Original-pixel (DPR 2) crop of the 552 x 352 item panel, dark  |
| [`04-item-panel-crop-light.png`](screenshots/04-item-panel-crop-light.png)                               | Original-pixel (DPR 2) crop of the 552 x 352 item panel, light |

Exact captured geometry and computed styles for both appearances are in
[`computed/item-panel-metrics.json`](computed/item-panel-metrics.json).

## Computed comparison against the accepted exit-gate values

Every captured value matches the supervised exit-gate measurement in both appearances:

| Metric                    | Accepted (supervised live main + playground)   | Captured dark              | Captured light               |
| ------------------------- | ---------------------------------------------- | -------------------------- | ---------------------------- |
| Outer item panel          | 552 x 352                                      | 552 x 352                  | 552 x 352                    |
| Scroll-shell outer width  | 550 px                                         | 550 px                     | 550 px                       |
| Scroll-shell client width | 544 px (6 px classic scrollbar gutter)         | 544 px                     | 544 px                       |
| Leaf row                  | 526 x 20                                       | 526 x 20 (`alpha`)         | 526 x 20 (`alpha`)           |
| Label column              | 257 px (`--param-column-width`)                | 257 px                     | 257 px                       |
| Label role                | 12/16 px semibold sans-serif                   | 12/16 px, weight 600       | 12/16 px, weight 600         |
| Label color               | setta-800 light / setta-200 dark               | `rgb(182,192,211)`         | `rgb(26,33,45)`              |
| Value role                | 12/16 px regular monospace, normal numerals    | 12/16 px, 400, `normal`    | 12/16 px, 400, `normal`      |
| Value color               | `rgb(36,41,46)` light, `rgb(201,209,217)` dark | `rgb(201,209,217)`         | `rgb(36,41,46)`              |
| Value-column divider      | 1 px; dark `rgba(65,80,108,.3)`                | 1 px `rgba(65,80,108,0.3)` | 1 px `rgba(182,192,211,0.5)` |

Supporting captured facts:

- The list is genuinely scrollable at the baseline state (`scrollHeight` 328 over a 320 px client
  height), so the 544 px client width demonstrates the host scrollbar contract's reserved 6 px
  gutter rather than an overlay scrollbar.
- The nested grid contract holds: the `options` group row measures 538 x 72 with its label on its
  own row, and the `momentum` and `decay` children render 514 x 20 on their own rows, indented
  24 px from the top-level row edge beneath the group label — no implicit side column.
- The light divider's computed `rgba(182,192,211,0.5)` is `border-setta-200/50`; the dark
  `rgba(65,80,108,0.3)` is `border-setta-600/30` — the accepted host divider classes.
- The application-owned ARGS toolbar and value controls remain deliberately absent from the
  unrelated renderer, per the exit-gate record.
