# Semantic Runtime And Graph Interaction Phase 0

Date: 2026-06-17

## Scope

Phase 0 evidence report for
`docs/plans/semantic_runtime_and_graph_interaction_refactor_plan.md`.

The source recording is `.recordings/20260617T041546Z`. It used development
Electron with full recording payload capture enabled, production app IPC/HTTP
paths, and screenshots every 10 seconds. The recording started at
`2026-06-17T04:15:47.312Z` and stopped at `2026-06-17T04:25:14.753Z`.

Full payload recording inflates the artifact size, but the repeated
`semantic-graph:working-set-read` calls are real app work. The recording does
not include an instrumented idle-camera latency trace, so idle pan/zoom remains
a user-observed failure with screenshot context rather than a measured latency
distribution in this artifact.

## Idle Camera Evidence

Screenshot `screenshots/0005-periodic.png` at `2026-06-17T04:16:07.754Z`
shows the idle three-node workflow before execution:

- Workflow: `Start -> Reviewer -> End`.
- No semantic live-source visuals are present yet.
- The user observed delayed/sluggish pan and zoom before starting the workflow.
- This recording has no `workflowGraphDebugSnapshot` or wheel input timing
  samples, so it cannot prove the idle camera path's event-to-transform or
  event-to-frame latency.

Phase 0 adds a hard budget to the deterministic small-trackpad graph recording
for this missing evidence:

- `wheel/pinch event -> camera transform` p95 must stay below `16 ms`.
- `wheel/pinch event -> rendered frame after camera` p95 must stay below
  `32 ms`.
- No semantic working-set read may occur during the measured camera interaction
  window.
- No long task over `100 ms` may occur during camera movement.

Frame p95 remains report-only because local frame cadence still varies, but it
is recorded every run.

## Active Workflow Evidence

During the running workflow, semantic runtime activity dominates the graph
path.

| Metric                                           |                Value |
| ------------------------------------------------ | -------------------: |
| `ipc.jsonl` size                                 |    204,310,057 bytes |
| `backend-http.jsonl` size                        |      1,457,244 bytes |
| `renderer-events.jsonl` size                     |        353,311 bytes |
| `events.jsonl` size                              |      2,949,519 bytes |
| Semantic graph events forwarded                  |                3,545 |
| Peak semantic graph events in one second         |                  136 |
| `semantic-graph:working-set-read` IPC calls      |                2,983 |
| `POST /semantic-graph/working-set/read` requests |                2,983 |
| Working-set read latency p50                     |                69 ms |
| Working-set read latency p95                     |               128 ms |
| Working-set read latency max                     |               228 ms |
| Working-set IPC bytes                            |    203,665,057 bytes |
| Working-set IPC byte rate                        | about 21.5 MB/minute |

Largest working-set IPC result payloads:

| IPC id | Timestamp                  | Result bytes | Duration |
| -----: | -------------------------- | -----------: | -------: |
|   3026 | `2026-06-17T04:20:29.016Z` |      140,981 |   111 ms |
|   3029 | `2026-06-17T04:20:29.019Z` |      140,981 |   114 ms |
|   3032 | `2026-06-17T04:20:29.021Z` |      140,981 |   113 ms |
|   3022 | `2026-06-17T04:20:28.894Z` |      139,883 |   121 ms |
|   3023 | `2026-06-17T04:20:28.898Z` |      139,883 |   125 ms |

Semantic event changed-area counts:

| Changed area         | Count |
| -------------------- | ----: |
| `cartographer_audit` | 3,545 |
| `working_set`        | 3,545 |
| `graph`              |     2 |
| `activity`           |     2 |

Changed-area combinations:

| Changed areas                                   | Count |
| ----------------------------------------------- | ----: |
| `cartographer_audit,working_set`                | 3,543 |
| `cartographer_audit,working_set,graph,activity` |     2 |

Backend HTTP request counts by hot path:

| Path                               | Requests |
| ---------------------------------- | -------: |
| `/semantic-graph/working-set/read` |    2,983 |
| `/workspace-session`               |       19 |
| `/workflows/graph/read`            |       16 |
| `/semantic-graph/read`             |        9 |
| `/semantic-graph/activity/summary` |        9 |
| `/workspaces/ui/layout/save`       |        7 |
| `/chat/conversations/list`         |        6 |

IPC bytes by hot channel:

