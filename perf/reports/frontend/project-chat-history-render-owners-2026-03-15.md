# Project Chat History Render Owner Extraction

- Date: `2026-03-15`
- Surface: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
- Slice: extract the history toolbar/panel shell, grouped or ungrouped folder shells, and thread row render owners into local history modules

## Scenario

- Page: `http://127.0.0.1:3002/desert_wise`
- View: project chat with the inline threads panel visible
- Interaction: click `Hide thread engine badges` from the threads toolbar and wait for the thread row to settle

## Measurements

- Before refactor:
  - Observed INP: `45ms`
  - CLS: `0.00`
- After refactor:
  - Observed INP: `32ms`
  - CLS: `0.00`

## Notes

- The measured toolbar interaction stayed fast after the render-owner extraction and improved on this headed-CDP sample.
- Visual follow-up on the same page confirmed that the extracted toolbar still renders in the thread header, `New Group` still creates an editable group row, and the ungrouped thread list still renders beneath the new group shell.
