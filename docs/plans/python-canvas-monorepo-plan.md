# Python Canvas Monorepo Plan

## Status and decision

This is the implementation plan for turning this repository into the Setta monorepo and adding the
first application built on `@setta/workspace`. The application working name is **Python Canvas**;
`apps/python-canvas` is an internal repository path, not a final product or publication-name
decision.

The decision is:

- keep `packages/workspace` as the backend-free, independently consumable UI/core package;
- keep `apps/playground` as its small backend-free reference consumer;
- add one private mixed TypeScript/Go application at `apps/python-canvas`;
- let Python Canvas import `@setta/workspace` through pnpm's `workspace:*` protocol;
- give Python Canvas its own Go module, project format, backend, CLI, MCP server, runtime policy,
  and tests; and
- keep Python-specific source analysis, reconciliation, code generation, LSP, execution, and
  terminal behavior inside that application unless one of those boundaries later proves useful
  independently.

This plan does not authorize compatibility with the existing Setta project format, a migration
path, a new public package, or publication. The new project format starts at version 1 and rejects
unsupported versions explicitly. The frozen `../setta-main` worktree at commit `043d3b2e9` is a
read-only behavior and extraction reference, not a dependency.

## Goals and boundaries

Python Canvas should eventually let a person:

1. point the application at an explicit Python source root and interpreter;
2. discover functions and classes and place callable/value sections on the workspace;
3. connect values and outputs to typed arguments;
4. review and apply identity-preserving source-reconciliation plans;
5. compile the graph into deterministic Python plus a semantic source map;
6. receive LSP diagnostics, completions, signatures, and documentation in the visual context;
7. run a function or project entry point and map diagnostics and tracebacks back to sections,
   items, ports, and source locations; and
8. perform the same meaningful operations through the UI, CLI, and Python-Canvas-owned MCP
   server.

The application is not a restoration of the full product on `main`. It deliberately excludes
chat, agent management, app generation, plugin installation, deployment, social/browser embeds,
the universal Setta MCP surface, and the existing project-management and project-file systems.

## Observed starting point

The repository is already a pnpm workspace: `packages/*` and `apps/*` are workspace roots, and the
playground consumes the UI package. The physical conversion to a monorepo is therefore small; the
important work is defining ownership and completing the reusable core boundary.

The current `@setta/workspace` package already provides a substantial React surface:

- a serializable section document and full-document change callback;
- canvas, selection, grouping, resizing, DnD, item trees, controls, panes, Inspector, Outline,
  commands, shortcuts, and toolbar/context-menu extension points;
- opaque application-owned section data with load-time validation;
- built-in text and code sections; and
- host-supplied item diagnostics.

It is intentionally backend-free, but several current contracts are not yet sufficient for a
backend-coordinated graph application:

| Current contract                                                  | Python Canvas need                                                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Module-global stores, registries, and document callback           | One instance-scoped host/controller per open project                                                 |
| Full snapshot notification without revision or operation identity | Expected-revision transactions, conflicts, acknowledgements, and inverses                            |
| Sections and item trees, but no public ports or edges             | Connections from values/outputs to callable arguments                                                |
| TypeScript interfaces only                                        | A versioned serialization/schema surface from which Go wire types can be generated                   |
| Package-private section CodeMirror wrapper                        | Generic diagnostics, semantic ranges, completions, hover/signature requests, and reveal-source hooks |
| Item-only ephemeral diagnostics                                   | Section, item, port, edge, and text-range status/diagnostic presentation                             |

The code section contract explicitly leaves file binding, LSP diagnostics, generated-code ranges,
and backend completion outside the package. That separation is correct; Python Canvas needs a
generic editor extension surface, not Python or LSP concepts inside the UI package.

Useful extraction anchors on the frozen main worktree include:

- `internal/codegen` for the dependency graph, renderer, values, diagnostics, materialization,
  and rename behavior;
- `internal/watchcode` and the `internal/projectstate/watch_code*` owners for source snapshots and
  reconciliation planning;
