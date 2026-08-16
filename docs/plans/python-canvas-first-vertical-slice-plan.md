# Python Canvas First Vertical Slice Plan

## Purpose and status

**Status: proposed; not yet authorized for implementation.**

This is the bounded implementation plan for the first useful Python Canvas consumer of
`@setta/workspace`. It starts from the completed instance-scoped workspace-host cutover and tests
the most important product assumption before adding more reusable infrastructure:

> Can an application compose the existing public workspace UI with a small Go service to turn
> authored section values into deterministic Python?

The answer should be demonstrated with one real end-to-end path: edit the arguments of one
supported Python call on the canvas, choose **Generate Python**, and see the Go-generated source in
a read-only workspace code section.

This plan replaces the first implementation milestone described in
`docs/plans/python-canvas-monorepo-plan.md`. That broader document remains a roadmap and research
record, not an executable checklist. In particular, this slice does not require the deferred
workspace transaction core, ports and edges, schemas for workspace internals, or semantic editor
services.

## Outcome

A clean checkout can start a private `apps/python-canvas` frontend and Go backend. The initial
workspace contains:

- one application-owned **Python Call** section for `textwrap.shorten`;
- editable item rows for `text`, `width`, and `placeholder`;
- one package-owned, read-only Python code section; and
- one host-registered **Generate Python** toolbar command.

After changing an argument and invoking the command, the frontend projects only the Python call
data from the current workspace snapshot, sends a version-1 generation request to the Go service,
and places the successful result in the code section. Invalid input or an unavailable backend is a
visible failure and never becomes an empty successful result.

The slice is complete when that behavior works through production application boundaries and all
workspace imports come from the package's public root export.

## Fixed decisions

1. Add one private application at `apps/python-canvas`. Its frontend is a pnpm workspace package;
   its backend is a nested Go module. Do not add a root Go module or `go.work`.
2. Keep `packages/workspace` and `apps/playground` unchanged unless the consumer proves one exact
   public seam is missing. A discovered gap requires a separate, narrowly justified workspace
   change; it is not permission to resume the generalization roadmap.
3. Use the existing `WorkspaceHost`, `WorkspaceProvider`, `WorkspaceShell`, section-kind registry,
   item controls, commands, toolbar contributions, and built-in code section.
4. Go owns Python generation rules and the generation HTTP contract. The frontend owns the
   projection from a workspace snapshot into that contract. The backend never receives or decodes
   the complete workspace document.
5. Support exactly one callable catalog entry in this slice: `stdlib.textwrap.shorten`. Do not add a
   generic plugin system, arbitrary Python expressions, or dormant variants for future callables.
6. Generation is explicit. Editing the workspace does not start background requests, debounce
   changes, or continuously synchronize a backend model.
7. The first slice is in-memory. It does not define or persist a Python Canvas project file.
8. Development runs the frontend and loopback-bound Go service as separate processes. Embedding or
   packaging frontend assets into the Go binary is a later delivery decision.
9. Version 1 begins here. Unsupported versions fail explicitly; there are no legacy readers,
   migrations, aliases, or transitional endpoints.

## Explicit non-goals

Do not use this plan to add:

- MCP, a user-facing CLI, or headless command parity;
- the deferred `@setta/workspace/core` snapshot/transaction engine;
- ports, edges, connection gestures, or a multi-section dependency graph;
- source-root discovery, filesystem watching, callable reconciliation, or source identity;
- an LSP process, completion, hover, signatures, or diagnostic mapping;
- Python execution, interpreter discovery, terminals, PTYs, run history, or cancellation;
- project save/load, databases, authentication, collaboration, or optimistic synchronization;
- semantic source maps beyond stable section/item identifiers in generation failures;
- a second callable, collection-value system, arbitrary expression escape hatch, or plugin ABI;
- a public package, final naming, licensing, desktop packaging, deployment, or release artifacts;
- copied application stores or wholesale ports from `setta-main`; or
- general workspace cleanup, parity auditing, file-length work, or speculative edge-case review.

