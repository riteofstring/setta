# Setta Semantic Work Graph Implementation Plan: Later Phases

This continuation belongs with
`docs/plans/setta_semantic_work_graph_implementation_plan.md` and keeps the
main implementation plan below the repository file-length limit.

Phase 8 starts only after Phase 7 retrieval indexes and usefulness-loop evidence
have landed. The current branch is not ready for Phase 8 while Phase 7 still has
no FTS store, retrieval service, retrieval-backed context/cartographer
integration, or trace-corpus quality report.

## Phase 8: Constraint Enforcement Bridge

Goal: connect semantic constraints to runtime validation without mixing semantic
meaning and executable enforcement.

Deliverables:

- Support enforcement levels:

```text
prompt_only
llm_judge_checked
code_checked
workflow_gate
```

- Link constraint nodes to enforcement mechanisms:

```text
file edit guard
schema/API diff check
contract test
custom command
LLM judge
human approval
workflow validation gate
```

- Record constraint check results as semantic events with evidence.
- Show constraint status in node details, run details, and workflow validation
  surfaces.
- Keep prompt-only constraints useful but visibly weaker than code-checked or
  workflow-gated constraints.

Verification:

- Backend tests for constraint check recording and enforcement-level display.
- Deterministic Electron workflow for at least one prompt-only constraint and
  one code-checked or workflow-gated constraint.
- Live provider test when a constraint is delivered to a live Codex run.

## Phase 9: Replay And Review

Goal: make the semantic graph's history inspectable and compatible with future
session replay.

Deliverables:

- Add event-history views for a semantic node, run, session, and workspace.
- Add projection rebuild/debug tooling for a temporary app data directory.
- Add time-window queries for activity intervals and semantic graph changes.
- Add optional replay data APIs:

```text
events in time order
graph projection at event cursor
activity intervals active at timestamp/cursor
context packs delivered by cursor
cartographer patches by cursor
```

- Keep UI replay minimal at first: chronological review and selected-node history
  are enough before animation.

Verification:

- Backend tests for projection-at-cursor and activity time-window queries.
- Electron workflow for history inspection and reload.

## Phase 10: Optional Library Evaluations

Goal: add heavier libraries only when real usage shows the need.

Evaluation order:

1. **ELK.js** for auto-layout of new/unpinned semantic neighborhoods.
2. **sqlite-vec** for local embedding retrieval behind `VectorIndex`.
3. **OpenTelemetry + OpenInference** for agent/cartographer/retrieval traces.
4. **Tree-sitter** for structured file/symbol anchors.
5. **LadybugDB** as a rebuildable graph traversal/analytics projection.
6. **Graphiti** as a benchmark/reference for temporal agent memory quality, not
   as Setta's implementation substrate.

Each evaluation should produce a short report or plan update covering:

```text
problem being solved
sample Setta traces used
quality/performance result
packaging impact
dependency/license impact
replacement/fallback story
whether the dependency becomes required, optional, or rejected
```

Dependency changes must pin exact versions and use the repo dependency workflow.

## MVP Definition

The MVP is complete when this loop works through production app paths:

```text
agent or workflow work happens
the semantic cartographer is enabled by default
bounded cartographer windows are processed automatically while work is running
semantic events are appended
semantic nodes/edges/activity appear
each node has inspectable evidence
user can edit and steer through graph operations
selected semantic context reaches an agent explicitly
context-pack history records what the agent saw
state survives restart/reload
history can explain why the graph changed
validated cartographer updates do not require user review or approval
```

MVP dependencies should be limited to existing stack plus SQLite FTS5 if
available. Vector search, graph databases, CRDTs, durable message brokers,
external tracing backends, and alternate graph renderers are later additions only
after pressure from real Setta sessions.

## Verification Policy By Phase

- Run the narrowest focused backend, renderer, or Electron checks that exercise
  each phase first.
- Regenerate TypeScript contracts whenever Go-owned semantic contracts or HTTP
  endpoint contracts change.
- For phases touching chat behavior, Codex harness behavior, provider protocol
  handling, run lifecycle, queueing, steering, approvals, event streaming,
  IPC/preload contracts, generated backend contracts, renderer chat state, or
  transcript UI, add deterministic end-to-end app workflow tests through the
  production Electron/main/preload/renderer/HTTP/store paths.
- When semantic context is delivered to Codex-backed runs, run live Codex E2E
  tests if local ChatGPT auth is available. If unavailable, report the live test
  skip explicitly and do not treat the skip as provider proof.
- Before committing source, tests, scripts, generated inputs or outputs, build
  config, or executable examples, run `./scripts/format.sh` and
  `./check_quality.sh --all`.
- For documentation-only changes to this plan, inspect the diff and skip the full
  workflow unless a directly relevant automated check exists.
