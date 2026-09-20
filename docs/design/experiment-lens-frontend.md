# Experiment Lens frontend design rationale

This document owns current non-local rationale for the `experiment-lens-frontend` module. Public
behavior belongs in `apps/experiment-lens/README.md`.

## Declarative built-in presentation

Experiment Lens projects the manifest's required presentation directly into Workspace. Manifest
section IDs become stable Workspace section IDs. Named manifest views become saved-view tabs with
their declared viewport and exact section geometry; `initialViewId` chooses the first view. There is
no inferred fallback dashboard or fixed set of view names.

The built-in catalog contains facets, scatter, histogram, heatmap, parallel coordinates, a
virtualized observation table, aggregate metrics, standardized timelines, and artifact galleries.
Each renderer consumes only its validated field or artifact-role bindings. Projects choose and
arrange those capabilities but do not supply component source, ECharts options, expressions,
callbacks, dependencies, or executable code. The catalog remains closed until repeated projects
justify a safe extension boundary.

The validated backend snapshot remains authoritative for immutable result identity, admitted
artifact content, filters, focused observation, explicit selection basket, artifact inclusion,
anchored ranges, annotations, and revision. Workspace sections contain only the manifest presentation
section ID. A coherent interaction optimistically previews one complete selection replacement,
submits it against the observed revision, and reconciles the accepted result or a newer server-sent
snapshot. Changing exploration state never rewrites the Workspace document.

React owns only interaction drafts, chart hover, playback cursor, local axis choices, pending
optimistic presentation, and managed-window geometry. An indeterminate or rejected mutation is
never silently retried. A revision conflict refreshes the authoritative snapshot before another
human action is admitted. Renderers resolve the authoritative typed section definition from the
snapshot instead of copying presentation configuration into the Workspace document.

## Linked exploration

Facets and parallel-axis brushes update one normalized filter model. Population charts and the
virtual table derive the same visible observation set. A chart mark or table row changes focus;
the series and artifact sections resolve that same observation. Series interaction changes the
shared time cursor and range, and a timed artifact view resolves the nearest admitted frame.

The selection basket is explicit and independent of the visible cohort. Filtering never silently
deletes a prior selection. Annotation mode converts scatter points, histogram bins, and heatmap
cells through the live chart projection into their exact observation IDs. Repeating a gesture over
an already selected mark removes that group, while Shift modifies the existing basket. A reusable
layer around every ECharts section captures freehand strokes in normalized chart coordinates, so
accepted drawings remain aligned when a Workspace section resizes. Each annotation records its
intent, text, originating section and view, field bindings, filter snapshot, and selected
observation IDs.
Artifact annotations use the same durable collection with an exact artifact anchor. Passive saved
overlays do not intercept chart or Workspace input; pointer boundaries apply only while selecting
or drawing. A managed comparison window overlays the selected series and presents their primary
metrics. Export becomes available when the durable state contains observations, artifacts, ranges,
or annotations and records their IDs, filters, time range, annotation context, and exact artifact
references.

There are no semantic graph edges. Synchronization is one shared state relationship, and edges
between every linked view would add visual noise without explaining provenance. Manifest-defined
saved views arrange any subset of the declared sections. Attention briefly identifies table,
timeline, and gallery details when focus changes; view activation remains explicit.

## Dependencies and rendering

ECharts is imported directly from its tree-shakable core with scatter, line, bar, heatmap, and
parallel charts plus the required components and Canvas renderer. A small app-owned wrapper controls
theme, resize, events, and disposal; no React chart wrapper is required. TanStack Table owns sorting
and column projection, while TanStack Virtual bounds row rendering for larger manifests. React state
is sufficient for linked exploration, and Ajv validates the generated wire contract.

Custom interactive surfaces use Workspace pointer, drag, pan, and wheel boundaries. Each chart
observes its section body rather than the browser viewport and recreates its visual option when
Workspace appearance changes. Section minimum sizes preserve meaningful plots; internal controls
wrap with container queries, tables own horizontal scrolling, and media remains contained.
Narrow initial loads begin with the outline closed and a compact saved-view viewport so mounting
does not shift or resize an already-live canvas across the breakpoint.

Lens starts with the Workspace minimap hidden because its fixed overlay can obstruct dense table
controls. The standard Workspace toolbar remains the explicit way to reveal it when navigation
context is more valuable than the underlying interaction area.

Lens section bodies are interaction boundaries; section movement remains available from section
chrome. Linked mutations and local projections that replace interactive descendants begin on the
next browser task so a trusted pointer or keyboard event can finish before React projects a
different cohort, row order, or controlled value across rich sections. This avoids coupling a
Workspace input session to the reconciliation it initiated.

Experiment data is read-only while Workspace layout remains editable. The host disables structural
editing but retains section movement, resizing, saved-view activation, and section handoff into
managed windows.

## Verification

Pure tests cover filter normalization, focus and selection invariants, time synchronization,
selection packet input, and manifest-to-Workspace projection. Component tests cover section
interaction and chart lifecycle with a controlled ECharts boundary. Headless browser acceptance
uses a realistic 864-observation battery project whose three declared views exercise all nine
built-ins. It verifies filtering, table overflow, bidirectional focus, selection across filters,
timeline synchronization, point, histogram-bin, and heatmap-cell selection, drawing, resize
alignment, persistence,
annotation editing and deletion, managed comparison, exported packet content, light and dark
rendering, and constrained viewport behavior. It records screenshots for manual visual review.