The frozen main application may explain intended Python rendering behavior, but implementation must
port only the small rules named here. It must not import that repository or reproduce its project
aggregate.

## Acceptance walkthrough

The single product walkthrough is:

1. Start the Go service on a loopback address and start the Vite frontend with its development
   proxy targeting that service.
2. Open Python Canvas and observe one Python Call section and one Generated Python section.
3. Change `width` from its initial integer value to another valid integer through the public
   workspace item control.
4. Invoke **Generate Python** from the workspace toolbar.
5. Observe a pending status while exactly one request is active.
6. Observe deterministic Python in the read-only code section, including the edited width.
7. Enter an invalid integer and invoke generation again.
8. Observe an issue targeted to the `width` item. Keep the last successful source visible; do not
   replace it with empty or partial output.
9. Stop the backend and invoke generation once more. Report the backend as unavailable without
   changing the last successful output.

The expected successful source is formatted from one fixed callable definition, for example:

```python
from textwrap import shorten

shortened_text = shorten(
    text="A deliberately long greeting for the first Python Canvas slice.",
    width=32,
    placeholder="...",
)
```

The exact initial values may be adjusted before implementation, but the callable, fields, stable
ordering, and output style are fixed for this plan.

## Repository shape

Keep the new application small:

```text
apps/python-canvas/
├── package.json
├── index.html
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── frontend/
│   ├── main.tsx
│   ├── app/
│   │   ├── PythonCanvasApp.tsx
│   │   └── initialWorkspaceDocument.ts
│   ├── generation/
│   │   ├── generationClient.ts
│   │   ├── generationController.ts
│   │   └── projectGenerationRequest.ts
│   ├── generated/
│   │   └── generationContract.ts
│   └── sections/
│       └── pythonCallSection.tsx
└── backend/
    ├── go.mod
    ├── cmd/python-canvas/main.go
    └── internal/
        ├── contracts/
        ├── generation/
        └── httpapi/
```

Exact test filenames and small helper files may follow their owning code. Do not create additional
packages, Go modules, `domain`, `application`, `adapters`, `ports`, or `shared` directories until a
second responsibility actually needs them.

The frontend package declares `"@setta/workspace": "workspace:*"` and exact versions for direct
dependencies. The Go module should use only the standard library for this slice unless a specific
need survives dependency review.

## Ownership and dependency direction

| Concept                                                       | Authoritative owner                    | Consumer form                                     |
| ------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------- |
| Generic workspace document, layout, controls, and interaction | `@setta/workspace`                     | Public React and TypeScript exports               |
| Meaning of the Python Call section in the browser             | Python Canvas frontend section adapter | Validated projection from the host snapshot       |
| Generation request/result wire contract                       | Python Canvas Go `contracts` package   | Deterministically generated TypeScript projection |
| Supported callable catalog and Python rendering rules         | Python Canvas Go `generation` package  | HTTP generation result                            |
| Pending, success, unavailable, and issue presentation         | Python Canvas frontend controller      | App status plus the built-in code section         |

Dependency direction is:

```text
@setta/workspace
        ^
        |
Python Canvas frontend --> generated Go-owned transport types
        |
        v
thin HTTP client --> Go HTTP adapter --> Go generation core
```

The Go backend does not import, execute, or reimplement workspace internals. The frontend does not
render Python itself. Generated TypeScript transport types contain data shapes only and import
nothing from either runtime.

## Workspace composition

### Host setup

The frontend creates exactly one host for the mounted application and performs setup in this order:

1. create the host;
2. register the Python Call kind and the package's built-in code kind;
3. register the generation command and toolbar contribution;
4. load the initial document; and
5. mount `WorkspaceProvider` and `WorkspaceShell`.

Dispose the host on application teardown. Keep `WorkspaceShellViewState` controlled in the app and
separate from the workspace document.

### Python Call section

Use one application-owned kind ID and one strictly parsed data shape, such as:

```ts
type PythonCallSectionDataV1 = {
  version: 1;
  callableId: "stdlib.textwrap.shorten";
};
```

The section's item tree contains stable items for `text`, `width`, and `placeholder`. Each item uses
the package's single-line text presentation so the user can author a value and receive a precise
generation-time error for malformed input. Application-owned item data identifies the argument
name and literal kind; labels are presentation rather than parser keys. Render the rows through
`WorkspaceItemList`.

The kind registration supplies `assertValidData`, a default size, and the section renderer. It does
not query private DOM nodes, reconstruct package rows, or deep-import package modules.

The item IDs, application-owned item data, control values, and order form the frontend projection
contract. The backend still validates every request; frontend validation exists to produce a
precise local issue rather than to replace the trust boundary.

Map backend issues with an `itemId` into the package's existing item-diagnostic registry passed to
`WorkspaceItemList`. Keep request-wide and unavailable status in app UI outside the document. Do
not persist either form or generalize the package diagnostic model for this slice.

### Generated Python section

Register `WORKSPACE_CODE_SECTION_KIND` through `createWorkspaceCodeSection`. The initial document
contains one section using `createWorkspaceCodeSectionData` with Python, line numbers, and
`readOnly: true`.

On success, update that section only through the public code-section mutation API. On failure,
leave its previous code unchanged. Do not put request state, backend errors, or generation history
inside the code-section document data.

### Generation command

Register one pane command, `python-canvas.generate`, for the toolbar surface and contribute it with
`registerWorkspaceToolbarContributions`. Its controller:

1. reads one immutable host snapshot;
2. validates and projects the Python Call section and its items;
3. records a monotonically increasing in-memory request token;
4. sends one request;
5. ignores a response whose token is no longer current or whose projected inputs changed; and
6. applies only the latest matching success or visible failure.

Only one request may be active. A second invocation reports that generation is already pending.
This is local stale-response protection, not a general transaction or reconciliation system.

## Version-1 generation contract

The Go `contracts` package owns the request, success, and failure structures. Generate the frontend
projection deterministically and check it in. A drift check regenerates into a temporary directory
and compares bytes; neither side hand-maintains a second copy.

The request contains only:

- `version`, exactly `1`;
- the stable workspace `sectionId` for issue mapping;
- `callableId`, exactly `stdlib.textwrap.shorten` for this slice;
- an ordered, non-empty argument list containing stable `itemId`, argument `name`, literal `kind`,
  and authored string `value`.

Literal kinds are limited to `string` and `integer`. A string value is data to escape, never Python
source. An integer is a canonical base-10 value within an explicitly tested range. Reject duplicate
argument names or item IDs, unknown/missing arguments, reordered required arguments, unsupported
kinds, malformed identifiers, unexpected fields, and trailing JSON.

A success contains version `1` and complete generated code. A failure contains version `1`, a
stable failure code, and one or more issues with `sectionId`, optional `itemId`, field, and message.
Use HTTP status to distinguish malformed input, unsupported version, semantic validation failure,
method/content-type errors, oversized input, and internal failure. The frontend must not infer
failure type from message text.

Do not include a workspace snapshot, revision, operation, edge, source location, interpreter path,
or execution result in this contract.

## Go generation core

The pure `generation` package accepts a fully validated version-1 request and returns source or a
typed error. It has no HTTP, filesystem, environment, process, UI, or persistence imports.

Required behavior:

- Resolve the one supported callable from an explicit catalog rather than interpolating module or
  symbol names supplied by the browser.
- Keep the module, symbol, result name, required argument names, literal kinds, and argument order
  in that catalog. The browser supplies none of the emitted identifiers.
- Preserve catalog-defined argument order; never depend on Go map iteration.
- Render named arguments with four-space continuation indentation and a trailing comma.
- Encode strings with a dedicated Python literal function covering quotes, backslashes, newlines,
  control characters, and Unicode. Never concatenate an authored value as raw Python.
- Parse and render integers canonically. Reject overflow and non-canonical or non-integer input.
- Validate the result identifier and all emitted identifiers against Python identifier and keyword
  rules.
