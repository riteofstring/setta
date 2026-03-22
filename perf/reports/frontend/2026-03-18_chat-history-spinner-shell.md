# Chat History Spinner Shell

Date: 2026-03-18
Worktree: `setta.frontend-performance-11`
Branch: `frontend-performance-11`

## Scope

- Flatten the managed history spinner shell in `frontend/src/components/Section/Layouts/ChatArea.tsx`.
- Keep the managed Chat history row on the same constrained branch shell.
- Exhaust the last section-owned `single-cell` owner under `frontend/src/components/Section/Layouts`.

## Production Change

- `ChatSectionHistoryList(...)` no longer gives the live `BrailleSpinner` the shared `single-cell-child` class.
- The spinner now stays on the row's existing flex contract via `shrink-0`.
- Added a focused Playwright guardrail in `frontend/tests/e2e/chat/chat-history-spinner-shell.spec.ts` for the managed history row shell and spinner bounds.

## Automated Verification

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/chat-history-spinner-shell.spec.ts`
  - result: `1` passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/chat-composer-controls.spec.ts --grep "chat section history refreshes runs when the history panel opens|chat section exits history when external activity resumes the current managed thread"`
  - result: `2` passed

## CDP Compare

- Untouched `main`: disposable compare project `pearl_chief` on `http://127.0.0.1:3087/pearl_chief`
  - representative managed history row keeps the existing flex row class
  - live spinner class still includes `single-cell-child`
  - touched markup still exposes the old helper contract
  - geometry:
    - row `376 x 52.5`
    - spinner `8.89 x 13`
  - spinner stays inside the row bounds
- Worktree: disposable compare project `eager_fair` on `http://127.0.0.1:3011/eager_fair`
  - representative managed history row keeps the same flex row class
  - live spinner class now reads `inline-flex ... shrink-0 text-[13px] ...`
  - touched markup no longer exposes `single-cell-child`
  - geometry:
    - row `386 x 52.5`
    - spinner `8.89 x 13`
  - spinner stays inside the row bounds

## Result

- Accepted for the managed Chat history spinner seam.
- The section-owned lower layout stack is exhausted for the current scope.
- The next pass should widen into `frontend/src/components/Utils/MediaCarousel.tsx`.

## Correction

- The first committed follow-up also folded the chat-width wrapper into the scrolling history root.
- A fresh CDP compare rejected that extra wrapper merge because it widened the representative worktree row from untouched `main`'s `376px` width to `386px`.
- The kept correction restores the original `data-chat-width-shell="true"` wrapper and inner `overflow-y-auto px-4 pb-2 pt-1` history root while preserving the accepted spinner move off `single-cell-child`.

### Correction Verification

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/ChatArea.test.tsx src/components/Section/Layouts/chatAreaHistoryPolling.test.ts`
  - result: `2` files passed, `8` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/chat-history-spinner-shell.spec.ts`
  - result: `1` passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/chat-composer-controls.spec.ts --grep "chat section history refreshes runs when the history panel opens|chat section exits history when external activity resumes the current managed thread|chat section defers run history loading until history is opened|chat section history avoids polling while all runs are idle"`
  - result: `4` passed

### Corrected CDP Compare

- Untouched `main`: disposable compare project `coral_thick` on `http://127.0.0.1:3087/coral_thick`
  - width-shell class: `mx-auto w-full max-w-[72rem] px-2 min-h-0 flex-1`
  - history-root class: `min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-1`
  - touched markup still exposes `single-cell-child`
  - geometry:
    - row `376 x 52.5`
    - spinner `8.89 x 13`
- Worktree: disposable compare project `dune_wise` on `http://127.0.0.1:3011/dune_wise`
  - width-shell class: `mx-auto w-full max-w-[72rem] px-2 min-h-0 flex-1`
  - history-root class: `min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-1`
  - touched markup no longer exposes `single-cell-child`
  - geometry:
    - row `376 x 52.5`
    - spinner `8.89 x 13`

### Corrected Result

- Accepted for the managed Chat history spinner seam on the restored width-shell split.
- The section-owned lower layout stack remains exhausted for the current scope.
- The next pass still widens into `frontend/src/components/Utils/MediaCarousel.tsx`.
