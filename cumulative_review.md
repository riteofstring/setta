## 2026-03-05 10:06:46 PST

### Consolidated findings implemented
- Prevented lossy custom-skill saves from truncated previews.
- Fixed custom-skill root selection to choose the highest-priority writable root.
- Decoupled `skillId` updates from unrelated default-root writability.
- Hardened slash-command lifecycle collision handling (native vs custom).
- Hardened persisted custom slash-command schema parsing/normalization.
- Removed hidden legacy Watch Code overview render path and migrated persisted `WatchCode` tab state to `Overview`.

### Proposed fixes applied
- Backend root resolution now probes writability and fails deterministically if none are writable.
- Custom-skill save in raw mode is blocked when content is truncated or still loading.
- Raw editor draft state preserves intentional empty content (`""`) rather than falling back to preview text.
- Composer command list now re-reconciles custom commands against managed/native reserved tokens.
- Local storage merge now deep-sanitizes custom slash command shapes.

### UX/DX before and after
- Before: Users could save truncated skill previews and silently lose content.  
  After: Save is disabled/blocked until safe full-content editing conditions are met.
- Before: Create/update could fail due to non-writable default roots even with writable fallbacks.  
  After: Create selects first writable root by priority; update targets only the selected skill path.
- Before: Command collisions could appear later and still execute ambiguous custom commands.  
  After: Collisions are reconciled continuously and conflicted custom commands are disabled/excluded.
- Before: Malformed persisted slash-command data could destabilize command handling.  
  After: Invalid persisted entries are dropped deterministically.

## 2026-03-05 10:46:03 PST

### Consolidated implementation updates
- Added backend skill editability metadata (`isEditable`, `editabilityReason`) for MCP skills viewer records.
- Updated frontend skills viewer state handling to separate loading/error state from editable draft content.
- Scoped slash-command polling/work to slash mode and added a deterministic fallback selector helper.
- Fixed notifications `initialTab` handling to apply once without overriding later user tab changes.
- Added and updated backend, Vitest, and Playwright coverage for these behavior fixes.

### UX/DX before and after
- Before: Skill editability decisions were implicit and could be inconsistent between backend and UI.  
  After: Backend sends explicit editability metadata, so UI edit controls behave predictably.
- Before: Skills editor loading/error transitions could interfere with raw draft state.  
  After: Draft state is preserved independently from fetch lifecycle state.
- Before: Slash-command polling and selector checks ran more broadly than needed.  
  After: Polling/lookup is limited to slash mode with stable fallback behavior and tests.
- Before: Notifications `initialTab` could keep reapplying and disrupt user tab selection.  
  After: `initialTab` is consumed once, then user tab choice is preserved.