- Build the complete output in memory and return it once. There is no partial output on failure.
- Produce byte-identical output for byte-identical requests.

Focused golden tests cover the accepted walkthrough plus escaping, invalid values, duplicate or
missing arguments, unsupported versions/callables/kinds, deterministic repetition, and the absence
of partial output. Keep this matrix bounded to the declared rules; do not audit the Python grammar
or invent future literal types.

## HTTP boundary

Expose one endpoint, `POST /api/v1/generate`, from a standard-library Go server. The adapter must:

- bind to loopback by default;
- accept only the expected method and JSON content type;
- set a small explicit request-body limit;
- decode once, reject unknown fields and trailing values, and validate the complete request;
- pass request cancellation into the handler boundary even though generation is synchronous;
- return JSON with explicit content type and stable status/failure codes;
- avoid broad recovery that converts programmer errors into plausible generation failures; and
- log bounded operational context without logging authored values or generated source.

Use the Vite development proxy so the browser calls a same-origin `/api/v1/generate` path. Do not
add permissive CORS, authentication placeholders, a websocket, polling, or an event stream.

The delivery binary only wires configuration, logging, the handler, and graceful shutdown. It is
not a general CLI: it exposes no product subcommands, project operations, or headless generation
surface.

## Code Policy bootstrap

The current trusted configuration owns only `workspace` and `playground`. Candidate configuration
cannot widen a Code Policy task session, and `.code-policy.json` is protected control-plane state.
Therefore the new app requires one explicit, separately reviewed bootstrap before the ordinary plan
loop begins.

That bootstrap should:

1. add the minimal compilable app roots and meaningful boundary tests;
2. change the project kind from library to application and add only the `backend`, `frontend`, and
   `ui` capabilities actually present;
3. add non-overlapping `python-canvas-backend` and `python-canvas-frontend` modules, with only the
   frontend depending on `workspace`;
4. add quick focused suites for both modules, Go and frontend build checks, and one generated-
   contract drift check;
5. add the smallest real app integration/contract suite required for the new backend capability,
   without treating the existing playground or packed consumer as proof of the new backend;
6. declare generated frontend contract output in `.code-policy.json`;
7. keep the existing workspace/playground ownership and suites intact; and
8. run `agents check` rather than editing the release-owned `AGENTS.md`.

The bootstrap tests must exercise real boundaries; no placeholder, pass-with-no-tests, or
scaffold-only command is acceptable. Because it changes protected configuration, obtain the
required owner review and commit it as one deliberate control-plane/bootstrap change. That accepted
commit becomes the trusted base for subsequent task sessions and plan-loop phases.

Before changing `apps/python-canvas/package.json` or `pnpm-lock.yaml`, generate the candidate
lockfile without lifecycle scripts and run `code-policy dependency-review --base <merge-target>`.
Install only after the candidate graph is accepted. Pin every direct dependency and keep the root
package-manager version unchanged unless a separate dependency decision authorizes otherwise.

## Implementation phases

### Phase A — reviewed app and policy bootstrap

Perform the explicit bootstrap above. Keep the initial code to the smallest real contracts needed
for the configured focused suites: the version-1 transport structs and deterministic TypeScript
projection, strict request decoding on the backend, and creation, registration, loading, and
disposal of the initial workspace on the frontend.

**Boundary:** `doctor --strict`, static checks, both new quick suites, the app integration/contract
suite, contract drift, and both build checks pass from the new trusted base. The app modules are
then available for ordinary scoped work.

### Phase B — Go contract, generator, and HTTP endpoint

Complete contract validation and implement the one-callable catalog, pure renderer, typed failures,
handler, and loopback service while keeping the generated TypeScript projection current. Keep
transport and generation packages separate without adding speculative layers.

**Boundary:** focused Go tests prove all declared rendering and boundary rules. The real service
accepts the walkthrough fixture and returns the exact expected source. No frontend behavior is
required yet.

### Phase C — workspace frontend and generation controller

