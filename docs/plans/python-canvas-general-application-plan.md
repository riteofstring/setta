# Python Canvas General Application Plan

## Purpose and status

**Status: proposed for Code Policy plan-loop.**

This is the bounded implementation plan for replacing Python Canvas's fixed,
in-memory V1 Square Root demonstration with a persisted, general-purpose Python
callable authoring application. It owns exactly the Python Canvas backend and
frontend modules. The result is one strict project-file format and one V2
transport contract; it does not retain a V1 reader, route, fixture, alias, or
transitional behavior.

Run the implementation loop only with its two declared modules and focused
verification:

~~~sh
code-policy plan-loop docs/plans/python-canvas-general-application-plan.md \
  --module python-canvas-backend \
  --module python-canvas-frontend \
  --verification focused
~~~

Code Policy v0.12.0 is locked on this branch by commit f01bc1d89, and strict
doctor passed for that locked release. A stale label on an external CI runner is
a separately validated external concern. It is not a reason to modify
.code-policy.json, .code-policy.lock.json, CI control-plane files, or any
other module in this loop.

The current V1 implementation is useful evidence for its narrow seams: Go owns
the canonical response, generated Python, semantic ranges, and the pinned
Basedpyright lifecycle; the frontend projects that response through public
workspace APIs. This plan changes the product model, not that ownership split.

## Authoritative behavior reference

The authoritative behavior anchors are deliberately narrow:

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
- for each callable, an ordered list of zero or more signature-derived
  parameter records with stable ID, signature name, passing style, type
  annotation, optional default, and authored expression.

Generated Python, generated body boundaries, semantic source ranges,
diagnostics, completion results, Basedpyright document state, and temporary
materialization paths are derived. None is serialized into the authored
project file or accepted as a mutable API input.

Callable expression validation remains intentionally narrow: a nonempty,
dot-separated sequence of Python identifiers. This plan does not expand it to
arbitrary Python expressions. A callable may exist with an empty expression
before it is committed; that is an authored empty section, not an implicit
default callable.

Only a callable commit creates or replaces parameter membership. A commit
resolves the current expression against Basedpyright and atomically replaces
that callable's entire parameter collection with freshly allocated
signature-derived IDs. It does so even when a user recommits the same
expression. There is no parameter identity migration, matching, preservation,
or reconciliation across commits.

A set-parameters mutation carries the complete ordered expression list for one
current callable. Its IDs and order must exactly match that callable's current
signature-derived collection; it changes authored expressions only. It cannot
add, rename, reorder, or delete parameters. Empty authored expressions remain
valid in-progress values and are omitted from the generated call, allowing the
provider to report a real missing-argument diagnostic where applicable.

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

| Signature passing style | Rendered argument |
| --- | --- |
| positional-only | state.<parameter-path> |
| positional-or-keyword | <signature-name>=state.<parameter-path> |
| keyword-only | <signature-name>=state.<parameter-path> |
| variadic positional | *state.<parameter-path> |
| variadic keyword | **state.<parameter-path> |

For syntactic validity, the renderer emits positional-only arguments first,
then variadic-positional arguments, then positional-or-keyword and keyword-only
arguments in their relative signature order, and variadic-keyword arguments
last. Assignment order remains the original parameter order. Unknown styles,
marker pseudo-parameters, or an invalid normalized signature fail at the
provider/aggregate boundary; the renderer never guesses another calling
convention.

Every accepted mutation rerenders the complete aggregate automatically. Prefix
and suffix are one expected-revision target mutation. The generated body is
never writable by a client and is shown as read-only UI output.

### Revision, validation, and failure rules

Every mutation carries expectedRevision, including create callable, rename
callable, delete callable, commit callable, set parameter expressions, and set
target. The coordinator serializes mutations, checks the expected revision
before constructing a candidate, and increments revision exactly once for an
accepted semantic change. Read-only snapshot and completion queries are not
mutations.

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

Do not add a Generate Python command, endpoint, or button. Do not add a
project-name editor, rename refactoring, parameter identity reconciliation, or
hand-authored parameter metadata in this plan.

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
          "id": "opaque stable parameter id",
          "name": "argument",
          "passingStyle": "positional_or_keyword",
          "typeAnnotation": "int",
          "default": null,
          "authoredExpression": "42"
        }
      ]
    }
  ]
}
~~~

The format field must equal python-canvas-project/v1. Decoding rejects unknown
fields, missing fields, wrong JSON types, unsupported passing styles, duplicate
stable IDs, dangling structure, invalid strings at the declared boundaries, and
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
  ParameterV2[] records;
