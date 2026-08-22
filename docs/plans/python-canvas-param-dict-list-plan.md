# Python Canvas Param Dict and List of Objects Plan

## Status and purpose

**Status: In progress. The generic `@setta/workspace` registered vertical-container seam, the
canonical backend cutover (aggregate forest, strict project document, renderer, coordinator, V2
HTTP/generated TypeScript contract, and fixture), and the Python Canvas implementation (three
app-owned kinds, forest projection/DnD persistence, subscription-safe dictionary item proposals
and diagnostics, list increment/decrement controls, and placeholder geometry reconciliation) are
implemented and
covered by focused frontend tests. The existing single production browser walkthrough now contains
the seven Param Dict/List acceptance flows and maps each canonical section type to its workspace
section identity, list-child wrapper/projection polling, non-stealing focus check, and nested-item
child-adoption gesture regressions; same-parent list reordering uses the proven free section drag
rather than the synthetic sorting chord, and each drag now waits for its deferred DnD mode
deactivation before the next gesture. The production driver waits for the nested Param Dict's
exact direct sortable projection before its second move, begins each section drag from a
pointer-reachable non-control point in the title header, holds Alt through genuine CDP key events,
and retries a failed activation within a small bounded window. Its isolated headless Chrome launch
retains the disposable profile and keychain protections, resolves a valid explicit raw executable
before the highest valid Playwright cached raw headless shell on macOS, reports its source and path,
and uses `--mute-audio` only for renderer audio—not for AppKit system-alert sounds. Its bounded
policy structure and format checks now pass. Supervised
production headless execution, review, and remaining Code Policy closeout remain incomplete.**

Add the next two Python Canvas section types from main: **Param Dict** and **List of Objects**.
This is one closed vertical slice across the validated Go aggregate, strict project file, generated
Go/TypeScript transport, deterministic Python renderer, `@setta/workspace`, Python Canvas
projection/controller, and the real headless-browser walkthrough.

Main at `043d3b2e9c69caf99d1246f1408b3ad7194b7864` is the behavioral donor. In
particular:

- `frontend/src/state/actions/sections/createSectionsHelper.ts` owns the exact creation labels
  `Param Dict` and `List of Objects`;
- `frontend/src/components/Section/Layouts/DictArea.tsx` presents Param Dict as an authored
  parameter tree with the ordinary authoring/filter controls;
- `frontend/src/components/Section/SectionParts/Incrementer.tsx` presents a List of Objects with a
  child count and minus/plus controls, defaulting new children to Callable;
- `frontend/src/components/Section/Container/ManyNestedSections.tsx` renders the default list view
  as vertically ordered nested sections;
- `internal/codegen/python_dependency_graph.go` assigns list children indexed paths and dict
  entries named paths; and
- `internal/codegen/python_value_codec.go` emits dict and list values from their ordered
  dependencies.

Use those checked-in behaviors, not remembered behavior and not the older Python Canvas prototype.
Main is a donor, not a dependency.

The already committed callable-field correction is a prerequisite and must remain intact: a dirty
or diagnostic indicator cannot change the field's measured height, one Enter accepts an open
completion, and the following Enter performs the section action. Do not reopen that interaction as
a general editor audit while implementing this plan.

## Fixed outcome

Implement exactly these product behaviors:

1. The creation pane offers `Python callable`, `Param Dict`, and `List of Objects`.
2. A new Param Dict is a normal resizable section with the existing item authoring/filter toolbar.
   Its ordered entries have editable names and Python-expression values. Entries can be reordered
   and nested with the package's existing item-tree interactions; a parent entry represents a
   nested dictionary and a leaf represents an expression.
3. A new List of Objects is a normal section shell followed by its vertically ordered nested
   section children. Its compact `Children` incrementer starts at one; plus creates that many new
   Callable children and minus removes that many children from the end.
4. Existing Callable, Param Dict, and List of Objects sections can be moved into a List of Objects,
   reordered there, and moved back to the top level using the existing section drag interaction.
   Nested lists are valid; cycles and multiple parents are not.
5. The canonical project persists and transports the complete forest. Reloading produces the same
   top-level order, list-child order, dictionary-entry tree, stable IDs, names, and expressions.
6. Generated Python assigns every child before its parent, emits a Param Dict as an ordered Python
   dictionary, emits a List of Objects as an ordered Python list, and preserves the established
   editable prefix/generated-body/editable-suffix contract.
7. Basedpyright diagnostics for an authored dictionary expression appear on the owning entry. A
   diagnostic for a generated dict/list composition that has no narrower authored expression stays
   on the exact Generated Python range. A corrected value or structural edit replaces stale
   diagnostics with the next canonical snapshot.
