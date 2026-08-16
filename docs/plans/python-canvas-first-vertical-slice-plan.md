# Python Canvas First Vertical Slice Plan

## Purpose and status

**Status: implementation in progress — Phase A is complete; Phase B is next.**

This is the bounded implementation plan for the first useful Python Canvas consumer of
`@setta/workspace`. It replaces the previous contents of this document, which described a fixed
`textwrap.shorten` form and an explicit **Generate Python** action. Those choices did not match the
Python code-generation workflow on main.

The behavior reference is the clean `../setta-main` worktree at commit `043d3b2e9`. Main establishes
the product model this slice must preserve:

- a project has a Python codegen target with a prefix and suffix;
- a Callable section contains a user-authored Python callable expression;
- the Go backend asks a Python language server for the callable signature and creates its parameter
  rows;
- every accepted callable or parameter mutation automatically reconciles generated Python;
- Go exports the project's semantic section state into a dependency graph and renders a
  `SettaState` module;
- the generated body is reflected in a singleton generated-code section and the complete file is
  materialized for the language server; and
- generated diagnostics are mapped back to the section or parameter that produced the affected
  source range.

The first slice should prove that model through the reusable workspace UI without restoring the
rest of the main application.

## Fixed product decisions

1. There is no **Generate Python** command, toolbar button, or `/generate` endpoint. Generated code
   is derived automatically from each accepted backend mutation.
2. There is no fixed callable catalog. The acceptance walkthrough uses `math.sqrt`, but the
   committed callable is a user-authored, dot-separated Python name resolved by the language
   server.
3. Go owns the canonical Python Canvas project state, signature-derived parameter metadata,
   dependency graph, generated code, generated source ranges, and transport contracts.
4. `@setta/workspace` owns generic layout, interaction, section chrome, item controls, diagnostics
   presentation, and the built-in code editor. The Python Canvas frontend projects canonical Go
   state into those public primitives.
5. The frontend may hold an uncommitted callable draft and transient control edits. It does not
   render Python or define a second semantic project model.
6. The backend starts exactly one pinned Basedpyright language-server process. Do not introduce an
   LSP plugin system, server selection, or fallback server in this slice.
7. The project is in memory. The generated `setta_gen.py` under a backend-owned temporary workspace
   is a derived LSP artifact, not a persisted Python Canvas project file.
8. The generated-code section displays the complete prefix, generated body, and suffix as read-only
   text. Editing prefix/suffix and mixed editable/read-only editor regions are deferred.
9. Version 1 begins here. Unsupported contract versions fail explicitly; there are no legacy
   readers, migrations, aliases, or transitional endpoints.

## Acceptance walkthrough

The one product walkthrough is:

1. Start the Go service, its pinned Basedpyright process, and the Vite frontend.
2. Open Python Canvas and observe one empty **Callable** section named **Square Root** and one
   read-only **Generated Python** section.
3. Enter `math.sqrt` in the Callable field and press Enter.
4. Observe a bounded pending state while Go asks Basedpyright for signature help against a generated
   Python snapshot containing the configured `import math` prefix.
5. Observe one parameter row named `x`. Its backend-owned metadata records that it is positional
   only; the frontend does not infer that from its label.
6. Observe the Generated Python section update automatically to contain `math.sqrt`. Do not invoke a
   separate generation action.
7. Enter `missing_value` as the Python expression for `x` and wait for that mutation to settle.
8. Observe the generated source update with `missing_value` and a real Basedpyright undefined-name
   diagnostic mapped to the `x` row by its generated source range.
9. Replace the expression with `3` and wait for the mutation to settle.
10. Observe the generated source update automatically and the `x` diagnostic clear.

The final generated file is byte-stable and follows main's shape:

```python
import math

class SettaState:
    def __init__(state):
        state.Square_Root__x = 3
        state.Square_Root = math.sqrt(state.Square_Root__x)

state = SettaState()
```

