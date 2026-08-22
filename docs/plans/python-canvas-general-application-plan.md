# Python Canvas General Application Plan

## Purpose and status

**Status: proposed for Code Policy plan-loop.**

This is the bounded implementation plan for replacing Python Canvas's fixed,
in-memory V1 Square Root demonstration with a persisted, general-purpose Python
callable authoring application. It owns exactly the Python Canvas backend and
frontend modules plus one launcher, `scripts/run-python-canvas.sh`. The result
is one strict project-file format and one V2 transport contract; it does not
retain a V1 reader, route, fixture, alias, or transitional behavior.

Run the implementation loop only with its two declared modules, one launcher,
and focused verification:

~~~sh
code-policy plan-loop docs/plans/python-canvas-general-application-plan.md \
  --agent-1-model gpt-5.6-terra \
  --agent-1-reasoning-effort max \
  --agent-2-model gpt-5.6-terra \
  --agent-2-reasoning-effort max \
  --module python-canvas-backend \
  --module python-canvas-frontend \
  --allow-path scripts/run-python-canvas.sh \
  --verification focused
~~~

The loop owns only `python-canvas-backend`, `python-canvas-frontend`, and that
one launcher; it does not authorize broader workspace source changes.

Code Policy v0.12.0 is locked on this branch by commit f01bc1d89, and strict
doctor passed for that locked release. A stale label on an external CI runner is
a separately owned external merge prerequisite: before its label is changed in
a separately authorized control-plane change, exact v0.12 runner availability
and the loaded `.code-policy.lock.json` must be evidenced. Never guess that
label or claim CI coverage. This implementation loop does not edit CI,
`.code-policy.json`, `.code-policy.lock.json`, or any other control-plane file.

The current V1 implementation is useful evidence for its narrow seams: Go owns
the canonical response, generated Python, semantic ranges, and the pinned
Basedpyright lifecycle; the frontend projects that response through public
workspace APIs. This plan changes the product model, not that ownership split.

## Authoritative behavior reference

The authoritative behavior anchors are deliberately narrow:

- The accepted parameter-authoring behavior in
  docs/plans/python-canvas-callable-section-presentation-plan.md and
  apps/python-canvas/README.md establishes one complete, revision-bound
  parameter-list mutation per callable, real app-authored rows alongside
  provider-derived rows, and the existing public workspace item-authoring
  interactions. This plan generalizes that accepted behavior to every dynamic
  callable without reopening its broader presentation audit.
- The current Python Canvas implementation and README establish the Go-owned
  snapshot, a generated body placed between authored Python regions, real
  Basedpyright completion and diagnostics, and a frontend that uses only public
  workspace APIs.
- The directly relevant decisions in
  docs/plans/python-canvas-first-vertical-slice-plan.md establish automatic
  regeneration, the pinned language-server boundary, canonical Go state, and
  the generated-document ownership boundary.
- The directly relevant decisions in
  docs/plans/python-canvas-monorepo-plan.md establish strict project-file
  loading, same-filesystem replacement, a pure renderer/source map, and thin
  delivery adapters. Its broader source, execution, CLI, and workspace roadmap
  is not adopted here.
- The directly relevant parameter and accessibility contracts in
  docs/plans/setta-workspace-extraction-plan.md establish whole-request
  validation, one notification, public workspace composition, native controls,
  keyboard behavior, and host-owned domain semantics.
- The clean ../setta-main worktree at commit 043d3b2e9 is read-only behavioral
  evidence only. The only behavior carried forward is the deterministic
  generated module convention: a body inside class SettaState with state
  assignments, plus an editable/default suffix that may instantiate
  SettaState. Do not copy its architecture, data model, source discovery,
  plugins, routes, or broad product surface.

The renderer must therefore retain this shape while generalizing the records
that feed it:

~~~python
class SettaState:
    def __init__(state):
        # deterministic state assignments for the current ordered snapshot
        pass

state = SettaState()
~~~

The constructor contains pass when the project has no rendered assignments. The
suffix remains authored text and may be empty; the blank-project default is
state = SettaState().

## Fixed decisions

### Startup and project lifecycle

- Starting the backend requires --project PATH. The only delivery flags in this
  slice are --project, --create, and the existing loopback-port flag. --project
  is not optional and positional project paths are not accepted.
- The only launcher in scope is `scripts/run-python-canvas.sh`. It requires an
  explicit `--project PATH`, accepts optional `--create`, forwards those exact
  flags to the Go command, and uses only `GET /api/v2/project` as its V2
  readiness/project route. It supplies no implicit project or workspace.
  README instructions and browser process startup use the same explicit
  project lifecycle.
- If the selected project file is absent, startup fails before the service
  accepts requests unless --create is also supplied. With --create, the adapter
  exclusively creates one blank project and refuses to overwrite an existing
  target. With an existing file, --create is an error rather than an
  instruction to reset it.
- A blank project has a newly allocated stable project ID, the documented
  nonempty default name Untitled Python Canvas, revision 1, an empty prefix,
  the default suffix state = SettaState(), and zero callables. It has no Square
  Root record and no hard-coded import math.
- Startup strictly loads or creates the authored aggregate, renders and
  materializes its derived module, then publishes one snapshot. If the pinned
  provider cannot start, the snapshot reports an explicit unavailable provider
  state; mutations and completion queries return a typed provider failure
  rather than an empty successful result until it is ready.
- Restarting with the same existing --project path reloads only authored
  records, rebuilds all derived data, and leaves its persisted revision
  unchanged until a later accepted mutation.

### Canonical authored state

The persisted aggregate is the sole authored model. It contains:

