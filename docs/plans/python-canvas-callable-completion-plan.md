# Python Canvas Callable Completion Vertical Slice Plan

## Purpose and status

**Status: approved for autonomous implementation; all phases are pending.**

This plan adds only the first narrow callable-name completion slice to the existing Python Canvas
application. It is deliberately a completion of the accepted first vertical slice, not a restart of
that slice or a general semantic-editor initiative.

The required user flow is:

1. Activate the existing single-line **Callable expression** editor.
2. Type `math.sq` and receive results from the app's real pinned Basedpyright process in the
   canonical `import math` context.
3. See `sqrt` as an accessible completion option and select it with the keyboard.
4. Have that selection replace only the current identifier segment, producing `math.sqrt` in the
   local, uncommitted callable draft.
5. Press Enter again, with no completion popup active, to use the existing callable commit,
   signature, parameter, generated-code, and diagnostics flow.

Selecting a completion is not a callable commit. It must not create a parameter, increment the
project revision, synchronize diagnostics, rewrite the canonical generated file, or otherwise
mutate canonical project state.

This plan is already approved for implementation and for the recommended ordinary verification
profile described below. Do not add a developer-only approval gate. Normal Code Policy checks and
the stop conditions in this document still apply.

The completed [Python Canvas First Vertical Slice Plan](python-canvas-first-vertical-slice-plan.md)
remains historical evidence and must not be edited. This plan supersedes only that plan's statement
that frontend completion menus were deferred. During implementation, update the current Python
Canvas README so it no longer lists callable-name completion as deferred; retain the deferrals that
remain out of scope.

## Fixed scope and delivery invariants

This is one callable-name completion route for the one existing Callable section. It is not support
for Python completion generally.

- Keep Go authoritative for the Python Canvas project, the generated canonical Python context, the
  Basedpyright provider, HTTP contracts, and provider failures.
- Keep `@setta/workspace` consumer-neutral. It owns a generic `TextValueEditor` completion seam and
  its CodeMirror adapter, never a Python or network client.
- Keep the Python Canvas frontend responsible for its provider closure, identifier replacement
  range, request lifecycle, strict response parsing, and visible transient completion failure.
- Keep the only new application route read-only: `POST /api/v1/project/callable/completions`.
- Preserve the existing callable commit route and its behavior. The completion selection occurs
  before, rather than alongside or instead of, that existing commit.

An atomic public cutover is not a one-turn or one-commit constraint. Coherent private
implementation batches are allowed, but no partial public API or compatibility surface may be
committed. In particular, the exported workspace completion seam and its Python Canvas consumer
must land in the same Phase B public cutover; do not leave a reusable but unused application-facing
completion API in a committed state.

Do not use this work to add any of the following:

- backward compatibility, legacy support, migrations, aliases, deprecated props, transitional
  endpoints, or parallel old/new paths;
- MCP, a user-facing CLI, parameter completion, prefix/suffix completion, hover, documentation,
  diagnostics expansion, completion resolve, snippets, arbitrary editor services, persistence,
  execution, source discovery, ports/edges, catalogs, caching, multiple callables, or generalized
  core work;
- a fallback language server, provider selection, polling, WebSockets, CORS, or another
  transport path;
- text edits that span outside the authored callable field, ranking, catalogs, caching, or
  completion routes for other controls; or
- a broad audit of historical main behavior, malformed LSP variants, unrelated editor edge cases,
  or a rewrite of the established first slice.

No `.code-policy.json` change is expected. The existing `workspace`, `python-canvas-backend`, and
`python-canvas-frontend` modules and their focused, contract, browser, and build coverage already
own this scope.

## Behavioral guidance and current seams

### Main donor behavior is guidance only

The old main-branch callable completion implementation is a behavioral donor, not code to port or
a second architecture to restore. It establishes these useful facts:

- It appended a callable draft as a standalone expression after generated Python, then issued
  `textDocument/completion` against a temporary sibling snapshot.
