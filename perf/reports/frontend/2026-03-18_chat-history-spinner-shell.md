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