8. Item edits remain editable while requests are pending. Do not introduce lock flashes, row
   spinners, giant error panels, changing row heights, or hidden provider failures.

## Explicit non-goals

This slice does not add:

- List of Objects task-list or kanban modes, view-mode configuration, pinning, variants, or frozen
  variants;
- arbitrary section types as list children beyond Callable, Param Dict, and List of Objects;
- a separate main-style `Dict` grouping section, global variables, metadata, ports, graph edges,
  execution, or cross-section expression references;
- dictionary JSON-source editing, type switching, arbitrary parameter UI types, parameter help,
  provider-derived dictionary entries, or callable signature behavior changes;
- project-file migration, compatibility readers, optional legacy fields, aliases, feature flags,
  or dual V2/V3 transport shapes; or
- a broad parity or edge-case audit of main, workspace grouping, DnD, CodeMirror, or Basedpyright.

Do not turn these exclusions into research tasks. Implement the acceptance paths below, fix defects
encountered on those paths, and stop.

## Canonical ownership and invariants

### The Go aggregate owns one section forest

Extend the authored aggregate with three typed section collections and one authoritative forest:

- existing Callables;
- Parameter Dictionaries;
- Lists of Objects; and
- ordered top-level section IDs, while each list owns its ordered child section IDs.

Do not replace the typed model with a generic map of optional payloads. IDs are globally unique
across the project, all three section collections, callable parameters, and dictionary entries.
Every section ID appears exactly once: either in the top-level order or in one list's children.
Every section is reachable from the top level, no list contains itself transitively, and no section
has two parents. Generated Python is not an authored aggregate section and never appears in the
forest.

A Parameter Dictionary owns an ordered recursive entry tree. Each entry is a strict union:

- a leaf has a nonblank sibling-unique name, an authored Python expression (blank is valid while
  authoring), and no children; or
- a parent has a nonblank sibling-unique name, ordered children, and no authored expression.

Dropping an entry into a leaf performs main's leaf-to-parent promotion as one validated structural
mutation; the promoted node no longer owns its former expression. Moving its last child away leaves
an empty parent rather than inventing an expression. Adding a row creates a blank leaf. Reject
cycles, duplicates, dangling IDs, malformed names, and configured count/size limits at the
aggregate boundary.

A List of Objects owns only ordered child section IDs. Plus with count `n` allocates `n` empty
Callable sections and appends them atomically. Minus with count `n` removes the last `n` child
subtrees atomically, capped at the current child count. Deleting a list or any other parent removes
its complete nested subtree. These destructive semantics must be explicit in the UI action and
covered by tests; do not silently promote children on delete.

All commands carry project ID and expected revision. Validate the complete candidate—including the
forest and every nested dictionary—before publication. A changed candidate increments the revision
once; an idempotent candidate does not. Clone and equality operations must deep-copy the new trees.

Use focused typed commands rather than a catch-all patch document:

- create, rename, and delete a Parameter Dictionary;
- replace one Parameter Dictionary's complete entry tree;
- create, rename, and delete a List of Objects;
- increment or decrement one list's children; and
- replace the complete section forest after a valid drag/reorder operation.

The forest replacement accepts IDs and parent/child order only. It cannot edit a typed section
payload in the same request. Callable create/delete commands and every new create/delete command
must update the forest in the same aggregate candidate.

### Project file and transport cut over atomically

Extend the current strict project document directly with required `topLevelSectionIds`,
`parameterDictionaries`, and `lists` fields. Extend the current V2 snapshot and request/response
contracts directly with the corresponding closed shapes. Go remains the authority and the checked-
in TypeScript contract is regenerated. Update exact-field validation and the one canonical fixture.

This vertical slice is unreleased. Do not add old-file readers, omitted-field defaults, migrations,
V3 aliases, or compatibility adapters. A file with the former field set is invalid after this
cutover; browser and manual testing must use a fresh project file.

Transport a dictionary entry as a recursive discriminated shape, not a record that can carry both
an expression and children. Transport list children and top-level section order as IDs and validate
all references against the complete snapshot. Preserve non-null empty arrays so the wire shape has
one exact representation.

### Renderer and diagnostics remain deterministic

Replace the callable-only body loop with a renderer over the validated section forest. Allocate
top-level Python paths collision-safely across all top-level section types using the existing
display-name sanitization and stable-ID tie break. Match main's path rules below a parent:

- a List of Objects child path is `<parent>__<zero-based-index>`; and
- a dictionary entry path is `<parent>__<sanitized-entry-name>`, made unique among collisions.

Render post-order so every dependency assignment precedes the assignment that references it:

- a Callable renders its authored parameter assignments and call as it does now;
- a dictionary leaf renders its expression assignment, a dictionary parent renders a dict of its
  already assigned children, and the section renders its root dict;