- Its completion request carried the project and section identity, complete authored text, and the
  browser cursor offset. Its UI replaced the current identifier segment and let CodeMirror filter
  the returned options.
- Its position converter was Unicode-incorrect, and it had no cancellation or stale-result
  protection. Do not reproduce either defect.
- Its temporary snapshot was always opened, completed, closed, and removed.

Do not wholesale port the donor's frontend, transport, provider abstraction, or editor service.
Use only the behavior above to guide the bounded path defined here.

### Current Python Canvas capabilities to reuse

The current Canvas already has the pieces this slice needs:

- one exact pinned Basedpyright session and a thin `project.LSPProvider` boundary;
- a temporary sibling Python snapshot for signature help, including `didOpen`, `didClose`, and
  cleanup discipline;
- UTF-16 LSP position conversion utilities with invalid-boundary tests;
- Go-owned V1 contracts, deterministic checked-in TypeScript projection, strict frontend runtime
  decoding, and typed `provider_unavailable` failures; and
- a real production browser walkthrough that drives the existing `math.sqrt` commit, parameter,
  generated-code, and diagnostics flow.

The existing public `TextValueEditor` already owns controlled values, disabled behavior, the
single-line Enter commit callback, and Escape-to-section behavior. Its current CodeMirror setup
deliberately turns autocomplete off, so this work must add a narrow adapter rather than assuming an
ambient completion extension exists.

## Ownership and contracts

| Owner | Sole responsibility in this slice | Must not own |
| --- | --- | --- |
| `@setta/workspace` | Generic `TextValueEditor` completion contract and its internal CodeMirror adapter | CodeMirror types in its public API, LSP, Python, URLs, fetch, request state, or app errors |
| Python Canvas frontend | Callable-only provider closure, UTF-16 identifier range, fetch cancellation, strict HTTP response parsing, and transient UI failure | LSP parsing, generated Python, canonical semantic state, or completion behavior for parameters |
| Go `contracts` and HTTP boundary | Exact V1 request/response types, generated TypeScript projection, strict request decoding, and stable error mapping | React or CodeMirror behavior |
| Go `project` | Read-only completion query validation and immutable canonical-context snapshot | Browser cursor arithmetic beyond the supplied UTF-16 contract, HTTP, or LSP wire types |
| Go `lsp` | Temporary completion snapshot, full-document LSP position, `textDocument/completion`, cleanup, and narrow item normalization | Project mutation, HTTP, UI filtering, resolve, documentation, or snippets |

### Expected implementation owners

Keep changes beside their current owners rather than creating a completion framework:

| Area | Current owner files to extend | Focused proof owner |
| --- | --- | --- |
| Generic editor seam | `packages/workspace/src/controls/text/TextValueEditor.tsx`, `textValueExtensions.ts`, package-root exports, and `packages/workspace/package.json` | `TextValueEditor.test.tsx` and the public API test |
| Go V1 route | `apps/python-canvas/backend/internal/contracts`, `internal/httpapi/server.go`, and the generated `apps/python-canvas/src/backend/generatedContract.ts` | existing contracts and HTTP tests plus contract drift |
| Read query and provider | `apps/python-canvas/backend/internal/project` and `internal/lsp/provider.go`, using the existing session and position helpers | project, LSP position/provider, and real Basedpyright integration tests |
| Callable consumer | `apps/python-canvas/src/backend/client.ts`, `runtimeContract.ts`, `sections/CallableSection.tsx`, and the app mutation/controller path | frontend runtime/client/component tests |
| End-to-end and documentation | `apps/python-canvas/vertical-slice.browser.mjs` and `apps/python-canvas/README.md` | real production browser walkthrough |

The exact small helper filenames may be finalized while keeping these ownership boundaries. Do not
create a cross-package completion service, a second LSP client, or a general frontend editor layer.

### Workspace public seam

Add one optional `completionProvider` prop to the existing public `TextValueEditor` contract. Final
type names may be chosen during implementation, but the public semantics are fixed and must be
available from the package root:

| Generic concept | Required semantic fields |
| --- | --- |
| Completion request | `value`, `cursorOffset` as a JavaScript UTF-16 index, `explicit`, and an `AbortSignal` |
| Completion option | nonempty `label` and optional `insertText` |
| Completion result | `from`, optional `to`, and readonly `options` |
| Completion provider | async function from the request to that result or `null` |

`completionProvider` belongs on `TextValueEditor` only. Do not create a second editor component,
an alias, a deprecated prop, a public hook, a public CodeMirror wrapper, or a public package
concept for LSP, Python, URLs, provider state, pending state, or application errors. The package's
internal meta-control composition can remain an implementation detail; it does not acquire a
separate completion surface.

The internal adapter must:

- add an exact-pinned direct `@codemirror/autocomplete` dependency to `packages/workspace`;
- use its `autocompletion` source and completion keybindings only when a provider is supplied;
- translate CodeMirror's current document, JavaScript UTF-16 position, and explicit-invocation bit
  into the generic request;
- create and pass an `AbortSignal`, abort it on a document change, and discard any provider result
  that arrives after that abort or after the editor is disabled;
- ensure a visible popup takes keyboard precedence: Enter accepts the selected option and Escape
  closes the popup, without calling `onCommit` or the existing `onEscape`; and
- preserve the existing unmodified Enter commit and Escape-to-section behavior when no completion
  popup is active, including the existing IME and disabled safeguards.

Disabled editors neither start completion requests nor accept a completion that was already in
flight. Do not add Tab behavior in this slice. Do not surface an internal CodeMirror completion
context, result object, extension, keymap, request token, or error through the package API.

### Python Canvas frontend provider and interaction

The app passes a provider only to the Callable editor. Parameter editors retain their existing
plain `TextValueEditor` behavior and never query this route.

For each callable request, the app-owned closure must:

1. Treat a blank draft as no completion request.
2. Capture the current draft, its project and callable section IDs, the requested JavaScript
   UTF-16 cursor offset, and the generic request signal.
3. Compute the current callable identifier-segment replacement span in JavaScript UTF-16 offsets.
   Use a small Unicode-aware local scanner bounded by the dot-separated segment; it is not a
   Python parser and must not use UTF-8 byte offsets or code-point indexes as editor offsets.
4. Fetch the single completion route with the supplied signal and parse the response strictly at
   the existing frontend boundary.
5. Map only the response items to the generic workspace result: `from` and `to` are the computed
   segment bounds, each option exposes the response label and insertion text, and CodeMirror may
   further filter them.

Cancellation is part of normal typing. An abort, superseded request, or stale response must not
show an error or overwrite a newer result. A genuine provider failure, network failure, or invalid
response must be visible in the Callable section and distinguishable from a successful empty
`items` list. A successful completion response, including a valid empty response, clears the
transient failure. Completion failure remains separate from the existing mutation pending and
mutation-error state.

The first Enter when the popup is active therefore changes only the controlled local draft. The
second Enter occurs after the popup has closed and calls the existing callable commit callback.

### Go V1 transport and read-only project query

The Go contracts package remains authoritative. Add exactly one new path:

```text
POST /api/v1/project/callable/completions

{
  "projectId": "…",
  "sectionId": "…",
  "authoredExpression": "math.sq",
  "cursorOffsetUtf16": 7
}

{
  "items": [
    { "label": "sqrt", "insertText": "sqrt" }
  ]
}
```

The body and response have exactly those fields. The V1 request and response structs, path
constant, response item, TypeScript renderer, generated TypeScript artifact, and contract drift
test move together. The frontend consumes the checked-in generated projection but strictly parses
the runtime JSON before it reaches the provider closure.

