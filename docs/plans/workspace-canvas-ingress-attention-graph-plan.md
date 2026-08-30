# Workspace canvas ingress, attention, and graph plan

Status: temporary implementation plan

## Outcome

`@setta/workspace` will expose three coherent downstream capabilities:

1. A host-owned external-drop boundary for dropping browser data onto the bare canvas.
2. Multi-section viewport fitting and transient section attention.
3. A controlled, Workspace-native port and edge layer that downstream applications can render and
   operate without importing XYFlow.

This document is removed after the implementation, durable design rationale, public usage docs,
tests, and Playground acceptance are complete.

## Reference authority

The local `main` worktree at commit `043d3b2e9c69caf99d1246f1408b3ad7194b7864` is the UX and
behavior reference. Implementation must study and preserve main's established interaction model,
timing, visual meanings, and failure behavior. It must not copy app-specific stores, generated
domain types, persistence calls, file import logic, AI routing, or the old XYFlow fork.

The implementation adapts reference behavior to Workspace's current upstream `@xyflow/react`
renderer and host/document ownership model. It must not invent replacement UX where main already
defines one. Any necessary departure must be recorded in `docs/design/workspace.md` with the
concrete current constraint and the retained user-visible behavior.

The primary local references are:

- External drops: `frontend/src/forks/xyflow/core/container/Pane.tsx` and
  `docs/plans/standalone-section-workbench-oss-plan.md`.
- Multi-section attention: `docs/reference/ai-follow.md`,
  `frontend/src/state/hooks/aiFollow.ts`,
  `frontend/src/components/Section/Container/utils.tsx`, and
  `frontend/index.css`.
- Ports and edges: `docs/reference/agentic-edges.md`, `docs/reference/edge-styles.md`,
  `frontend/src/components/Section/Container/*EdgeHandles.tsx`, and the edge renderers under
  `frontend/src/forks/xyflow/core/container`.

## Current boundaries

- `WorkspaceDocument` remains the canonical serializable owner of sections, item trees, geometry,
  viewport, selection, and saved views.
- External `DataTransfer` objects, attention state, graph callbacks, and downstream graph snapshots
  remain host-owned runtime or view inputs.
- Workspace owns coordinate conversion, measured geometry, viewport transitions, section chrome,
  port and edge presentation, gesture arbitration, validation at the public boundary, and
  accessibility.
- Downstream applications own file interpretation, asynchronous import, AI or activity routing,
  edge meaning, persistence, revisions, domain validation, and accepted graph mutations.
- XYFlow remains a private renderer. Public contracts use Workspace types and never expose XYFlow
  nodes, edges, handles, stores, instances, or callbacks.

## Public composition

`WorkspaceCanvas` gains an optional configuration object. `WorkspaceShell` accepts and forwards the
same configuration so standalone and integrated compositions use one contract.

```ts
type WorkspaceCanvasConfiguration = Readonly<{
  externalDrop?: WorkspaceExternalDropConfiguration;
  graph?: WorkspaceGraphConfiguration;
}>;
```

The exact prop names may be simplified during implementation, but there must be one authoritative
type and one validation path. The shell must not fork or reinterpret canvas behavior.

## Slice 1: canvas external drop

### Contract

Expose a controlled host configuration with:

- A synchronous `canDrop` decision that receives the live `DataTransfer` object.
- An `onDrop` callback that receives that same `DataTransfer`, the exact workbench position, and the
  originating native drag event.
- Optional accessible status text only when the host supplies it; Workspace does not infer file
  types or domain meaning.

The browser objects are read-only inputs and never enter `WorkspaceDocument`, history, or a package
store beyond the active browser event.

### Reference behavior

- Only the bare XYFlow pane accepts an external drop. Sections, controls, scrollable content,
  managed windows, section DnD, and item DnD keep their existing ownership.
- `canDrop` runs during drag-over. A rejected drag is untouched so another browser or application
  target can own it.
- An accepted drag prevents the browser default and sets `dropEffect` to `copy`, matching main.
- Drop converts `clientX` and `clientY` through Workspace's existing screen-to-workbench transform
  exactly once, prevents default, and calls the host once.
- The host decides whether the payload represents files, internal application MIME data, or another
  supported input and owns import errors and notifications.
- Loading or disposing a host cannot retain an active drag state.

### Verification