- generatedCode { code, body, body boundaries, sourceRangesByTargetId };
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
| GET /api/v2/project | Return the current canonical snapshot |
| POST /api/v2/project/callables | Create one callable from projectId, expectedRevision, and a nonempty name |
| POST /api/v2/project/callables/{callableId}/rename | Rename that callable from projectId, expectedRevision, and name |
| POST /api/v2/project/callables/{callableId}/delete | Delete that callable from projectId and expectedRevision |
| POST /api/v2/project/callables/{callableId}/commit | Resolve authoredExpression and replace that callable's signature-derived parameters; carries projectId and expectedRevision |
| POST /api/v2/project/callables/{callableId}/parameters | Set one complete ordered list of { id, authoredExpression } records; carries projectId and expectedRevision |
| POST /api/v2/project/target | Set prefix and suffix together; carries projectId and expectedRevision |
| POST /api/v2/project/callables/{callableId}/completions | Read-only callable completion for its draft and UTF-16 cursor |
| POST /api/v2/project/target/completions | Read-only prefix or suffix completion using the complete target draft and UTF-16 cursor |

The HTTP adapter validates route IDs, exact JSON keys, content type, body size,
and request shape before calling the coordinator. It does not perform aggregate
validation, synthesize defaults, hide provider errors, or choose a callable by
array position.

## Mutation transaction

The coordinator exposes exactly these aggregate commands:

| Command | Candidate effect |
| --- | --- |
| Create callable | Allocate one callable ID, add an empty expression and zero parameters in ordered position, render, persist, and publish |
| Rename callable | Keep its ID and nested parameters, validate the new nonempty name, rerender, persist, and publish |
| Delete callable | Remove only that callable and its nested parameters, rerender the remaining aggregate, persist, and publish |
| Commit callable | Validate its dotted expression, resolve its signature with the pinned provider in the candidate target context, allocate a fresh full parameter collection, rerender, persist, and publish |
| Set parameters | Require the current callable's exact parameter IDs and order, replace authored expressions as one list, rerender, persist, and publish |
| Set target | Validate and replace prefix and suffix together, rerender, persist, and publish |

For commit, the coordinator creates a temporary complete candidate module from
the current prefix, generated body, and suffix, asks the real pinned
Basedpyright session for signature help at the renderer-provided call position,
and normalizes zero or more parameters. It accepts only the five stated
passing-style values. It never hard-codes math, assumes a parameter count, or
uses a default callable.

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
and the generated-code surface, but does not serialize positions, viewport,
section size, or any other layout state. Reloading deliberately recalculates
that layout from the snapshot.

### Empty and callable sections

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
- A parameter row exposes its signature name, passing-style information where
  helpful, type/default metadata as read-only context, and a labelled native
  expression input. The frontend does not let a user rename a signature-derived
  parameter or create a second parameter model.
- Each callable has its own draft, completion request/cancellation state,
  pending state, validation/provider error, and diagnostic presentation. Use a
  map keyed by callable ID, never one shared callable draft or one
  callables[0]-derived controller. A response for callable A cannot overwrite
  an uncommitted expression draft for callable B.

The client serializes mutation requests against its latest canonical revision
to avoid self-inflicted stale writes. A server revision conflict refreshes the
canonical snapshot, announces the conflict, and keeps the affected local draft
visible for deliberate retry rather than silently overwriting it.

### Target and generated code

- Prefix and suffix have separate visible labels and editable native multiline
  controls. Their controller sends both values in one debounced,
  expected-revision target mutation.
- Prefix and suffix completion calls receive the complete target draft and
  renderer-owned generated context; completion never targets the generated
  body.
- The generated-code surface is read-only and copyable. It displays the
  canonical complete generated code and makes the generated body distinction
  clear without accepting text, paste, cut, or selection replacement as an
  authored mutation.
- Every accepted snapshot automatically redraws this surface. The frontend
  never joins prefix, body, or suffix by reproducing Python rendering rules; it
  verifies and projects the canonical renderer output.

### Accessibility and responsive behavior

Use native buttons, inputs, and textareas for app-owned controls. Every input
has an associated label; buttons have action-specific names; destructive
controls say Delete callable rather than relying on an icon; and all custom
completion and status behavior is keyboard complete. Visible focus uses
focus-visible styling, errors have a programmatic relationship to their
control, and pending/success/conflict/provider status is announced through a
polite live region without repeatedly interrupting input.

