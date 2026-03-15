# File Browser Pane Tree Data Extraction

- Date: `2026-03-15`
- Surface: `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
- Slice: extract root/folder transport, request ownership, recursive-search crawl, and preview-URL refresh policy into `useFileBrowserPaneTreeData.ts` plus `fileBrowserPaneTreeModel.ts`

## Scenario

- Page: `http://127.0.0.1:3002/desert_wise`
- View: overview `File Browser`
- Interaction: click `Expand folder frontend` from the workspace root and wait for nested rows such as `src` to render

## Measurements

- Before refactor:
  - Observed INP: `80ms`
  - CLS: `0.00`
- After refactor:
  - Observed INP: `83ms`
  - CLS: `0.00`

## Notes

- The measured expand interaction stayed effectively flat after the extraction.
- No meaningful regression was observed on the same headed-CDP flow.
- Visual follow-up on the same page confirmed that the explorer still renders the root path, expands `frontend`, and keeps the search-scope popover anchored with both `Recursive search` and `Local search` options visible.
