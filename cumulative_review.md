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

# 2026-03-13 21:56 PDT

## Implementation Follow-Up

This entry records the actual implementation pass that followed the consolidated review above.

The reviewed findings were implemented directly rather than papered over with compatibility shims or fallback heuristics. The resulting changes narrowed the search surface to what the UI actually renders, made chat hydration backend-authoritative for completed messages, removed redundant Project Chat manager behavior, normalized chat-window z-order restoration, and eliminated per-instance spinner intervals.

## What Changed

### 1. Conversation search now uses the rendered surface as the source of truth

Implemented changes:
- `frontend/src/utils/conversationSearch.ts` now excludes hidden tool payload details and markdown-only destinations from searchable text.
- Attachment names remain searchable.
- Visible assistant activity labels are searchable and highlighted.
- `frontend/src/components/Chat/ChatMessages.tsx` now derives search counts and the active target from rendered `mark` nodes instead of from a parallel raw-text occurrence model.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx` now treats the rendered match count as authoritative for the search counter and navigation.

Behavioral result:
- Searching for hidden tool payload text no longer reports phantom hits.
- Searching for visible labels like attachment names or activity labels produces a real highlight target.
- `Enter` / `Shift+Enter` step across actual visible highlights.

Additional regression found during CDP verification:
- When the conversation filter produced zero visible messages, `ProjectChatCore` swapped in the empty-state paragraph instead of `ChatMessageList`, which left a stale non-zero counter on screen.
- Fix: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx` now explicitly reports `0` matches whenever the search empty state replaces the message list.
- A focused regression test was added in `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.hydration.integration.test.tsx`.

UX before:
- Search could show counts for content the user could not see.
- Empty-state filtering could leave stale match counts on screen.

UX after:
- Search results map to visible highlights only.
- Zero-result filters show `0/0` and the empty-state message consistently.

DX before:
- Search semantics were split between multiple competing models.

DX after:
- The rendered highlight list is the authoritative count/navigation model.

### 2. Hydration now trusts the backend for completed messages

Implemented changes:
- `frontend/src/state/actions/chatMergeUtils.ts` now takes backend content verbatim for same-id hydration when `preserveLocalOnlyMessages=false`.
- Local `createdAt` is only preserved if the backend omitted it.

Behavioral result:
- Equal-length or otherwise ambiguous assistant-content ties no longer preserve stale local content just because it happened to score similarly.

UX before:
- Reloaded chats could keep stale local completions instead of converging to the backend transcript.

UX after:
- Completed chats converge to backend truth.

DX before:
- Same-id hydration still relied on a completeness heuristic in cases that should have been deterministic.

DX after:
- Completed-message hydration is a direct rule, not a guess.

### 3. Tool-message serialization now strips UI-only fields consistently

Implemented changes:
- `backend/setta/types/chat_messages.py` now routes `ToolChatMessage.to_openai_format()` through the shared parent formatting path so UI-only fields like `createdAt` are stripped consistently.

Behavioral result:
- Tool-message history no longer leaks UI-only keys into provider payloads.

UX before:
- Chats with tool history could fail or behave inconsistently on later turns.

UX after:
- Tool and non-tool messages cross the provider boundary through the same sanitization rule.

DX before:
- Cross-cutting field stripping depended on each subtype remembering to reimplement the same cleanup.

DX after:
- There is one authoritative sanitization boundary.

### 4. Project chat windowing is simpler and more deterministic

Implemented changes:
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatManager.tsx` removed the obsolete variant branching and now exposes only the menu-backed manager.
- Hidden/minimized rows expose `Reopen`.
- Open rows expose `Focus`, plus `Hide` when layout editing is allowed.
- `frontend/src/state/actions/projectChatWindowing.ts` now normalizes duplicate `zIndex` ties before focus operations.
- `frontend/src/state/actions/windowSpaces.ts` now normalizes restored windowing layouts so restore/import does not leave tied top layers behind.

Behavioral result:
- The manager presents one state-specific action set per row.
- Focus is deterministic after restore/import even when prior state contained tied `zIndex` values.

UX before:
- The manager had redundant branches and focus behavior could no-op in tied-layer cases.

UX after:
- The manager is easier to scan and focus behavior is predictable.

DX before:
- Window-manager behavior was spread across stale UI branches and tie-prone focus logic.

DX after:
- The code path is flatter and easier to reason about.

### 5. BrailleSpinner no longer creates one timer per instance

Implemented changes:
- `frontend/src/components/Utils/BrailleSpinner.tsx` now uses a shared ticker with `useSyncExternalStore` instead of creating a new interval per spinner instance.

Behavioral result:
- Busy chat surfaces can show many spinners without multiplying timer work linearly.

UX before:
- Large waiting surfaces incurred avoidable JS churn.

UX after:
- The same visual behavior scales better.

DX before:
- Animation cost was hidden inside each mounted spinner instance.

DX after:
- Animation state is centralized and directly testable.

## Verification Run

Automated verification completed during this implementation pass:
- Frontend Vitest:
  - targeted suites covering conversation search, chat messages, multi-surface Project Chat behavior, hydration merge behavior, manager behavior, spinner behavior, and windowing restore/focus behavior
- Backend pytest:
  - targeted suites covering chat-message formatting and tool-message request payload sanitization
- Playwright:
  - targeted `project-ai-chat-threads` conversation-search coverage

Manual verification completed with Chrome DevTools MCP:
- verified hidden tool payload text shows `0/0`
- verified attachment-label search produces a real highlight target
- verified visible activity-label search produces a real highlight target
- verified Project Chat manager rows show `Hide` / `Focus` for open windows and `Reopen` for minimized windows

## Outcome

The earlier consolidated review identified real blockers; this implementation pass closed them with direct code simplification, targeted regression coverage, and live UI verification.

The remaining state in this worktree is materially better than the reviewed baseline:
- fewer stale branches,
- fewer heuristic pathways,
- tighter alignment between UI behavior and internal state,
- and broader regression coverage for the failure modes the review documents identified.
