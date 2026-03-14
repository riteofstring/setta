# 2026-03-13 20:57 PDT

## Summary

This entry consolidates the five top-level review documents that were present in the repo at review time (`review1.md` through `review5.md`).

Shared conclusion from those reviews:
- Merge recommendation at review time was `do not merge yet`.
- The strongest consensus findings were waiting-thread hydration correctness, conversation-search occurrence accounting, lossy draft persistence, and removal of dead `includeHidden` / obsolete Project Chat manager surface area.
- Several lower-frequency findings also pointed to concrete correctness and maintainability issues in Overview quick-info wiring, Git worktree error handling, dock-width reservation, provenance fallback logic, and Windows path-root handling.

All of the issues below were addressed in the implementation that now exists in this worktree.

## Consolidated Findings And Fixes

### 1. Waiting-thread hydration needed to be backend-authoritative and monotonic

Review consensus:
- Raised by all five review documents as the highest-risk correctness problem.
- The old merge path preserved any non-empty local assistant fragment over hydrated backend content.
- Mixed content-block shapes could also corrupt the transcript by overlaying by array index instead of preserving the backend structure.

Implemented fix:
- Assistant hydration reconciliation now uses a backend-authoritative merge rule in `frontend/src/state/actions/chatMergeUtils.ts`.
- Same-shape text/thinking blocks are resolved by completeness instead of truthiness.
- Shape mismatches no longer preserve stale local structure; the backend structure wins.
- Truly local-only trailing assistant content is still preserved when the backend has not emitted that content yet.
- The runtime-probe fallback for missing provenance was removed, so hydration now uses a single authoritative run-type source and fails clearly when provenance is missing.

UX before:
- Reloading or hydrating an active chat could leave the user staring at stale partial text even after the backend had a fuller answer.
- Mixed `thinking` + `text` messages could lose a block or duplicate text after hydration.

UX after:
- Hydration catches the UI up to the canonical backend transcript.
- Mixed assistant content keeps the backend structure intact.
- Missing provenance now surfaces as a direct data-integrity problem instead of silently probing multiple runtimes.

DX before:
- Hydration behavior depended on brittle truthiness and fallback probing.
- The merge path was hard to reason about and difficult to test with confidence.

DX after:
- There is one explicit merge rule and one authoritative hydration path.
- The behavior is simpler to explain and is now covered by direct unit and integration tests.

### 2. Conversation search needed one canonical occurrence model

Review consensus:
- Raised by all five review documents.
- The counter, thread badges, highlight rendering, and active-target navigation were derived from different match models.
- Duplicate terms, overlapping terms, and matches inside skipped render regions could create phantom occurrences.

Implemented fix:
- Conversation search now builds its count from the same canonical highlightable ranges used by rendering in `frontend/src/utils/conversationSearch.ts`.
- Duplicate query tokens are deduplicated.
- Fenced code blocks and inline code are excluded from the searchable text used for visible match accounting.
- Navigation and counter behavior now stay aligned with the visible marks in the chat UI.

UX before:
- Search could report more matches than the user could actually see.
- `Enter` / `Shift+Enter` could advance the counter without moving to a distinct visible highlight.

UX after:
- Every reported occurrence corresponds to one visible, targetable highlight.
- Repeated navigation advances across real rendered matches only.

DX before:
- Counting and rendering logic diverged, which made regressions easy to introduce and hard to verify.

DX after:
- One occurrence model now drives the whole feature, which reduces mental overhead and simplifies testing.

### 3. Persisted drafts needed exact round-tripping

Review consensus:
- Raised by four of the five reviews.
- Draft persistence by project config was correct in concept, but the persisted draft body was trimmed on rehydrate.

Implemented fix:
- Draft persistence normalization in `frontend/src/state/definitions.ts` now preserves draft strings exactly.
- Only invalid keys / values are filtered out.
- Empty-string deletion semantics remain explicit without rewriting valid draft content.