- stable project ID, nonempty project name, and positive revision;
- editable Python prefix and suffix;
- an ordered list of zero or more callable records, each with stable ID,
  editable name, and authored dotted callable expression; and
- for each callable, an ordered list of zero or more parameter records, each
  with stable ID, name, `nameEditable`, passing style, type annotation,
  optional default, immutable nullable `providerOrdinal`, and authored
  expression.

Provider-derived parameters use their provider-owned name, passing style, type
annotation, default, and zero-based normalized-signature `providerOrdinal`,
with `nameEditable=false`. `providerOrdinal` is immutable. A
provider-derived row retained by a complete parameter-list proposal preserves
all of those values. App-authored parameters use stable client-proposed IDs,
`nameEditable=true`, positional-or-keyword passing, editable name and
expression, and `providerOrdinal=null`. They have no fabricated type annotation
or default: their persisted canonical metadata records the absence of
provider-derived type and default information rather than inventing either
value.

Generated Python, generated body boundaries, semantic source ranges,
diagnostics, completion results, Basedpyright document state, and temporary
materialization paths are derived. None is serialized into the authored
project file or accepted as a mutable API input.

Callable expression validation remains intentionally narrow: a nonempty,
dot-separated sequence of Python identifiers. This plan does not expand it to
arbitrary Python expressions. A callable may exist with an empty expression
before it is committed; that is an authored empty section, not an implicit
default callable.

Committing a callable first compares its validated canonical expression with
the stored canonical expression. Recommitting the same canonical expression is
idempotent: it preserves the existing complete parameter list and IDs and does
not publish a semantic change. A changed canonical expression resolves against
Basedpyright and atomically replaces that callable's entire parameter list with
the newly normalized provider signature. That replacement discards every
app-authored row without matching or reconciliation; it is the current desired
behavior, not a compatibility or migration rule.

A set-parameters mutation carries the complete proposed ordered list of
`{ id, name, authoredExpression }` records for one current callable. It may
insert new app-authored records; delete or reorder any current record,
including a provider-derived record; rename only app-authored records; and edit
any record's expression. The aggregate validates the whole proposal once: IDs
are stable, unique, noncolliding, and scoped to that callable; the name of a
retained provider-derived record stays unchanged; and names/expressions meet
their lexical and size bounds. It preserves backend-owned metadata for every
retained record. In particular, a retained provider-derived record must retain
its provider-owned name, passing style, type annotation, default, immutable
`providerOrdinal`, and `nameEditable=false`. Omitting a provider-derived record
deletes it; that is allowed and is not a metadata mutation. The aggregate
creates the canonical app-authored defaults for each new stable client-proposed
ID, including `providerOrdinal=null`. An app-authored name may be blank in
progress; a present name must be a non-keyword Python identifier and unique
within its callable. It accepts no client-supplied passing style, type
annotation, default, `providerOrdinal`, or `nameEditable` override. Empty
authored expressions remain valid in-progress values; an app-authored row
remains persisted and is omitted from the generated call until it has both a
valid name and an expression.

For a candidate's expressed provider-derived positional-only rows, the retained
immutable `providerOrdinal` values must form the leading contiguous prefix
`0..n-1`. A blank or deleted positional-only row is not expressed. If an
expressed row would leave a gap, start after zero, or otherwise violate that
prefix, the candidate is rejected with a typed `validation_failed` error before
rendering. This narrowly prevents deletion, blanks, or UI reordering from
silently binding a value to another positional-only parameter; it does not
restrict the planned ordinary deletion/reorder authoring operations or any
other passing style.

### Rendering and generated module

The renderer consumes one complete validated aggregate snapshot and has no
filesystem, HTTP, process, LSP, or React dependency. It produces byte-stable
complete code, generated-body boundaries, callable-call positions required for
signature help, and semantic source ranges keyed by the dynamic callable and
parameter IDs present in that snapshot.

It renders state assignments in callable order and each callable's parameter
order. It derives collision-safe Python state paths from the current stable IDs
and names; it must not rely on a fixed name, a list index, or a known parameter
position. Renaming changes the rendered path only through this one renderer.

The supported provider passing styles and their exact call syntax are:

| Canonical passing style | Rendered argument |
| --- | --- |
| positional-only | state.<parameter-path> |
| positional-or-keyword | <canonical-name>=state.<parameter-path> |
| keyword-only | <signature-name>=state.<parameter-path> |
| variadic positional | *state.<parameter-path> |
| variadic keyword | **state.<parameter-path> |

For syntactic and positional binding correctness, the renderer emits expressed
provider-derived positional-only arguments first in ascending original
`providerOrdinal` order, regardless of UI reorder. It then emits
variadic-positional arguments, positional-or-keyword and keyword-only arguments
in their relative current parameter-list order, and variadic-keyword arguments
last. Assignment order remains current parameter-list order. The aggregate has
already rejected an expressed positional-only ordinal sequence other than the
leading contiguous prefix from zero. Unknown styles, marker pseudo-parameters,
or an invalid normalized signature fail at the provider/aggregate boundary; the
renderer never guesses another calling convention.

For a provider-derived parameter, the canonical name in that table is its
immutable signature name. For an app-authored parameter, it is that record's
validated editable name; app-authored rows use only positional-or-keyword
passing and are not rendered until their name and expression are both present.

Every accepted mutation rerenders the complete aggregate automatically. The
canonical generated code is one combined Python document: editable prefix,
exactly one renderer-owned protected generated-body range, and editable suffix.
Prefix and suffix remain one expected-revision target mutation. A client may
not alter that protected range, but may author either outer region through the
validated mapped document transaction defined below.

### Revision, validation, and failure rules

