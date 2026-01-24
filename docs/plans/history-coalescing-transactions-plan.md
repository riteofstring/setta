# History coalescing and transactions plan

## Goals
- Reduce CPU/memory pressure from frequent history snapshots.
- Make undo/redo feel like user intent (edit sessions, gestures, discrete actions).
- Keep history semantics simple and deterministic in the backend.
- Avoid conflicts with native browser undo in focused inputs.

## Non-goals
- Full diff-based history or persistent/immutable data structures (for now).
- Changing the fundamental snapshot model of History.

## Current behavior
- History uses full deep copies and stores up to 1000 snapshots.
- Most mutations call `add_new_history_entry()` before changes.
- High-frequency updates (parameter typing, drag/resize, viewport) can add many entries.
- Frontend uses short debounce (50ms) but still produces many history entries.

## Proposed approach
### 1) History coalescing
Allow repeated changes for the same logical target to share one history entry.

Design
- Add optional coalescing metadata in `History`:
  - `last_entry_key: str | None`
  - `last_entry_ts: float | None` (monotonic time)
- Add a method or extend `add_current_copy()` to accept:
  - `coalesce_key: str | None`
  - `coalesce_window_s: float | None`
- Behavior:
  - If `coalesce_key` matches the last key and time since last entry is <= window,
    skip adding a new snapshot and update the timestamp (sliding window).
  - Otherwise, add a new snapshot and record the key/time.

Default windows (initial suggestion)
- Text/param editing: 0.5 to 1.0s idle window.
- Drag/resize/viewport: 0.2 to 0.4s idle window.
- Discrete actions: no coalescing.

Backend integration
- Extend `BaseProjectManager.add_new_history_entry()` to accept optional coalescing args.
- Apply coalescing to selected endpoints, for example:
  - `set_param_entered_value`
  - `set_param_name_and_value`
  - `set_section_sizes`
  - `set_section_column_width`
  - `set_browser_column_widths`
  - `set_viewport`
  - (possibly) `move_section` when driven by drag events
- Coalescing keys should be stable and specific, e.g.
  - `param:{projectConfigId}:{sectionId}:{paramInfoId}`
  - `viewport:{projectConfigId}`
  - `sectionSize:{projectConfigId}:{sectionId}`

### 2) History transactions (grouping)
Allow multiple backend mutations to collapse into a single undo entry.

Design
- Add a lightweight transaction state in `BaseProjectManager`:
  - `history_transaction_depth: int`
  - `history_transaction_key: str | None`
  - `history_entry_added_in_transaction: bool`
- Provide a context manager like `history_transaction(key: str)` that:
  - increments depth
  - allows the first `add_new_history_entry()` inside to add
  - skips subsequent entries until the outermost transaction exits

Usage patterns
- Backend-only: wrap multi-step operations that currently trigger multiple history
  entries or call multiple endpoints internally.
- Client-initiated grouping: add optional `historyGroupId` to the base request
  model (e.g., `ProjectManagerRequestWithFrontendOp`) and treat it like a
  transaction key for the duration of a request batch.

## Frontend considerations
- Provide a utility to generate stable `historyGroupId` values for multi-step UI
  actions (for example, create section + layout, or multi-entity edits).
- Ensure input-focused undo stays native by not intercepting Cmd/Ctrl+Z when
  focus is in a text input or contenteditable.

## Rollout plan
1. Add coalescing support in `History` and wire it through `BaseProjectManager`.
2. Enable coalescing for the highest frequency endpoints only.
3. Add transaction context manager in `BaseProjectManager`.
4. Add optional `historyGroupId` in request base model if client grouping is
   required; update generated types via `pnpm generate` when ready.
5. Add or update doc notes about undo behavior and native input undo.

## Verification
- Manual: type in param input, drag a section, and confirm a single undo step per
  edit session or gesture.
- Performance: compare CPU and memory during rapid input before/after.
- Safety: confirm discrete actions still generate one undo entry each.

## Open questions
- Exact idle windows for coalescing (per action type).
- Whether to introduce `historyGroupId` now or defer until a real use case.
- Any UI actions that must remain per-step undo (no coalescing).
