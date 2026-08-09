# Setta UI redesign — before screenshots (Phase 0)

Recorded 2026-08-09 for the
[Setta-Styled Workspace UI Plan](../plans/setta-styled-workspace-ui-plan.md), Phase 0. These
images freeze the pre-redesign presentation so every later phase can be reviewed against the same
baseline.

## How to reproduce

```
corepack pnpm evidence:visual
```

The command starts the playground development server if one is not already listening on
`http://127.0.0.1:4173`, drives headless Playwright Chromium through each scenario, and writes the
screenshots plus `capture-manifest.json` (scenario list, viewports, color schemes, environment) to
`docs/evidence/setta-ui-redesign/before/`. Re-running after the redesign with
`node scripts/capture-visual-evidence.mjs --label after` captures the identical scenarios for
comparison. Reference run: macOS arm64, Node 24.18.1, Playwright 1.62.1 Chromium.

## Scenarios

| Screenshot                       | What it freezes                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `default-first-launch.png`       | Fresh first run at 1440 × 900: hero header and settings above an empty canvas, product below the fold. |
| `default-first-launch-full.png`  | The same first run as a full-page capture, including the data panel and canvas.                        |
| `default-populated-example.png`  | The example document after “Reset example”: the current populated presentation.                        |
| `default-populated-canvas.png`   | The populated workspace region in isolation: card chrome, toolbar capsule, minimap.                    |
| `default-section-style-menu.png` | The section style dialog (chrome, accent, tag editors) opened on the Welcome note.                     |
| `default-creation-menu.png`      | The “Add a section” creation dialog.                                                                   |
| `default-narrow-320.png`         | Full-page reflow at 320 CSS pixels.                                                                    |
| `default-zoom-200.png`           | Layout equivalent of 200% page zoom on a 1440 × 900 window (720 × 450 viewport).                       |
| `visual-matrix-light.png`        | The visual-matrix canvas, light appearance: chrome variants, states, nesting depths.                   |
| `visual-matrix-dark.png`         | The same matrix in the dark appearance.                                                                |
| `visual-matrix-selection.png`    | The matrix with a two-section selection and one hovered header: selected-state controls and outlines.  |
| `visual-matrix-toolbar.png`      | The built-in viewport toolbar in isolation.                                                            |
| `visual-matrix-minimap.png`      | The built-in minimap in isolation, including the visible “React Flow” badge.                           |

## The visual-matrix route

`/?visual-matrix` is a permanent playground route built only from public `@setta/workspace`
exports (`apps/playground/src/VisualMatrixPage.tsx`, smoke-tested by
`tests/e2e/workspace-visual-matrix.spec.ts`). One deterministic document shows:

- All four section chrome variants (`default`, `compact`, `transparent`, `none`).
- Accent plus tag presentation, locked, and minimized states.
- A root group with vertical, horizontal, and third-depth nested descendants.
- A freeform container with positioned children and an empty ordered container.
- Host buttons that drive single selection, multi-selection, and clearing through the public
  controller so gesture-independent states are reviewable and screenshotable.

Query modes: `&appearance=dark` (or `light`/`system`) and `&read-only`.

## What these captures already document for later phases

- The hero/settings-first default page and hidden example document (plan: product hierarchy).
- Heavy card chrome, two-line headers with a permanent kind line, boxed 40 px control rows,
  repeated elevation at every depth, and the large dashed empty-container affordance (plan: visual
  language).
- The floating toolbar capsule overlapping canvas content and the boxed control treatment (plan:
  toolbar rail).
- The visible “React Flow” badge in package-owned canvases (plan: attribution).

## States not captured here

Gesture-bound states (moving, resizing, drag overlays, insertion placeholders, invalid drop,
detached windows) are already frozen as Playwright baselines under `tests/e2e/*-snapshots/`, for
example `workspace-recursive-mixed-parent.spec.ts-snapshots/`,
`workspace-section-resizing.spec.ts-snapshots/`, `workspace-sortable-items.spec.ts-snapshots/`,
and `workspace-section-detachment.spec.ts-snapshots/`. Those baselines are the before-evidence for
interaction states; this capture set intentionally does not duplicate them.
