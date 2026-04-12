# Settings Graph Main-Reference Probe After Interaction ReactFlow State Sync Slices

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Rerun the canonical main-reference perf lane after the two product-side
`interactionReactFlowStateSync` slices (`328` and `329`) to confirm whether the
measured owner drops out on a fresh lifecycle or the lane remains unstable.

## Verification

- `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-019/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-019/main-ai.log`
  - resolved fresh runtime facts for both worktree and read-only `main`
  - reached the canonical Playwright probe on the named
    `rotaryParamCodeObjDefault` lane
  - showed reference `/settings` eventually mounted after about `30.36s`
  - failed again before numeric output with:
    `Timed out after 30000ms during settings graph probe phase: worktree: capture initial pane state.`

## Result

- the rerun did not produce a new numeric attribution sample
- the repeated failure remains worktree-side on `capture initial pane state`
- the fresh-lifecycle rerun therefore does not clear the existing instability
  in the canonical cross-worktree probe lane

## Reading

- this pass closes the narrow "fresh lifecycle may be enough" hypothesis for
  the default canonical rerun path on the current runtime
- do not spend the next default iteration on another probe-only retry or
  another pane-state-helper tweak for this same stall shape
- the next bounded frontier should return to product-side work inside the
  already measured `interactionReactFlowStateSync` owner, using the existing
  canary instrumentation rather than waiting on this unstable cross-worktree
  perf lane
