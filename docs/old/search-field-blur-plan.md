# Section Search Blur Behavior Plan

## Problem
- `TextInputCodeMirror` tears down the active CodeMirror editor on blur and renders the dummy fallback with the canonical `codeInfoName`.
- The dummy receives only the canonical value, so any in-progress edits vanish when the field loses focus.
- Users lose their draft if they click elsewhere, which is frustrating even though the amber "consistency" indicator works.

## Goals
- Preserve the user's draft across focus changes unless they explicitly cancel with Escape.
- Keep the existing consistency indicator logic so the border reflects whether the draft differs from the saved name.
- Avoid unnecessary re-renders on every keystroke.
- Retain the Escape key behavior that clears completions and restores the canonical name.

## Proposed Approach
- Keep the draft text in component state (`useState`) so React re-renders with each edit and always passes the latest draft to `TextInputCodeMirror`.
- Compute the displayed value as `draftCallableName ?? codeInfoName`, preserving the canonical name whenever no draft is present.
- Reuse the existing debounce to maintain the inconsistency indicator without double-rendering; clearing the draft resets the warning immediately.
- On `onChange`, set the draft state and run the debounce so the amber border tracks divergence from the saved name.
- On `onBlur`, keep the draft intact unless Escape explicitly requested a reset. When `shouldResetValueOnBlur` is set (Escape path), clear the draft, cancel completions, and resync with the canonical name.
- When `codeInfoName` updates from the backend, clear any draft so the UI reflects the authoritative value.
- Escape continues to clear the draft and queue a backend reset; Enter/Shift+Enter still call `setCallable`, after which websocket updates supply the new canonical name.

## Rationale
- Keeps the blur behavior localized to `SectionSearchCore`, leaving other `TextInputCodeMirror` consumers untouched.
- Leaning on controlled state ensures the dummy and live editors stay in sync without extra bookkeeping.
- Maintains the existing completion cleanup pipeline and consistency indicator semantics while preventing accidental draft loss.
