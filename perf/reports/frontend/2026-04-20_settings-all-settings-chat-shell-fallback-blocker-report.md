## Settings All Settings chat shell fallback blocker report

Date: 2026-04-20
Worktree: `go-rewrite-pixijs`
Canonical target section: `settings-section__chatSectionDefault`

### Goal

Evaluate the handoff fallback candidate `settings-section__chatSectionDefault` before promoting it from shared resting-text ownership to full shell ownership on the retained `canvas-shell-underlay` path.

### What was checked

1. Local experimental promotion of `chatSectionDefault` into `CANVAS_OWNED_SECTION_SHELL_IDS`.
2. Focused live proof on `/settings` -> `All Settings` using `frontend/tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts`.
3. Dense canary sanity probe using `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`.
4. Fresh headless DevTools inspection on the same runtime.

### Findings

- The graph surface stayed healthy during the experiment.
  - The dense probe continued to report one retained canvas and a mounted `All Settings` surface.
  - Representative reruns during the investigation stayed in the same whole-scene band:
    - `projectChatChromeCount: 0`
    - `documentNodeCount: 5498`
    - `buttonCount: 47`
    - `canvasCount: 1`
    - `raf.meanMs: 41.17ms`, `45.38ms`, and `46.78ms`
    - `longTasks.totalMs: 2703ms`, `3142ms`, and `3299ms`

- The shell promotion itself wired through visually.
  - DevTools confirmed `section[data-section-id="settings-section__chatSectionDefault"]` carried `data-canvas-owned-shell="true"` during the experiment.
  - DevTools also confirmed `#settings-section__chatSectionDefault-CustomResizable` carried `data-canvas-owned-shell="true"`.

- The visible text-edit handoff is not trustworthy on this lane.
  - The visible `permissionMode` value (`minimal`) did not open an inline CodeMirror editor under either Playwright or DevTools.
  - DevTools showed the hidden `permissionMode` `ParamInput` anchor had `width=0` and `height≈12.3`, so the visible value area did not map to a hittable text activator.
  - `document.elementFromPoint(...)` at that anchor center resolved to the nested scroll container (`DIV.section-args-nested...`), not the input root.
  - Clicking the visible value area triggered `POST /api/setActiveIds -> 404` on the current runtime and still did not create a `.cm-editor`.

### Interpretation

- `chatSectionDefault` is not a safe immediate shell-ownership fallback on the current runtime.
- The blocking issue is broader than this single section id:
  - the shared canvas-owned resting-text path still lacks a trustworthy first-click activator geometry / handoff for this lane
  - the current runtime also exposes an active-section durable-sync gap via `POST /api/setActiveIds -> 404`
- Because the interaction blocker remained unresolved, the experimental source changes were reverted at the end of the iteration.

### Result

- Close `chatSectionDefault` as the immediate shell-ownership fallback for now.
- Do not spend the next automated pass on another `chatSectionDefault` shell-id promotion attempt by itself.
- The next real frontier is a shared product fix for canvas-owned resting-text activator geometry / first-click editing handoff, after which `chatSectionDefault` can be reconsidered.

### Commands used

```bash
source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx
```

```bash
source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.S2eJtf/loop-001/run-003/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1
```