- Exact component tests cover accepted and rejected drag-over, bare-pane targeting, unchanged
  `DataTransfer` identity, copy cursor behavior, transformed coordinates, callback count, and
  host isolation.
- The Playground exposes a browser-data drop fixture that creates or records a sample section
  without native filesystem access.
- Browser inspection confirms the drop path does not interfere with section movement, item DnD,
  canvas pan, or host-page scrolling.

## Slice 2: multi-section attention

### Contract

Expose two public operations over an explicit `WorkspaceHost`:

- `fitWorkspaceSections(host, sectionIds, options?)` fits one validated section set into the visible
  canvas using Workspace geometry and viewport insets.
- `setWorkspaceSectionAttention(host, sectionIds)` replaces the complete transient highlighted set;
  an empty array clears it.

The fit options support documented padding, maximum zoom, and transition duration. Defaults match
main: `0.1` padding, maximum zoom `1`, and a `500ms` transition after reduced-motion resolution.

### Reference behavior

- Validate every requested ID before changing attention or viewport. Unknown, hidden, unmounted, or
  empty-bounds inputs fail specifically and produce no partial effect.
- Multi-section bounds are computed from the exact visible section shells, including nested
  sections, and respect shell viewport insets.
- Pan and zoom gestures are disabled only while the fit transition is active. Overlapping
  transitions use the newest transition as owner and cannot unlock it early.
- Highlighting does not change document selection, layout, history, saved views, or focus.
- The section shell uses main's animated blue-purple-pink conic-gradient border. Clearing attention
  retains the visible highlight for `650ms` to prevent flicker.
- Reduced-motion presentation keeps the border visible without animation and resolves viewport
  motion through the existing Workspace motion policy.
- The package does not implement Follow AI modes, websocket batching, the `300ms` tool-result group
  window, the `2s` result-clear policy, or chat filtering. A downstream application composes those
  policies from the generic operations.
- Loading a replacement document clears attention and transition ownership.

### Verification

- Pure and component tests cover complete validation, multi-section bounds, nested sections,
  viewport insets, default and overridden options, reduced motion, overlapping transition locks,
  host isolation, `650ms` linger, reload cleanup, and unchanged selection/document publication.
- The Playground provides a host action that fits and highlights a stable multi-section set and a
  clear action that demonstrates the linger.
- Browser inspection reviews the full transition, highlighted sections, reduced-motion state, and
  continued edge/port alignment.

## Slice 3: downstream ports and edges

### Controlled graph snapshot

`WorkspaceGraphConfiguration` is one complete controlled snapshot plus callbacks. It contains:

- Stable port definitions keyed by port ID and section ID.
- Stable edge definitions keyed by edge ID with source and target section/port endpoints.
- A complete selected-edge ID set.
- A synchronous connection validator.
- Callbacks for proposed connect, reconnect, edge-selection, and delete operations.

Workspace validates the complete snapshot before rendering any part of it. Duplicate IDs, unknown
sections, unknown ports, wrong endpoint directions, family mismatches, self-connections rejected by
host policy, non-finite placement values, invalid selected IDs, or malformed callbacks fail with
specific errors. Host callbacks receive detached Workspace-native values and decide whether and
when to publish the next controlled snapshot.

The controlled graph does not enter `WorkspaceDocument` in this slice. This keeps downstream edge
semantics and persistence with their existing owner and avoids a speculative migration of current
documents. Durable design docs must state this ownership explicitly.

### Port model and reference behavior

Ports define:

- `id`, `sectionId`, `type` (`source` or `target`), and `family` (`data`, `agentic`, or `workflow`).
- A left or right side and a normalized vertical placement. Defaults follow main: targets on the
  left, sources on the right, centered at `0.5`.
- A non-empty accessible label and an optional disabled state.

Presentation follows main:

- Data ports use the compact neutral dot treatment.
- Agentic ports use blue ring/filled treatments; workflow ports use amber.
- Target ports are hollow and source ports are filled.
- Large transparent safe zones bridge the section edge and the visible handle.
- Handles fade in on section or safe-zone hover, remain visible while connected or while any
  connection gesture is active, and show disabled handles at reduced opacity.
- A connection may start from either endpoint. A target-originating drag is normalized into the
  same source-to-target proposal instead of creating a reversed domain edge.
- A live bezier preview follows the pointer. Candidate handles show valid or invalid feedback from
  the synchronous downstream validator.