The exact Basedpyright wording is not a product contract. The diagnostic must have a stable source
and severity and must be associated with `x` through the renderer's source-range map rather than by
matching words in the message.

## Explicit non-goals

Do not use this plan to add:

- MCP, a user-facing CLI, or headless command parity;
- a Generate Python button, command registry contribution, or standalone generation endpoint;
- source-root configuration, source discovery, Watch Code, filesystem watching, or callable
  reconciliation after source changes;
- Python execution, interpreter selection, terminals, PTYs, run history, or cancellation;
- a persisted project format, save/load, databases, authentication, collaboration, websockets,
  server-sent events, or polling;
- ports, edges, connection gestures, Dict/value sections, or multiple callable sections;
- variants, section policies, code-object value policies, metadata generation, rename refactoring,
  or generated-output export;
- frontend completion menus, hover, documentation popovers, prefix/suffix completion, or general
  semantic-editor services;
- arbitrary callable expressions, arbitrary statement insertion, additional parameter-control
  kinds, or a callable/plugin catalog;
- a public package, final naming, licensing, desktop packaging, deployment, or release artifacts;
- the deferred `@setta/workspace/core` transaction engine or any other phase of the broad workspace
  generalization roadmap; or
- wholesale copying of `setta-main`, unrelated parity auditing, or speculative edge-case work.

Concrete correctness and security cases within the declared callable, parameter, renderer, LSP,
and transport boundaries remain in scope.

## Repository shape

Add one private application with a pnpm frontend and a nested Go module:

```text
apps/python-canvas/
├── package.json
├── index.html
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── PythonCanvasApp.tsx
│   │   └── workspaceProjection.ts
│   ├── backend/
│   │   ├── client.ts
│   │   └── generatedContract.ts
│   └── sections/
│       └── CallableSection.tsx
└── backend/
    ├── go.mod
    ├── cmd/python-canvas/main.go
    └── internal/
        ├── codegen/
        ├── contracts/
        ├── httpapi/
        ├── lsp/
        └── project/
```

Tests live beside their owners. Do not add a root Go module, `go.work`, or speculative `domain`,
`application`, `ports`, `adapters`, `shared`, `plugins`, or `runtime` packages.

The frontend declares `"@setta/workspace": "workspace:*"` and pins every direct dependency. The
Basedpyright distribution is an exact app dependency and its language-server executable is resolved
from that installation. Do not search arbitrary `PATH` entries or silently fall back to a globally
installed server.

## Ownership and dependency direction

| Concept                                                  | Authoritative owner                   | Consumer form                                       |
| -------------------------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| Canvas document, layout, controls, and interaction       | `@setta/workspace`                    | Public React and TypeScript exports                 |
| Python project semantics and revision                    | Go `project` package                  | Versioned canonical snapshot                        |
| Callable signature and parameter metadata                | Go LSP adapter plus `project` package | Canonical parameter projection                      |
| Dependency ordering, Python rendering, and source ranges | Go `codegen` package                  | Generated body, full code, and range map            |
| HTTP request and response shapes                         | Go `contracts` package                | Deterministically generated TypeScript types        |
| Callable-section rendering and backend projection        | Python Canvas frontend                | Public workspace registrations and mutations        |
| LSP process and protocol details                         | Go `lsp` package                      | Normalized signature, diagnostic, and status values |

Dependency direction is:

```text
@setta/workspace
        ^
        |
Python Canvas frontend --> generated Go-owned contracts
        |
        v
thin HTTP client --> Go HTTP boundary --> Go project mutation
                                             |
                         +-------------------+-------------------+
                         v                                       v
                   Go codegen core                         Go LSP adapter
```

The Go backend does not import or reimplement workspace layout and interaction internals. The
frontend does not maintain a parallel dependency graph, parse LSP messages, or render Python.

## Minimal Go-owned project state

The backend owns one in-memory version-1 project containing only:

- a stable project ID and monotonically increasing revision;
- a Python target with `genCodePrefix = "import math"` and
  `genCodeSuffix = "state = SettaState()"`;