- `internal/lsp`, `internal/lspcompletion`, and `internal/lspsignature` for language-server
  lifecycles and snapshot requests;
- `internal/pythonenv` for interpreter resolution;
- `internal/terminals`, `internal/runs`, and `internal/detachedruns` for execution behavior; and
- the narrow `internal/projectstate/python_codegen*`, `code_section_bindings*`,
  `section_code_objects*`, and `lsp_diagnostics*` contracts.

These are sources to port and prune. `internal/projectstate` as a whole must not become the new
application domain.

## Recommended repository shape

Keep one top-level pnpm workspace and place the complete application under one app root:

```text
.
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── packages/
│   └── workspace/
│       ├── src/
│       │   ├── core/                 # new headless structural boundary
│       │   └── ...                   # existing React/interaction implementation
│       └── package.json
├── apps/
│   ├── playground/
│   └── python-canvas/
│       ├── package.json              # private pnpm package and frontend build
│       ├── go.mod                    # app-owned Go module
│       ├── go.sum
│       ├── cmd/
│       │   └── python-canvas/
│       ├── internal/
│       │   ├── domain/
│       │   ├── contracts/
│       │   ├── sourceindex/
│       │   ├── reconcile/
│       │   ├── compiler/
│       │   ├── sourcemap/
│       │   ├── lsp/
│       │   ├── execution/
│       │   ├── terminal/
│       │   ├── projectfile/
│       │   ├── application/
│       │   ├── adapters/
│       │   └── delivery/
│       │       ├── httpapi/
│       │       └── mcp/
│       ├── frontend/
│       │   ├── app/
│       │   ├── backend/
│       │   ├── sections/
│       │   └── panes/
│       ├── generated/                # checked/generated contract projections
│       ├── workspace-runtime/        # bounded @setta/workspace/core bridge
│       └── scripts/                  # app-only build/generation helpers
└── docs/
    ├── architecture/
    └── plans/
```

The application should have a nested `go.mod`, not a repository-root Go module. This keeps its Go
dependency graph and `internal/` boundary self-contained, prevents a future app from importing it
accidentally, and lets a future Go-backed app pin its own runtime independently. Do not add a
root `go.work` until a real cross-module development need exists; it would make accidental
cross-application coupling easier.

`apps/python-canvas/package.json` remains private and declares
`"@setta/workspace": "workspace:*"`. React and other direct frontend dependencies are exact-pinned
there. The app owns Vite/build configuration and can embed its production frontend in the Go
binary after the development topology is stable. Internal Go directories are not npm packages or
separately published Go modules merely because they are testable.

Future applications should follow the same `apps/<application>` pattern and may depend on
`@setta/workspace`; they must not import Python Canvas or each other.

## Authoritative ownership and cross-language contracts

The monorepo must not create competing TypeScript and Go owners for the same behavior.

| Concept                                                                                  | Authoritative owner                                | Downstream form                                           |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| Structural workspace snapshot, ports/edges, operations, transaction validation, inverses | `@setta/workspace/core` TypeScript                 | Versioned JSON Schema and generated Go wire types         |
| Python callable/value graph semantics and invariants                                     | Python Canvas Go domain                            | Generated frontend/API projections                        |
| Python Canvas project aggregate and persistence rules                                    | Python Canvas Go application/project-file boundary | Generated frontend client contracts                       |
| Editor diagnostics/completion presentation                                               | Generic UI package types                           | Python Canvas adapts LSP responses into those types       |
| LSP, source watcher, filesystem, interpreter, process, PTY protocols                     | Python Canvas Go ports/adapters                    | Normalized app events; provider types do not cross inward |

The persisted Python Canvas project should compose, rather than blur, those owners. A project
contains a version, one application revision, a versioned workspace snapshot, and Python-owned
domain data keyed by stable IDs. The persisted graph topology must have one representation. The
Go domain builds a validated `PythonGraph` from the canonical snapshot and Python payloads at the
ingress boundary; it must not save a second edge list that can drift from the workspace edges.

The two generation directions remain explicit:

- `@setta/workspace/core` owns structural schemas and generates Go decoders/wire types consumed by
  Python Canvas.