UX before:
- Leading spaces, trailing spaces, or final newlines disappeared after reload.
- In-progress prompts and formatted snippets could come back changed.

UX after:
- Reload restores the exact draft the user typed.

DX before:
- The persistence layer rewrote valid user data and the tests encoded the wrong behavior.

DX after:
- The storage layer now matches the actual product contract: exact draft persistence.

### 4. Dead or superseded API/UI surface needed removal

Review consensus:
- Universal agreement on removing the dead `includeHidden` request flag.
- Strong agreement on removing the obsolete `ProjectChatManager` `"overview"` variant.

Implemented fix:
- Removed `includeHidden` from the backend request model, frontend callers, generated types, and related tests.
- Regenerated synced endpoint/types output after the contract cleanup.
- Removed the dead `ProjectChatManager` `"overview"` variant and its obsolete test surface.

UX before:
- Minimal user-facing impact, but the codebase still suggested behavior that no longer existed.

UX after:
- No functional regression; the visible behavior stays the same while the contract surface is smaller and clearer.

DX before:
- The repo contained stale request/UI branches that could mislead future changes.

DX after:
- The active API and UI surface better reflect the real product behavior.

### 5. Lower-frequency correctness and maintainability issues

Several findings appeared in one review each, but they were still concrete and were fixed:

- Overview quick-info:
  - Problem: JSON Render quick-info copy had been removed as a single source of truth while the UI still referenced it.
  - Fix: restored one shared quick-info object in `frontend/src/components/Panes/Overview/Overview.tsx`.
  - UX before/after: the App tab risked render breakage and missing help text; it now renders normally with the intended quick-info metadata.

- Git status fallback:
  - Problem: `git worktree list` failure could blank the entire Git status response even when `git status` had succeeded.
  - Fix: worktree enumeration in `backend/setta/routers/git.py` is now best-effort and falls back to `worktrees=[]`.
  - UX before/after: the Git pane could fail completely; it now still shows primary status even if supplemental worktree metadata is unavailable.

- Bottom dock reserved width:
  - Problem: the persistent manager trigger was not reserved in single-chat dock width math.
  - Fix: extracted a small layout helper in `frontend/src/components/ChatWindowing/projectChatBottomDockLayout.ts` and used it from the dock component.
  - UX before/after: dock chrome could overlap at narrower widths; the dock now reserves strip controls explicitly.

- Windows drive-root handling:
  - Problem: shared path helpers collapsed `C:/` into `C:`, breaking absolute-root semantics.
  - Fix: normalized Windows-aware root handling in `frontend/src/utils/browserPaths.ts` and related navigation/path-relation helpers.
  - UX before/after: breadcrumb and parent navigation could generate incorrect Windows paths; they now preserve `C:/` as an absolute root token.

## Verification Added For These Fixes

The implementation added or updated targeted coverage across unit, integration, Playwright, and backend tests:

- Frontend unit/integration coverage for:
  - hydration merge completeness and mixed-block handling
  - authoritative provenance blocking
  - exact draft round-tripping
  - canonical search occurrence accounting and code-block exclusion
  - Overview JSON Render quick-info rendering
  - bottom-dock reserved-width calculation
  - Windows path-root navigation behavior

- Backend coverage for:
  - Git status success when worktree enumeration fails
  - file-browser route behavior after `includeHidden` removal

- Playwright coverage for:
  - exact draft persistence across reloads
  - project-AI conversation search with duplicate terms and code-only matches excluded
  - standalone chat draft persistence
  - App-tab behavior after the quick-info cleanup

## Outcome

At review time, the branch had clear pre-merge blockers and several smaller correctness issues.

After the implementation in this worktree:
- the high-consensus blockers were fixed,
- the dead/superseded code paths were removed instead of preserved,
- targeted regression coverage was added where the reviews identified gaps,
- and the resulting code in the affected areas is materially simpler and easier to reason about than the reviewed state.