- one Callable section with a stable ID, name, committed callable expression, and ordered parameter
  IDs;
- zero or one signature-derived `CodeParam` record for this acceptance slice, including stable ID,
  name, passing style, type annotation, default value, and authored expression;
- the complete generated code, generated body, and renderer-owned source ranges; and
- ephemeral normalized diagnostics and LSP availability state.

Revision tags canonical responses and LSP work so the frontend cannot apply an older result over a
newer snapshot. It is not a reusable workspace transaction protocol. Only one mutation is active in
the first frontend, so this plan does not add optimistic concurrency, inverses, or undo/redo.

The generated code and source ranges are derived from the semantic records. They may be present in
the response for efficient rendering, but they are never independently mutable inputs.

This slice accepts only a signature containing exactly one supported positional parameter. A
resolved signature outside that boundary fails with a typed unsupported-signature result; the
backend does not silently omit parameters or invent controls.

## Mutation and automatic reconciliation

Expose semantic mutations, not a generation request.

### Commit callable

The callable mutation accepts the project ID, section ID, and authored callable name. It must:

1. trim and validate a non-empty dot-separated sequence of Python identifiers;
2. clone the current semantic state;
3. build a temporary generated snapshot with the candidate callable in the exact current prefix,
   body, and suffix context;
4. ask Basedpyright for signature help at the candidate call position;
5. fail visibly without changing canonical state if no matching signature is available;
6. require exactly one supported positional parameter and normalize its name, passing style, type,
   and default into Go-owned metadata;
7. render the complete candidate project and source ranges;
8. atomically replace the derived generated file; and
9. commit the candidate state once and increment its revision.

Recommitting the same callable is idempotent. Committing a different supported callable atomically
replaces the old signature metadata with a fresh parameter record; it does not preserve the
abandoned parameter value. General parameter-identity reconciliation across signatures is outside
this slice.

### Set parameter expression

The parameter mutation accepts the project ID, parameter ID, and authored expression string. It
must:

1. resolve the exact canonical parameter and reject unknown IDs;
2. enforce only boundary constraints such as maximum size and forbidden transport values;
3. store the string as a Python expression rather than coercing it into a JavaScript or Go literal;
4. render a complete candidate graph, generated file, and source-range map;
5. atomically replace the derived generated file and commit the candidate state once;
6. synchronize that exact file revision with Basedpyright;
7. await the corresponding diagnostic publication for a bounded interval; and
8. return the latest canonical snapshot with mapped diagnostics or an explicit LSP status.

`missing_value` is therefore rendered and diagnosed; it is not rejected as a malformed string. This
matches main's expression-oriented parameter model and keeps Python semantics with the Python
tooling.

Mutations are serialized. Validation and rendering happen against a clone before the canonical
state changes. A failed signature request, validation, render, or generated-file write leaves the
previous canonical state and file intact. An LSP timeout after a successful commit is reported as
an unavailable or pending diagnostic status, not as an empty successful diagnostic result.

## Go code generation

Port and prune only the main-branch concepts needed for one Callable and one CodeParam:

- export the canonical Callable section and its ordered parameter dependency;
- sanitize the section and parameter names into stable Python paths;
- render a parameter assignment before the callable that depends on it;
- honor the LSP-derived positional-only passing style;
- render the `SettaState` wrapper with fixed indentation and separators;
- combine the target prefix, generated body, and suffix deterministically;
- record byte offsets for each emitted callable and parameter value; and
- produce byte-identical output and ranges for identical canonical state.

Do not port the main project aggregate, other section exporters, representation policies, password
or file helpers, metadata renderer, rename logic, edges, listener modes, or execution behavior.

The renderer accepts validated semantic records and returns one immutable result. It has no HTTP,
React, filesystem, process, or LSP imports. The materialization caller writes the complete result to
the backend-owned temporary workspace with same-filesystem atomic replacement.

## Backend LSP boundary

Use a real, pinned Basedpyright language server for both required capabilities:

1. signature help for the committed callable; and
2. diagnostics for the canonical generated file.

The Go adapter owns process startup, JSON-RPC framing, initialization, document versions, bounded
request waits, shutdown, and stderr capture. It exposes normalized application methods and never
leaks LSP wire structures into `project`, `codegen`, HTTP, or frontend contracts.

Signature help uses a temporary sibling snapshot in the generated file's import context. Always
send the matching close notification and remove the snapshot on success, failure, or cancellation.

Diagnostics use the canonical temporary `setta_gen.py`. Convert LSP UTF-16 positions at the adapter
boundary and bind each publication to the generated revision it observed. Map a diagnostic to a
parameter only when its range intersects that parameter's renderer-owned value span. Diagnostics
outside known spans remain generated-code diagnostics. Do not inspect message keywords to invent a
target.

An unavailable server, startup failure, timeout, malformed response, or version mismatch is visible
and typed. Do not return a plausible empty signature or diagnostic list.

## HTTP boundary

Expose only the three application operations needed by the walkthrough:

- `GET /api/v1/project` returns the canonical initial or current snapshot;
- `POST /api/v1/project/callable` commits the Callable expression; and
- `POST /api/v1/project/parameters/{parameterId}` sets one authored expression.

The Go `contracts` package owns all request, success, failure, snapshot, parameter, generated-code,
diagnostic, and status structures. Generate the TypeScript projection deterministically and check
it in. A drift check regenerates to temporary output and compares bytes.

The server binds to loopback, accepts strict JSON, rejects unknown fields and trailing values,
enforces small body limits, propagates cancellation, and returns stable typed failure codes. Use the
Vite development proxy for same-origin browser calls. Do not add CORS, authentication placeholders,
websockets, server-sent events, or polling.

The server binary is delivery wiring, not a product CLI. It has no subcommands or headless project
operations.

## Frontend workspace composition

Create one `WorkspaceHost` for the mounted app and dispose it on teardown. Register:

- one application-owned Callable section kind;
- the built-in workspace code-section kind; and
- no generation command or toolbar contribution.

Load a document containing the projected Callable section and the read-only Generated Python
section. Keep shell view state controlled in the app.

The Callable section renders:

- one single-line, Python-highlighted callable editor at the top;
- a bounded pending or unavailable status owned by the app; and
- a `WorkspaceItemList` containing the canonical signature-derived parameter items.

Each parameter item carries its stable backend parameter ID in application-owned item data. Its
presentation uses the package's Python code control with autocomplete off. Parameter names,
passing styles, annotations, and IDs come from the backend response; labels are not parser keys.

The frontend keeps the callable editor's uncommitted text local until Enter. Parameter item changes
are debounced and serialized through the parameter mutation. While a mutation is active, disable
the affected authored controls instead of introducing optimistic rebase logic.

On each canonical response, the projection adapter uses public workspace mutations to reconcile
the Callable section items, update the built-in code section, and replace the item-diagnostic
registry. Mark backend-applied projection work so it cannot be mistaken for a new authored
mutation. Never reload the entire host for an ordinary response, deep-import a package store, query
private DOM selectors, or derive Python output in React.

## One consumer-driven `@setta/workspace` change

The public `TextValueEditor` currently reports document changes but deliberately has no Enter
commit seam. Add one narrow, backend-neutral optional callback:

```ts
onCommit?: (value: string) => void;
```

For a single-line editor, unmodified Enter invokes `onCommit` with the current value without adding
a newline. It must not fire while disabled or during IME composition. Add the prop directly to the
sole public editor contract and update its owners in place. Do not add an alias, deprecated prop,
adapter component, or second editor path.

Use that public editor for the app-owned callable field. Do not add LSP types, URLs, completion
providers, loading state, diagnostics, CodeMirror extensions, generated regions, or Python concepts
to the workspace package. The app owns the pending indicator and calls its backend on commit.