- a list recursively renders its child sections and then a list of their state lookups;
- an empty dictionary renders `{}` and an empty list renders `[]`; and
- a completely empty project still renders `pass`.

Keep one semantic source range for every authored callable expression, callable parameter
expression, and dictionary leaf expression. Retain dictionary-parent, dictionary-section, and list
composition ranges separately as generated-document coordinates; they are not field targets. A
provider diagnostic on only one of those compositions therefore remains targetless and visible in
Generated Python. Do not manufacture field diagnostics from message keywords.

The coordinator must materialize and type-check one fully rendered candidate before publishing and
persisting it, using the existing transactional boundary. Structural changes clear diagnostics
from the prior generated document before provider replacement. Provider failure remains explicit;
it must not be converted into a plausible empty diagnostic set or partial success.

## `@setta/workspace` decision

Param Dict needs no new value-control or item-tree abstraction. Reuse the existing generic item
tree, nested item movement, editable labels, custom Python-expression row, authoring/filter toolbar,
selection, and stable row layout.

List of Objects does require one narrow package change. Today `WorkspaceSection.children` and the
live section-DnD projection are generic, but rendering and valid drop targets are hard-coded to the
package-owned `group` kind. Add one ordinary-kind registry capability:

```ts
nestedSections?: "vertical"
```

That declaration means the registered application-owned section kind may own section children,
renders its ordinary section shell followed by the package's existing vertical nested-section
surface, and is a valid section DnD parent. It does not give the kind group-only orientation,
overflow, ungrouping, or group chrome. Meta-control kinds cannot declare it.

Use this capability everywhere the package decides whether an ordinary section may own children:
load validation, section-container composition, live DnD eligibility/collision behavior, canonical
move preparation, and relevant accessibility labels. A section with children is valid only when it
is the package group or its registered ordinary kind declares `nestedSections`. Existing groups
remain unchanged. Add no List, Python, incrementer, count, section-type, or backend vocabulary to
the package.

The List of Objects incrementer is Python Canvas content rendered through the existing registered
kind seam. Use native labeled numeric input and buttons with stable dimensions and keyboard/focus
behavior. The package change is complete when a synthetic registered kind can own, render, and
reorder nested sections in package tests.

## Python Canvas projection and interaction

Register distinct app-owned kinds for Callable, Param Dict, and List of Objects. Keep their opaque
section data small and validated; canonical authored values come from the backend snapshot, while
workspace geometry, transient selection, filter text, and pending placeholder geometry remain
frontend presentation state.

Project the backend forest rather than assuming every callable is top-level. Generated Python stays
top-level and outside the authored forest. When a pending create resolves, replace only its
placeholder identity while preserving its geometry. When a section moves between top level and a
list, preserve its existing section record and dimensions instead of reconstructing its editor.

Param Dict uses the existing item-area order:

1. authoring/filter toolbar;
2. the visible recursive item tree; and
3. custom Python-expression rows using the same stable indicator slot and Basedpyright diagnostic
   treatment as callable parameters.

Adding, removing, renaming, reordering, indenting, or unindenting entries submits one complete
dictionary-tree proposal at the current revision. Value edits use the established serialized
revision queue and may debounce before submission, but do not disable the row or replace it with a
spinner. Structural edits submit immediately. A rejected proposal restores the next canonical
snapshot and exposes its compact local/application error through the existing error surface.

List of Objects renders the compact main-style `Children` count/minus/plus control inside its empty
ordinary shell and declares `nestedSections: "vertical"`. Count input accepts positive integers and
resets blank/zero to one on blur. Disable actions only when the canonical action is unavailable, not
for the full lifetime of an unrelated request. DnD subscriptions serialize one complete forest
replacement and do not echo a canonical projection back as a new mutation.

Creation commands use the exact visible labels. New section names follow the established unique
name allocator. A new Param Dict is empty. A new List of Objects is empty until plus is invoked;
the incrementer value of one is an action count, not an implied child.

## Acceptance behavior

Extend the production walkthrough and prove these flows against the real Go backend, strict fresh
project file, pinned Basedpyright, Vite production frontend, and headless Chrome only:

1. Open the creation pane and create `Param Dict`. Add leaves `radius = missing_radius` and
   `options`; move a `scale = 2` leaf under `options`. The section keeps a stable size, the nested
   item presentation matches main's ordinary hierarchy, and Generated Python contains the ordered
   nested dict with stable human-readable paths.
2. `missing_radius` produces a Basedpyright error on the `radius` row without a giant error panel,
   lock flash, spinner, or Generated Python duplicate. Replace it with `4`; the row error clears and
   generated output updates.
