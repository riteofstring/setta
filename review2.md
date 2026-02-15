# Branch Review vs `main` (`main...HEAD`)

Considering the fixes already captured in `cumulative_review.md`, this branch is directionally sound and I do **not** see a hard blocker that should prevent merge.

## Findings

### 1) `activeSheet` is currently dead plumbing in spreadsheet sections (redundant/unused)
- Severity: Medium
- Concrete examples:
  - `frontend/src/components/Section/Layouts/SpreadsheetArea.tsx:68` persists `activeSheet` unchanged whenever `filePath` changes.
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserSpreadsheetEditor.tsx:561` always loads/parses sheet data from file bytes and does not consume persisted `activeSheet`.
  - `backend/setta/code_gen/dependency_graph.py:523` still exports `activeSheet`, so stale values can propagate to generated output.
- Proposed fix:
  - Short-term: when setting a new `filePath`, reset `activeSheet` to `null`.
  - Better: either implement active-sheet selection end-to-end or remove `activeSheet` from schema/routes/codegen entirely (no backward-compat requirement).
- UX before/after:
  - Before: users have no explicit sheet-selection behavior but metadata can still carry stale `activeSheet`.
  - After: behavior is deterministic (no stale metadata) or explicitly controllable.
- DX before/after:
  - Before: extra field/route surface with unclear runtime effect.
  - After: state contract matches actual behavior and is easier to reason about.

### 2) Task-board task editor UI is duplicated across list and kanban views (redundant)
- Severity: Low
- Concrete examples:
  - `frontend/src/components/Section/Layouts/TaskBoardArea.tsx:1549` and surrounding block (title/description/schedule/remove handling in list row).
  - `frontend/src/components/Section/Layouts/TaskBoardArea.tsx:1895` and surrounding block (nearly identical logic in kanban card).
- Proposed fix:
  - Extract a shared task-editor subcomponent (layout variants only for container/chrome).
- UX before/after:
  - Before: risk of behavior drift between list and kanban when future fixes touch only one path.
  - After: consistent task editing behavior across both views.
- DX before/after:
  - Before: two parallel implementations to maintain/test.
  - After: one shared implementation reduces maintenance overhead and review risk.

### 3) Nested ternary in file-drop section selection reduces clarity and conflicts with repo style guidance
- Severity: Low
- Concrete example:
  - `frontend/src/state/actions/sections/createSections.ts:486` uses nested ternary chaining for `spreadsheet`/`image`/default selection.
- Proposed fix:
  - Replace with `switch (kind)` (or handler map) to make extension paths explicit.
- UX before/after:
  - Before: no immediate UX bug, but higher risk of branching mistakes when adding new drop kinds.
  - After: same UX with safer evolution.
- DX before/after:
  - Before: harder to scan/extend.
  - After: clearer control flow and alignment with stated TypeScript style rules.

## Backward-compatibility shim check
- I did not find new unnecessary backward-compatibility shims in this diff.

## Why merge / why not merge
- Reason to merge: large feature set is coherent, prior review fixes appear carried forward, and targeted backend + frontend suites passed.
- Reason to delay merge: only if you want to clean up the non-blocking issues above first (especially #1 to remove dead spreadsheet state ambiguity).

## Validation run
- Backend: `./scripts/run_backend_tests.sh tests/routers/test_file_browser_routes.py tests/routers/test_share_policy_routes.py tests/project_state/test_settings_project_view_modes.py tests/types/test_text_param_time_control_mode.py` (passed)
- Frontend: `pnpm -C frontend exec vitest run src/components/Panes/Overview/FileBrowser/FileBrowserSpreadsheetEditor.test.tsx src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx src/utils/textParamDateTime.test.ts src/utils/taskBoard.test.ts src/state/actions/sections/createSectionsHelper.test.tsx` (passed)