Every mutation carries expectedRevision, including rename project, create
callable, rename callable, delete callable, commit callable, set the complete
parameter list, and set target. The coordinator serializes mutations, checks
the expected revision before constructing a candidate, and increments revision
exactly once for an accepted semantic change. Read-only snapshot and completion
queries are not mutations.

Candidate construction is all-or-nothing:

1. Validate the complete request and resolve the named current resource.
2. Clone the aggregate and apply its pure candidate operation. For commit,
   render the candidate signature context and obtain a real normalized
   Basedpyright signature before replacing the parameter collection.
3. Render and validate the complete candidate snapshot and semantic ranges.
4. Stage the generated-materialization and strict authored-project-file bytes,
   atomically install the candidate materialization with a rollback backup,
   synchronize that exact canonical document with the pinned provider, and map
   diagnostics by renderer-owned ranges.
5. Atomically replace the durable project file. If that replacement or either
   required materialization/provider step fails, restore any already replaced
   materialization before returning the typed failure.
6. Publish the new in-memory aggregate and derived snapshot only after both
   replacements and required provider work succeed.

The coordinator owns rollback of an already replaced participant before
returning a failure. Failed validation, provider work, render, materialization,
or persistence leaves the published memory and the project file unchanged. It
also never publishes an empty diagnostic or completion result to stand in for
an unavailable provider.

## Non-goals and forbidden rabbit holes

This is a general callable authoring application, not a route to wholesale main
parity. The implementation must not add or investigate:

- wholesale main parity, main architecture copying, or broad parity auditing;
- source roots, source discovery, file watching, Watch Code, or callable
  reconciliation;
- Python execution, interpreter selection, terminals, PTYs, run history, or
  cancellation;
- ports, edges, connection gestures, values, or graph topology beyond callable
  parameters;
- multi-project management, project discovery, clone/save-as, or a project
  picker; this slice operates only on the one explicit --project path;
- user-facing CLI or MCP product commands; --project/--create are startup
  delivery wiring only;
- authentication, collaboration, WebSockets, server-sent events, deployment,
  packaging, release work, or databases;
- alternate LSPs, fallback servers, language-server plugins, or plugin systems;
- persisted canvas layout, viewport state, or geometry;
- a workspace-core redesign, a second transaction engine, deep imports, or
  workspace package changes unless a concrete public-API blocker is proved;
- legacy readers, migrations, aliases, V1 demo import, dual routes, or any
  transitional compatibility behavior; and
- malformed-input combinatorial auditing beyond strict file, transport, and
  public boundary contracts.

Do not add a Generate Python command, endpoint, or button. Do not add rename
refactoring beyond the one in-place project-name mutation, parameter identity
reconciliation, or any project-management surface beyond that labelled control.

## Ownership and dependency direction

| Concern | Authoritative owner | Consumers and prohibited ownership |
| --- | --- | --- |
| Authored project invariants and candidate construction | Pure Go project aggregate | Takes typed commands and provider-normalized signatures; imports no files, HTTP, LSP, or UI |
| Complete Python rendering and semantic ranges | Pure Go renderer/compiler | Takes an entire validated aggregate; imports no process, adapter, HTTP, or React code |
| Strict project file lifecycle | Narrow Go project-file adapter | Loads, exclusively creates, stages, and same-filesystem replaces only the authored project file |
| Mutation ordering, pinned provider, materialization, persistence, and publication | Go application coordinator | Owns the transaction above and the one real Basedpyright session |
| Basedpyright protocol and path handling | Go LSP adapter | Returns normalized signatures, completions, diagnostics, and typed availability failures |
| HTTP and JSON | Go HTTP adapter | Parses one V2 request, calls the coordinator, and writes one typed result; contains no project rules |
| Wire schema and TypeScript declarations | Go contracts generator | Generates the frontend contract from the single Go V2 contract owner |
| Canvas projection and transient drafts | Python Canvas frontend | Uses public workspace APIs and generated TypeScript; owns no Python semantic model or renderer |
| Layout, section chrome, generic controls, focus machinery | @setta/workspace | Consumed through documented public APIs only |

Dependency direction remains:

~~~text
@setta/workspace
       ^
       | public TypeScript/React APIs only
Python Canvas frontend --> generated V2 contract --> thin HTTP client
                                                    |
                                                    v
                                             HTTP adapter
                                                    |
                                                    v
                                         application coordinator
                                      /          |          \
                          pure aggregate   pure renderer   LSP/file adapters
~~~

No frontend code parses LSP protocol objects, derives Python call syntax, maps
byte ranges heuristically, or keeps a second collection of canonical callable
or parameter records. No backend code imports workspace internals.

Use the project file's parent directory only as the explicit Basedpyright
module-resolution context for that project. It is not a configured source root,
does not trigger discovery, and does not enable watching or reconciliation. The
generated document remains a disposable derived materialization; the
coordinator names and cleans it up rather than adding it to the project file.

## New disk and V2 transport contracts

### Strict on-disk format

The only accepted disk format is a strict JSON document with this exact
top-level shape:

~~~json
{
  "format": "python-canvas-project/v1",
  "project": {
    "id": "opaque stable project id",
    "name": "Untitled Python Canvas",
    "revision": 1
  },
  "pythonTarget": {
    "prefix": "",
    "suffix": "state = SettaState()"
  },
  "callables": [
    {
      "id": "opaque stable callable id",
      "name": "Callable name",
      "authoredExpression": "package.function",
      "parameters": [
        {
          "id": "opaque stable provider-derived parameter id",
          "name": "argument",
          "nameEditable": false,
          "passingStyle": "positional_or_keyword",
          "typeAnnotation": "int",
          "default": null,
          "providerOrdinal": 0,
          "authoredExpression": "42"
        },
        {
          "id": "stable client-proposed app-authored parameter id",
          "name": "scale",
          "nameEditable": true,
          "passingStyle": "positional_or_keyword",
          "typeAnnotation": null,
          "default": null,
          "providerOrdinal": null,
          "authoredExpression": "2"
        }
      ]
    }
  ]
}
~~~

