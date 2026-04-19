# Scene-Level Text Activator Publication Blocker Report

Date: 2026-04-20
Worktree: `go-rewrite-pixijs`
Target lane: `settings-section__chatSectionDefault`
Control lanes checked: `settings-section__browserSectionDefault`, `settings-section__shortcuts`

## Summary

- This iteration tried one bounded deeper activator slice locally: scene-measured lightweight text hit boxes plus pane capture forwarding for canvas-owned resting text.
- The speculative source was not kept. After the live probes below, all product/test edits were reverted before finishing the iteration.
- The live runtime evidence says the next blocker is not another row/body proxy or another pane event-ordering micro-pass. The unresolved gap is that the intended lightweight text activator is not being published to, or consumed by, the live click-routing path in a trustworthy way.

## Live findings

### 1. `shortcuts` is not a trustworthy visible-click control after shared `fit view`

On the current headless runtime, the `advancedSearchShortcut` retained-text point sat above the viewport after normalization:

- target input rect: `left=708`, `top=-90.10`, `width=0`, `height=11.70`
- retained text range rect: `left=708`, `top=-89.80`, `width=0.72`, `height=1.40`
- `document.elementFromPoint(...)` at that point returned `null`

Because the point is offscreen, `shortcuts` should not be reused as the visible-click control for this lane under the current normalized setup.

### 2. `browser` provides an on-screen visible-click point, but the forwarded activation still does not happen

The `browser.columnWidth` retained-text point is on-screen and deterministic:

- retained text range rect: `left=709.20`, `top=38.30`, `width=0.72`, `height=1.40`
- click point: `x=709.56`, `y=39.00`
- `document.elementFromPoint(...)` at that point returned `.react-flow__pane`

Two follow-up probes on that same point showed:

- the pane received the live `mousedown`
- the target lightweight root still existed after the click
- no inline CodeMirror editor mounted
- no target-root `mousedown` was observed

So the missing step is between the live pane hit and the hidden lightweight activator root, not the browser-side click synthesis itself.

### 3. The intended lightweight root does geometrically contain the `browser` click point

A direct DOM geometry probe across all `[data-canvas-owned-resting-text-lightweight="true"]` roots showed exactly one matching root for the same `browser` click point:

- matched id: `settings-section__browserSectionDefault-settings-codeobj__browserSectionDefault__browserSectionDefault__columnWidth-ParamInput`

That closes the “wrong visible point” question for the `browser` control lane. The retained-text point itself is valid.

### 4. Dynamic import of the local registry module showed no published hit boxes

A page-side dynamic import of `/src/forks/xyflow/core/container/canvasOwnedTextActivatorRegistry.ts` returned empty arrays for:

- `settings-section__browserSectionDefault`
- `settings-section__chatSectionDefault`
- `settings-section__shortcuts`

Interpretation:

- the live publication path for scene hit boxes is still untrusted
- keep a small caveat here: Vite module-instance ambiguity means this is strong evidence, but not yet absolute proof that the app and the probe were reading the same in-memory map

## Commands used

- `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.S2eJtf/loop-001/run-009/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts frontend/tests/e2e/settings/settings-all-settings-shortcuts-resting-text.spec.ts --reporter=line --workers=1`
  - result during the speculative try: `chat` remained blocked; the `shortcuts` visible-click proof was invalid because the target point was offscreen after normalization
- one-off `@playwright/test` node probes against fresh bootstrap URLs
  - measured retained-text rects before/after `fit view`
  - logged `elementFromPoint(...)` at the visible-click target
  - logged pane/target `mousedown` capture on `browser.columnWidth`
  - enumerated which lightweight roots geometrically contained the `browser` click point
  - dynamically imported the local registry module and read section hit boxes

## Conclusion

- Close this local scene-level activator attempt as not ready to land.
- Do not spend the next automated pass on another `shortcuts` visible-click retry under the current normalized `fit view`, or on more pane-native `mousedown` timing tweaks without first resolving the publication/consumption gap.
- The next bounded frontier is to instrument or simplify the live hit-box publication path itself so the app can prove that one named on-screen retained-text point maps to one specific lightweight activator root in the running browser.