Cards and target controls use fluid grid/flex layouts with min-inline-size: 0,
wrapping labels, and no page-level horizontal overflow at narrow widths.
Canvas panning remains a workspace interaction, but the page itself must reflow
rather than require horizontal scrolling.

## Phased coherent implementation batches

### Phase A — private aggregate, file format, and general renderer

1. Replace singleton assumptions in a new pure aggregate boundary: dynamic
   stable IDs, ordered nested callable/parameter records, expected-revision
   candidate commands, and no Square Root bootstrap/default import.
2. Add the strict python-canvas-project/v1 codec and narrow project-file
   adapter with exclusive create, full load validation, staged same-filesystem
   replacement, and temporary-state tests.
3. Generalize the pure renderer to consume a whole validated snapshot, emit the
   SettaState body for zero to many callables, render all five supported passing
   styles, and return dynamic semantic range maps.
4. Keep this replacement private during the batch. Do not expose V2 routes or
   TypeScript beside V1 and do not forward V1 routes through V2 code.

### Phase B — durable coordinator and pinned provider boundary

1. Build the application coordinator around the private aggregate, renderer,
   project-file adapter, materializer, and existing pinned Basedpyright session.
2. Change signature normalization from V1's exact-one positional restriction to
   zero to many records across the five declared styles. Keep completion and
   diagnostics normalized at the LSP boundary.
3. Implement staged candidate materialization, exact diagnostic mapping, durable
   file replacement/rollback, and typed validation/provider/render/
   materialization/persistence failures.
4. Exercise the private load-or-create lifecycle with temporary state, including
   required project-path validation and create/load/refuse-overwrite behavior.
   Keep command wiring on the V1 side untouched until the Phase C cutover; do
   not retain V1 startup bootstrap behavior as a compatibility path.

### Phase C — one atomic public V2 cutover

This is the only public contract cutover. Land it as one coherent candidate:

1. Replace Go V1 contracts, routes, handlers, generated artifacts, schema
   fixtures, and HTTP tests with the V2 snapshot, requests, errors, and exact
   V2 paths above.
2. Wire the command to load/create the selected project and serve the V2
   coordinator. Remove InitialProjectSnapshot, BootstrapShippedExample,
   Square Root IDs, V1 route constants, fixed default import math, and every
   exact-one validation branch.
3. Regenerate TypeScript from Go, replace the V1 runtime decoder/client with
   strict V2 versions, and make any V1 payload or route absent/rejected rather
   than tolerated.
4. Replace the fixed frontend projection with dynamic callable-ID-keyed
   sections, independent drafts, full parameter expression lists, labelled
   target controls, and the read-only generated surface. Use public workspace
   APIs only.
5. Replace README startup instructions, browser process setup, browser
   walkthroughs, and test fixtures in the same candidate so the checked-in
   product contains no demo-only or V1 public surface.

No commit in this phase may expose a V2 endpoint while preserving V1 endpoints,
or expose a frontend that still relies on fixed callable IDs, callables[0], or
Square Root bootstrap data.

### Phase D — acceptance evidence and removal audit

1. Complete focused backend, contract, HTTP, runtime-decoder, client, frontend,
   and browser evidence from the matrix below. Use temporary projects and
   fixture modules, not the historical Square Root demo.
2. Make provider-unavailable, revision-conflict, pending, validation, and
   persistence failure presentation explicit and accessible.
3. Audit production sources, generated contract output, README, browser
   scripts, fixtures, and tests for V1/fixed-demo terminology and behavior.
   Remove the source rather than hiding it behind compatibility branches.
4. If public workspace APIs cannot support the dynamic accessible projection,
   stop with the concrete missing API and affected UI behavior. Do not redesign
   workspace-core or change package/workspace configuration speculatively.

### Phase E — focused verification closeout

1. Run the focused module verification and changed-file selection listed below.
2. Review the exact V2 candidate against the acceptance matrix and removal
   checklist before declaring the plan complete.
3. Do not run, request, or imply authorization for recommended, full, verify,
   gate, merge-gate, test --all, or supplemental suites in this plan.

## Exact acceptance matrix

