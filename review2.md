# Branch Review (`main...HEAD`)

## Merge recommendation
No hard blocker found. I would merge after (or with) the medium-severity fixes below; lows can be follow-up cleanup.

## Findings

### 1) Medium: Unknown slash commands still fall through to model execution
- Evidence:
  - `frontend/src/components/Chat/ChatInput.tsx:227-230` returns `false` when `parseSlashCommand(...)` is `null`, so the message is submitted normally.
  - `frontend/src/components/Chat/chatComposerControls.ts:334-335` returns `null` for unknown commands like `/unk`.
- Concrete example:
  - User types `/unk` and presses Enter in chat composer. Instead of local feedback, this is sent to `/getLLMResponse`.
- Why this matters:
  - It is inconsistent with the composer feedback contract (`"Unknown or unavailable command. Use /help."`) and wastes an LLM request on obvious command typos.
- Proposed fix:
  - In `runSlashCommand`, detect command-shaped first tokens (same token regex), and if token is command-like but unmatched, handle locally with unknown-command feedback (while still allowing path-like inputs such as `/tmp ...`).
- UX/DX before:
  - UX: typoed slash commands can trigger model calls and confusing assistant replies.
  - DX: harder to debug command behavior because typo vs valid-input paths are not clearly separated.
- UX/DX after:
  - UX: immediate, deterministic local feedback for typoed commands.
  - DX: clearer slash-command pipeline and fewer accidental network calls.

### 2) Medium: Empty-state workspace Python scan is still aggressive for large roots
- Evidence:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx:72` sets `WORKSPACE_PYTHON_SIGNAL_REVALIDATE_MS = 5000`.
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx:251-253` runs periodic revalidation every 5s when visible.
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx:304-310` scans root contents up to `maxEntries: 5000`.
- Concrete example:
  - Leaving Project Chat empty-state open on a large workspace causes repeated folder scans every ~5s.
- Why this matters:
  - Unnecessary background load (frontend + backend) and noisy polling for an advisory UI hint (starter prompt visibility).
- Proposed fix:
  - Increase revalidation interval (for example 30-60s), keep immediate refresh on root change/visibility return, and optionally skip full scans when cached signal is fresh unless root identity changes.
- UX/DX before:
  - UX: avoidable background churn while idle.
  - DX: harder perf profiling due constant polling noise.
- UX/DX after:
  - UX: same behavior with less background overhead.
  - DX: cleaner perf traces and lower backend request volume.

### 3) Low: Required execution settings are still guarded by nullish fallback shims
- Evidence:
  - `frontend/src/components/Section/Layouts/ChatArea.tsx:591-592` and `frontend/src/components/Section/Layouts/ChatArea.tsx:1363-1364` use:
    - `permissionMode: currentSectionState.permissionMode ?? permissionMode`
    - `searchEnabled: currentSectionState.searchEnabled ?? searchEnabled`
- Concrete example:
  - If state becomes malformed, these fallbacks silently mask it and continue with stale prop values.
- Why this matters:
  - This is effectively a backward-compatibility shim on fields that are now part of the required chat contract.
- Proposed fix:
  - Remove nullish fallbacks and require these fields directly from section state; fail loudly (or assert) if missing.
- UX/DX before:
  - UX: silent drift can hide config issues.
  - DX: harder to detect upstream state/schema bugs.
- UX/DX after:
  - UX: explicit failure only when state is invalid.
  - DX: faster detection of real contract violations.

### 4) Low: Redundant duplicated execution-settings update logic in section chat
- Evidence:
  - Nearly identical `updateExecutionSettings` blocks exist in:
    - `frontend/src/components/Section/Layouts/ChatArea.tsx:579-618` (scriptable)
    - `frontend/src/components/Section/Layouts/ChatArea.tsx:1351-1390` (managed)
- Concrete example:
  - Any future permission/search behavior change requires editing both code paths and tests, increasing drift risk.
- Why this matters:
  - Redundant code adds maintenance overhead and regression risk.
- Proposed fix:
  - Extract a shared helper for section-level execution-settings persistence (similar to existing shared slash-control helpers).
- UX/DX before:
  - UX: none immediate.
  - DX: duplicate maintenance and higher chance of inconsistency.
- UX/DX after:
  - UX: unchanged.
  - DX: single source of truth, lower drift/regression risk.