- Python Canvas Go owns app commands, results, events, and domain payload schemas and generates the
  TypeScript client/types in `apps/python-canvas/generated`.

A project-specific generation check must regenerate both surfaces in a temporary directory and
compare them byte-for-byte with checked-in outputs. Generated files remain governed and follow
module direction, but are never hand-edited.

### Structural mutation flow

UI gestures, CLI commands, and MCP tools must converge on one application service:

1. A caller submits a typed command or workspace transaction with the expected project/workspace
   revision and a caller-generated idempotency ID.
2. The Go application service serializes mutation per project and rejects a stale revision with a
   typed conflict containing the current revision.
3. For a structural transaction, Go invokes the exact built `@setta/workspace/core` operation
   engine through the bounded `workspace-runtime` bridge. The bridge accepts and returns only the
   versioned JSON contract; it does not own persistence or Python semantics.
4. Go parses the result, validates the entire resulting Python project and graph, and performs one
   atomic file replacement or database transaction.
5. Only after persistence succeeds does it increment the project revision and publish the typed
   event/acknowledgement.
6. The frontend reconciles its optimistic result by transaction ID and revision; a conflict loads
   the current snapshot and never pretends the write succeeded.

The browser may run the same pure core engine optimistically so drag/resize interaction is local
and responsive. A drag should publish one transaction at its semantic commit point, not network a
stream of pointer coordinates.

The JS bridge is the price of keeping the reusable structural algorithm TypeScript-owned while
retaining a Go application backend and headless CLI/MCP behavior. If shipping a bounded JS runtime
is unacceptable, stop for a separate architecture decision. Do not silently reimplement the
operation engine in Go.

## What Python Canvas imports and what it implements

Python Canvas should import the following from the UI package:

- the instance-scoped provider/host and in-memory host for tests;
- workspace snapshot, operation, transaction, revision, error, port, and edge contracts;
- `WorkspaceShell`, canvas interaction, Outline, Inspector routing, panes, commands, menus, DnD,
  selection, groups, and appearance;
- item trees and the package's generic controls;
- generic section/item/port/edge diagnostics and status presentation;
- the semantic code-editor primitive; and
- public stylesheet and testing/conformance helpers.

The app implements:

- registrations for Callable, Dict/value, Python Code, Terminal, and any app-specific sections;
- projections from Python domain objects into opaque section/item payloads and controls;
- Python-specific validation, port compatibility, signatures, defaults, passing styles, and
  connection semantics;
- pane content for sources, functions/classes, diagnostics, environment, runs, reconciliation,
  source identity, and run configuration;
- the backend host adapter and generated API client; and
- all persistence, LSP, source, compilation, execution, terminal, CLI, MCP, and security behavior.

The app should initially compose Callable and Dict sections from the public item/port primitives.
Promote a new Callable or Dict view into `@setta/workspace` only after its props and behavior are
demonstrably backend- and Python-neutral. Do not move Python vocabulary into the package merely to
reduce app code.

## Required work in `@setta/workspace`

### 1. Replace singleton runtime state with an instance host

Introduce an instance-scoped `WorkspaceHost`/provider that owns one snapshot, registrations,
subscriptions, presentation state, and transaction application boundary. Mounting two workspaces
in one page or test must not share section kinds, callbacks, active IDs, commands, or appearance.

The current package is unpublished, so replace the singleton public API and update the playground
directly. Do not add compatibility aliases or a second legacy path.

### 2. Extract the headless structural core

Add a pure, React-free subpath such as `@setta/workspace/core` within the same versioned package.
It should own:

- stable section, item, port, edge, view, and transaction IDs;
- a workspace revision;
- explicit serializable operations for create/delete/move/reparent/group/ungroup/resize,
  presentation changes, connect/disconnect, selection, and viewport/view changes as appropriate;
- whole-transaction validation and dry-run planning;
- deterministic application, structured errors, stale-revision conflicts, and atomicity;
- inverse transactions and undo/redo history; and
- JSON serialization and versioned schemas.