The format field must equal python-canvas-project/v1. Every parameter persists
its canonical ID, name, `nameEditable`, passing style, type annotation, default,
immutable nullable `providerOrdinal`, and authored expression. A
provider-derived record has its nonnegative zero-based normalized-signature
ordinal; an app-authored record has `providerOrdinal=null`. For an app-authored
record, null type/default fields mean that no provider metadata exists; they
are not fabricated hints or values. Decoding rejects unknown fields, missing
fields, wrong JSON types, unsupported passing styles, duplicate stable IDs,
dangling structure, invalid strings at the declared boundaries, incoherent
provider-derived or app-authored metadata (including `providerOrdinal`), and
any derived field. It does not inspect old formats or attempt a best-effort
import.

The project-file adapter parses once at the boundary, validates the whole
document before returning it, creates through an exclusive non-overwrite path,
and replaces through a temporary file in the target directory followed by an
atomic same-filesystem rename. It writes complete bytes, syncs the file before
replacement, and reports a typed persistence failure rather than retaining a
partial file. Tests inject the replace boundary; the implementation does not
grow a general filesystem abstraction.

### V2 snapshot and errors

Go replaces the V1 contracts package contents with a single V2 contract and
regenerates TypeScript from it. The V2 snapshot has:

- version: "v2";
- project { id, name, revision };
- pythonTarget { prefix, suffix };
- callables: CallableV2[], where every callable embeds its ordered
  ParameterV2[] records. Each ParameterV2 includes id, name, `nameEditable`,
  passingStyle, typeAnnotation, default, immutable nullable `providerOrdinal`,
  and authoredExpression; clients never infer provider ownership from an ID,
  blank name, or position;
- generatedCode { code, body, exactly one protected generated-body range,
  sourceRangesByTargetId };
- diagnostics keyed to a dynamic target ID when a range intersects one; and
- explicit Basedpyright provider status.

sourceRangesByTargetId is a map whose keys are the current dynamic callable or
parameter IDs, never section ordinals. Each range remains a UTF-8 byte range in
generatedCode.code. The frontend converts byte coordinates only at its
code-surface projection boundary.

Every error response is a closed V2 error object. Its discriminator includes at
least revision_conflict, validation_failed, not_found, invalid_request,
provider_unavailable, provider_failed, render_failed, materialization_failed,
persistence_failed, method_not_allowed, and internal. A revision conflict also
contains expectedRevision and currentRevision. The HTTP status maps the typed
failure consistently, but frontend behavior keys off the generated error code,
not a message substring.

### V2 routes

All successful mutations return the complete canonical ProjectSnapshotV2. There
is no V1 route alias.

| Method and path | Request responsibility |
| --- | --- |
| GET /api/v2/project | Return the current canonical snapshot; this is the launcher's sole V2 readiness/project route |
| POST /api/v2/project/rename | Rename the one current project from projectId, expectedRevision, and a nonempty name |
| POST /api/v2/project/callables | Create one callable from projectId, expectedRevision, and a nonempty name |
| POST /api/v2/project/callables/{callableId}/rename | Rename that callable from projectId, expectedRevision, and name |
| POST /api/v2/project/callables/{callableId}/delete | Delete that callable from projectId and expectedRevision |
| POST /api/v2/project/callables/{callableId}/commit | Commit authoredExpression; a changed canonical expression replaces the entire list from its provider signature, while the same canonical expression preserves it; carries projectId and expectedRevision |
| POST /api/v2/project/callables/{callableId}/parameters | Set one complete ordered list of `{ id, name, authoredExpression }` records; carries projectId and expectedRevision |
| POST /api/v2/project/target | Set prefix and suffix together; carries projectId and expectedRevision |
| POST /api/v2/project/callables/{callableId}/completions | Read-only callable completion for its draft and UTF-16 cursor |
| POST /api/v2/project/target/completions | Read-only completion only for a validated mapped editable outer region of the combined target document, using the complete target draft and UTF-16 cursor |

The HTTP adapter validates route IDs, exact JSON keys, content type, body size,
and request shape before calling the coordinator. It does not perform aggregate
validation, synthesize defaults, hide provider errors, or choose a callable by
array position.

## Mutation transaction

The coordinator exposes exactly these aggregate commands:

| Command | Candidate effect |
| --- | --- |
| Rename project | Validate and replace the current project's nonempty name, rerender, persist, and publish |
| Create callable | Allocate one callable ID, add an empty expression and zero parameters in ordered position, render, persist, and publish |
| Rename callable | Keep its ID and nested parameters, validate the new nonempty name, rerender, persist, and publish |
| Delete callable | Remove only that callable and its nested parameters, rerender the remaining aggregate, persist, and publish |
| Commit callable | If its canonical expression is unchanged, preserve the current parameter list without a new semantic publication; otherwise resolve the changed expression in the candidate target context, replace the full list with provider-derived records carrying zero-based normalized-signature `providerOrdinal` values, discard app-authored records without reconciliation, rerender, persist, and publish |
| Set parameters | Validate and replace one complete ordered `{ id, name, authoredExpression }` list: allow new app-authored records, deletion or reordering of any current record including provider-derived records, renaming only app-authored records, and expression edits to any record; each retained provider-derived record preserves its provider-owned name, passing style, type/default, immutable `providerOrdinal`, and `nameEditable=false`, while its deletion is allowed and is not a metadata mutation; create canonical app-authored defaults with `providerOrdinal=null` for new client-proposed IDs; reject a non-leading/noncontiguous expressed positional-only ordinal prefix with typed validation; rerender, persist, and publish once |
| Set target | Validate and replace prefix and suffix together, rerender, persist, and publish |