The HTTP handler remains loopback-only and strict: reject unsupported methods, queries, bodies
outside the small existing limit, unknown JSON fields, missing fields, trailing JSON values, and
invalid body shapes. Map malformed input to the existing `invalid_request` failure, exact unknown
project or callable IDs to the existing `not_found` failure, and provider, session, timeout, or
completion-response failures to the existing typed `provider_unavailable` failure. Never turn a
provider failure into `200 {"items": []}`. A genuine successful no-match result is exactly
`200 {"items": []}`.

The project-layer completion query must:

- validate the exact current project and callable section IDs;
- validate a bounded, single-line authored draft and reject transport-breaking input;
- validate `cursorOffsetUtf16` as a JavaScript UTF-16 boundary from zero through the draft length,
  rejecting an offset in the middle of a surrogate pair;
- briefly hold the store lock only long enough to verify the store and capture the current canonical
  generated code, provider, and any required identity/revision values;
- build one immutable completion request, release the project lock before waiting on Basedpyright,
  and return only normalized completion items; and
- never increment revision, alter canonical callable or parameter records, change diagnostics,
  update provider status, or write the canonical generated Python file.

The read-only query may use a project-private completion request/result boundary alongside the
existing signature boundary, but it must not expose LSP types to `project`, HTTP, contracts, or the
frontend.

### LSP completion adapter

The Basedpyright adapter receives the immutable query request and:

1. Starts from the captured canonical generated Python, not a fresh frontend-generated model.
2. Appends the authored draft as a standalone expression in that Python context, with an explicit
   separator and tracked draft start.
3. Converts the draft-relative JavaScript UTF-16 offset to the corresponding full-document LSP
   `Position` correctly. The conversion must respect surrogate pairs and line/character boundaries;
   do not inherit the donor's Unicode bug or use a raw byte or rune index as an LSP character.
4. Creates a sibling temporary Python snapshot in the existing provider workspace, synchronizes it
   through the existing document lifecycle, calls `textDocument/completion`, and uses the request
   context for the bounded wait.
5. Sends `didClose` and removes the temporary snapshot on success, provider error, malformed
   response, deadline, or caller cancellation.

Reuse the current context cancellation path. Do not broaden this task into a generalized JSON-RPC
cancellation initiative.

Normalize only what the route consumes: retain items with nonblank labels and use a plain,
nonblank insertion string when provided, otherwise safely fall back to the label. Do not implement
`resolveCompletionItem`, text edits that span outside the authored field, snippets, documentation,
ranking, catalogs, caching, or any other completion route. The adapter should only parse the narrow
Basedpyright response shape required by this proof; it is not a reason to audit speculative malformed
LSP variants.

## Acceptance and focused proof

The completed implementation must demonstrate all of the following observable outcomes:

- A real integration using the pinned Basedpyright executable returns a `sqrt` completion for
  `math.sq` in the canonical `import math` context.
- The browser walkthrough finds an accessible `sqrt` completion option, selects it with keyboard
  interaction, and observes `math.sqrt` in the callable draft after the first Enter.
- Before the second Enter, the walkthrough verifies through the UI and canonical project snapshot
  that there is no new parameter, no revision mutation, no committed callable change, and no
  generated-code mutation.
- The second Enter then drives the already-proven real callable signature, automatic parameter,
  generated-code, and diagnostics walkthrough.
- Workspace component tests prove active-popup Enter/Escape precedence, request cancellation and
  stale-result discard, normal Enter/Escape preservation, disabled behavior, and no Tab addition.
- Frontend unit/component tests prove strict response parsing, blank-draft suppression, UTF-16
  identifier replacement bounds, fetch cancellation, genuine completion-error visibility, empty
  success handling, and callable-only provider attachment.
- Go contract/project/HTTP tests prove exact request validation and error mapping, no project
  mutation, no canonical generated-file write, lock-free provider wait, and typed provider failure.
- LSP tests prove Unicode UTF-16 mapping including surrogate pairs, temporary snapshot
  synchronization, and cleanup after success, failure, and cancellation.

Keep these tests bounded and observable. Do not convert a completion slice into an exhaustive audit
of arbitrary malformed LSP payloads, unrelated CodeMirror behavior, or the rest of Python syntax.

