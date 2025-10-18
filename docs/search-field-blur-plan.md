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
- Store the draft text in a `useRef` (`draftCallableNameRef`) instead of `useState`.
- Derive the displayed value as `displayed = draftCallableNameRef.current ?? codeInfoName` and pass it to `TextInputCodeMirror`.
- Use the existing debounce to maintain the inconsistency indicator without triggering React renders.
- Introduce a lightweight `useReducer` counter (`bumpVersion`) that forces re-render only when the UI must sync the ref (blur, Escape, external updates).
- On `onChange`, update the ref and run the debounce—no render needed.
- On `onBlur`, call `bumpVersion` so the dummy component shows the draft; if Escape set `shouldResetValueOnBlur`, also reset the ref and canonical value.
- On `codeInfoName` changes (backend updates), clear the ref, cancel the debounce, recompute consistency, and `bumpVersion` so the UI realigns with the canonical name.
- On Escape with no completion, clear the ref, mark `shouldResetValueOnBlur`, set focus back to the section, and `bumpVersion`.
- On Enter/Shift+Enter success, clear the ref so the view mirrors the saved upstream value once the websocket update arrives.

## Rationale
- Keeps the blur behavior localized to `SectionSearchCore` so other `TextInputCodeMirror` consumers remain unaffected.
- Minimizes render churn by leveraging refs and a manual `bumpVersion`.
- Preserves the existing completion cleanup pipeline and consistency indicator semantics.
