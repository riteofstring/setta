# Workspace Graph Phase 8 Performance Gate

Updated 2026-06-20 for
`docs/plans/workspace_graph_retained_scene_camera_fast_path_plan.md`.

Phase 8 is now a reproducible verification gate rather than a handwritten
checklist. The root wrapper is:

```bash
./scripts/test_workspace_graph_phase8.sh
```

For deterministic-only local or CI runs:

```bash
./scripts/test_workspace_graph_phase8.sh --deterministic-only
```

## Gate Composition

- Focused renderer and parser checks run first. These cover camera invariants,
  retained scene sync, visible scene windows, labels, edges, graph scene-store
  behavior, layout persistence, shared workflow/chat activity UI, pan/zoom
  performance report parsing, and recording incident parsing.
- Production Electron workflows run through the
  `workspace-graph-phase8` manifest tier. The tier includes graph smoke,
  workflow drag ownership and cancellation contracts, activity sprite
  popover/details workflows, Phase 3 pan/zoom recorder-on/off matrix coverage,
  baseline/small-trackpad/active pan/zoom runs, and semantic runtime burst
  pan/zoom coverage.
- Live Codex workflows run only when local Codex ChatGPT auth is available.
  The wrapper delegates to `scripts/test_chat_workflows.sh --live-only` with
  `OPENAI_API_KEY` removed from the environment. If ChatGPT auth is unavailable,
  the live-provider portion is reported as skipped, not as provider proof.

## Deterministic Versus Timing Evidence

The hard CI gates are deterministic retained-scene invariants:

- no duplicate focused graph renderer;
- no renderer instance replacement during interaction;
- no graph app/canvas creation during camera interaction;
- no camera-caused workspace presentation writes;
- no camera-caused graph React commits;
- no camera-caused full graph replacement;
- no semantic working-set reads during camera interaction;
- no full graph label sync per pan/wheel event;
- bounded retained object materialization;
- drag movement and layout writes are limited to admitted movement owners;
- recording incident reports contain the required gesture evidence.

Machine-dependent millisecond evidence remains a performance report unless the
runner opts in as the reference timing runner with
`SETTA_PERFORMANCE_REFERENCE_RUNNER=1` or
`SETTA_WORKFLOW_GRAPH_PHASE0_REFERENCE_RUNNER=1`. First-Pixi-render timing is
still proxy evidence; compositor presented-frame timing is explicitly marked
unavailable until a presentation trace source is wired.

## Latest Focused Verification

Command:

```bash
./scripts/test_workspace_graph_phase8.sh --focused-only
```

Result on 2026-06-20:

- Vitest: 11 files passed, 65 tests passed.
- Node parser tests: 3 tests passed.

## Latest Production-Path Verification

Command:

```bash
./scripts/test_workspace_graph_phase8.sh --electron-only --skip-build
```

Result on 2026-06-20 after `pnpm -C desktop build`:

- Passed `workflow-graph-smoke`.
- Passed all Phase 8 drag ownership/cancellation workflows:
  `workflow-graph-editable-drag-contract`,
  `workflow-graph-read-only-port-contract`,
  `workflow-graph-read-only-view-layout-contract`,
  `workflow-graph-active-replacement-contract`,
  `workflow-graph-node-drag-pointercancel-contract`,
  `workflow-graph-edge-draw-pointercancel-contract`,
  `workflow-graph-marquee-pointercancel-contract`, and
  `workflow-graph-live-runtime-drag-contract`.
- Passed `workspace-trajectory-file-fidelity`, including retained activity
  sprite hit targets, popover activity rendering, details-link behavior, and
  sprite incident evidence.
- Passed pan/zoom production workflows:
  `workflow-graph-pan-zoom-phase3`,
  `workflow-graph-pan-zoom-baseline`,
  `workflow-graph-pan-zoom-small-trackpad`,
  `workflow-graph-pan-zoom-small-active`,
  `workflow-graph-pan-zoom-active`, and
  `workflow-graph-pan-zoom-runtime-burst`.

The active pan/zoom harness now treats workflow edge flow, workflow node pulse,
and semantic activity markers as the required meaningful liveness evidence.
Decorative semantic cell animation is not required for Phase 8 readiness.

## Latest Live Codex Verification

Command:

```bash
./scripts/test_workspace_graph_phase8.sh --live-only --skip-build
```

Result on 2026-06-20 with local Codex ChatGPT auth available:

- Passed `live-codex-electron`.
- Passed backend live Codex workflow
  `./scripts/go.sh test ./internal/runtime -run TestBackendAppWorkflowWithLiveCodex -count=1`.