React gestures and programmatic callers must use the same operations. Full-document snapshots may
remain useful for load/resync, but they must no longer be the only change contract.

References, variants, saved views, and automatic layouts can follow after the first Python Canvas
vertical slice unless the slice proves one is required. Revisions, transactions, ports/edges, and
schema generation are blockers.

### 3. Add generic ports, edges, and connection interaction

The package owns structural endpoints, rendering, handles, connection gestures, selection,
deletion, and endpoint-existence validation. It may support generic direction and cardinality
metadata. Python Canvas owns whether an output type can feed a particular argument and whether a
connection is semantically executable.

Item rows need a public port/anchor slot or typed attachment point. The app must not query private
DOM selectors or import XYFlow handles.

### 4. Export versioned serialization artifacts

The public contract needs a schema/version for snapshots, transactions, and results, plus a
deterministic generator entry point. Package output may therefore grow from ESM, declarations,
source maps, and one stylesheet to include versioned schema assets. Update package-boundary tests
and the project-owned `AGENTS.md` description when this is implemented.

Generated Go types are projections, not a second structural owner. Conformance fixtures should
round-trip through TypeScript and Go decoders and run malformed inputs through production
boundaries.

### 5. Add a semantic editor surface without exposing CodeMirror

Export either a generic `WorkspaceCodeEditor` primitive or a narrow contribution contract for the
built-in code section. Its public types should support:

- immutable text diagnostics with severity, message, source, and offset range;
- generated/read-only/decorated ranges;
- completion, hover, and signature requests carrying document version and `AbortSignal`;
- cursor/selection and reveal-range intents; and
- explicit loading/unavailable/error status.

Use text offsets or another package-owned position type. Do not expose CodeMirror `EditorView`,
extensions, decorations, LSP wire types, backend URLs, or Python language-server responses. The
app adapter owns UTF-16/LSP position conversion, cancellation, and stale-response rejection.

### 6. Generalize ephemeral diagnostics and status

Extend the existing item diagnostic idea to stable targets: section, item, port, edge, and text
range. Keep diagnostics, compile state, reconciliation state, and run state outside the persisted
workspace snapshot unless they are genuinely authored project data. The UI package renders a
generic severity/status vocabulary; Python Canvas owns messages and meaning.

### 7. Add a testing/conformance surface

Provide an in-memory host, operation fixtures, schema fixtures, and helpers for mounting registered
sections and panes without private imports. Python Canvas should be able to prove that its host,
section registrations, and generated Go contracts conform without copying package test utilities.

## Python Canvas internal responsibilities

### Domain and project file

Define a small application aggregate with stable identities and explicit invariants. Parse the
complete file once, validate structural and Python payload contracts, and publish no partial
state. Save via a same-filesystem temporary file, durability step where required, and atomic
replacement. Expected revisions protect concurrent UI, CLI, MCP, watcher, and run updates.

Do not import the old Setta project document or its registries. Port only narrow behavior needed by
the new format.

### Source index and reconciliation

Index explicitly configured roots, discover supported functions/classes, retain file and callable
identity, and produce a reviewable reconciliation plan. Validate the complete plan before apply.
Renames, moves, removals, signature changes, and ambiguous matches need typed outcomes; destructive
graph changes never occur merely because a watcher emitted an event.

### Compiler and semantic source map

Build a Python-Canvas-owned validated graph, detect missing inputs and cycles, order dependencies
deterministically, encode values explicitly, and render stable Python. The semantic map should
connect generated spans to section, item/argument, port/edge, callable source, file, line, and
column identities. Diagnostics and tracebacks use this map rather than line-number heuristics.

### LSP

Own one process/session lifecycle behind a narrow port. Start with one exact supported server
(Basedpyright or Ty) after a deliberate choice; do not implement both during the first slice.
Normalize diagnostics, completions, hover, signatures, and provider failures at the adapter. Bound
requests, cancel stale work, and make unavailable/misconfigured status visible.

### Execution and terminal

