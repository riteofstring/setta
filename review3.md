# Review 3

## Verdict
No hard merge blocker found in the `main...HEAD` diff. The branch is broadly coherent, and targeted tests I ran for changed risk areas passed.

## Findings

### 1. [Medium] Reintroduced nullish fallback shims in section chat execution settings
- Example: `frontend/src/components/Section/Layouts/ChatArea.tsx:591` and `frontend/src/components/Section/Layouts/ChatArea.tsx:1363` use:
  - `permissionMode: currentSectionState.permissionMode ?? permissionMode`
  - `searchEnabled: currentSectionState.searchEnabled ?? searchEnabled`
- Why this is a problem: `permissionMode` and `searchEnabled` are now required/defaulted in section state and request contracts. These fallbacks hide contract/state issues instead of surfacing them.
- Proposed fix: remove the `??` fallbacks and read state fields directly (or throw explicitly if unexpectedly missing).
- UX/DX before: malformed state is silently masked, making runtime behavior drift harder to diagnose.
- UX/DX after: contract violations fail fast, and debugging state corruption is straightforward.

### 2. [Medium] Workspace Python root scan bypasses cache every 5s in empty Project Chat
- Example: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx:72` (`WORKSPACE_PYTHON_SIGNAL_REVALIDATE_MS = 5000`) plus `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx:289` (`shouldUseCache = revalidationTick === 0`).
- Why this is a problem: once the first scan is done, every revalidation tick bypasses cache and calls `route_get_folder_contents(...maxEntries: 5000)` even when root identity is unchanged.
- Proposed fix: always consult `getCachedWorkspacePythonSignal(...)` and let TTL/backoff control rescan frequency (instead of forcing uncached scans every tick).
- UX/DX before: avoidable background API load and repeated large-root scans while the empty state is visible.
- UX/DX after: same feature behavior with materially lower polling overhead and less backend chatter.

### 3. [Low] Slash-command parser ignores the injected command list
- Example: `frontend/src/components/Chat/ChatInput.tsx:227` parses with `CHAT_SLASH_COMMANDS` instead of the `slashCommands` prop.
- Why this is a problem: `ChatInput` exposes configurable `slashCommands`, but parsing is hard-wired to defaults, making custom command sets brittle.
- Proposed fix: call `parseSlashCommand(message, slashCommands)`.
- UX/DX before: parser behavior can diverge from the command list provided by callers.
- UX/DX after: parsing and command availability are aligned, making command customization safer.

## Merge recommendation
- If you want strict contract/performance hygiene, fix Findings 1 and 2 before merge.
- If you prioritize velocity, merging is still reasonable; I did not find a correctness-blocking regression in this diff.