The existing built-in read-only code section and `WorkspaceItemList` diagnostic registry are
sufficient for the remaining slice. If implementation disproves that statement, stop and document
the exact missing public seam before changing the package.

## Code Policy bootstrap

The current trusted configuration owns `workspace` and `playground`, not the new app. Candidate
configuration cannot widen its own task-session scope, and `.code-policy.json` is protected
control-plane state. The app therefore needs an explicit, separately reviewed bootstrap before its
ordinary implementation sessions.

That bootstrap should:

1. change the project kind from library to application and add only the `backend`, `frontend`, and
   `ui` capabilities now present;
2. add non-overlapping `python-canvas-backend` and `python-canvas-frontend` modules, with only the
   frontend depending on `workspace`;
3. declare the checked-in generated TypeScript contract and any generated artifact command;
4. add quick focused suites for both modules, Go and frontend production builds, contract drift,
   and the smallest real Go/TypeScript boundary suite;
5. declare the pinned Basedpyright executable as a resolved app dependency rather than an
   undeclared external input;
6. preserve all existing workspace and playground ownership and suites; and
7. run `agents check` rather than editing the release-owned `AGENTS.md`.

The bootstrap tests must exercise real boundaries; no placeholder or pass-with-no-tests command is
acceptable. Obtain required owner review for `.code-policy.json`. The accepted bootstrap commit is
the trusted base for subsequent app task sessions.

Before changing `apps/python-canvas/package.json` or `pnpm-lock.yaml`, generate the candidate
lockfile without lifecycle scripts and run `code-policy dependency-review --base <merge-target>`.
Review the complete Basedpyright and frontend dependency change before installation.

## Implementation phases

### Phase A — callable-editor commit seam

Add the optional `TextValueEditor.onCommit` contract, focused keyboard/IME/disabled tests, public
export proof, and a small playground or fixture demonstration if needed to prove consumption.

**Boundary:** package-focused tests, public API checks, package build, and the existing playground
consumer remain green. No Python Canvas or LSP vocabulary enters the package.

**Completed 2026-08-17:** `TextValueEditor.onCommit` is available from the public root and uses the
current single-line editor value for an unmodified Enter. Focused tests cover modifier, IME, and
disabled cases, including the passive CodeMirror-extension handoff after an active editor becomes
disabled; the public API check, TypeScript check, workspace build, playground consumer test and
build, and authorized Code Policy focused and recommended profiles passed.

### Phase B — reviewed app and policy bootstrap

Add the minimal private frontend and Go roots, generated transport types, initial canonical snapshot,
strict HTTP decoding, frontend host lifecycle, and the protected Code Policy declarations above.

**Boundary:** `doctor --strict`, both quick suites, contract drift, the cross-language boundary
fixture, and both production builds pass from the new trusted base.

### Phase C — Go project and automatic codegen core

Implement the one-section project state, callable and parameter mutations with fake signature input
at the focused boundary, minimal dependency graph, renderer, source-range map, temporary generated
file, and golden output.

**Boundary:** focused Go tests prove automatic reconciliation, positional-only rendering,
determinism, exact source ranges, failed-mutation atomicity, and the final expected file. There is no
generation endpoint or frontend renderer.

### Phase D — real Basedpyright integration

Implement the bounded LSP process/session, signature snapshot, parameter normalization, canonical
document synchronization, diagnostic waiting, UTF-16 conversion, source-range mapping, and explicit
provider status.

Use fakes only for focused protocol failures. Add one integration test against the real pinned
Basedpyright executable for `math.sqrt`, `missing_value`, and `3`.

**Boundary:** the real server produces the `x` parameter, maps the undefined-name diagnostic to its
stable parameter ID, and clears it on the next exact generated revision without leaked temporary
files or processes.

### Phase E — frontend projection and browser acceptance

Implement the Callable registration, public commit editor, parameter projection, serialized
mutation controller, pending/unavailable status, read-only generated code section, and diagnostic
registry adapter. Connect it to the real Go service through the Vite proxy.