For a changed commit, the coordinator creates a temporary complete candidate
module from the current prefix, generated body, and suffix, asks the real
pinned Basedpyright session for signature help at the renderer-provided call
position, and normalizes zero or more provider-derived parameters. It accepts
only the five stated passing-style values and assigns each provider-derived row
its zero-based normalized-signature `providerOrdinal`. It never hard-codes
math, assumes a parameter count, or uses a default callable.

For all commands, generated diagnostics are derived from the exact candidate
materialization. The LSP adapter converts provider positions at its boundary,
and the coordinator maps them by overlap with
sourceRangesByTargetId. A targetless diagnostic remains a document diagnostic.
An unavailable session, missing signature, failed completion, malformed
provider result, or failed document synchronization is explicit; no empty
completion list or cleared diagnostics substitutes for it.

All command paths use the same staged transaction. A failed command does not
advance revision, change the canonical in-memory snapshot, overwrite the
project file, or replace the published materialization. The coordinator returns
the appropriate typed V2 failure and retains the prior snapshot for a GET.

## UI behavior

The frontend projects each V2 snapshot into transient workspace sections using
public APIs. It computes deterministic placement from current callable order
and the combined-document surface, but does not serialize positions, viewport,
section size, or any other layout state. Reloading deliberately recalculates
that layout from the snapshot.

### Project name, empty state, and callable sections

- The frontend presents one labelled Project name control for the current
  project. Its controlled draft sends the expected-revision project-rename
  mutation, reflects the canonical response or conflict, and neither selects,
  discovers, clones, nor saves another project.
- A project with no callables renders an explanatory empty state: callables are
  Python functions or methods that Python Canvas can call after their signature
  is resolved. It includes an accessible native Add callable button.
- Add callable opens and focuses a labelled native callable-name input and its
  native submit button. The action creates one canonical callable only after
  the user supplies a name. Keyboard users can complete or cancel the flow
  without pointer-only behavior.
- Each dynamic callable card is keyed by callable ID, not a fixed section ID or
  array index. It contains labelled native inputs for the callable name and
  expression; independent Rename callable, Commit callable, and explicitly
  labelled Delete callable <name> buttons; its own completion popup; and its
  dynamic parameter rows.
- Each callable projects its canonical parameter list directly into the existing
  public workspace item tree. Its `authoring-and-filter` surface provides Add,
  Remove Last, Delete Selected, drag reorder, filtering, and item actions per
  callable; each action proposes the resulting complete ordered list rather
  than a second frontend parameter model. Add creates a new app-authored row
  and assigns its stable client-proposed ID before that list is sent. Removal
  and drag-reorder actions apply to any current row, including a
  provider-derived row; only app-authored rows are renameable.
- A provider-derived parameter renders its immutable signature name and its
  `nameEditable=false` and `providerOrdinal` metadata; passing style, type, and
  default remain provider-owned read-only context where helpful, while its
  authored expression remains editable. It may nevertheless be deleted or
  reordered in the complete proposal. An app-authored parameter renders the existing workspace
  `ItemNameEditor` with `nameEditable=true` and an editable expression. It
  shows no fabricated type/default metadata and has `providerOrdinal=null`. The
  frontend never infers either row kind or a provider ordinal from an ID, blank
  name, or UI position.
- Each callable has its own draft, completion request/cancellation state,
  pending state, validation/provider error, and diagnostic presentation. Use a
  map keyed by callable ID, never one shared callable draft or one
  callables[0]-derived controller. A response for callable A cannot overwrite
  an uncommitted expression draft for callable B.

The client serializes mutation requests against its latest canonical revision
to avoid self-inflicted stale writes. A server revision conflict refreshes the
canonical snapshot, announces the conflict, and keeps the affected local draft
visible for deliberate retry rather than silently overwriting it.

### Combined target document and generated body

- The target is one canonical combined Python document, not separate prefix and
  suffix textareas: editable prefix, exactly one protected generated-body range,
  and editable suffix. The frontend renders it with the documented public
  workspace generated-document behavior.
- That public behavior atomically rejects a transaction that touches the
  protected range, including a replacement spanning an outer region and that
  range, and maps every accepted outer edit to its updated document offsets.
  The frontend validates those mapped offsets against the canonical document,
  splits only at the validated mapped body boundaries, and sends the resulting
  prefix and suffix together in one debounced expected-revision target mutation.
- Target completion is available only at a validated mapped offset in an editable
  outer region. It uses the complete combined target draft and renderer-owned
  generated context; completion never targets the protected body.
- Every accepted snapshot automatically redraws the combined document. The
  frontend neither reconstructs Python rendering nor guesses body boundaries:
  it projects the canonical renderer output and uses only validated mapped
  offsets for outer edits.

### Accessibility and responsive behavior

Use native buttons and inputs for app-owned controls, the documented public
workspace controls for parameter items, and its generated-document behavior for
the target. Every input, including Project name and each app-authored
`ItemNameEditor`, has an associated label; buttons have action-specific names;
destructive controls say Delete callable rather than relying on an icon; and all
custom completion and status behavior is keyboard complete. Visible focus uses
focus-visible styling, errors have a programmatic relationship to their control, and
pending/success/conflict/provider status is announced through a polite live
region without repeatedly interrupting input.

