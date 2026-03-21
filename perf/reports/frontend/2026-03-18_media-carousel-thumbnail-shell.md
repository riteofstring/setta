# 2026-03-18 MediaCarousel Thumbnail Shell

Branch: `frontend-performance-11`

## Summary

- Flatten the shared `MediaCarousel` thumbnail shell.
- Keep Browser carousel tile geometry and Chat attachment-preview thumbnails visually aligned with untouched `main`.
- Preserve the existing shared carousel selectors and resize/scroll behaviors.

## Verification

- `pnpm -C frontend exec vitest run src/components/Utils/MediaCarousel.test.tsx src/components/Utils/MediaCarousel.perf.test.tsx src/components/Utils/MediaCarouselScrollbar.test.ts src/components/Section/Layouts/BrowserArea.test.tsx`
  - result: `4` files passed, `15` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/file-browser/browser-carousel-thumbnail-shell.spec.ts frontend/tests/e2e/file-browser/browser-carousel-scroll.spec.ts frontend/tests/e2e/file-browser/browser-carousel-resize.spec.ts frontend/tests/e2e/file-browser/browser-carousel-spreadsheet-preview.spec.ts frontend/tests/e2e/chat/chat-attachments.spec.ts --grep "chat attachment preview supports common file types|carousel thumbnail shells keep the shared wrapper off single-cell helpers|carousel thumbnail strip scrolls with trackpad wheel|carousel thumbnail strip is vertically resizable|browser carousel previews and edits csv/xlsx spreadsheets"`
  - result: `5` passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/file-browser/browser-transfer-and-drop.spec.ts frontend/tests/e2e/file-browser/browser-file-open.spec.ts --grep "explorer drag-and-drop opens sections and spreadsheet accepts file drops|browser history buttons navigate folders"`
  - result: `2` passed

## CDP Compare

- Untouched `main`: disposable compare project `wolf_racing` on `http://127.0.0.1:3087/wolf_racing`
  - Browser carousel row class: `setta-media-carousel-thumbnail-row flex items-start shrink-0 gap-2 overflow-x-scroll overflow-y-hidden px-2 py-2 [scrollbar-gutter:stable] nopan nowheel`
  - image shell class: `single-cell-container shrink-0 overflow-clip rounded-md border border-solid border-blue-500 shadow-md`
  - text shell class: `single-cell-container shrink-0 overflow-clip rounded-md border border-solid border-setta-500/20 bg-setta-100 opacity-80 transition-opacity group-hover/thumbnail:opacity-100 dark:bg-setta-800`
  - geometry:
    - image shell `100.8 x 100.8`
    - text shell `96 x 96`
    - image checkbox offset `5.25 x 5.25`
    - text checkbox offset `5 x 5`
    - `TXT` badge `36.04 x 17.5`
- Worktree: disposable compare project `flying_soft` on `http://127.0.0.1:3011/flying_soft`
  - Browser carousel row class: `setta-media-carousel-thumbnail-row flex items-start shrink-0 gap-2 overflow-x-scroll overflow-y-hidden px-2 py-2 [scrollbar-gutter:stable] nopan nowheel`
  - image shell class: `relative flex shrink-0 items-center justify-center overflow-clip rounded-md border border-solid border-blue-500 shadow-md`
  - text shell class: `relative flex shrink-0 items-center justify-center overflow-clip rounded-md border border-solid border-setta-500/20 bg-setta-100 opacity-80 transition-opacity group-hover/thumbnail:opacity-100 dark:bg-setta-800`
  - touched markup no longer exposes `single-cell-container` or `single-cell-child`
  - raw tile shell reads slightly smaller because the React Flow viewport scale is `0.987184`
  - normalized geometry:
    - image shell `100.8 x 100.8`
    - text shell `96 x 96`
    - image checkbox offset `5.25 x 5.25`
    - text checkbox offset `5 x 5`
    - `TXT` badge `36.04 x 17.5`

## Result

- Accepted for the shared `MediaCarousel` thumbnail shell seam.
- Browser carousel and Chat attachment-preview hosts stayed green on the shared shell move.
- The next pass should widen upward into `frontend/src/components/Utils/PaneContainer.tsx`.