Resolve the interpreter from CLI/config/environment/default precedence and report the resolved
source. Use argument arrays, contained working directories, a narrow environment allowlist,
explicit cancellation/timeouts, and bounded output. Secrets are never embedded in generated code,
project files, source maps, events, or logs. PTY behavior is an adapter behind the application
service, not part of the compiler or domain.

### Delivery

The Go binary owns thin CLI, HTTP/event, and MCP adapters over the same application services. The
frontend uses generated HTTP/event contracts. CLI and MCP should call the service in process when
possible rather than loop back through HTTP. A transport handler parses, authorizes, invokes one
command, and translates its typed result; it does not reconstruct business rules.

## Implementation sequence

### Phase 0 — finish and freeze the current package baseline

- Complete the remaining Milestone D acceptance/closeout work or explicitly declare the accepted
  baseline on which Python Canvas starts.
- Resolve the Code Policy command/CI bootstrap mismatches listed below.
- Record the current public surface and consumer proof before changing the host model.

Gate: the workspace package and playground are green and the chosen baseline is explicit.

### Phase 1 — workspace-core boundary spike

- Implement an instance host and one pure revision-checked transaction path.
- Add schemas and a generated Go round-trip fixture.
- Add one output port, one input port, connect/disconnect, and an edge on the playground.
- Drive one identical transaction from a UI gesture and the headless core.
- Prove stale conflicts, failed-transaction atomicity, inverse application, and two isolated mounted
  workspaces.

Gate: an unrelated consumer can use the core and React surface without a backend, and the Go
fixture consumes only generated structural contracts.

### Phase 2 — semantic UI seams

- Add row/section port attachment points and generic target diagnostics/status.
- Add the semantic editor primitive with a fake asynchronous provider in the playground.
- Add testing/conformance exports and package-boundary coverage.

Gate: the playground demonstrates diagnostics, completion cancellation, unavailable status, and
connections through public APIs only.

### Phase 3 — app and policy bootstrap

- Add the private `apps/python-canvas` pnpm package and nested Go module.
- Add the smallest Go domain/application/delivery skeleton and frontend host adapter.
- Establish both contract-generation directions and drift checks.
- Update `.code-policy.json`, project-owned `AGENTS.md`, build checks, focused suites, and CI in a
  separately reviewed control-plane batch.
- Run `code-policy dependency-review` before installing any new dependency graph.

Gate: the production frontend and Go binary build; a temporary version-1 project opens, changes,
saves, and reloads with revision checks.

### Phase 4 — first end-to-end Python slice

- Discover one Python function from a temporary source root.
- Create one Callable section and one Dict/value section.
- Connect one value to one argument.
- Compile deterministic Python and a semantic map.
- Run it with the configured interpreter.
- Map one compile/runtime failure back to the graph and reveal its source.

Gate: the complete flow uses production boundaries and no copied global Setta store.

### Phase 5 — source reconciliation and LSP

- Port/prune source watching and identity logic.
- Add reviewable reconciliation plans and atomic apply.
- Integrate the selected LSP server through virtual/generated documents.
- Map diagnostics, completions, signatures, hover, and source identity through the generic UI
  seams.

Gate: supported rename/move/signature changes preserve identity or produce an explicit review
conflict, and stale LSP responses cannot overwrite current state.

### Phase 6 — execution, terminals, CLI, and MCP

- Add run plans, cancellation, output/log history, and PTY sessions.
- Add the focused CLI commands for inspect/reconcile/connect/compile/run/output/serve.
- Add a Python-Canvas-specific MCP server with the same meaningful command contracts.
- Prove UI/CLI/MCP parity at the application service boundary.

Gate: headless CLI and MCP work without a mounted browser and use the exact workspace core bridge
for structural mutations.

### Phase 7 — packaging and release audit

- Embed or package frontend assets and the bounded workspace runtime deliberately.
- Verify interpreter/LSP/runtime resolution, platform support, licenses, notices, and source maps.
- Run browser, project round-trip, generated-contract, CLI/MCP, execution, and clean-install proofs.
- Decide naming, licensing, repository visibility, and release artifacts separately.

Gate: Python Canvas installs and runs without `setta-main` or another application.

