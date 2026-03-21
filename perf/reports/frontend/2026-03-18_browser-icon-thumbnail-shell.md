# Browser Icon Thumbnail Shell

Date: 2026-03-18
Worktree: `setta.frontend-performance-11`
Branch: `frontend-performance-11`

## Scope

- Flatten the Browser-owned icon-view thumbnail shell in `frontend/src/components/Section/Layouts/BrowserArea.tsx`.
- Keep the shared `MediaCarousel` host out of scope for this checkpoint.
- Preserve the existing icon-tile geometry and restore a real overflow owner for large icon directories.

## Production Change

- `BrowserThumbnailContent(...)` now renders inside a Browser-owned `relative flex h-full w-full` wrapper.
- The image/icon fallback, `TXT` badge, and checkbox overlay no longer rely on `single-cell-child`.
- `ThumbnailItem(...)` now uses a plain `relative` preview shell instead of `single-cell-container`.
- The Browser section root now carries `min-h-0`, and the icon-view `File explorer` region now carries `h-0 min-h-0 flex-1` so large icon sets scroll instead of expanding the section body to content height.

## Automated Verification

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/BrowserArea.test.tsx`
  - result: `1` file passed, `4` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/file-browser/browser-thumbnail-shell.spec.ts`
  - result: `1` passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/file-browser/browser-icon-scroll.spec.ts`
  - result: `1` passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/file-browser/browser-filters.spec.ts`
  - result: `4` passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/file-browser/browser-transfer-and-drop.spec.ts`
  - result: `3` passed

## CDP Compare

- Untouched `main`: disposable compare project `walking_crystal` on `http://127.0.0.1:3087/walking_crystal`
  - representative image/text icon cards still read `single-cell-container ...` at the preview shell
  - the touched thumbnail markup still exposes `single-cell-container` / `single-cell-child`
  - geometry:
    - image card `96 x 132`
    - text card `96 x 132`
    - image preview `96 x 96`
    - text preview `96 x 96`
  - text tile badge: `TXT`
- Worktree: disposable compare project `broad_winter` on `http://127.0.0.1:3011/broad_winter`
  - representative image/text icon cards now read `relative overflow-clip ...` at the preview shell
  - the Browser-owned image/icon/badge/checkbox path no longer exposes `single-cell-container` / `single-cell-child`
  - geometry:
    - image card `96 x 132`
    - text card `96 x 132`
    - image preview `96 x 96`
    - text preview `96 x 96`
  - text tile badge: `TXT`

## Result

- Accepted for the Browser-local icon thumbnail seam.
- The next lower-shell pass should move to `frontend/src/components/Section/Layouts/ChatArea.tsx`.
