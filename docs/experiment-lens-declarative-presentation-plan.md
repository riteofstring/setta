# Experiment Lens Declarative Presentation Plan

## Outcome

Make `experiment.json` describe a useful Experiment Lens interface instead of relying on an automatically inferred dashboard. A producer chooses built-in visual sections, binds each section to declared fields or artifact roles, and places those sections exactly in named Setta views.

The presentation remains data, not executable extension code. Lens validates and renders it with a fixed catalog of safe, shared section implementations.

## Manifest contract

Add a required `presentation` object with:

- `initialViewId`: the named view opened first.
- `sections`: globally identified section definitions. Each definition has an ID, title, discriminated built-in type, and type-specific data bindings.
- `views`: named tabs with an explicit viewport and placements that reference section IDs. A placement supplies `x`, `y`, `width`, and `height`.

Support these built-in definitions:

- `facets`: explicit factor fields.
- `scatter`: numeric x/y fields and an optional grouping field.
- `histogram`: one numeric field and a bin count.
- `heatmap`: two factor fields, one numeric value field, and an aggregation.
- `parallel`: explicit numeric dimensions.
- `table`: explicit columns.
- `metrics`: explicit numeric fields and an aggregation.
- `timeline`: an artifact relation role plus optional detail fields.
- `gallery`: one or more artifact relation roles and a column count.

Do not accept executable code, expressions, arbitrary ECharts options, remote resources, project dependencies, or plugin discovery.

## Validation

- Keep strict unknown-field rejection and publish the presentation in the generated JSON Schema and TypeScript contract.
- Require unique section and view IDs, a valid initial view, valid placement references, one placement per section per view, and at least one placement for every declared section.
- Validate field bindings against declared roles and value types.
- Validate artifact-role bindings against declared relations and compatible artifact media types.
- Bound section, view, field, bin, column, coordinate, size, and zoom counts and values.
- Reject properties that do not belong to a section's discriminated type.

## Frontend

- Replace inferred sections, Atlas/Inspect layouts, and fixed section IDs with a direct manifest projection.
- Store the presentation section ID in each Workspace section and let renderers resolve its validated definition.
- Make existing facets, scatter, parallel, table, series/timeline, and artifact renderers consume explicit bindings.
- Add histogram, heatmap, and metric renderers using the existing ECharts and Setta section infrastructure.
- Treat timeline and gallery as clearer names for the existing rich artifact experiences, without compatibility aliases.
- Preserve shared filters, focus, selection, timeline cursor, notes, comparison, and packet handoff across all applicable sections.

## Example and documentation

- Author the battery playground as a realistic multi-view presentation that exercises all nine built-ins and deliberately different layouts.
- Update test fixtures and invalid-contract cases for the required presentation.
- Update the backend and frontend design documents, app README, app-ideas entry, and mockup explanation to make the declarative built-in catalog the public boundary.
- Regenerate checked-in schemas, TypeScript contracts, validators, and the battery fixture.

## Delivery sequence

1. Commit this plan.
2. Implement and verify the backend contract, validation, generated artifacts, and fixture migration; commit the milestone.
3. Implement and verify manifest projection and all section renderers; commit the milestone.
4. Update product/design documentation, run governed changed tests and the checkpoint gate, and fix all findings.
5. Delete this plan, verify the final repository state, and commit the completed feature.

## Exit criteria

- Changing only `experiment.json` can choose the section catalog, field/artifact bindings, named views, exact geometry, and initial view.
- The app contains no inferred default dashboard path.
- Every built-in renders meaningful fixture data and participates in shared interaction where applicable.
- Invalid presentation references and configurations fail before the UI loads.
- Generated contracts are current, the required governed checks pass, and this temporary plan no longer exists.