## Implementation phases

### Phase A — read-only Go completion query and real Basedpyright proof

- [x] Read-only Go completion query and pinned Basedpyright proof complete

Implement the authoritative backend before the reusable editor consumer:

- Add a project completion-query method and private request/result types. Validate the exact IDs,
  one-line bounded draft, and JavaScript UTF-16 cursor boundary; capture canonical generated code
  and provider under the store lock; construct an immutable request; then release the lock before
  calling the provider. Prove the query leaves snapshot revision, semantic records, diagnostics,
  provider status, and generated-file contents unchanged.
- Extend the existing pinned Basedpyright provider with the temporary sibling completion snapshot,
  full-document offset mapping, `textDocument/completion`, narrow normalization, and deferred
  `didClose`/file removal for every exit path. Reuse the existing session synchronization and
  context propagation rather than adding a second protocol client.
- Add focused project, LSP position/cleanup, and real pinned-server integration tests. The real
  integration must obtain `sqrt` from `math.sq` with the canonical import context.

Phase A is a coherent private implementation and proof batch. Do not expose the V1 route, its
checked-in generated TypeScript projection, or a reusable workspace completion API in a separately
committed public surface; those are part of Phase B's atomic consumer cutover.

**Boundary:** Phase A owns the Go project read query and LSP adapter behind private boundaries. It
adds no CodeMirror dependency, V1 completion route, generated frontend contract, workspace
completion prop, frontend completion UI, README claim, or completion behavior for any other editor.

**Evidence to record when complete:** focused Go suite names and results; the real pinned
Basedpyright `math.sq`/`sqrt` assertion; private query-validation and no-mutation evidence; Unicode
surrogate-pair mapping evidence; and cleanup proof. Record concise commands and outcomes here, not
a new evidence subsystem.

**Avoid rabbit holes:** test the real `math.sq` path, lock release, UTF-16 boundary behavior, and
cleanup. Do not audit every LSP completion union, build resolve support, or expand diagnostics while
proving this phase.

**Recorded evidence (2026-08-18; audit correction verified):** `go test ./internal/lsp` and
`code-policy test --module python-canvas-backend` passed
(`python-canvas-backend-focused`; Go packages including `internal/project` and `internal/lsp`).
`TestPinnedBasedpyrightCompletesCallableNameInCanonicalMathContext` started the pinned
Basedpyright executable, asserted the captured `import math` canonical context, and found `sqrt`
for `math.sq` without changing the snapshot or canonical generated file. Project proofs cover exact
IDs, bounded single-line drafts, UTF-16 surrogate boundaries, provider failure, no mutation, and
store-lock release before the provider wait. LSP proofs cover Unicode full-document positioning,
normalization, and `didOpen`/completion/`didClose` plus temporary-file cleanup on success, provider
failure, and caller cancellation. `TestBasedpyrightProviderRejectsMalformedCompletionItems` rejects
both `{}` and `{"items":null}` with a typed malformed-result failure instead of an empty success;
`TestSessionCancellationDuringInitializationDoesNotCloseSharedSession` cancels the first completion
during initialization and proves a later completion still uses the shared session successfully.

### Phase B — atomic workspace consumer cutover

- [ ] Generic workspace seam and callable-only consumer cutover complete

Perform the dependency governance and the consumer-facing implementation as one atomic public
cutover:

1. Before adding `@codemirror/autocomplete`, generate the candidate lockfile without lifecycle
   scripts (for example, `pnpm install --lockfile-only --ignore-scripts` after declaring the exact
   direct version). Against the trusted plan-loop base, run
   `code-policy dependency-review --base <trusted-plan-loop-base>`. Review and record the exact
   direct and transitive change set, native audit, OSV findings, and release-age output. Only after
   that review passes, install/use the already-reviewed frozen lockfile. Keep the direct dependency
   exact-pinned; do not use a range, a transitive-only import, or an unreviewed lockfile refresh.
