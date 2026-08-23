# Python Canvas Parser-Backed Dependency Ordering Plan

## Status and purpose

**Status: Ready for implementation.**

Make authored Python references between canvas values executable regardless of visual section
order. A user can write `state.Other_section` or `state.Other_section__parameter` in a callable,
parameter, or dictionary expression; generated Python discovers that reference with a real Python
parser and emits the referenced assignment first.

This is the only active plan in `docs/plans`. The deferred distribution/environment plan and
completed parity plans remain available in Git history rather than competing with the current
implementation objective.

Ports, edges, and connection editing are not part of the Python Canvas dependency model. Authored
Python is the dependency declaration.

## Product outcome

Given a canvas whose visual order is Consumer then Producer:

```text
Consumer.value = state.Producer
Producer.value = 21
```

the generated body is dependency ordered:

```python
state.Producer__value = 21
state.Producer = make_value(state.Producer__value)
state.Consumer__value = state.Producer
state.Consumer = consume(state.Consumer__value)
```

Moving either card does not change the result. Renaming a referenced section or another generated
target updates resolvable `state.*` references in the same durable project mutation. Unknown
references and dependency cycles remain authored, receive field-level diagnostics, and never turn
into a rejected edit or an application-level error panel.

## Fixed decisions

### 1. Parse Python; do not infer with text heuristics

Use main's tree-sitter-backed expression-reference extractor as the behavioral reference. Add the
exact pinned Go tree-sitter and Python grammar dependencies only after the required candidate
dependency review. Do not use regexes, string splitting, a subprocess Python interpreter, or
Basedpyright text messages to discover dependencies.

The extractor recognizes unshadowed `state.<generated_name>` attribute references. For a longer
chain such as `state.Factory.build`, the dependency is `state.Factory`. It ignores `state` when a
lambda or comprehension binds that name. Empty or syntactically incomplete authored expressions
produce no inferred edge and continue to the existing Basedpyright diagnostic path.

Dynamic access such as `getattr(state, name)` is ordinary Python but cannot declare a static
ordering dependency. Do not invent keyword heuristics for it in this batch.

### 2. Compile one assignment graph

Build the graph from the same validated aggregate and collision-safe path allocation used to
render generated Python. Each emitted assignment is one stable target node:

- callable parameters and callable results;
- dictionary leaves and dictionary composition nodes; and
- list descendants and list composition nodes.

Structural edges preserve existing semantics: a callable depends on its rendered parameters, a
dictionary composition depends on its entries, and a list composition depends on its children.
Parser-discovered edges add dependencies from the expression-owning target to referenced targets.

Resolve references against the complete target-path index after every path has been allocated, so
forward references work. Unknown generated names create no graph edge and are left for
Basedpyright. A reference to a known but currently unrendered target is also unresolved rather than
being replaced with a plausible value.

### 3. Ordering is deterministic and independent of layout

Emit dependencies before their consumers with a stable depth-first topological traversal. Use the
existing forest/post-order sequence as the tie-breaker for unrelated nodes so adding one reference
does not reshuffle unrelated generated code. Deduplicate targets reached through multiple
dependencies.

Visual movement and `TopLevelSectionIDs` still define canvas nesting and the stable unrelated-node
order; they do not override an authored dependency. Re-rendering the same aggregate must remain
byte-identical.

### 4. References follow stable target identity

Generated names are human-readable syntax, while section, parameter, and dictionary-entry IDs are
the durable identity. For every accepted candidate, compare the old and new ID-to-generated-path
indexes before persistence. If a surviving target's path changes, rewrite parser-confirmed
references from its old path to its new path across all authored expression fields in the same
candidate and revision.

This single mechanism covers section renames, editable parameter or dictionary-entry renames,
collision-suffix changes, and list-child reindexing. Deleted targets have no replacement: their
references remain unchanged and become ordinary unknown-symbol diagnostics. Never rewrite text in
strings, comments, shadowed scopes, or unrelated identifiers.

### 5. Dependency failures are field diagnostics

An unknown `state.*` reference continues through generated Python so Basedpyright can report it on
the originating callable/parameter/dictionary field using the existing semantic ranges.

A cycle is a compiler-owned diagnostic because generated assignment order cannot satisfy it.
Publish one concise cycle diagnostic on every authored expression target that contributes a cycle
edge. Preserve the authored project and render a deterministic fallback order so Generated Python
remains inspectable. Do not reject the mutation, disable the section, clear unrelated diagnostics,
or show a giant provider/backend error panel.

Merge compiler diagnostics with Basedpyright diagnostics under the same project revision. Keep IDs
stable for an unchanged cycle and avoid duplicate messages when several traversal roots reach it.

