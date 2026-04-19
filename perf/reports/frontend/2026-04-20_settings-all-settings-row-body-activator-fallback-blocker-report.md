## 2026-04-20 settings `All Settings` row-body activator fallback blocker

- canonical target sections:
  - `settings-section__chatSectionDefault`
  - `settings-section__shortcuts`
- intent:
  - test whether a bounded `ParamContainer` row-body click activator could unblock first-click editing on the canvas-owned resting-text path without needing a deeper scene-level hit-test primitive

### Attempted local experiment

- temporary production change:
  - `frontend/src/components/Params/ParamContainer.tsx` briefly composed an article-level `onClick` handler that tried to focus a direct child `[data-canvas-owned-resting-text-lightweight="true"]` root when the row body itself was clicked
- temporary focused coverage:
  - `frontend/src/components/Params/ParamContainer.test.tsx` briefly added a jsdom proof that a mocked lightweight text root would receive focus from a row click
  - `frontend/tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts` and `frontend/tests/e2e/settings/settings-all-settings-shortcuts-resting-text.spec.ts` briefly switched from hidden-input/programmatic activation to live row/label click attempts
- result:
  - the experiment was reverted before finishing the iteration because the live runtime evidence showed the row-body activator does not solve the actual click path on the retained graph

### Live runtime evidence

- focused live verification command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.S2eJtf/loop-001/run-006/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts frontend/tests/e2e/settings/settings-all-settings-shortcuts-resting-text.spec.ts --reporter=line --workers=1`
- attempted live proof outcome:
  - chat row-article `locator.click()` timed out because the draggable article resolves as not enabled to Playwright
  - chat and shortcuts coordinate-click reruns then landed on the visible label area but still failed to surface inline CodeMirror:
    - chat: `expect(locator('#CodeMirror-settings-section__chatSectionDefault-settings-codeobj__chatSectionDefault__chatSectionDefault__permissionMode')).toBeVisible()` failed because no editor mounted
    - shortcuts: `page.waitForFunction(...)` timed out waiting for the hidden input to be replaced by the live editor

### Direct geometry / hit-test probe

- one-off headless probe on the current runtime inspected the actual DOM geometry and `elementFromPoint(...)` stack for the would-be click coordinates
- observed values:
  - chat `permissionMode` row:
    - row rect: `x=701.20 y=151.10 width=8.52 height=11.70`
    - label rect: `x=701.40 y=155.95 width=6.60 height=2`
    - hidden input rect: `x=709.20 y=151.10 width=0.32 height=11.70`
    - `elementFromPoint(...)` at the label-center probe returned `.react-flow__pane`, not the row or label
  - shortcuts `advancedSearchShortcut` row:
    - row rect: `x=701.20 y=-90.10 width=1.20 height=11.70`
    - label rect: `x=701.40 y=-85.25 width=5.40 height=2`
    - hidden input rect: `x=708.00 y=-90.10 width=0`
    - the label-center probe was offscreen after fit-view normalization

### Interpretation

- this closes the bounded row-body activator fallback as insufficient for the real user path
- the retained canvas is drawing the visible label surface, but the hidden DOM anchors are too small and do not own hit testing at the visible canvas coordinates
- adding another DOM-row `onClick`/`onMouseDown` handler would be churn unless a higher-level scene/pane click primitive can map visible canvas-space clicks back to a target param row

### Verification notes

- focused lint during the temporary experiment passed
- `vitest` remained blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before collection and therefore did not provide new trustworthy coverage for this slice

### Next frontier

- the next product slice for this blocker is a deeper pane-level or scene-level activator / hit-test primitive that can translate visible retained-graph clicks into the intended param row, rather than another DOM-row fallback