3. Create `List of Objects`. Set the incrementer to `2` and press plus once. Exactly two new Callable
   children appear vertically inside the list. Their editors have the same dimensions and callable
   Enter/autocomplete behavior as a top-level Callable.
4. Drag the Param Dict into the list between the two Callables, reorder it, and drag one Callable
   back to top level. The UI order and Generated Python list order change once per action, paths use
   list indices, focus is not stolen, and no child editor is remounted into a wrong height.
5. Create a nested List of Objects, add one Callable child, then remove it with minus. Delete the
   nested list and prove its subtree is gone. The outer list remains valid and Generated Python
   contains no dangling state lookup.
6. Reload the browser and backend from the saved project. The three section types, forest, entry
   tree, names, authored expressions, generated code, and diagnostics match the last canonical
   snapshot.
7. Exercise the callable dirty-indicator and completion selection once after the new section work:
   field height is unchanged, one Enter accepts the completion, and the next Enter performs the
   already-defined callable action.

All browser automation must pass explicit headless flags and an isolated temporary user-data
directory. Never launch or attach to the user's interactive Chrome profile, and never request
Keychain access.

## Tests and proof

Add focused observable tests at the boundaries that own behavior:

- aggregate tests for all three typed collections, globally unique IDs, recursive dictionary
  union validation, sibling names, forest reachability/order, cycles, multiple parents, atomic
  list increment/decrement, subtree deletion, revision conflict, clone, and idempotence;
- project-file tests for exact new required fields, recursive entries, forest references, stable
  encode/decode, malformed union rejection, and atomic replacement;
- renderer tests for mixed top-level sections, nested dictionaries, empty values, nested lists,
  post-order assignments, collision-safe names, indexed list paths, and source ranges;
- coordinator/provider tests for materialize/type-check/persist order, stale-diagnostic clearing,
  dictionary-expression target mapping, and no partial publication on failure;
- Go/TypeScript contract generation, drift, runtime validation, and HTTP route tests for every new
  command and complete snapshot;
- workspace tests for registry validation, ordinary shell plus vertical children, DnD into/out of
  a registered container, cycle rejection, groups unchanged, and accessible nested controls;
- frontend tests for forest projection, placeholder reconciliation, geometry preservation,
  dictionary item-tree proposals, revision serialization, increment/decrement, exact creation
  labels, and absence of pending spinners/disabled editors; and
- the production headless-browser acceptance flows above, using the real backend and pinned
  Basedpyright rather than a fake browser-only provider.

Run exact focused tests during implementation. The plan-loop supervisor owns recommended
verification plus the required `python-canvas-browser` suite. Do not run supplemental, mutation,
`test --all`, `verify`, or `gate` inside the loop. Do not add screenshot snapshots or a second browser
harness.

## Implementation sequence and loop guardrails

Implement coherent batches in this order:

1. Add and prove the generic registered vertical-container seam in `@setta/workspace`.
2. Cut over the Go aggregate, strict project file, renderer, coordinator, HTTP surface, generated
   TypeScript contract, and fixtures as one internally coherent model.
3. Register and project the two section types in Python Canvas; wire dictionary item mutations,
   list increment/decrement, forest DnD, diagnostics, and stable transient geometry.
4. Extend and pass the real headless acceptance walkthrough, then run Code Policy closeout.

The implementation agents may split those into private commits but must not leave a committed
partial public contract. If a focused acceptance path exposes a defect, fix its root owner and add
one regression. Do not pause to audit excluded main features or unrelated DnD/editor/provider edge
cases. A claimed blocker must identify a concrete contradiction between this plan and checked-in
code; difficulty or additional tests are not blockers.

Run the supervised loop from a clean source checkout with:

```sh
code-policy plan-loop docs/plans/python-canvas-param-dict-list-plan.md \
  --agent-1-model gpt-5.6-terra \
  --agent-1-reasoning-effort max \
  --agent-2-model gpt-5.6-terra \
  --agent-2-reasoning-effort max \
  --module workspace \
  --module python-canvas-backend \
  --module python-canvas-frontend \
  --verification recommended \
  --require-suite python-canvas-browser \
  --max-iterations 12 \
  --progress-interval 30 \
  --unattended-permission-bypass
```

The supervisor must watch each progress report and stop/reseed the loop if either agent broadens
scope into the explicit non-goals or performs a general edge-case audit.

## Plan-loop checklist

### Phase 1 — Param Dict and List of Objects vertical slice

- [x] Generic `@setta/workspace` registered vertical-container seam: registry, load and move
      validation, vertical nested projection, DnD eligibility, accessible container labeling, and
      focused workspace boundary tests
- [x] Param Dict walkthrough uses the rightward item child-adoption lane for leaf-to-parent
      nesting, with a focused static gesture regression
- [ ] Implementation, production headless proof, review, and closeout complete