Implement the initial document, Python Call registration, public item-list composition, read-only
code section, controlled shell, generated client, command, toolbar contribution, pending/error
status, and stale-response protection.

Use a fake HTTP adapter for focused component tests and production generated transport types for all
requests and responses.

**Boundary:** frontend tests edit the public workspace control, invoke the registered command, and
prove matching success, validation failure, unavailable backend, and stale response behavior without
deep imports or private selectors.

### Phase D — real vertical-slice acceptance and closeout

Connect the real frontend to the real Go service through the development proxy. Add one
browser acceptance that performs the exact walkthrough using accessible roles and labels. Reuse the
repository's existing headless Chrome/CDP support if it meets the need; adding a browser dependency
requires normal dependency review.

Register the completed browser suite in `.code-policy.json` through a separate reviewed
control-plane closeout; do not let the implementation loop edit its own active verification scope.
Run `doctor --strict` again after that registration.

Document local startup and the intentionally deferred capabilities in the app README. Update the
broad monorepo roadmap only to point to accepted evidence; do not mark its deferred platform phases
complete.

**Boundary:** the complete acceptance walkthrough passes against real processes, both production
builds pass, the generated contract is current, and an unrelated workspace package consumer remains
green.

## Verification

During implementation, run focused checks at their owning boundary:

- Go contract, generator, and HTTP package tests from `apps/python-canvas/backend`;
- frontend projection, section, controller, and app component tests;
- generated-contract drift comparison;
- frontend and Go production builds; and
- the one real browser vertical-slice suite.

Near each task's completion, run `code-policy test --changed --base <merge-target>`. After bootstrap
or any later module/check change, run `code-policy doctor --strict` and the relevant static policy
selection.

Before merging, run `code-policy test-levels --base <merge-target>` and present exactly its
recommended and full ordinary choices. Do not run a broader ordinary choice, `verify`, `gate`, or
supplemental suite without the authorization required by the checked-in policy.

## Audit boundary

Reviewers should inspect only:

- public-package consumption and host lifecycle;
- the declared Python Call projection;
- strict request parsing and typed errors;
- safe literal encoding and deterministic output;
- success, validation, unavailable, and stale-response UI behavior;
- module direction and generated-contract ownership; and
- the exact acceptance walkthrough.

Do not expand review into general Python code generation, complete Python syntax support, graph
algorithms, LSP behavior, persistence, execution security, deployment, application-wide UX parity,
or unchanged workspace internals. Concrete regressions in changed code remain in scope.

## Stop conditions

Stop and request a new decision if:

- the slice cannot be built entirely through public `@setta/workspace` exports;
- meaningful generation requires ports, edges, the transaction core, or changes to generic
  workspace document semantics;
- the backend would need the complete workspace document or a copy of workspace mutation logic;
- frontend and Go contract projections cannot have one deterministic owner without substantial
  new tooling;
- safe rendering requires accepting arbitrary Python expressions from the browser;
- Code Policy cannot express the app modules and real suites without weakening the locked baseline;
- a new dependency is necessary but does not pass dependency review; or
- implementation starts adding source discovery, LSP, execution, project persistence, CLI, MCP, or
  another callable to make the first walkthrough pass.

## Completion criteria and next decision

This plan is complete only when:

- the real browser walkthrough passes against the real Go service;
- generated Python is deterministic, safely encoded, and shown through the package code section;
- validation and backend unavailability are visible and preserve the last successful output;
- the app uses one disposed host and only public workspace APIs;
- Go and frontend contracts have one authoritative owner and a passing drift check;
- focused, integration, build, and authorized ordinary policy evidence pass; and
- no deferred capability or compatibility surface has been added.

After acceptance, use observed consumer pressure—not this roadmap—to choose the next plan. Likely
questions are whether users first need multiple connected calls, source discovery, or execution.
Only a demonstrated need for atomic cross-surface mutations should reopen the headless transaction
core. Only a demonstrated need for visual data flow should authorize ports and edges.
