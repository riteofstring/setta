# Flat Section Prototype CSS Refactor

Date: 2026-04-25
Area: frontend
Branch/Commit: go-rewrite-dom-simple @ 69f4c6b48 before refactor
Related PR: n/a

## Goal

Reduce runtime DOM styling noise for the flat section prototype by moving stable section chrome from Tailwind utility-heavy `className` strings into component CSS, while preserving the React/data-driven row and port structure.

## Scenario

- Entry point: `/internal/flat-section-prototype`
- Steps: load the route at 1440x1100, collect metrics from all `[data-flat-section-shell="true"]` cards with controls collapsed; then open the first callable control bar and collect its card metrics.
- Data set: static prototype gallery with dark/light callable and dict cards.
- Browser + OS: Chrome via CDP on Linux.
- Notes: Vite dev server, no CPU/network throttling. Metrics are DOM/class-shape counts, not frame-time measurements.

## Before

- Measurement method: CDP `evaluate_script`, counting rendered descendants, class attributes/tokens/chars, inline style attributes/chars, grid descendants, row counts, and mounted controls.
- Collapsed gallery totals across four cards:
  - Elements: 112
  - Class attributes: 112
  - Class tokens: 1152
  - Unique class tokens summed per card: 374
  - Class-name characters: 20054
  - Inline style attributes: 8
  - Inline style characters: 2162
  - Grid descendants: 0
  - Mounted controls: 0
- First dark callable card with controls open:
  - Elements: 38
  - Class attributes: 38
  - Class tokens: 396
  - Unique class tokens: 125
  - Class-name characters: 6961
  - Mounted controls: 1

## After

- Measurement method: same CDP script and route.
- Collapsed gallery totals across four cards:
  - Elements: 112
  - Class attributes: 112
  - Class tokens: 182
  - Unique class tokens summed per card: 110
  - Class-name characters: 5696
  - Inline style attributes: 4
  - Inline style characters: 236
  - Grid descendants: 0
  - Mounted controls: 0
- First dark callable card with controls open:
  - Elements: 38
  - Class attributes: 38
  - Class tokens: 64
  - Unique class tokens: 40
  - Class-name characters: 1967
  - Mounted controls: 1

## Conclusion

- What improved: class tokens dropped 84.2% collapsed and 83.8% on the opened callable; class-name characters dropped 71.6% collapsed and 71.7% opened. Theme styles moved out of per-card inline styles, leaving only nested row dynamic CSS variables.
- What regressed: no intended visual or DOM-count regression. Plain component CSS was used instead of `@layer components` because this Vite/PostCSS setup rejects standalone component CSS files that use `@layer` without a local `@tailwind components` directive.
- Follow-ups: profile real panning/zooming with production section data before enabling React Flow `onlyRenderVisibleElements` or changing row virtualization behavior.

## Raw Artifacts (local-only)

- `/tmp/flat-prototype-css-refactor-desktop-collapsed-fixed.png`
- `/tmp/flat-prototype-css-refactor-mobile.png`

## Automated Perf Tests

- Vitest guard: `frontend/src/components/Section/Layouts/FlatSectionPrototype.test.tsx`
- Budgets/assertions added: markup assertions now guard against utility-heavy section internals returning to the prototype.
