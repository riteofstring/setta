# Workspace Trajectory Liveness And Semantic Memory Appendix

This appendix extends
`docs/plans/workspace_trajectory_liveness_and_semantic_memory_plan.md`.

## Product Acceptance Matrix

Add deterministic and live-provider gates that reflect the real product goals.

Required deterministic workflows:

- `trajectory-live-basic`: command, reasoning summary, tool call, file change,
  diff, approval, and assistant output without semantic nodes.
- `trajectory-file-fidelity`: typed file read, typed file write, typed diff
  stats, and unknown command fallback.
- `semantic-memory-usefulness`: trajectory facts followed by final synthesis
  that creates durable findings/decisions with evidence and future use.
- `graph-camera-live-runtime`: active workflow plus trajectory sprite burst
  during pan/zoom.
- `semantic-layout-refresh-race`: drag semantic node while runtime/graph events
  arrive.
- `stable-foundation`: add/remove semantic nodes without background mode changes.
- `reload-reconnect-runtime`: runtime stream reconnect with and without revision
  gaps.

Hard gates:

- First deterministic trajectory sprite appears within one second of meaningful
  typed run item activity.
- No repeated full working-set reads after runtime bootstrap.
- No camera-triggered backend reads.
- Pan/zoom event-to-camera and event-to-frame latency remain within budget.
- Essential workflow and trajectory animations continue during camera movement.
- Default graph view has no unlabeled particles or mystery source nodes.
- Semantic node drag positions survive graph/runtime refresh.
- First semantic node does not change the canvas foundation/background.
- Hot-path runtime payloads stay within budget.
- Useful semantic nodes have evidence, source links or semantic edges, and
  future-use summaries.

Live-provider checks:

- Run live Codex E2E when local ChatGPT auth is available and the implementation
  touches Codex harness behavior or provider protocol handling.
- Do not use `OPENAI_API_KEY` for live provider checks.
- If ChatGPT auth is unavailable, skip narrowly and state that live-provider
  integration was not proven.

## Current Acceptance Status

Last reviewed after the Phase 6 follow-up working-tree changes on June 18,
2026.

Passing checks:

- Focused renderer runtime tests passed for scene-store coalescing, semantic
  runtime store behavior, trajectory store behavior, semantic graph projection
  and state, and workflow graph projection/layout.
- Production `semantic-graph` passed.
- Production `workspace-trajectory-file-fidelity` passed.
- Production `semantic-cartographer-auto` passed.
- Production `workflow-graph-pan-zoom-runtime-burst` passed after the Phase 6
  follow-up. Evidence:
  `.recordings/workflow-graph-pan-zoom-runtime-burst/2026-06-19T013825-039Z`.
- Production `semantic-review-live-product` passed after the Phase 6 follow-up.
  Evidence:
  `.recordings/semantic-review-live-product/2026-06-19T013800-441Z`.
- Production `semantic-runtime-reconnect` passed after the Phase 6 follow-up.
  Evidence:
  `.recordings/semantic-runtime-reconnect/2026-06-19T013845-717Z`.
- Production `semantic-runtime-large-review` passed after the Phase 6 follow-up.
  Evidence:
  `.recordings/semantic-runtime-large-review/2026-06-19T013906-441Z`.

Blocking checks:

- None from the Phase 6 follow-up.

Not yet proven:

- Live Codex E2E was not required for the Phase 6 follow-up because it did not
  touch Codex harness behavior, provider protocol handling, or live-provider
  integration. Future changes in those areas still require the live-provider
  gate when local ChatGPT auth is available.

Exit criteria:

- The Phase 6 follow-up exit criteria are satisfied: the two blocking checks
  are fixed, the blocked Phase 7 workflow set was rerun, and focused unit and
  production workflow checks touched by the follow-up passed.

## Implementation Notes

### Contract And Generation Rules

- Go owns backend contracts.
- HTTP endpoints are owned by `internal/httpapi`.
- Generated TypeScript must be regenerated, not edited manually.
- If a persistent schema changes, bump the relevant store version and reject old
  incompatible state rather than adding silent compatibility paths.

### Data Honesty Rules

For trajectory sprites:

- Use typed source refs.
- Prefer exact file paths from typed fields.
- Prefer exact line ranges from typed tool arguments.
- Prefer exact diff stats from structured diff metadata.
- Display provider text as text when no structured field exists.
- Do not invent precision.

For semantic nodes:

- Store public summaries, evidence anchors, source refs, and usefulness
  metadata.
- Do not store private reasoning.
- Do not preserve low-value nodes for compatibility.

### Renderer Rules

- Do not render trajectory sprites as normal semantic graph nodes.
- Do not put graph hot-path state primarily in React.
- Pool display objects.
- Maintain visible windows and LOD.
- Keep layout dimensions stable.
- Keep labels short, with details on selection.
- Use icons and concise labels for sprite kinds.
- Avoid decorative animation that has no named state.

## Non-Goals

This plan explicitly excludes:

- polling,
- fake semantic estimates,
- command-output heuristics for file reads or line ranges,
- hardcoded TypeScript mirrors,
- broad cartographer prompt-only fixes,
- unreadable graph visuals,
- backward-compatibility shims,
- legacy support paths,
- SQLite or file-store migrations,
- old-field aliases,
- transitional readers or writers,
- dual-read/write paths,
- compatibility adapters,
- legacy renderer modes,
- silent compatibility fallbacks,
- and feature flags whose only purpose is to preserve old behavior during the
  refactor.

## Question Status

Resolved:

- Provider/tool metadata for Phase 7 should use the typed data added in earlier
  phases: run item file operations, structured diff stats, dynamic tool file
  metadata, command/test/tool fields, workflow runner refs, and explicit source
  refs. Missing provider precision should be displayed honestly instead of
  inferred from shell commands or output text.
- Runtime composition currently belongs in the renderer scene-store layer, with
  separate backend runtime projections for trajectory facts, semantic memory,
  and cartographer audit. Do not add a new backend composition service unless a
  later measured bottleneck proves the renderer scene store cannot own this
  boundary.
- `futureUse` is required for new semantic memory. Phase 5 put it in the
  cartographer schema and validation path, rather than deriving it silently.

Deferred product decisions:

- Exact default trajectory sprite TTL and collapse timing. Keep the existing
  bounded behavior until Phase 7 liveness/readability evidence shows a concrete
  problem.
- Manual pinning of individual trajectory sprites into durable semantic memory.
  This is useful future product work, but it is not required to complete this
  plan.