Cards and target controls use fluid grid/flex layouts with min-inline-size: 0,
wrapping labels, and no page-level horizontal overflow at narrow widths.
Canvas panning remains a workspace interaction, but the page itself must reflow
rather than require horizontal scrolling.

## Phased coherent implementation batches

### Phase A — private aggregate, file format, and general renderer

1. Replace singleton assumptions in a new pure aggregate boundary: dynamic
   stable IDs, ordered nested callable/parameter records with persisted
   `nameEditable`, immutable nullable `providerOrdinal`, and
   provider/app-authored metadata; expected-revision candidate commands
   including project rename and complete parameter lists; positional-only
   leading-contiguous-prefix validation; and no Square Root bootstrap/default
   import.
2. Add the strict python-canvas-project/v1 codec and narrow project-file
   adapter with exclusive create, full load validation, staged same-filesystem
   replacement, persisted `providerOrdinal` validation, and temporary-state
   tests.
3. Generalize the pure renderer to consume a whole validated snapshot, emit the
   SettaState body for zero to many callables, render all five supported passing
   styles, render expressed positional-only arguments in original
   `providerOrdinal` order, and return dynamic semantic range maps.
4. Keep this replacement private during the batch. Do not expose V2 routes or
   TypeScript beside V1 and do not forward V1 routes through V2 code.

### Phase B — durable coordinator and pinned provider boundary

1. Build the application coordinator around the private aggregate, renderer,
   project-file adapter, materializer, and existing pinned Basedpyright session.
2. Change signature normalization from V1's exact-one positional restriction to
   zero to many provider-derived records across the five declared styles. A
   changed callable expression assigns every provider-derived row its zero-based
   normalized-signature `providerOrdinal`, replaces the whole list, and discards
   app-authored rows; recommitting the same canonical expression is idempotent
   and preserves the list. Keep completion and diagnostics normalized at the
   LSP boundary.
3. Implement staged candidate materialization, exact diagnostic mapping, durable
   file replacement/rollback, project rename, complete parameter-list
   validation and canonical defaults, the positional-only ordinal-prefix
   validation failure, and typed validation/provider/render/materialization/
   persistence failures.
4. Exercise the private load-or-create lifecycle with temporary state, including
   required project-path validation and create/load/refuse-overwrite behavior.
   Keep command wiring on the V1 side untouched until the Phase C cutover; do
   not retain V1 startup bootstrap behavior as a compatibility path.

### Phase C — one atomic public V2 cutover

This is the only public contract cutover. Land it as one coherent candidate:

1. Replace Go V1 contracts, routes, handlers, generated artifacts, schema
   fixtures, and HTTP tests with the V2 snapshot, including the project-rename
   route, immutable nullable `providerOrdinal`, complete parameter-list request
   shape, requests, errors, and exact V2 paths above.
2. Wire the command and `scripts/run-python-canvas.sh` to load/create the
   selected project and serve the V2 coordinator. The launcher requires
   explicit `--project PATH`, accepts optional `--create`, forwards both to the
   Go command, and uses only `GET /api/v2/project` for readiness. Remove
   InitialProjectSnapshot, BootstrapShippedExample, Square Root IDs, V1 route
   constants, fixed default import math, every exact-one validation branch, and
   V1 or implicit-project launcher behavior.
3. Regenerate TypeScript from Go, replace the V1 runtime decoder/client with
   strict V2 versions, and make any V1 payload or route absent/rejected rather
   than tolerated.
4. Replace the fixed frontend projection with a labelled project-name control,
   dynamic callable-ID-keyed sections, independent drafts, complete parameter
   lists with app-authored ItemNameEditor/Add, all-row Remove Last/Delete
   Selected/drag reorder, filtering/item actions, and one combined target
   document with a protected generated-body range, mapped outer edits, and
   outer-only completion. Use public workspace APIs only.
5. Replace README startup instructions, browser process setup, browser
   walkthroughs, and test fixtures in the same candidate so they all require
   the same explicit `--project PATH` lifecycle with optional `--create`, and
   the checked-in product contains no demo-only or V1 public surface.

No commit in this phase may expose a V2 endpoint while preserving V1 endpoints,
or expose a frontend that still relies on fixed callable IDs, callables[0], or
Square Root bootstrap data. The launcher is the only explicitly allowed
non-module path in this cutover; no broader workspace source change is
authorized.

### Phase D — acceptance evidence and removal audit

1. Complete focused backend, contract, HTTP, runtime-decoder, client, and
   frontend evidence from the matrix below. Implement or update the production
   browser walkthrough artifact, but do not execute `python-canvas-browser` in
   this loop; it is a standard suite whose execution follows the
   post-implementation `code-policy test-levels` choice. Use temporary projects
   and fixture modules, not the historical Square Root demo.
2. Make provider-unavailable, revision-conflict, pending, validation, and
   persistence failure presentation explicit and accessible.
3. Audit production sources, generated contract output, README, browser
   scripts, the launcher, fixtures, and tests for V1/fixed-demo terminology,
   implicit project startup, split-target editing, and legacy readiness
   behavior. Remove the source rather than hiding it behind compatibility
   branches.
4. If public workspace APIs cannot support the dynamic accessible projection,
   stop with the concrete missing API and affected UI behavior. Do not redesign
   workspace-core or change package/workspace configuration speculatively.

### Phase E — focused verification closeout

1. Run the focused module suites and changed-file selection listed below in the
   plan-loop.
2. Review the exact V2 candidate against the acceptance matrix and removal
   checklist before declaring the plan complete.
3. After promotion, the caller runs `code-policy test-levels --base main` and
   presents its exact recommended and full ordinary choices before any broader
   suite, including `python-canvas-browser`, runs. The plan-loop does not run,
   request, or imply authorization for recommended, full, verify, gate,
   merge-gate, test --all, or supplemental suites.