- Ports render on root and nested sections and stay aligned during pan, zoom, resize, recursive
  layout, section DnD, and saved-view changes.

### Edge model and reference behavior

Edges define stable endpoints, family, optional label, visibility, and reference overlay state.
The supported families retain main's meanings and visuals:

- `data`: thin gray line; blue on hover, focus, or selection.
- `agentic`: dashed blue line; brighter and thicker when selected; optional `running` and `missing`
  overlays use main's blue glow and red dashed warning.
- `workflow`: solid amber line; brighter orange with a small glow when selected.

The package renders one interaction stroke wider than the visible edge, preserves deterministic
edge order, hides edges whose endpoint section is hidden by a saved view, and does not infer domain
semantics from family names.

Clicking an edge replaces the controlled selected-edge set through the host callback and clears
section selection using the same canvas-selection policy as main. Modifier-click supports additive
edge selection. Escape clears edge selection. Delete and Backspace propose deletion of the complete
selected edge set only when structure editing is allowed and a delete callback exists. Connection
and reconnection gestures obey the same capability gate.

Keyboard focus, accessible labels, and visible focus treatment are required for edges and ports.
Pointer interaction cannot initiate section movement, item DnD, or canvas pan.

### Renderer boundary

The graph layer may use upstream XYFlow utilities internally. Nested sections are not XYFlow nodes,
so endpoint measurement and rendering must be owned by Workspace rather than exposing an XYFlow
escape hatch. The public API must remain stable if the private renderer changes.

### Verification

- Boundary tests validate the complete graph before presentation and prove callback snapshots are
  detached from package state.
- Component tests cover all three families, source and target-originated connections, synchronous
  acceptance/rejection, preview cleanup, reconnect, selection, additive selection, Escape, delete,
  read-only capabilities, hidden endpoints, and multiple Workspace hosts.
- Geometry tests cover root and nested endpoints across pan, zoom, resize, DnD, and saved-view
  projection.
- The packed consumer builds a graph using public exports only.
- The Playground includes a small three-section graph showing data, agentic, and workflow edges,
  connected handles, connection creation, selection, delete, and an attention transition.
- Browser interaction acceptance exercises a real connection gesture and confirms no browser
  errors, host-page scrolling, or section-drag leakage.

## Shared implementation order

1. Add and verify the external-drop boundary.
2. Add and verify attention state, viewport fitting, transition locking, and section treatment.
3. Add graph types and complete-snapshot validation.
4. Add port registration, measurement, presentation, and connection gestures.
5. Add edge rendering, selection, deletion, and reconnection.
6. Integrate all three capabilities into the Playground and packed consumer.
7. Rebuild Workspace, run live Playground inspection, and review emitted geometry and screenshots.
8. Update `docs/design/workspace.md`, `packages/workspace/README.md`, and durable testing/tooling docs.
9. Delete this plan and every obsolete empty-edge, no-connections, or superseded documentation
   artifact made invalid by the implementation.

## Commit checkpoints

Keep public APIs coherent at every commit:

1. Temporary implementation plan.
2. External-drop boundary with exact tests and docs-in-progress.
3. Multi-section attention with exact tests and reference presentation.
4. Controlled graph contract, port rendering, and connection gestures.
5. Edge rendering, selection, delete, reconnect, and downstream fixture.
6. Playground/browser acceptance and durable documentation.
7. Plan removal, obsolete-artifact cleanup, and final gate fixes.

Each commit stages only task-owned files and preserves unrelated work.

## Required verification

- Exact affected Vitest files while each slice is edited.
- `code-polishy test --changed` after integration.
- Workspace build before every live Playground inspection.
- `pnpm playground:inspect` against a running Playground with geometry and screenshot review.
- The repository's browser interaction and packed-consumer contract suites selected by policy.
- `code-polishy merge-gate --base main` once for the final candidate.

## Non-goals

- Native file detection, upload, filesystem access, or file-to-section mapping.
- AI transports, chat selection modes, durable activity records, or AI execution semantics.
- Domain validation, execution, routing, code generation, workflow actions, or agent scope rules for
  edges.
- Public XYFlow types, components, instances, stores, node definitions, or renderer callbacks.
- A migration of existing downstream project formats.
- Compatibility aliases, dual graph models, legacy parsers, or a second edge renderer.
