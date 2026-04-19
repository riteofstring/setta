## Settings All Settings chat row activator fallback blocker report

Date: 2026-04-20
Worktree: `go-rewrite-pixijs`
Canonical target section: `settings-section__chatSectionDefault`

### Goal

Evaluate one shared product fallback for the run-`051` chat activator blocker: if the hidden lightweight `ParamInput` anchor stays too small or too occluded to click directly, can the surrounding param row safely hand first-click editing off to the same inline CodeMirror editor on the current runtime?

### What was checked

1. A bounded local experiment wiring a row-surface activator through `ParamContainer` for canvas-owned resting-text rows.
2. Focused live proof on `/settings` -> `All Settings` using `frontend/tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts`.
3. Dense canary sanity probe using `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`.
4. One-off live hit-test snapshots and synthetic DOM event checks on `#ParamContainer-settings-section__chatSectionDefault-settings-codeobj__chatSectionDefault__chatSectionDefault__permissionMode`.

### Findings

- The dense canary stayed healthy while this fallback was investigated.
  - `projectChatChromeCount: 0`
  - `documentNodeCount: 5497`
  - `inputCount: 3`
  - `textareaCount: 1`
  - `buttonCount: 47`
  - `canvasCount: 1`
  - `raf.meanMs: 45.38`
  - `raf.p95Ms: 50`
  - `longTasks.totalMs: 3206`

- The transformed row box on the dense fit-view lane is not a trustworthy live pointer target.
  - The chat `permissionMode` row rect was only about `7.8px x 11.7px` on the shared fit-view canary.
  - `document.elementFromPoint(...)` samples across that row rect landed on unrelated surfaces instead of the row itself:
    - the resize-handle overlay
    - `SECTION#settings-section__drawSectionDefault-CustomResizable`
    - the top-level `.react-flow__pane`

- The attempted row-surface fallback did not recover first-click editing on the current runtime.
  - A synthetic `row.click()` on `#ParamContainer-settings-section__chatSectionDefault-settings-codeobj__chatSectionDefault__chatSectionDefault__permissionMode` left `document.activeElement` empty and did not create `#CodeMirror-settings-section__chatSectionDefault-settings-codeobj__chatSectionDefault__chatSectionDefault__permissionMode`.
  - A synthetic `mousedown` on that same row also left `document.activeElement` empty and did not create the inline editor.
  - The focused Playwright proof still failed to surface inline CodeMirror after the row activator attempt.

- The broader blocker remains unchanged.
  - The original hidden-input issue from run `051` still stands: the direct lightweight `ParamInput` anchor is not a trustworthy live click target on this lane.
  - The row-surface fallback did not provide a viable immediate substitute.

### Interpretation

- Close the attempted row-surface activator fallback as unsupported on the current runtime.
- Do not spend the next automated pass on another `ParamContainer` row click/mousedown proxy, another synthetic row-event retry, or more article-level activator micropolish on `chatSectionDefault`.
- The next real frontier is still a deeper shared canvas-owned resting-text activator / hit-test fix, not another `chatSectionDefault` shell or row fallback experiment by itself.

### Result

- The local `ParamContainer` activator experiment was reverted before finishing the iteration.
- No product source changes from this fallback attempt were kept.
- This report is durable closing evidence for the attempted row-surface fallback.

### Commands used

```bash
source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/ParamContainer.tsx src/components/Params/ParamContainer.test.tsx src/components/Utils/CodeMirror/DummyCodeMirror.tsx src/components/Utils/CodeMirror/DummyCodeMirror.test.tsx tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts
```

```bash
source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Params/ParamContainer.test.tsx src/components/Utils/CodeMirror/DummyCodeMirror.test.tsx
```

Notes:
- the `DummyCodeMirror` test passed
- the run still hit the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before `ParamContainer.test.tsx` could be collected

```bash
source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.S2eJtf/loop-001/run-004/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1
```

```bash
source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.S2eJtf/loop-001/run-004/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts --reporter=line --workers=1
```

```bash
source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.S2eJtf/loop-001/run-004/worktree-ai.log)" && ...
```

Notes:
- one-off browser scripts on the same runtime were used to sample `document.elementFromPoint(...)` across the row rect and to check whether synthetic row `click` / `mousedown` events ever focused the hidden `ParamInput`
- those one-off checks confirmed the row activator fallback never surfaced the inline editor on the live page