## Exact acceptance matrix

| Area | Required observable evidence |
| --- | --- |
| Project lifecycle | Temporary-state tests cover missing --project, missing file without --create, exclusive create, refuse-overwrite, strict load, invalid format/field rejection, and same-filesystem atomic-write rollback. Launcher tests prove `scripts/run-python-canvas.sh` requires `--project PATH`, forwards optional `--create` to the Go command, and uses only `GET /api/v2/project` for readiness. README and browser process startup evidence use that same explicit lifecycle. They prove an expected-revision project rename persists across restart without adding project discovery, clone/save-as, or derived fields to the file. |
| Aggregate | Focused project tests cover blank zero-callable state, project/callable create/rename/delete behavior by dynamic ID, independent commits of two callables, stale expectedRevision, and no fixed Square Root/math assumptions. They prove a changed commit replaces the complete list from its provider signature with zero-based `providerOrdinal` values and discards app-authored rows without reconciliation, while a same-canonical-expression recommit preserves the existing list and IDs. They cover one atomic parameter-list candidate that inserts, renames, deletes, and reorders app-authored rows; deletes and reorders a provider-derived row; edits any row's expression; preserves each retained provider-derived row's provider-owned name, passing style, type/default, immutable `providerOrdinal`, and `nameEditable=false`; and creates canonical defaults including `providerOrdinal=null` for stable client-proposed IDs. They also prove an expressed positional-only gap caused by deletion or a blank, or a sequence starting after zero, is a typed validation failure while ordinary deletion/reorder remains available. |
| Renderer | Focused renderer tests cover an empty SettaState body, two callables, multiple and zero parameters, provider-derived and app-authored rows, every supported passing style, deletion, byte-stable output, and sourceRangesByTargetId for dynamic callable/parameter IDs. They assert a default suffix can instantiate SettaState, a blank project has no hard-coded math import, app-authored positional-or-keyword rows use their validated editable names without fabricated type/default metadata, and expressed positional-only arguments render in original `providerOrdinal` order after UI reorder. |
| File/coordinator transaction | Failure-injection tests prove validation, provider, render, materialization, and persistence failures leave the published snapshot and project file unchanged for rename project, callable, complete parameter-list, and target mutations. Success increments revision once, writes only canonical authored state including `nameEditable`, immutable nullable `providerOrdinal`, and all other parameter metadata, regenerates code automatically, and maps candidate diagnostics after publication. |
| Basedpyright integration | A real executable resolved from the pinned app dependency resolves at least two fixture-module signatures, including a zero-parameter callable and a multi-parameter callable covering all passing styles. It proves callable and target completion, diagnostic-to-dynamic-ID mapping, correct target context, and explicit unavailable behavior without an empty fallback. |
| V2 transport | Go contract generation and drift tests produce only V2 artifacts. Contract, HTTP, runtime-decoder, and client tests accept valid V2 snapshots/errors, reject V1 and unknown shapes, require expectedRevision on every mutation including project rename, verify the `{ id, name, authoredExpression }` parameter-list request and persisted `nameEditable` plus immutable nullable `providerOrdinal` metadata, verify typed conflicts/failures including the positional-only prefix violation, and prove /api/v1 paths are absent. |
| Frontend projection | Component tests cover the labelled project-name control and conflict recovery, explanatory empty state, Add callable, rename, delete, multiple dynamically rendered sections, zero/arbitrary provider-derived and app-authored parameter rows, independent callable drafts, app-authored parameter insert/rename/delete/reorder, provider-derived parameter deletion and reorder, per-callable Add/Remove Last/Delete Selected/drag reorder/filtering/item actions and ItemNameEditor behavior, completion isolation, and one canonical combined target document. They prove the public generated-document behavior atomically rejects a transaction touching the one protected body range, maps accepted outer edits, validates mapped offsets before splitting only there, sends prefix and suffix together, and permits completion only in outer regions; they also cover revision conflicts, pending/error handling, and callable/parameter/document diagnostics. |
| Accessibility and reflow | Component or browser assertions verify labels including Project name and app-authored parameter names, native and public-workspace controls, visible focus, keyboard project/callable/parameter add/rename/commit/delete/completion flows, keyboard outer-document editing without access to the protected body, explicit destructive labels, polite announcements, errors associated with controls, and no page-level horizontal scroll at a narrow viewport. |
| Production browser walkthrough | The required checked-in walkthrough specification is: start through `scripts/run-python-canvas.sh` against a temporary absent project with explicit --project and --create plus a temporary fixture module, and observe readiness only through `GET /api/v2/project`. Rename the project, create and commit multiple callables, prove app-authored parameter insert/rename/delete/reorder through Add, Remove Last, Delete Selected, drag reorder, filtering, item actions, and ItemNameEditor, delete and drag-reorder a provider-derived parameter, edit expressions for provider-derived and app-authored parameters and the two outer regions of the one target document, prove a protected-body transaction is rejected, observe outer-only completion and diagnostics, delete one callable, stop and restart the backend through the launcher with the same explicit --project and without --create, and prove the project file restores the renamed project, remaining callables, canonical parameter metadata, and byte-identical generated code. Its execution evidence is pending the later post-loop authorization for the standard `python-canvas-browser` suite. |

## Removal checklist

- [ ] Remove V1 Go contracts, V1 generated fixture, V1 contract generator
      names, V1 HTTP routes, and V1 handler payloads/error vocabulary.
- [ ] Remove the in-memory InitialProjectSnapshot and
      BootstrapShippedExample path, all Square Root constants, and every
      hard-coded math import/default callable.