| Channel                                |       Bytes |
| -------------------------------------- | ----------: |
| `semantic-graph:working-set-read`      | 203,665,057 |
| `semantic-graph:cartographer-run-list` |     321,278 |
| `appearance:presets`                   |     135,963 |
| `workflow:graph-projection`            |      47,299 |
| `semantic-graph:read`                  |      41,500 |

Renderer events:

| Event type                    | Count |
| ----------------------------- | ----: |
| `layout_snapshot`             |   710 |
| `click`                       |    21 |
| `keydown`                     |    16 |
| `cartographer_audit_snapshot` |     1 |

Layout snapshot triggers:

| Trigger            | Count |
| ------------------ | ----: |
| `dom_mutation`     |   672 |
| `click`            |    21 |
| `keydown`          |    16 |
| `renderer_load`    |     1 |
| `settings_refresh` |     1 |

## Cartographer Runtime Snapshot

The final `cartographer_audit_snapshot` at `2026-06-17T04:20:01.863Z`
recorded:

| State                   | Count |
| ----------------------- | ----: |
| queued windows          |     4 |
| running windows         |     1 |
| superseded windows      |    63 |
| completed no-op runs    |     5 |
| failed runs             |     1 |
| pending-review patches  |     1 |
| durable queued windows  |     4 |
| durable running windows |     1 |

Last notable runtime facts:

- Last applied patch: `patch_browser_proxy_diagnostic_smell` at
  `2026-06-17T04:19:34.511739Z`.
- Last no-op run: `cartographer_run_d2a55856506eb918f184b8b55c39968c` at
  `2026-06-17T04:19:58.70355Z`.
- Last superseded window:
  `cartographer_window_6de27995252acebe56b8fc948c32ee3e` at
  `2026-06-17T04:19:39.601804Z`.

## Screenshot Evidence

- `screenshots/0005-periodic.png`: idle three-node workflow before run.
- `screenshots/0008-periodic.png`: running workflow with small unlabeled
  live-source clusters appearing around the workflow.
- `screenshots/0025-periodic.png`: zoomed running workflow where the active
  `Reviewer` node has a visible outline, but a vertical pile of unlabeled
  live-source beads and semantic source edges competes with the workflow path.
- `screenshots/0033-periodic.png`: later view where committed semantic labels
  are readable, after the graph has already shown the unlabeled runtime bead
  pile during execution.

## Phase 0 Guardrails

The deterministic Electron performance workflows now enforce these budgets:

| Guardrail                                            |                               Budget | Enforcement                                         |
| ---------------------------------------------------- | -----------------------------------: | --------------------------------------------------- |
| Idle three-node wheel/pinch to camera transform p95  |                            `< 16 ms` | `workflow-graph-pan-zoom-small-trackpad` hard check |
| Idle three-node wheel/pinch to rendered frame p95    |                            `< 32 ms` | `workflow-graph-pan-zoom-small-trackpad` hard check |
| Semantic working-set reads during camera interaction |                                  `0` | `workflow-graph-pan-zoom-*` hard check              |
| Long tasks during camera movement                    |                      `0 over 100 ms` | `workflow-graph-pan-zoom-*` hard check              |
| Small semantic-live workflow full working-set reads  |                   `<= 120` temporary | `semantic-live-run` hard check                      |
| Working-set IPC payload rate                         | `< 8,000,000 bytes/minute` temporary | `semantic-live-run` hard check                      |
| Unlabeled live-source graph nodes in default view    |                                  `0` | `semantic-live-run` hard check                      |

The temporary semantic-live budgets allow current blank-scope graph working-set
reads in the deterministic workflow. The focused Phase 0 verification run
measured 97 blank-scope reads and about 5.33 MB of working-set IPC over a
one-minute rate floor. Phase 1 must replace that temporary read budget with `0`
full working-set reads after the initial runtime snapshot, except for one
single-flight snapshot reload per detected stream gap, and should restore the
semantic runtime IPC target to `< 1 MB/minute`.

## Readout

The evidence confirms two distinct problems:

- Idle three-node camera sluggishness needs its own measured camera budget; this
  recording only supplies the visual/user-observed baseline.
- Active workflow semantic liveness currently amplifies the problem by turning
  `cartographer_audit,working_set` events into thousands of full working-set
  reads and over 200 MB of IPC payload.

Phase 1 should remove the event-to-full-read runtime path with a compact,
revisioned semantic runtime projection. Phase 3 should continue from the new
camera latency gate and fix any remaining idle camera delay.
