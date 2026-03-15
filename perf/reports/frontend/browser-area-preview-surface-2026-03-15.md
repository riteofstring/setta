# BrowserArea Preview Surface Extraction

- Date: `2026-03-15`
- Slice: extract Browser section preview rendering and preview-state ownership
  out of `frontend/src/components/Section/Layouts/BrowserArea.tsx`

## Scenario

- Page: `http://127.0.0.1:3002/desert_wise`
- Setup: created a Browser section on the canvas, pointed it at the repo root,
  then toggled the section between list, icon, and carousel views.
- Action measured for before/after notes: `List view -> Icon view`

## Before

- BrowserArea still owned the preview render surface plus preview URL/text
  loading.
- After the toggle, the section rendered `47` icon-view thumbnails for the repo
  root.
- DevTools trace summary reported `CLS: 0.00`.
- That baseline trace did not surface any additional insight cards.

## After

- `BrowserArea.tsx` now coordinates navigation, root bootstrap, filter
  persistence, and file-open commands only.
- `BrowserAreaContentView.tsx` now owns the list/icon/carousel surface, and
  `useBrowserAreaPreviewState.ts` now owns preview URL/text-preview cache plus
  carousel selection.
- After the same `List view -> Icon view` toggle, the section again rendered
  `47` icon-view thumbnails.
- DevTools trace summary still reported `CLS: 0.00`.
- DevTools surfaced one `ForcedReflow` insight on the post-refactor trace. The
  top reported frames were shared hooks and chrome outside the new local
  preview owners:
  - `projectChatBottomDockPillStrip.tsx:86`
  - `useColumnWidthDrag.ts:59`
  - `useBrowserColumnWidth.ts:94`
  - `sectionScrollability.ts:16`
- The same CDP session also verified `Icon view -> Carousel view`, with the
  Browser section rendering `1` carousel thumbnail row and the expected preview
  shell.

## Notes

- The extraction did not introduce a visible layout shift in the Browser
  section.
- The remaining performance signal is in shared measurement/layout hooks, not in
  `BrowserAreaContentView.tsx`, `useBrowserAreaPreviewState.ts`, or
  `browserAreaPreviewModel.ts`.
