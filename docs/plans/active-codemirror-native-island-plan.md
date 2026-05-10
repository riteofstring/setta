# Active CodeMirror Native Island Plan

## Goal
Make text/code parameter editing inside retained canvas sections feel like a normal focused editor: the first click reveals a live CodeMirror editor with a visible caret/selection, typed characters echo immediately, and backend latency or retained-canvas texture refreshes cannot make input feel delayed or invisible.

The UI invariant is:

`active text/code input = live browser editor is visibly authoritative`

Retained canvas rendering, backend persistence, websocket updates, settings broadcasts, pan/zoom, and texture fallback must not hide the active caret or make keypress feedback depend on backend round trips.

## Current Evidence
- The latest Chrome recording shows CodeMirror does mount: `activeDomIsland` becomes a `cm-content cm-lineWrapping` element for `settings-codeobj__gui__gui__maxZoom`, and keyboard events target `#CodeMirror-settings-section__gui-settings-codeobj__gui__gui__maxZoom` with `role="textbox"`.
- The user-visible symptom is still that no caret appears and keypresses feel slow.
- During typing, each debounced `/api/setParamEnteredValue` request takes roughly 170-356 ms in the recording.
- Each edit also receives a full `UpdateSettings` websocket payload of about 16.8 KB plus an `UpdateFrontendProjectParam` message.
- GPU frame diagnostics show frequent retained-content frames and retained page uploads while the active editor is conceptually a DOM island.
- This points to two related problems:
  - the active CodeMirror DOM exists for focus/input but is not the single visible editor surface
  - persistence and settings broadcast work is too tightly coupled to each edit while the user is typing

## Non-Goals
- No backward compatibility shims, legacy paths, migrations, dual-read/write paths, old-field aliases, silent compatibility fallbacks, transitional adapters, or compatibility layers.
- Do not fix this with longer debounce timers, delayed focus, fake carets, hidden textarea mirrors, or heuristic input fallbacks.
- Do not create a second parameter value model for the GPU surface.
- Do not make retained text/code editing depend on backend confirmation before visual feedback.
- Do not add tests that assert private renderer counters as the primary regression signal.

## Principles
1. The active editor's browser DOM is the source of truth for what the user sees while editing.
2. The retained canvas can provide inactive previews and surrounding structure, but it must not compete with the active editor's text, caret, selection, or scroll state.
3. Persistence is latest-wins and coalesced for text/code editing; local editor responsiveness is independent of persistence latency.
4. Go-owned backend state remains canonical for committed project/config state, but frontend-local editor state owns in-progress visual editing.
5. Active editor visibility is an explicit visual mode. The live editor can render through a deliberate viewport editor layer, while inactive retained content continues to use the GPU retained rendering path.

## Implementation Plan

### 1. Add a failing user-visible regression test
- Add a Playwright E2E test that uses the production UI and reproduces the experienced bug:
  - open the settings project on the GPU canvas
  - navigate/zoom so a retained text/code parameter input is visible, preferably `gui.maxZoom`
  - click the parameter value exactly as a user would
  - type a short distinctive string while delaying `/api/setParamEnteredValue` responses and websocket confirmations
  - assert the visible canvas/editor area shows an active caret or selection and the newly typed text within the next animation frame or a tight user-facing threshold
  - continue typing several characters and assert visual text keeps up without waiting for backend responses
- The assertion must be visual/user-facing:
  - prefer screenshots or canvas pixels around the active input, plus browser focus checks only as supporting evidence
  - do not pass the test solely because a `CodeMirror` node exists in the DOM
  - do not inspect `activeDomIsland`, texture counters, dirty flags, websocket payload counts, or other implementation diagnostics
- The test should fail on the current implementation because the real editor may receive focus/key events while the user-visible canvas does not show the live caret/text promptly.
- Put any network delay in the test harness, not production code.

### 2. Define the active native-island visual contract
- Document and enforce a single active-editor state for retained text/code inputs:
  - active row id
  - active surface id
  - active island id
  - editor kind
  - local viewport/clip rect
  - current local editor value
  - activation/focus state
- Keep this state in the project GPU retained-param owner path, not inside generic CodeMirror helpers.
- Treat activation as a visual mode change: inactive retained row preview becomes background/structure; active native island becomes the visible editor.
- Remove code paths that allow retained row text and active CodeMirror text to be visible as competing sources for the same input.

### 3. Promote active CodeMirror islands to a first-class visual path
- Extend the GPU flow scene/native-island contract so an active DOM island is intentionally rendered above retained content as the authoritative editor surface.
- Render active editor islands in a viewport-positioned editor layer owned by `GpuFlow`, with explicit pointer/focus ownership and transform updates from the scene viewport.
- Draw the active island above the retained content surface and clip it to the retained row/control rect.
- Keep portal roots for CodeMirror tooltips and validation UI on the existing canvas-aware portal path.
- Avoid duplicating CodeMirror rendering: the same mounted editor DOM is used for browser focus/input and for the visible editor.
- Do not rely on incidental browser fallback visibility from a hidden canvas child.