## Architecture changes

### Backend renderer/compiler

- Separate collision-safe target-path allocation, assignment-node construction, dependency
  resolution, stable traversal, and byte emission into small renderer-owned stages.
- Port only main's parser-backed `state` reference extraction behavior needed by the supported
  one-line expressions.
- Keep renderer output authoritative for source ranges and callable call positions after ordering.
- Add compiler diagnostics with exact target IDs without exposing tree-sitter nodes outside the
  compiler boundary.
- Add an atomic old-path/new-path reference rewrite used by every aggregate candidate before it is
  staged and persisted.

### Coordinator and contracts

- Prepare/refactor the whole candidate before rendering, staging, provider synchronization, and
  publication; validation and persistence remain one transaction.
- Merge compiler diagnostics and provider diagnostics without introducing a second frontend error
  model.
- Extend the public snapshot contract only if compiler diagnostics require an explicit origin;
  otherwise preserve the current diagnostic shape.

### Frontend and workspace

No new dependency UI is expected. Existing callable and item diagnostic projection must render
unknown-reference and cycle messages with the same field error state already used for type errors.
No `@setta/workspace` change is expected unless a focused acceptance test proves the existing
generic diagnostic surface cannot represent a compiler diagnostic.

## Acceptance behavior

1. A consumer may visually precede its producer while referencing `state.Producer`; generated
   Python emits the complete producer assignment chain before the consumer and runs successfully.
2. References from callable expressions, callable parameters, and dictionary leaves resolve to
   sections or nested generated parameters independent of forest order.
3. Moving unrelated cards does not alter dependency-correct ordering, and repeated renders are
   byte-identical.
4. Renaming or reindexing a surviving referenced target atomically updates every parser-confirmed
   reference; string literals and shadowed `state` bindings remain untouched.
5. An unknown target persists and shows the existing Basedpyright field error without a lock flash
   or application-level error panel.
6. A direct or multi-node dependency cycle persists and shows stable field-level cycle diagnostics;
   unrelated diagnostics and section geometry do not flicker or reset.
7. List and dictionary structural post-order behavior remains unchanged when no cross-reference is
   present.
8. A raw-headless acceptance flow creates Producer and Consumer in reverse visual order, authors a
   `state.Producer` parameter reference, verifies generated order, renames Producer, and verifies
   the rewritten expression and successful execution. Browser automation must remain headless and
   must not use the user's Chrome profile or keychain.

## Focused verification

- Parser unit tests: forward references, nested attribute chains, lambda/comprehension shadowing,
  incomplete syntax, and exact replacement byte ranges.
- Compiler tests: cross-section and cross-parameter ordering, stable unrelated order, structural
  list/dict ordering, unknown targets, deduplication, and cycles.
- Coordinator tests: rename/reindex rewrite and compiler/provider diagnostic merge remain atomic
  across persistence or provider failure.
- Existing renderer byte-range, callable-signature, collection-layout, and diagnostics tests.
- One production raw-headless acceptance test for the normal forward-reference and rename flow.

Tests must assert generated Python, persisted authored expressions, mapped target IDs, and runtime
behavior. Do not duplicate the parser implementation in test helpers or expand into generalized
Python dataflow analysis.

## Implementation sequence

1. Review and pin the two parser dependencies, then port the narrow parser-backed reference
   extractor with focused tests.
2. Refactor rendering into target-path allocation, assignment graph construction, stable
   dependency traversal, and emission while retaining current source-coordinate behavior.
3. Add atomic path-change reference rewriting to candidate preparation and cover renames/reindexing.
4. Publish cycle diagnostics alongside Basedpyright diagnostics and confirm existing frontend
   projection needs no new styling contract.
5. Add the reverse-order raw-headless acceptance flow, run changed-scope tests, and run the
   policy-selected merge gate.

Stop when the eight acceptance behaviors pass. Do not add ports, edge editing, a generic graph UI,
runtime value propagation, dynamic Python dataflow analysis, project variants, packaging work, or
unrelated source-reconciliation features.

## Completion checklist

- [ ] Exact tree-sitter dependencies reviewed and pinned
- [ ] Parser-backed `state.*` extraction implemented
- [ ] Assignment graph and stable dependency-first emission implemented
- [ ] Unknown targets preserve the existing Basedpyright field diagnostic path
- [ ] Cycles publish stable field-level compiler diagnostics
- [ ] Surviving path changes atomically refactor references
- [ ] Existing generated source ranges and signature refresh remain correct after reordering
- [ ] Focused backend, frontend, and raw-headless acceptance tests pass
- [ ] `code-policy test --changed` passes
- [ ] Policy-selected merge gate passes
