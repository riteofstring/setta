# Workspace top-level auto-layout implementation plan

## Outcome

Add one deterministic, dependency-free top-level auto-layout capability to `@setta/workspace`.
The package will measure, plan, validate, and atomically move eligible top-level sections through
its existing document and history boundary. Integrated command surfaces will make the capability
available to package consumers, including Python Canvas, without requiring each application to
invent a packing algorithm.

The operation will preserve section dimensions, hierarchy, stacking, selection, viewport, and
host-owned payloads. Position-and-size-locked sections will remain fixed and participate as
obstacles. A plan will only publish when every top-level rectangle has usable geometry and at
least one eligible section changes position.

## Ownership boundary

`@setta/workspace` will own:

- the pure rectangle-planning types and deterministic algorithm;
- geometry readiness, layout-capability, and lock handling;
- one complete next-document mutation and one `section-move` publication;
- built-in command availability, disabled explanations, execution, and status;
- default visual spacing and deterministic tie-breaking.

Downstream applications will own:

- when to expose or invoke the package command beyond its built-in pane menu and palette surfaces;
- any product-specific layout policy or future semantic grouping hints;
- persistence at their existing canonical boundary;
- feedback for downstream persistence failures and conflicts.

Python Canvas will keep backend-authored section forest placement authoritative and browser-local
workspace geometry local. Auto-layout coordinate changes will therefore produce no forest command,
while later canonical snapshot projections will retain the accepted workspace geometry through the
existing projection boundary. No coordinate fields will be added to the Go transport or project
file.

## Planner

Create a small pure module under `packages/workspace/src/auto-layout/`. It will accept detached
top-level rectangles containing an id, current position, positive dimensions, stacking order, and
locked state, plus an optional finite non-negative gap. The public default gap will be 48 workspace
units.

The planner will use deterministic multi-candidate shelf packing:

1. Preserve locked rectangles as fixed obstacles and sort movable rectangles by descending padded
   height, descending padded width, stacking order, current position, and id.
2. Generate several shelf widths around the square-root-of-area baseline, including candidates
   biased toward a compact landscape canvas.
3. Pack each candidate left-to-right into height-aware shelves.
4. Evaluate stable origins around the current top-left anchor and, when needed, beside fixed
   obstacle bounds.
5. Reject candidates that overlap any fixed rectangle or another packed rectangle, then choose the
   lowest deterministic score for compact area, balanced aspect ratio, ragged final space, and
   normalized movement.
6. Return positions only. Preserve all input values and make a repeated plan idempotent.

Inputs, intermediate arithmetic, and outputs will be validated as finite and prototype-safe. The
implementation will remain package-owned instead of adding a general graph-layout dependency: the
problem is rectangle packing without graph edges, and a small shelf planner keeps the bundle,
contract, and deterministic behavior under workspace control.

## Host action and command integration

Add a public availability query and `autoLayoutTopLevelSections(host, options?)` action. The action
will check `canEditLayout` before reading geometry, collect every displayed top-level section from
the canonical document and live node measurements, create one plan, build one complete next
document, reproject node internals, publish the stores atomically, and emit one `section-move`
change. Zero/one movable-section and already-arranged results will be no-ops.

Add `workspace.auto-layout-top-level` as a pane command on the context-menu and command-palette
surfaces. Its disabled reason will come from the same availability query used by direct hosts. It
will have no default key binding and will not add a mandatory toolbar control or preference.

## Focused coverage to author

Author focused tests without executing them, per the caller's instruction:

- planner determinism, non-overlap, spacing, mixed dimensions, balanced candidate selection,
  locked obstacles, anchor behavior, idempotence, immutable inputs, prototype-like ids, and invalid
  numeric input;
- action capability gating, geometry readiness, fixed locked sections, preservation of canonical
  fields, atomic publication, one history transaction, and no-op behavior;
- built-in command discovery, disabled explanation, execution, and status;
- Python Canvas geometry retention across a later canonical projection and proof that coordinate-
  only layout changes do not produce a backend forest proposal;
- public export coverage.

## Delivery sequence

1. Commit this plan as a temporary implementation contract.
2. Implement and commit the pure planner plus its focused tests.
3. Implement and commit the atomic host action, public exports, and command integration.
4. Implement and commit Python Canvas integration coverage and any required projection correction.
5. Update `packages/workspace/README.md`, `apps/python-canvas/README.md`, and current design rationale
   with the final ownership and persistence contract.
6. Delete this completed plan and any implementation artifacts made obsolete by the final design,
   then commit the durable documentation and cleanup.
7. Run formatting, architecture, and other non-test static policy checks only. Do not run unit,
   integration, browser, build-smoke, or merge-gate commands that execute tests, and do not perform
   GitHub operations.

## Completion criteria

- A consumer can invoke one public action or the built-in pane command and receive a compact,
  deterministic, non-overlapping arrangement.
- Locked sections do not move, all other document fields are preserved, and accepted movement is
  one observable canonical publication and one local-history transaction when local history exists.
- Python Canvas receives the command through `@setta/workspace`, retains browser-local coordinates
  across backend projections, and sends no backend mutation for coordinate-only changes.
- The public API and durable docs describe the behavior and ownership boundary.
- The temporary plan and obsolete implementation artifacts are absent from the final tree.