- [ ] Remove singleton canonical state, exact-one callable/signature checks,
      fixed parameter slots, fixed source ranges, and callables[0] selection
      from project, renderer, provider, and HTTP code.
- [ ] Remove parameter-expression-only routes, request types, and provider-only
      membership assumptions. Remove client inference of parameter ownership and
      any UI that withholds Add, Remove Last, Delete Selected, drag reorder,
      filtering, item actions, or ItemNameEditor from dynamic callable lists.
- [ ] Remove fixed/non-configurable project-name handling. Keep only the one
      expected-revision V2 project-rename route and labelled in-place control;
      do not replace it with project discovery, clone/save-as, or multi-project
      management.
- [ ] Remove V1 or implicit-project behavior from
      `scripts/run-python-canvas.sh`, README startup instructions, and browser
      process startup. Keep only explicit `--project PATH`, optional `--create`
      forwarding to the Go command, and the sole V2 readiness/project route
      `GET /api/v2/project`.
- [ ] Remove V1 generatedContract.ts, V1 runtime parser, V1 client route
      constants, V1 decoder aliases, and fixed frontend callable/parameter
      IDs. Regenerate only V2 TypeScript.
- [ ] Remove the fixed callable workspace projection, shared callable draft,
      fixed parameter root assumptions, V1 x/y canvas placement constants, and
      any UI list-position selection. Derive transient placement only from the
      current dynamic callable collection.
- [ ] Remove separate prefix/suffix target textareas, any standalone
      generated-document surface disconnected from editable outer regions,
      guessed body boundaries, and any direct generated-body mutation path.
      Keep only one public-workspace combined document with exactly one
      protected body range, atomic transaction rejection, validated mapped
      outer edits, and outer-only completion.
- [ ] Replace browser scripts, fixtures, README prose, and tests that mention
      /api/v1, V1, Square Root, math.sqrt bootstrap, a single callable, or a
      one-parameter assumption; remove any CI-coverage claim or guessed stale
      runner label from this implementation loop.
- [ ] Confirm no production Python Canvas source uses a legacy reader,
      migration, compatibility endpoint, V1 fallback, or a silent
      provider-unavailable empty result.

## Verification commands

The plan-loop invocation at the top selects focused verification only. Near
completion, run the declared focused module suites and the changed-file
selection in the same task-session worktree:

~~~sh
code-policy test --module python-canvas-backend
code-policy test --module python-canvas-frontend
code-policy test --changed
~~~

Use focused tests during the phases for the relevant owning boundary. Do not
authorize or run recommended/full profiles, test --all, verify, gate,
merge-gate, supplemental suites, or a dependency review unless a separately
authorized dependency change becomes necessary. This plan contains no package,
workspace, or dependency change; a concrete public-API blocker must be
reported before any such expansion.

## Completion criteria

This plan is complete only when:

1. The backend and `scripts/run-python-canvas.sh` require explicit `--project
   PATH`; the launcher optionally forwards `--create` to the Go command and
   uses only `GET /api/v2/project` for readiness. The backend implements
   exclusive --create, persists exactly one strict python-canvas-project/v1
   authored document, and renames that project's nonempty name only through the
   expected-revision V2 mutation. README and browser process startup follow the
   same lifecycle.
2. A blank project is truly empty of callables and hard-coded math, while its
   renderer preserves the SettaState body/default suffix convention.
3. The pure aggregate, pure renderer, file adapter, application coordinator,
   LSP adapter, HTTP adapter, Go contract generator, and frontend have the
   ownership boundaries stated above.
4. All mutable behavior — project rename, callable changes, complete parameter
   lists, and target edits — is V2, expected-revision-bound, automatically
   regenerated where relevant, durable, and all-or-nothing with typed failures.
   Target editing is one canonical combined document with editable outer
   regions around exactly one protected generated-body range; public workspace
   transactions touching that range are atomically rejected, accepted outer
   edits split only at validated mapped offsets, and both prefix and suffix are
   sent together.
5. The application supports zero to many callables and parameters without
   fixed IDs, positions, Square Root data, or callables[0] anywhere in product
   code.
6. A complete parameter-list proposal may insert new app-authored rows, delete
   or reorder any current row including provider-derived rows, rename only
   app-authored rows, and edit any row's authored expression. A retained
   provider-derived row preserves its provider-owned name, passing style,
   type/default, immutable zero-based normalized-signature `providerOrdinal`,
   and `nameEditable=false`; deleting it is allowed and is not a metadata
   mutation. App-authored parameters persist stable client-proposed IDs,
   `nameEditable=true`, positional-or-keyword passing, editable
   name/expression, `providerOrdinal=null`, and no fabricated type/default
   metadata. Expressed positional-only rows render in original
   `providerOrdinal` order and a non-leading/noncontiguous ordinal prefix is a
   typed validation failure.
7. A changed callable commit replaces its complete parameter list from the
   provider signature and discards app-authored rows without reconciliation; a
   same-canonical-expression recommit is idempotent and preserves that list.
8. The frontend provides an accessible, responsive labelled project-name and
   empty-to-many-callables authoring flow with independent drafts, per-callable
   public-workspace parameter authoring, and one editable-outer/protected-body
   canonical target document with outer-only completion.
9. Focused verification passes, and the production browser walkthrough is
   checked in and ready; its execution evidence is post-loop, after later
   authorization for the standard suite.
10. V1 is absent rather than supported, the removal checklist is complete, and
   no forbidden scope or control-plane change was introduced. Exact v0.12
   runner availability and the loaded lock remain separately evidenced merge
   prerequisites before any separately authorized CI label change; this loop
   makes no CI coverage claim.