### 4. Suppress retained text for the active editor row
- When a text/code/name row is active as a native island, retained row rendering should draw only stable structure:
  - row background
  - label/background affordances as appropriate
  - validation/selection styling that does not obscure the editor
- Do not draw the active control's text from retained canvas while the editor island is active.
- Preserve retained rendering for inactive rows and for active-row non-editor structure.
- Make the retained scene carry explicit active-editor display state instead of inferring it from DOM queries or CSS class names.

### 5. Make editor-local typing independent from backend persistence
- Keep CodeMirror's local document as the immediate visible value while focused.
- Update local React/Zustand preview state synchronously enough for dependent UI that must reflect the in-progress value.
- Change standard text/code parameter persistence to latest-wins coalescing:
  - at most one in-flight save per active editor
  - queue only the latest value while a save is in flight
  - flush on blur, Enter/Tab commit where applicable, explicit run actions, and safe periodic idle boundaries
- Do not send one backend project update per keypress under normal typing.
- Keep password/dropzone/date/time special behavior explicit and separate; do not route them through the text/code editor coalescer unless they actually share the same editing contract.

### 6. Stop full settings broadcasts for in-progress text edits
- On the Go-owned settings/project mutation path, distinguish in-progress text/code input updates from committed settings changes.
- During active typing, emit only the narrow project-param update needed to reconcile canonical state and pending op ids.
- Emit full `UpdateSettings` only for committed settings changes or for a coalesced latest committed value when settings consumers actually need a full settings snapshot.
- Keep endpoint shapes and shared contracts Go-owned; if a new operation mode or commit phase is needed, add it to the authoritative Go contract and regenerate downstream surfaces.
- Do not add handwritten TypeScript/Python mirrors for new contract data.

### 7. Keep active editor rendering stable across viewport changes
- Pan/zoom should move the active island by transform only when possible.
- Do not require a full retained surface reraster just to keep the active caret visible during viewport movement.
- If the active island texture is stale or waiting on a paint record, draw a deliberate active-editor visual fallback that still shows the browser DOM editor in the correct screen position, rather than reverting to retained text.
- This fallback must be part of the active-editor visual contract, not a compatibility shim.

### 8. Add focused lower-level coverage
- Add only focused Vitest coverage for observable owner behavior that is hard to exercise end-to-end:
  - backend persistence coalesces fast typing into latest-wins saves
  - pending text edits flush on blur/commit
  - active editor state survives pan/zoom without losing focus or caret ownership when that behavior is exposed through public interaction helpers
- Do not add tests whose primary assertion is a private renderer flag, texture counter, draw-command call, DOM layer placement, or implementation-specific source registration detail.
- The Playwright test remains the primary regression test for the user-visible bug.

### 9. Remove obsolete activation assumptions
- Remove any code whose only purpose was to make an invisible mounted CodeMirror feel like an active editor through opacity toggles or paint nudges.
- Keep focus replay, pointer-position selection, and tooltip portal behavior only where they are still required by the new active visual contract.
- Delete dead retained text/caret workarounds instead of preserving them behind flags.

### 10. Verify the full flow
- Run the new Playwright regression and confirm it fails before the fix and passes after the fix.
- Run targeted Vitest suites for:
  - GPU flow DOM islands
  - retained content interaction
  - project GPU retained param adapters
  - CodeMirror activation
  - parameter value persistence
  - settings websocket/update behavior
- Run `./scripts/quality/check.sh` before finishing the implementation.
- Perform Chrome DevTools visual verification for:
  - click into `gui.maxZoom`
  - visible caret
  - rapid typing under delayed backend responses
  - pan/zoom while editor remains active

## Acceptance Criteria
- The first Playwright test captures the current user-visible failure and passes only after the active editor is visibly authoritative.
- Clicking a retained text/code input shows a live CodeMirror caret/selection promptly.
- Typed characters are visible immediately and do not wait for `/api/setParamEnteredValue` responses.
- Rapid typing does not produce one backend project update plus one full settings broadcast per keypress.
- Active editor DOM is drawn through the principled html-in-canvas/GPU source path or a deliberate active-editor visual path, not incidental DOM visibility.
- Retained row text does not compete with the active editor text.
- Pan/zoom does not hide the caret or revert the visible input to stale retained text.
- No backward compatibility, migration, legacy, or transitional code is added.

## Suggested Execution Order
1. Add the failing Playwright regression for visible caret/immediate typed text under delayed backend responses.
2. Add the active native-island visual contract.
3. Promote active CodeMirror islands to GPU visual sources.
4. Suppress retained text for active editor rows.
5. Implement latest-wins editor persistence.
6. Narrow settings broadcasts for in-progress text edits through Go-owned contracts.
7. Stabilize active editor rendering across pan/zoom and paint-record delays.
8. Add lower-level behavior coverage.
9. Remove obsolete activation/paint workarounds.
10. Run targeted verification, CDP visual checks, and full quality check.
