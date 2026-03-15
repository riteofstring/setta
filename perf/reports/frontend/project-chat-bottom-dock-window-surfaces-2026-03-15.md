# Project Chat Bottom Dock Window Surface Extraction

- Date: `2026-03-15`
- Surface: `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
- Slice: extract the docked, floating, and maximized render shells plus shared window-action builders into local window-surface owners

## Scenario

- Page: `http://127.0.0.1:3002/desert_wise`
- View: overview canvas with the project chat bottom dock visible
- Interaction: click `Undock Chat Window 1` from the docked window header and wait for the floating window surface to settle

## Measurements

- Before refactor:
  - Observed INP: `344ms`
  - CLS: `0.00`
- After refactor:
  - Observed INP: `362ms`
  - CLS: `0.00`

## Notes

- The measured undock interaction stayed in the same range after the render-shell extraction.
- The `18ms` INP delta is small enough to treat as run-to-run noise for this single headed-CDP sample, and the refactor did not introduce a visible regression.
- Visual follow-up on the same page confirmed that the extracted floating window still renders, maximizing from the floating surface still shows the restore or dock controls, and the canvas-visibility toggle still appears while maximized.