| Area | Required observable evidence |
| --- | --- |
| Project lifecycle | Temporary-state tests cover missing --project, missing file without --create, exclusive create, refuse-overwrite, strict load, invalid format/field rejection, and same-filesystem atomic-write rollback. Restart proves persisted authored state restores without derived fields stored in the file. |
| Aggregate | Focused project tests cover blank zero-callable state, create/rename/delete by dynamic ID, independent commits of two callables, stale expectedRevision, atomic parameter-list replacement on recommit, zero-parameter signatures, and no fixed Square Root/math assumptions. |
| Renderer | Focused renderer tests cover an empty SettaState body, two callables, multiple and zero parameters, every supported passing style, deletion, byte-stable output, and sourceRangesByTargetId for dynamic callable/parameter IDs. They assert a default suffix can instantiate SettaState and a blank project has no hard-coded math import. |
| File/coordinator transaction | Failure-injection tests prove validation, provider, render, materialization, and persistence failures leave the published snapshot and project file unchanged. Success increments revision once, writes only canonical authored state, regenerates code automatically, and maps candidate diagnostics after publication. |
| Basedpyright integration | A real executable resolved from the pinned app dependency resolves at least two fixture-module signatures, including a zero-parameter callable and a multi-parameter callable covering all passing styles. It proves callable and target completion, diagnostic-to-dynamic-ID mapping, correct target context, and explicit unavailable behavior without an empty fallback. |
| V2 transport | Go contract generation and drift tests produce only V2 artifacts. Contract, HTTP, runtime-decoder, and client tests accept valid V2 snapshots/errors, reject V1 and unknown shapes, require expectedRevision on every mutation, verify typed conflicts/failures, and prove /api/v1 paths are absent. |
| Frontend projection | Component tests cover the explanatory empty state, Add callable, rename, delete, multiple dynamically rendered sections, zero/arbitrary parameter rows, independent callable drafts, completion isolation, prefix/suffix target context, generated-code read-only output, revision conflicts, pending/error handling, and callable/parameter/document diagnostics. |
| Accessibility and reflow | Component or browser assertions verify labels, native controls, visible focus, keyboard add/rename/commit/delete/completion flows, explicit destructive labels, polite announcements, errors associated with controls, and no page-level horizontal scroll at a narrow viewport. |
| Production browser walkthrough | Start against a temporary absent project with --project and --create plus a temporary fixture module. Create and commit multiple callables, edit expressions for multiple parameters and both target regions, observe completion and diagnostics, delete one callable, stop and restart the backend without --create, and prove the project file restores the remaining callables and byte-identical generated code. |

## Removal checklist

- [ ] Remove V1 Go contracts, V1 generated fixture, V1 contract generator
      names, V1 HTTP routes, and V1 handler payloads/error vocabulary.
- [ ] Remove the in-memory InitialProjectSnapshot and
      BootstrapShippedExample path, all Square Root constants, and every
      hard-coded math import/default callable.
- [ ] Remove singleton canonical state, exact-one callable/signature checks,
      fixed parameter slots, fixed source ranges, and callables[0] selection
      from project, renderer, provider, and HTTP code.
- [ ] Remove V1 generatedContract.ts, V1 runtime parser, V1 client route
      constants, V1 decoder aliases, and fixed frontend callable/parameter
      IDs. Regenerate only V2 TypeScript.
- [ ] Remove the fixed callable workspace projection, shared callable draft,
      fixed parameter root assumptions, V1 x/y canvas placement constants, and
      any UI list-position selection. Derive transient placement only from the
      current dynamic callable collection.
- [ ] Replace browser scripts, fixtures, README prose, and tests that mention
      /api/v1, V1, Square Root, math.sqrt bootstrap, a single callable, or a
      one-parameter assumption.
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

1. The backend requires --project, implements exclusive --create, and persists
   exactly one strict python-canvas-project/v1 authored document.
2. A blank project is truly empty of callables and hard-coded math, while its
   renderer preserves the SettaState body/default suffix convention.
3. The pure aggregate, pure renderer, file adapter, application coordinator,
   LSP adapter, HTTP adapter, Go contract generator, and frontend have the
   ownership boundaries stated above.
4. All mutable behavior is V2, expected-revision-bound, automatically
   regenerated, durable, and all-or-nothing with typed failures.
5. The application supports zero to many callables and parameters without
   fixed IDs, positions, Square Root data, or callables[0] anywhere in product
   code.
6. The frontend provides an accessible, responsive empty-to-many-callables
   authoring flow with independent drafts and canonical read-only generated
   code.
7. The full acceptance matrix passes under focused verification and the
   production browser walkthrough proves persistence across a backend restart.
8. V1 is absent rather than supported, the removal checklist is complete, and
   no forbidden scope or control-plane change was introduced.
