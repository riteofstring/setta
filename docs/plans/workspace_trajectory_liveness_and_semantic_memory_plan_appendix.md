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

## Open Questions

1. Which provider/tool events expose typed file read paths, line ranges, and
   structured diff additions/deletions today?
2. Should the long-term runtime composition service live in a new package, or
   should the existing semantic runtime be narrowed while workflow/chat runtime
   is added beside it?
3. How long should default trajectory sprites remain visible before collapsing
   into workflow-node details?
4. Should users be able to pin individual trajectory sprites into durable
   semantic memory manually?
5. Should "semantic memory future use" be required in the patch schema, or can
   it be deterministic audit derived from node kind, evidence, and retrieval
   behavior?