2. Add the generic `TextValueEditor.completionProvider` contract, public type exports, and internal
   CodeMirror adapter in `@setta/workspace`. Use the direct autocomplete package's source and
   keybindings while preserving active-popup Enter/Escape precedence, normal no-popup commit/Escape
   behavior, IME guards, disabled behavior, document-change abort, stale-result discard, and no
   Tab binding.
3. Promote the Phase A query through the exact V1 request, response, item, and path contract;
   deterministic TypeScript projection; and strict loopback HTTP POST handler. Add exact HTTP and
   contract-drift tests, preserve existing decoder/error conventions, and map unavailable providers
   to `provider_unavailable` rather than an empty success.
4. In Python Canvas, add the strict completion client/parser and provider closure. Compute the
   callable identifier segment in JavaScript UTF-16 offsets, issue the exact POST with its
   `AbortSignal`, map response items to the generic result, and retain only app-local transient
   error presentation. Do not attach it to parameter editors.
5. Extend focused workspace and Python Canvas tests for the full interaction contract. The public
   package export proof must use generic labels and values, never Python or network vocabulary.
6. Extend the checked-in production browser walkthrough: type `math.sq`, wait for the accessible
   `sqrt` option, select it with the keyboard, assert the first Enter changes only the draft and
   leaves the canonical snapshot unchanged, then press Enter again and run the existing
   parameter/codegen/diagnostics assertions against the real service and pinned Basedpyright.
7. Update `apps/python-canvas/README.md` in the same phase. State that narrow callable-name
   completion is supported and remove it from the deferred list; keep hover/docs, prefix/suffix
   completion, parameter completion, and general semantic-editor services deferred.

Do not commit the reusable workspace prop, its public types, or its direct completion dependency
without the callable consumer, real backend request, tests, and browser proof in the same public
cutover. Conversely, do not create an app-specific alternate editor to avoid consuming the generic
seam.

**Boundary:** Phase B is the one public cutover for the exact V1 route and generated projection,
the direct workspace package dependency and public editor contract, and the callable consumer.
Completion remains callable-only, local-draft-only, and consumer-neutral at the package boundary.
Parameter editors, generated code, existing commit semantics, and all non-completion deferrals
remain unchanged.

**Evidence to record when complete:** the candidate-lockfile and dependency-review summary with
trusted base; exact package, frontend, HTTP, and contract-drift suite results; strict parser and
visible-error assertions; keyboard popup precedence and cancellation assertions; the production
browser output; and the README wording update. Include the fact that no completion selection
mutated canonical project state.

**Recorded implementation evidence (2026-08-18; browser proof blocked):** Added the exact direct
workspace dependency `@codemirror/autocomplete@6.20.3`. The candidate lockfile generated with
`pnpm install --lockfile-only --ignore-scripts` changed only the workspace importer (the package
specifier and resolved version); it introduced no new transitive resolution. With trusted base
`13721b4dd881caf649aa21cadf2c12785dcae6f3`, `code-policy dependency-review --base
13721b4dd881caf649aa21cadf2c12785dcae6f3` completed successfully with no reported direct,
transitive, native-audit, OSV, or release-age finding. `pnpm install --frozen-lockfile
--ignore-scripts` then completed successfully.

The generic public completion seam, exact V1 route/projection, callable-only UTF-16 provider,
strict parser, app-local error, README wording, and focused tests are implemented together.
`go test ./...` in `apps/python-canvas/backend`, `code-policy test --module workspace --module
python-canvas-backend --module python-canvas-frontend`, `pnpm --filter @setta/python-canvas test`,
`pnpm --filter @setta/python-canvas run build`, and `pnpm --filter @setta/python-canvas run
contract:check` passed. The focused tests cover popup Enter/Escape precedence, IME guard,
cancellation and stale results, no Tab binding, strict HTTP/parser behavior, blank draft
suppression, UTF-16 replacement, abort/error/empty handling, and callable-only attachment.

