# Experiment Lens data-aware annotation implementation plan

## Outcome

Experiment Lens will let a reviewer select exact observations from a scatter plot, attach a typed
question, follow-up request, or context note, and draw directly over any chart. Saved annotations
will survive reloads, remain aligned when sections resize, render in their originating chart, and
travel in the durable selection packet with the experiment evidence they reference.

## Product behavior

1. Every ECharts-backed section exposes an **Annotate** control. Entering annotation mode reveals a
   compact toolbar for selecting, drawing, undoing, clearing, and composing text.
2. Scatter plots support point selection and rectangular multi-selection. Selected marks use the
   existing durable observation basket, so the table, comparison window, and other linked sections
   reflect the same observations.
3. Drawing uses one or more freehand vector strokes over the chart. Stroke points are normalized to
   the chart surface, preserving their placement across section resizing. Each saved annotation also
   records the originating section, view, chart bindings, active filters, and selected observation
   IDs so the visual markup retains its data context.
4. The composer requires text and identifies its intent as **Context**, **Question**, or
   **Follow-up**. Saving creates one structured chart annotation containing the text, context, and
   optional strokes. A text-only annotation is valid when observations are selected.
5. Saved annotations appear as chart overlays and in a compact annotation list within annotation
   mode. A reviewer can focus an annotation, edit its text/intent, or delete it. Drawings remain
   visible outside annotation mode without intercepting chart or Workspace input.
6. Existing artifact notes become structured annotations with an artifact anchor. The public state
   and packet expose one annotation collection rather than parallel note and drawing systems.

## Contract and backend

1. Replace the narrow selection-note contract with a discriminated structured annotation contract:
   identity, intent, text, section/view context, selected observation IDs, optional artifact/range
   anchors, chart bindings and filters, and bounded normalized vector strokes.
2. Validate annotation IDs, referenced observations, sections, views, artifacts, ranges, chart
   bindings, stroke counts, point counts, normalized coordinates, text, and collection limits.
3. Persist annotations in `.local/experiment-lens/state.json`, carry them through complete selection
   replacement, and materialize every referenced observation and artifact in exported packets.
4. Regenerate JSON Schemas, TypeScript declarations, and standalone validators from the Go-owned
   contracts. Update CLI/coordinator fixtures and tests for valid and invalid annotations.

## Frontend

1. Extend the Lens model and controller with add/update/delete annotation actions while retaining the
   existing optimistic mutation and revision-conflict behavior.
2. Add a reusable chart annotation surface around `EChartSurface`. It owns only draft interaction;
   accepted annotations remain in the validated snapshot. Pointer capture and Workspace input
   boundaries apply only while selecting or drawing.
3. Add scatter coordinate conversion for point and rectangle selection. Selection gestures update
   the existing observation basket once per completed gesture.
4. Render saved SVG strokes from normalized points above each matching chart. Keep the passive
   overlay pointer-transparent and resize-safe.
5. Convert artifact note input to the shared structured annotation model and language.
6. Update the playground copy and README so the controls and durable packet semantics are clear.

## Verification and milestones

1. **Contract milestone:** backend schema, validation, persistence, export, generated frontend
   contract, and focused backend tests. Commit the coherent contract cutover.
2. **Interaction milestone:** data selection, annotation composer, freehand drawing, rendering,
   editing/deletion, and focused frontend tests. Commit the working UI.
3. **Acceptance milestone:** headless browser coverage for point and rectangle selection, text-only
   and drawn annotations, resize alignment, reload persistence, deletion, export contents, chart
   input handoff, and light/dark rendering. Visually inspect recorded screenshots.
4. Update current design rationale, run changed-scope verification from the task base, commit the
   finished implementation, run the long-lived-branch checkpoint gate, then delete this plan and
   commit its removal.

## Completion criteria

- A user can select one or many scatter observations without visiting the table.
- A user can save a typed annotation tied to those observations.
- A user can draw on every chart section and save the drawing with typed context.
- Saved drawings render in the correct section after resize and reload.
- Annotations can be edited and deleted.
- The handoff packet contains annotation intent, text, data context, references, and vector strokes.
- Existing artifact annotation remains functional through the unified contract.
- Backend, frontend, generated-contract drift, and headless browser checks pass.
- The temporary implementation plan is absent from the final tree.