## Code Policy 0.7.0 compatibility

### Audit result

**Code Policy 0.7.0 supports the recommended repository shape; no Code Policy package change is
required to start or complete this monorepo.**

Evidence from the exact locked release (`0.7.0`, digest
`7589787c48e28eb40a34247693c7bc545723f50ce01abe4be1bedf9f6e521b8f`) is:

- `doctor --strict` passes the current repository and reports 715 governed files across the two
  current modules.
- The release ships a TypeScript+Go application template.
- Its Go architecture reader resolves every nested `go.mod` and enforces declared module edges.
- Its sealed TypeScript/JavaScript resolver understands pnpm workspace links, package exports,
  static/dynamic/type-only imports, and nearest-package dependency ownership.
- It requires exactly one module owner for executable files and a quick focused suite for every
  module.
- It supports project-declared external inputs, generated paths, custom checks, artifact targets,
  nested test profiles, and caller-scoped task sessions.
- React and OSV activate conditionally; checked-in Python activates policy-owned Ruff.

### Target configuration changes

When the app scaffold exists, update `.code-policy.json` from a library-only description to an
application monorepo with `backend`, `frontend`, `ui`, and `cli` capabilities. A practical module
graph is:

| Module                   | Paths                                                          | Direct dependencies     |
| ------------------------ | -------------------------------------------------------------- | ----------------------- |
| `workspace`              | Existing package, package scripts, and consumer fixture        | none                    |
| `playground`             | `apps/playground/**`                                           | `workspace`             |
| `python-canvas-domain`   | `internal/domain`, `internal/contracts`, generated projections | none                    |
| `python-canvas-engine`   | source index, reconcile, compiler, semantic source map         | `python-canvas-domain`  |
| `python-canvas-runtime`  | LSP, execution, terminal, project-file and external adapters   | domain, engine          |
| `python-canvas-delivery` | application services, `cmd`, HTTP/events, MCP                  | domain, engine, runtime |
| `python-canvas-frontend` | frontend and workspace JS bridge                               | workspace, domain       |

Use exact non-overlapping globs in the real config. Do not declare an unused direct dependency
merely to document a generation relationship; the cross-language schema provenance belongs in the
generation contract check.

Add:

- one quick focused boundary suite for each new module;
- Go and frontend production build checks with explicit module coverage;
- a generated-contract drift check;
- a standard repository-scoped Python Canvas integration/project-round-trip suite;
- a full browser/E2E suite for the actual app;
- a CLI/MCP contract suite; and
- clean-package/runtime tests in the full profile.

Keep existing workspace/playground suites. The new `backend` capability needs an app-relevant
integration/contract/E2E suite; the existing packed UI consumer must not be treated as proof of the
backend merely because its test kind happens to satisfy a generic requirement.

Declare external inputs where applicable:

- the selected Python source root;
- an interpreter when it is not bundled;
- the LSP executable when it is not bundled; and
- a Node/runtime executable if the final workspace-core bridge does not package one.

Each declaration needs explicit resolution precedence, resolved-source diagnostics, compatibility
validation, unavailable behavior, a quick contract suite, and a distinct full behavior suite.

If repository-owned `.py` files are added for a packaged Python runtime, 0.7.0 supplies Ruff but
not Python type checking or Python import-architecture enforcement. Add honest module-scoped
`typecheck` and `architecture` providers in `.code-policy.json`, or avoid checked-in Python runtime
code. Do not label Ruff as proof it does not provide.

### Updated-tooling issues to fix in this repository

The recent policy upgrade left two operational mismatches that are independent of the monorepo
shape:

1. The installed launcher exists under `~/.local/share/code-policy/bin`, but that directory is not
   on this shell's `PATH`; the documented `code-policy` command currently returns “command not
   found.” Fix the developer/agent shell bootstrap or invoke the exact launcher path until it is
   fixed.
2. `.code-policy.lock.json` pins 0.7.0/digest `7589787c...`, while
   `.github/workflows/code-policy-security.yml` still selects the self-hosted runner label
   `code-policy-0.6.0-9417a24a`. Provision/select a runner with the exact locked release before
   relying on scheduled supply-chain verification.

