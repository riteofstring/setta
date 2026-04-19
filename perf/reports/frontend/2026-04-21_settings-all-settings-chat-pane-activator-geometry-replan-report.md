## 2026-04-21 settings `All Settings` chat pane activator geometry replan report

- Worktree: `go-rewrite-pixijs`
- Runtime: live worktree session on `http://127.0.0.1:3068/` + `http://127.0.0.1:8068`
- Canonical blocker lane: `settings-section__chatSectionDefault`
- Canonical blocker control: `chat.permissionMode`
- Control fallback lane: `settings-section__browserSectionDefault`
- Control fallback control: `browser.columnWidth`

### Why this report exists

Run `062` already closed the one bounded chat-lane retry itself as a replan stop, but the remaining evidence still mixed two different stories:

- one rounded-point probe said the chat activator still ranked ahead of the overlapping draw activator
- one live visible-click replay still failed to mount inline CodeMirror on `chat.permissionMode`

This report adds one narrower runtime pass to decide whether another pane-level tweak is justified.

### Focused live probes

All probes below used fresh one-shot bootstrap URLs from `./scripts/dev-runtime-info.sh` and a headless `@playwright/test` browser session pointed at `/settings` with `All Settings` active after one `fit view`.

#### Browser control remains the only trustworthy green lane

- A real pane click on the current `browser.columnWidth` hidden-anchor center still forwarded through the pane path and mounted inline CodeMirror.
- Observed point on this runtime:
  - `x≈709.36`
  - `y≈41.45`
- Observed post-state:
  - `editorMounted: true`
  - `focusWithinEditor: true`

#### Chat `permissionMode` still fails from the current pane-owned point

- The current live `permissionMode` anchor is unique in the DOM, so this is not a duplicate-id bug.
- Observed current anchor geometry:
  - `top≈151.10`
  - `left≈709.20`
  - `width≈0.32`
  - `height≈11.70`
- A real pane click on its current center still failed:
  - click point `x≈709.36`, `y≈156.95`
  - `document.elementFromPoint(...)` returned `.react-flow__pane`
  - `editorMounted: false`
  - `inputPresent: true`

#### The current chat anchor point is not section-authoritative

- A store-side probe at that same chat click point used the live `screenToFlowPosition(...)` result plus `useNodeInternals.getState().x`.
- Observed flow point:
  - `x≈90`
  - `y≈2535`
- Observed containing measured nodes:
  - none

This matters because it removes the cleanest remaining bounded pane fix. If the live point that the current hidden anchor publishes is not inside any measured section node, then another pane-only section filter or node-bounds tie-break is not a trustworthy next step.

### Interpretation

- The current `chat.permissionMode` click miss is not narrowed enough for another small `Pane.tsx` retry.
- The blocker is now better described as missing scene-authoritative activator geometry:
  - the published pane-owned point for `chat.permissionMode` is still pane-owned
  - it still does not mount the editor
  - and it is not recoverable by a measured-node containment rule at that same point
- That means the autonomous loop should not spend another iteration on:
  - pane capture timing changes
  - client/flow coordinate tweaks
  - node-bounds section filters
  - more hidden-anchor center or zero-width hit-test retries

### Required next decision

Human replan is now warranted around one of these deeper primitives:

- publish section-authoritative or row-authoritative visible hit geometry for retained text instead of relying on the collapsed hidden anchor
- or introduce a different scene-owned activation contract for first-click editing on the retained-text path

Do not reopen the closed chat pane-consumer lane without that new primitive.
