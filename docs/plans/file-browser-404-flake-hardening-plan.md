# File Browser 404 Flake Hardening Plan

## Goal
Reduce Playwright flakiness from transient `/api/getFolderContents` 404 responses during in-progress path edits, without weakening the behavioral assertions in file-browser tests.

## Problem Summary
- The E2E unexpected-API guard intentionally fails tests on unhandled 4xx/5xx responses.
- File-browser path editing and completion can issue intermediate folder lookups for paths that do not exist yet.
- Backend currently returns `404` for missing folders on `/getFolderContents`, which intermittently trips the guard.
- Tests have added `allowExpectedApiError` overrides as a workaround, and those can mask regressions if overused.

## Implementation Plan
1. Backend API contract: add explicit missing-folder behavior mode
- Extend `GetFolderContentsRequest` with an optional field:
  - `missingFolderBehavior: "error" | "empty"` (default `"error"`).
- In `route_get_folder_contents`, when the resolved folder does not exist:
  - `"error"` -> keep existing `404`.
  - `"empty"` -> return `[]`.
- Keep non-directory path behavior unchanged (`400`) to preserve current semantics outside missing-path handling.

2. Frontend callers: use `"empty"` only for live-edit/query flows
- Update file-browser UI callers that run while users are typing or filtering:
  - `BrowserArea` folder loads and recursive crawl.
  - `FileBrowserPane` tree loading.
  - `folderPathCompletions` completion source.
- Pass `missingFolderBehavior: "empty"` in those calls.
- Do not change behavior for unrelated endpoints/callers.

3. Remove/avoid broad test allowances for `/api/getFolderContents` 404
- Remove file-browser test-level expected 404 allowances that were only compensating for transient missing-path lookups.
- Keep test conditions/assertions unchanged (same user flow and same assertions).

4. Harden E2E allowance helper to reduce masking risk
- Extend `allowExpectedApiError` rules with:
  - `method` (optional HTTP method match).
  - `ttlMs` (optional expiration window; default bounded duration).
- Apply method checks in both default allowed errors and per-test overrides.
- This keeps intentional error-path tests explicit while reducing accidental cross-test masking.

5. Regenerate endpoint/types and run targeted verification
- Regenerate generated endpoint/types after backend request model changes.
- Run focused tests:
  - `browser-carousel-scroll.spec.ts` repeated runs.
  - file-browser Playwright suite.
  - impacted frontend unit tests (`folderPathCompletions.test.ts`).

## Acceptance Criteria
- File-browser path-editing flows no longer depend on allowing transient `/api/getFolderContents` 404s.
- Existing test behavior assertions remain intact.
- E2E helper allowances are narrower by method/time and less likely to mask unrelated failures.
- Targeted test runs pass.