The required production browser command, `pnpm --filter @setta/python-canvas run browser:test`,
was attempted but could not start its local service: `listen EPERM: operation not permitted
127.0.0.1` while reserving the loopback port. It therefore could not produce the required real
Basedpyright/browser proof that first Enter changes only the draft and canonical state remains
unchanged. This Phase B marker remains unchecked until that required evidence can run in an
environment permitted to listen on loopback.

**Avoid rabbit holes:** do not add completion resolve, docs, snippets, Tab, hover, caching,
ranking, parameter completion, alternate editor services, or broad frontend redesign while making
the one `math.sq` flow work.

### Phase C — final contract, documentation, and Code Policy closeout

- [ ] Contract/docs audit and authorized Code Policy verification complete

Audit the completed vertical slice and record concise evidence in this plan:

- Confirm that the checked-in TypeScript projection exactly matches the Go contracts, the runtime
  parser accepts only the declared completion shape, and the sole new route is the read-only callable
  completion POST path.
- Confirm there is no revision/canonical-file/diagnostic mutation on selection, no completion prop
  on parameter editors, no public CodeMirror/LSP/Python/network/error leakage from
  `@setta/workspace`, and no compatibility, legacy, alias, migration, or transitional surface.
- Confirm the old first-slice plan is untouched and the app README describes the newly supported
  callable-name completion without claiming broader completion support.
- Run `code-policy test --changed --base <trusted-plan-loop-base>` near closeout. Run
  `code-policy test-levels --base <trusted-plan-loop-base>` and record its terminal-safe ordinary
  choices. This plan authorizes the planner-selected recommended ordinary profile; run it with the
  real browser and Basedpyright-backed checks it selects. Do not silently substitute `full`,
  `verify`, `gate`, or supplemental suites.
- Run `code-policy doctor --strict`, contract drift, and production builds when selected by the
  declared policy. Preserve the exact suite names and output needed to show the browser and pinned
  provider checks really ran.

**Boundary:** closeout is an audit and verification phase, not permission to generalize the
implementation or modify Code Policy configuration. If the existing policy cannot express the
required checks without a protected configuration change, stop rather than widening the task.

**Evidence to record when complete:** trusted base; changed and recommended profile results;
`doctor --strict`, contract-drift, and selected build results; the browser walkthrough result; the
real Basedpyright integration result; and a one-line scope audit confirming only the intended
completion route and seam were added.

**Avoid rabbit holes:** close the declared contract and proof. Do not turn the audit into a review
of unrelated workspace internals, main parity, source discovery, persistence, execution, or a
general LSP cancellation program.

## Verification and stop conditions

Use one caller-scoped Code Policy task session with the existing `workspace`,
`python-canvas-backend`, and `python-canvas-frontend` modules selected, and reuse its disposable
worktree for dependency setup and every check. Do not nest a task session when
`CODE_POLICY_TASK_SESSION=1` is already present. Focused tests may run throughout implementation;
the closeout commands above remain the ordinary verification boundary.

Stop and request a scope decision rather than inventing a workaround if:

- the pinned Basedpyright integration cannot return `sqrt` for `math.sq` in the captured canonical
  import context;
- a correct completion requires a CodeMirror/LSP/Python/network type or application error to leak
  through the public workspace API;
- the provider must mutate canonical project state, hold the project lock while waiting, or write
  the canonical generated file to complete;
- strict endpoint parsing or the current generated-contract workflow cannot express the fixed V1
  body and response without a compatibility path;
- dependency review identifies an unresolved direct, transitive, native, OSV, or release-age issue;
  or
- proving the behavior would require resolve, snippets, cross-field edits, parameter completion,
  a fallback provider, or a `.code-policy.json` change.

The plan is complete when all three phase markers are checked with their concise evidence appended,
the real browser and pinned Basedpyright proof pass, completion selection demonstrably leaves the
canonical project unchanged, the second Enter demonstrably invokes the existing vertical slice,
and no deferred or compatibility surface has been added.
