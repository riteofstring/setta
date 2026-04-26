# Flat Section Prototype Header Hit Targets

Date: 2026-04-25
Area: frontend
Branch/Commit: go-rewrite-dom-simple @ ac57fda99 before refactor
Related PR: n/a

## Goal

Fix uneven top control spacing and tiny hover targets caused by applying css.gg icon classes directly to buttons, while keeping the flat section prototype's markup modest and measurable.

## Scenario

- Entry point: `/internal/flat-section-prototype`
- Steps: load the route at 1440x1100, inspect all collapsed `[data-flat-section-shell="true"]` cards, and compare header button/title geometry.
- Data set: static prototype gallery with dark/light callable and dict cards.
- Browser + OS: Chrome via CDP on Linux.
- Notes: Vite dev server, no CPU/network throttling. Metrics are DOM/class-shape and hit-target checks, not frame-time measurements.

## Before

- Measurement source: previous CSS refactor report, plus visual inspection of the header controls.
- Collapsed gallery totals across four cards:
  - Elements: 112
  - Class attributes: 112
  - Class tokens: 182
  - Class-name characters: 5696
  - Inline style characters: 236
- Observations:
  - css.gg classes were on the `<button>` elements, so the button box collapsed to the transformed icon geometry.
  - Callable and dict titles started at different x positions because the kind icon buttons had different rendered widths.
  - Hover only activated over the drawn icon strokes rather than the intended button target.

## After

- Measurement method: CDP `evaluate_script` on the same route and viewport.
- Collapsed gallery totals across four cards:
  - Elements: 132
  - Class attributes: 132
  - Class tokens: 222
  - Class-name characters: 7096
  - Inline style characters: 236
  - Icon glyph spans: 20
  - Grid descendants: 0
  - Mounted controls: 0
- Header geometry:
  - All top header buttons measured 16px by 16px.
  - Top right button left positions were evenly spaced by 20px.
  - Callable and dict title relative x positions both measured 33px from the card left edge.
  - A point inside the button box but outside the glyph resolved to the button, and hover changed the button color.

## Conclusion

- What improved: header controls now have stable hit targets and equal spacing, and title alignment no longer depends on the visual width of the callable/dict icon.
- What regressed: 20 glyph spans were added across the four-card preview, raising collapsed element count by 17.9% for this prototype. This is an intentional tradeoff because the buttons need a stable hit target independent of css.gg's transformed drawing box.
- Follow-ups: if this pattern moves into production, keep glyph wrappers only for icon controls that need css.gg-style drawn icons; text-only rows and data cells should remain wrapper-free.

## Raw Artifacts (local-only)

- `/tmp/flat-prototype-header-controls-fixed.png`
- `/tmp/flat-prototype-header-controls-fixed-mobile.png`

## Automated Perf Tests

- Vitest guard: `frontend/src/components/Section/Layouts/FlatSectionPrototype.test.tsx`
- Budgets/assertions added: icon spans must correspond to `.flat-section-prototype__icon-glyph` rather than arbitrary wrapper spans.