Add one browser acceptance covering the exact walkthrough using accessible roles and labels. Reuse
the repository's headless Chrome/CDP support if sufficient; any new browser dependency requires
normal dependency review.

**Boundary:** the complete walkthrough passes against production frontend code, the real Go
service, and real Basedpyright. All imports come from the `@setta/workspace` public root.

### Phase F — verification closeout

Register the completed browser suite in `.code-policy.json` through a separate reviewed
control-plane closeout so the implementation loop never widens its own active verification scope.
Run `doctor --strict` after registration and document local startup plus every deferred capability
in the app README.

**Boundary:** focused, integration, browser, generated-contract, and production-build evidence is
owned by the declared modules and selectable through Code Policy.

## Verification

During implementation, run focused checks at their owning boundaries:

- workspace commit-seam component and public API tests;
- Go project, renderer, materialization, and HTTP tests;
- Go LSP framing, signature parsing, versioning, cleanup, and diagnostic-mapping tests;
- one real pinned-Basedpyright integration suite;
- frontend projection and interaction tests;
- deterministic generated-contract comparison;
- frontend and Go production builds; and
- the one real browser vertical-slice suite.

Near each task's completion, run `code-policy test --changed --base <merge-target>`. After bootstrap
or any later policy change, run `code-policy doctor --strict` and the relevant static checks.

Before merging, run `code-policy test-levels --base <merge-target>` and present exactly its
recommended and full ordinary choices. Do not run a broader ordinary choice, `verify`, `gate`, or a
supplemental suite without the authorization required by the checked-in policy.

## Review boundary

Reviewers should inspect only:

- the generic callable-editor commit seam;
- Go ownership of semantic project state and automatic reconciliation;
- deterministic one-Callable dependency ordering and rendering;
- real Basedpyright lifecycle, signature normalization, version binding, and cleanup;
- range-based diagnostic mapping without message heuristics;
- public workspace composition and backend projection;
- strict generated transport ownership; and
- the exact acceptance walkthrough.

Do not expand review into source discovery, execution, persistence, ports/edges, general Python
syntax analysis, multiple callables, alternate language servers, complete main-branch parity, or
unchanged workspace internals. Concrete regressions in changed code remain in scope.

## Stop conditions

Stop and request a new decision if:

- a real pinned Basedpyright cannot reliably resolve `math.sqrt` in the generated snapshot;
- callable or parameter behavior cannot be implemented through public workspace exports plus the
  single proposed `onCommit` seam;
- diagnostic targeting would require parsing provider message text rather than using generated
  ranges;
- meaningful codegen requires another section type, ports/edges, the shared transaction core, or
  the complete main project aggregate;
- the backend would need arbitrary Python statements or execution to pass the walkthrough;
- the Basedpyright or frontend dependency graph does not pass dependency review;
- Code Policy cannot express the app modules and real suites without weakening the locked baseline;
  or
- implementation begins adding source watching, persistence, completion UI, execution, CLI, MCP,
  metadata, variants, or a second callable to make the first walkthrough pass.

## Completion criteria and next decision

This plan is complete only when:

- committing `math.sqrt` through the public Callable section produces the LSP-derived `x` row;
- callable and parameter mutations automatically regenerate the Go-owned `SettaState` output;
- a real undefined-name diagnostic maps to `x` by generated range and clears after entering `3`;
- the generated file is deterministic, temporary, synchronized with Basedpyright, and cleaned up;
- the frontend applies canonical Go responses through public workspace APIs only;
- the one host and all LSP/process resources are disposed cleanly;
- focused, integration, browser, generated-contract, build, and authorized policy evidence pass; and
- no deferred capability or compatibility surface has been added.

After acceptance, use observed consumer pressure to choose the next plan. Likely candidates are
frontend callable completion, editable prefix/suffix regions, a second section/value dependency, or
source discovery. Do not infer that CLI, MCP, execution, persistence, ports/edges, or the complete
workspace generalization roadmap comes next.
