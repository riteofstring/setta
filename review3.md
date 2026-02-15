# Branch Review 3 (`main...HEAD`)

Scope: reviewed only the merge-base diff against `main`, and accounted for fixes already recorded in `cumulative_review.md`.

## Findings

### 1) Medium: Windows path normalization mismatch can leave stale File Browser state after move
Evidence: `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx:940`, `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx:947`, `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx:1007`, `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx:1022`, `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx:544`, `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx:561`

Concrete example: on Windows, moving `C:\repo\a.txt` into `C:\repo\sub\` can refresh `C:/repo/sub` while the state tree keys are tracked as `C:\repo\sub`; source/destination lists may stay stale until a manual refresh.

Proposed fix: keep raw path strings for state-key lookups and `fetchFolderContents(...)` refresh keys, and use normalized paths only for comparisons + backend request payloads. If needed, add a helper that resolves the existing state key by normalized match before refreshing.

UX before: file-browser moves can look inconsistent/stale on Windows after drop/paste operations.

UX after: moved/copied entries refresh correctly and consistently on all OS path styles.

DX before: mixed “normalized vs raw” key usage is easy to regress.

DX after: one clear invariant (`normalize for compare/API, raw for state keys`) simplifies maintenance.

### 2) Low: `activeSheet` is carried through state/API but currently ignored by spreadsheet loading
Evidence: `frontend/src/components/Section/Layouts/SpreadsheetArea.tsx:43`, `frontend/src/components/Section/Layouts/SpreadsheetArea.tsx:77`, `frontend/src/components/Section/Layouts/SpreadsheetArea.tsx:86`, `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserSpreadsheetEditor.tsx:599`, `frontend/src/utils/spreadsheet.ts:73`

Concrete example: even if `activeSheet` is set in section state/request payloads, load still uses `workbook.SheetNames[0]` and no sheet-selection input exists.

Proposed fix: either wire `activeSheet` into parse/load/save flow (plus UI selector), or remove `activeSheet` from this contract until multi-sheet behavior is implemented.

UX before: implied multi-sheet targeting does not actually affect loaded sheet.

UX after: either sheet targeting works as expected or the exposed contract is intentionally simplified.

DX before: dead contract surface adds ambiguity and test burden.

DX after: behavior and API contract align.

### 3) Low: nested async ternary in dropped-file dispatch hurts readability/extensibility
Evidence: `frontend/src/state/actions/sections/createSections.ts:486`

Concrete example: adding a new drop kind requires extending a nested ternary chain instead of an explicit branch table.

Proposed fix: replace with `switch (kind)` (or handler map) returning the awaited section-open call.

UX before: no direct UX regression.

UX after: no direct UX change.

DX before: harder to review/extend safely.

DX after: clearer control flow for future additions.

## Backward-compatibility shims
I did not find new unnecessary backward-compatibility shims in the branch-only diff.

## Merge recommendation
If Windows file-browser behavior is in scope, fix Finding 1 before merging. Otherwise, I don’t see a blocker for POSIX-only usage; Findings 2 and 3 can be follow-up cleanup.
