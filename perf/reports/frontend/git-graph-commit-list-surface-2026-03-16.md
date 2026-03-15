# Git Graph Commit List Surface

Date: 2026-03-16
Surface: `frontend/src/components/Git/GitGraphOverlay.tsx`
Slice: extract commit-index helpers plus the virtualized commit-list surface

## Baseline

- View: `http://127.0.0.1:3002/wave_tiger`
- Window: `1440x900`
- State: Git Graph open, no selected commit
- Measurements:
  - Overlay geometry: `1356px x 702px`
  - Commit-list wrapper geometry: `759px x 597px`
  - Overlay subtree nodes: `238`
  - Visible row hosts: `15`
  - Horizontal overflow: `false`

## After

- View: `http://127.0.0.1:3002/wave_tiger`
- Window: `1440x900`
- State: Git Graph open, no selected commit
- Measurements:
  - Overlay geometry: `1356px x 702px`
  - Commit-list wrapper geometry: `759px x 597px`
  - Overlay subtree nodes: `368`
  - Visible row hosts: `25`
  - Horizontal overflow: `false`

## Narrow-width Check

- Window: `960x900`
- State: first commit selected, selected-commit detail surface visible
- Measurements:
  - Overlay geometry: `876px x 702px`
  - Overlay subtree nodes: `325`
  - Visible row hosts: `19`
  - Horizontal overflow: `false`

## Notes

- The front-door coordinator dropped from `1224` to `310` lines.
- The stable signals for this slice were unchanged overlay geometry, unchanged
  list-wrapper geometry, preserved selected-row expansion, and no horizontal
  overflow at either width.
- The before/after row-host and subtree counts were captured from the live dev
  overlay across a reload, so they are not a strict apples-to-apples DOM-count
  benchmark. The post-reload overlay rendered more visible history rows even
  though geometry stayed flat.