The project-owned section of `AGENTS.md` also says the repository contains no application or
backend. Update that statement in the same reviewed policy/bootstrap phase that actually adds the
app, not in this planning-only branch.

### Does the Code Policy package itself need changes?

No package change is required. The following would be useful shared enhancements only if they are
worth supporting across multiple repositories:

- a first-class Python typecheck/import-architecture module (for example, the chosen pinned
  Basedpyright/Ty policy plus a real Python import graph), instead of target-declared providers;
- a declarative generated-contract/provenance check, instead of the Python Canvas custom drift
  check; and
- if self-hosted runner labels are intended to encode Code Policy releases, a validator that
  compares that convention with `.code-policy.lock.json`.

Those are convenience and coverage improvements, not blockers. The 0.7.0 extension points are
already sufficient, and project-specific generator semantics should remain in this repository
unless they become genuinely generic.

### Task-session bootstrap consequence

Code Policy 0.7.0 intentionally freezes module ownership from the trusted starting commit and
refuses candidate edits to `.code-policy.json`. The first app scaffold and the policy config cannot
bootstrap each other silently in one ordinary module session. Use one of these explicit sequences:

1. add a minimal, enumerated scaffold through `task-session --allow-new-path`, then make the
   control-plane/config update as a separate reviewed commit; or
2. perform one explicitly reviewed bootstrap batch, verify it, and treat its accepted commit as
   the trusted base for all later module-scoped sessions.

After that point, every implementation task selects only the relevant named Python Canvas and/or
workspace modules. Do not widen a session from candidate config.

## Verification strategy

During implementation:

- run the exact locked Code Policy release, not the neighboring Code Policy checkout or 0.7.1;
- run `code-policy dependency-review --base <merge-target>` on a scripts-disabled candidate
  lockfile before installing any dependency change;
- keep generated-contract, domain, compiler, LSP, execution, and UI tests focused at their owning
  boundaries;
- run `code-policy test --changed --base <merge-target>` near completion of each batch; and
- run `code-policy doctor --strict` after module, language, provider, or coverage changes.

Before broader verification, run `code-policy test-levels --base <merge-target>` and present the
emitted recommended and full ordinary choices. Run neither ordinary broad choice, `verify`, nor
`gate` without the authorization required by the checked-in policy. Supplemental mutation/risk
evidence remains a separate later decision.

## First vertical-slice acceptance test

The first application milestone is successful when a clean checkout can:

1. frozen-install pnpm dependencies and download/build the pinned Go graph;
2. start Python Canvas with an explicit temporary source root and interpreter;
3. discover a fixture function;
4. create a Callable section and value section using only public workspace APIs;
5. connect a value to an argument through public ports/edges;
6. save and reload the version-1 project;
7. generate deterministic Python and a semantic map;
8. execute the function;
9. map a deliberate failure to the correct section/argument/source span; and
10. repeat the compile/run command headlessly through the Go CLI.

The slice must not import `setta-main`, deep-import `@setta/workspace`, reach private XYFlow or
CodeMirror values, duplicate the structural operation engine in Go, or treat an unavailable
runtime as an empty successful result.

## Stop conditions and deferred decisions

Stop and return for an architecture decision if:

- the app requires Python/LSP/backend concepts in the public workspace contract;
- the Go backend would need a handwritten copy of structural operations or schema;
- the project needs two persisted owners for graph topology;
- source reconciliation cannot distinguish a safe identity-preserving change from a destructive
  guess;
- the chosen LSP/runtime cannot be pinned, licensed, contained, or made explicitly unavailable;
- task-session/module configuration would require weakening the locked policy baseline; or
- extraction requires changing the frozen main worktree.

Before release, separately decide the final application/package names, web/local-desktop delivery,
the single supported initial language server, whether the workspace JS runtime is bundled or an
explicit external input, public repository visibility, license, signing, and artifact format.
None of those decisions changes the recommended monorepo ownership shape.
