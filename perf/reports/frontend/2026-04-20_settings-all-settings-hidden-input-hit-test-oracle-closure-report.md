# Settings All Settings Hidden-Input Hit-Test Oracle Closure Report

Date: 2026-04-20
Worktree: `go-rewrite-pixijs`
Canonical target section: `settings-section__chatSectionDefault`

## Goal

Decide whether the current shared hidden-input hit-test evidence on the chat lane is a real product blocker or an untrustworthy oracle shape that should be closed before more renderer work.

## What was checked

1. Fresh headless DevTools inspection on the live worktree runtime for the canonical chat target:
   - `#settings-section__chatSectionDefault-settings-codeobj__chatSectionDefault__chatSectionDefault__permissionMode-ParamInput`
2. Matching DevTools inspection on the already-green shared comparison target:
   - `#settings-section__shortcuts-settings-codeobj__shortcuts__shortcuts__advancedSearchShortcut-ParamInput`
3. One bounded local transparent-activator experiment in `TextInputCodeMirror.tsx`, exercised only on the current worktree and reverted before finishing the iteration.
4. Live Playwright reruns on the worktree runtime with:
   - `frontend/tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts`
   - `frontend/tests/e2e/settings/settings-all-settings-shortcuts-resting-text.spec.ts`

## Findings

- The direct hidden `ParamInput` hit target is not trustworthy on the current renderer lane.
  - Chat `permissionMode` hidden input:
    - `getBoundingClientRect(): width=0, height≈11.7`
    - computed `display=block`, `position=static`, `width=0px`, `min-width=0px`, `pointer-events=all`, `opacity=0`
    - `document.elementFromPoint(...)` at the sampled point did not hit the hidden input; DevTools reported `div.react-flow__pane`
  - Shortcuts `advancedSearchShortcut` hidden input showed the same zero-width shape:
    - `getBoundingClientRect(): width=0, height≈11.7`
    - the hidden-input geometry/computed-style shape matched chat closely even though the shortcuts lane remains otherwise green

- This means the hidden-input click oracle is not a reliable discriminator for the chat blocker.
  - The same zero-width hidden-input shape exists on the already-green shortcuts lane.
  - Hidden-input hit testing therefore cannot be treated as chat-specific renderer drift by itself.

- The bounded transparent-activator experiment did not produce a keepable live fix.
  - A temporary absolute activator surface was tried in `TextInputCodeMirror.tsx`.
  - The focused live reruns still failed to surface inline CodeMirror on the chat lane under real pointer replay.
  - The experimental source edits were reverted before finishing the iteration.

- The existing focused probes remain useful only for rest-state ownership, not direct live click-hit claims.
  - After reverting the experiment, the baseline focused chat proof returns to the existing focus-based inline-editor handoff check.
  - The paired shortcuts proof remained green throughout the investigation.

## Interpretation

- Close the hidden-input direct-click oracle on this lane as untrustworthy for the current tool stack.
- Do not spend the next automated pass on:
  - another hidden-input width/style tweak
  - another fit-view hidden-input hit-test retry
  - another transparent overlay retry at the same `TextInputCodeMirror` boundary without a deeper scene-level hit-testing plan
- The next real frontier is a deeper shared scene-level activator / hit-test primitive, or a different deterministic lane that does not depend on zero-width hidden DOM inputs as the live click oracle.

## Result

- No product source changes from the transparent-activator experiment were kept.
- This report is the durable closing evidence for the hidden-input direct-hit oracle on the current chat lane.

## Commands used

```bash
source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Utils/CodeMirror/DummyCodeMirror.test.tsx
```

```bash
source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Utils/CodeMirror/TextInputCodeMirror.tsx tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts
```

```bash
source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.S2eJtf/loop-001/run-005/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts frontend/tests/e2e/settings/settings-all-settings-shortcuts-resting-text.spec.ts --reporter=line --workers=1
```

Notes:
- the focused reruns were used as diagnostic evidence during the temporary activator experiment
- the transparent-activator source edits were reverted before the iteration finished
- the headless DevTools inspection recorded the zero-width hidden-input geometry on both chat and shortcuts
