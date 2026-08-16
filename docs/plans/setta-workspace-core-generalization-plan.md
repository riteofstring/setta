# Setta Workspace Core Generalization Plan

## Purpose and status

This plan generalizes `@setta/workspace` into the backend-free structural core required by future
Setta applications, beginning with Python Canvas. It changes the package foundation without adding
Python Canvas, a backend, or application semantics.

This is the plan to pass to `code-policy plan-loop` with the existing `workspace` and `playground`
modules and focused verification. The implementation loop may edit only those trusted-base modules
and this plan. It must implement the earliest incomplete phase, commit coherent batches, and request
phase review without turning the work into a repository-wide audit.

- [ ] Phase 1 — instance-scoped workspace host
- [ ] Phase 2 — headless snapshot and transaction core
- [ ] Phase 3 — generic ports, edges, and connection interaction
- [ ] Phase 4 — versioned serialization artifacts
- [ ] Phase 5 — semantic editor surface
- [ ] Phase 6 — generalized diagnostics and status
- [ ] Phase 7 — conformance surface and package closeout

A phase is complete only when its implementation, focused tests, playground proof where required,
and independent phase review are complete. Update the checkbox and status sentence only after that
evidence exists. Do not mark later phases complete based on scaffolding.

## Outcome

After this plan:

- a page or test can mount two completely isolated workspaces;
- browser UI and headless callers use the same deterministic structural operation engine;
- every canonical change carries a transaction identity and expected workspace revision;
- sections and items may own generic ports connected by canonical edges;
- snapshots, transactions, results, and failures have versioned schema artifacts;
- applications can supply semantic text services without importing CodeMirror or LSP types;
- applications can publish ephemeral diagnostics and status to stable workspace targets; and
- unrelated consumers can exercise all of this through public APIs and public test helpers.

The package remains an opinionated Setta workspace rather than a generic diagram toolkit. Existing
canvas, section, group, item, Outline, Inspector, pane, command, control, drag-and-drop, appearance,
and accessibility behavior should survive unless this plan explicitly replaces its ownership seam.

## Fixed architecture decisions

These decisions are part of the requested implementation. Agents should implement them rather than
reopening them as broad design investigations.

1. `@setta/workspace` remains one versioned package. The React surface stays at the root export; a
   React-free `@setta/workspace/core` subpath owns structural contracts and algorithms; an optional
   `@setta/workspace/testing` subpath owns public test helpers.
2. The core imports no React, React DOM, Zustand, CodeMirror, DOM, XYFlow, dnd-kit, browser global,
   package stylesheet, or application module. It must execute in an ordinary JavaScript runtime.
3. TypeScript in the core is the sole owner of workspace structure and operations. Schema files are
   deterministic projections of that owner. No second handwritten operation engine is added.
4. One canonical version-1 snapshot owns sections, item trees, top-level layout, persisted viewport
   and selection, generic ports, and generic edges. It carries a non-negative workspace revision.
5. A transaction has a stable caller-supplied ID, an expected revision, and one or more explicitly
   typed operations. Applying a valid transaction increments the revision exactly once regardless of
   operation count. A stale or invalid transaction changes nothing.
6. The pure core computes structured results and inverse transactions. An instance host owns the
   current snapshot, subscriptions, and undo/redo stacks. Replacing the authoritative snapshot resets
   incompatible local history explicitly.
7. UI gestures may use ephemeral interaction state while in progress, but each semantic commit point
   publishes one canonical transaction. In particular, do not publish pointer-coordinate streams for
   drag or resize.
8. Structural validation owns identities, hierarchy, endpoint existence, direction, cardinality,
   atomicity, and serialization. Applications own domain compatibility and meaning.
9. Diagnostics, completion state, compile state, reconciliation state, and run state are ephemeral
   presentation inputs. They never enter the canonical snapshot.
10. Public editor types use package-owned text offsets and document versions. CodeMirror values,
    extensions, decorations, views, and LSP wire types remain private.
11. Existing application-owned `WorkspaceSectionData` stays opaque JSON data. Generalization must not
    introduce Python, callable, argument, interpreter, backend, persistence, HTTP, CLI, or MCP terms.
12. The package is unpublished. Replace superseded singleton APIs directly and update the playground;
    do not add aliases, deprecation shims, dual mutation paths, or legacy document support.

## Explicit non-goals and audit boundary

Do not use this plan to:

- add `apps/python-canvas`, Go code, generated Go types, Python code, or an LSP/runtime process;
- design Python callable, value, argument, typing, reconciliation, compilation, or execution rules;
- add backend transports, optimistic network retries, persistence, authentication, or authorization;
- add CRDTs, real-time collaboration, schema migrations, legacy format readers, plugin ABIs, variants,
  saved views, automatic layout, edge routing editors, or graph-layout algorithms;
- split `@setta/workspace` into multiple published packages or decide publication, licensing, or names;
- add or update dependencies, edit `pnpm-lock.yaml`, or run dependency research; use existing runtime
  and build capabilities for this plan;
- change `.code-policy.json`, `.code-policy.lock.json`, managed guidance, CI, accepted evidence, or the
  frozen `../setta-main` worktree;
- redesign accepted controls, typography, colors, spacing, motion, or general workspace UX;
- resolve unrelated vulnerability assessments, expiring exceptions, file-length debt, or technical
  closeout work; or
- audit unchanged code for speculative edge cases.

Reviewers should inspect the requested contracts, their changed implementation, and the listed
invariants. They should not expand a phase into a general security, accessibility, performance,
dependency, style, or historical-parity audit. Concrete regressions in changed behavior remain in
scope; hypothetical features and unrelated pre-existing findings do not.

The current checked-in branch is the sole implementation authority for this plan. Agents must not
run `git log`, `git blame`, `git show` on older commits, search other branches or refs, inspect a
`main` branch, inspect `../setta-main`, or use historical product code to look for an implementation
pattern. Bounded searches inside the current `packages/workspace`, `apps/playground`, `scripts`, and
`fixtures` trees are sufficient. When current code leaves a minor implementation choice open, choose
the smallest direct design consistent with the fixed decisions above rather than performing
historical research.

If an implementation needs a new direct dependency, control-plane change, live external probe, or
one of the excluded product decisions, return `PLAN_IMPLEMENTATION_BLOCKED` with the smallest
specific reason instead of widening the plan.

## Authoritative model and mutation flow

The intended ownership flow is:

```text
React gesture or public host call
             |
             v
instance WorkspaceHost.dispatch(transaction)
             |
             v
@setta/workspace/core validates and applies atomically
             |
             +--> next immutable snapshot + inverse + typed result
             |
             +--> instance subscribers receive one commit event
```

A future application may optimistically run the same core in the browser and send the same versioned
transaction elsewhere. This plan provides the deterministic core and reconciliation primitives only;
it does not implement that application's transport or acknowledgement policy.

## Phase 1 — instance-scoped workspace host

**Status: implementation complete; awaiting independent Phase 1 review.**

Replace process-wide runtime ownership with one explicit host per mounted workspace.

### Required implementation

- Add `createWorkspaceHost` (or an equivalently clear factory), a public `WorkspaceHost` contract,
  and `WorkspaceProvider`/`useWorkspaceHost` React bindings.
- Use the already installed Zustand vanilla store capability for per-host store instances and a
  required React context for selector hooks. Non-React actions receive the host/runtime explicitly or
  become host methods; they must not recover an implicit "current" host from module state.
- Move canonical document state, derived node state, active selection, appearance, capabilities,
  interaction options, menus, tooltips, drag state, resize state, focus state, mounted item-list views,
  and other mutable workspace runtime state behind the host instance.
- Move host-owned section kinds, item handlers, commands, creation commands, key bindings, and toolbar
  contributions into the instance. Cross-registry validation remains atomic and specific.
- Give the host explicit lifecycle cleanup for media-query listeners and any other external listener
  it owns.
- Make root components and all public hooks resolve one provider. A missing provider fails with a
  specific setup error rather than falling back to shared state.
- Replace global load/get/change-callback functions with host snapshot and subscription methods.
- Keep `WorkspaceShellViewState` controlled and separate from the canonical workspace snapshot; its
  callbacks operate in the mounted host context.
- Update every package component, action, and focused test that currently reaches a module-global
  store or registry. Do not keep a hidden default host for compatibility.
- Migrate the playground startup and registrations to construct exactly one host and mount the shell
  beneath its provider.

The bounded mutable-owner inventory for this phase is the current-tree store factories in
`document/`, `canvas/`, `dnd/`, `context-menu/`, `section/`, and `tooltip/`; the section-kind,
item-handler, mounted-item-list, command, creation-command, key-binding, and toolbar registries; the
document notification owner; and the appearance media-query listener. A current-tree `rg` search for
store construction, mutable registries, and document notifications may confirm that list. Do not
expand it through Git history or other branches.

Land each replaced owner and all of its callers as one coherent ownership cutover. A batch must not
leave both global and instance APIs available, even temporarily at a committed boundary.

For plan-loop execution, Phase 1 is one indivisible public cutover. Do not add or export a host,
provider, context, or instance hook in one iteration while describing any required mutable-owner
migration as remaining work for another iteration. Do not commit a scaffold, dormant parallel API,
partially instance-scoped runtime, compatibility wrapper, or "in progress" public surface. Complete
all Phase 1 owner migrations, playground migration, removals, focused proof, and plan status together
before the first Phase 1 implementation commit. If that cannot be done coherently in one agent turn,
return a clean `PLAN_IMPLEMENTATION_BLOCKED` explaining the plan-loop limitation rather than landing
transitional code.

### Focused proof

- Mount two providers simultaneously with overlapping section and item IDs, different documents,
  different kinds, different commands, different appearance, and different capabilities.
- Mutate and interact with each one and prove that snapshots, selection, callbacks, registrations,
  transient menus/drag state, and appearance do not cross.
- Prove that disposing one host removes its listeners without affecting the other.
- Run targeted existing tests for every store/registry family changed in this phase plus the new host
  isolation tests. Preserve the current playground build and the package public-boundary check.

### Phase boundary

The phase reviewer should verify instance isolation and absence of a default singleton path. It should
not request ports, transactions, schemas, editor services, or generalized diagnostics early.

## Phase 2 — headless snapshot and transaction core

**Status: blocked on Phase 1.**

Create the React-free structural owner and route every canonical write through it.

### Version-1 contracts

Define and export, at minimum:

- a versioned immutable workspace snapshot and input contract;
- branded or otherwise unambiguous stable IDs for snapshots' structural entities;
- a transaction containing `id`, `expectedRevision`, and a non-empty operation list;
- an exhaustive operation union covering every currently public canonical mutation;
- a success result containing the prior and next revisions, next snapshot, normalized transaction,
  and inverse transaction;
- structured stale-revision and validation failures with stable codes and the failing operation index
  where applicable; and
- pure validation, dry-run/planning, application, inverse, and history helpers.

The operation union must cover the current public behavior families rather than replacing them with
an unvalidated arbitrary patch:

- create, delete, move, reparent, group, and ungroup sections;
- section identity, data, appearance, size, layout, minimized, locked, orientation, and overflow
  changes;
- insert, delete, move/reparent, select, and update item data or typed presentation;
- item-column width;
- canonical section selection and viewport; and
- the port and edge operations introduced in Phase 3.

Phase 2 may reserve the Phase 3 operation variants in the public union only when they reject until
the Phase 3 model exists. Do not ship fake successful no-ops.

### Application rules

- Parse and validate the complete external snapshot once before publishing it.
- Validate the complete transaction against one immutable starting snapshot before publication.
- Reject duplicate IDs, unknown targets, malformed numbers, cyclic or multiply-owned hierarchies,
  impossible group/item relationships, and invalid operation ordering with typed failures.
- Do not expose partially applied state when a later operation fails.
- Preserve deterministic record/list ordering where it is observable or serialized.
- Generate an inverse that restores the exact prior canonical snapshot when applied at the returned
  revision. Undo and redo are normal revision-checked transactions, not direct store rewinds.
- A host snapshot replacement is a distinct authoritative resynchronization operation and must not
  masquerade as an acknowledged local transaction.

### UI migration

- Convert the finite canonical-write inventory currently identified by document-change notification
  funnels to operations dispatched through the host.
- Remove direct canonical store writes from React gesture handlers and exported mutations.
- Let derived node geometry and ephemeral interaction state update after a successful core result;
  they remain adapter state rather than a second canonical document.
- Replace the old full-document change callback with one commit subscription. A commit event includes
  the transaction ID and revision result; consumers may read the full immutable snapshot from it.
- Preserve existing public behaviors and single-notification semantics while changing their owner.

### Focused proof

- Run the same transaction through the headless core and a mounted host and compare results.
- Prove stale conflicts, multi-operation atomicity, deterministic output, exact inverse application,
  undo/redo revision behavior, and authoritative replacement history reset.
- Test each migrated mutation family at its existing boundary; do not multiply combinatorial cases
  beyond the named invariants.
- Add a boundary test that imports `@setta/workspace/core` without React or a browser environment.

### Phase boundary

The phase reviewer should search the changed package for remaining canonical direct-write or legacy
callback paths and assess the declared operation invariants. It should not propose distributed
transactions, persistence, network retry semantics, or future migration formats.

## Phase 3 — generic ports, edges, and connection interaction

**Status: blocked on Phase 2.**

Extend the canonical model with backend-neutral graph topology and a minimal usable connection UI.

### Structural contract

- Add stable port and edge records to the version-1 snapshot.
- A port names its owning section and optional owning item, direction (`input` or `output`), and
  generic cardinality. It carries no Python type or backend object.
- An edge names exactly one output source port and one input target port.
- Validate owner existence, endpoint existence, direction, duplicate topology, self/duplicate edge
  policy, and declared cardinality before applying a transaction.
- Section or item deletion removes its owned ports and incident edges as one deterministic structural
  result whose inverse restores them exactly.
- Connect and disconnect use the same transaction engine as every other structural caller.

### React surface

- Add public section/item attachment points or package-rendered anchors that do not expose private DOM
  selectors, XYFlow handles, canvas stores, or styling tokens.
- Render canonical edges in a package-owned layer that follows current pan, zoom, move, group, resize,
  and unmount behavior.
- Provide minimal pointer and keyboard connection creation, cancellation, selection, and deletion.
- Use visible/focusable states and non-color naming sufficient for the package's existing interaction
  standards, without redesigning the canvas or building an advanced graph editor.
- Allow applications to describe generic port labels/presentation through public data or registration
  callbacks while retaining structural ownership in the package.

### Semantic boundary

The package may reject a structurally impossible connection. A host-supplied semantic validator may
return a typed refusal before dispatch, but Python types, argument rules, conversion, execution, and
error wording stay outside the package.

### Focused proof and playground proof

- Demonstrate one section output, one item input, connect/disconnect, selected-edge deletion, an
  invalid-direction refusal, a cardinality refusal, and deletion cleanup in the playground.
- Drive one identical connect transaction through the visible gesture and headless API.
- Test connection keyboard cancellation and focus restoration without auditing unrelated shortcuts.
- Preserve current section/item drag, pan, zoom, grouping, and bounded-overflow behavior in directly
  affected tests.

### Phase boundary

The reviewer should verify topology ownership, public attachment seams, and no Python/XYFlow leakage.
It should not ask for routing algorithms, edge labels, reroute handles, automatic layout, variants,
or domain-specific type inference.

## Phase 4 — versioned serialization artifacts

**Status: blocked on Phase 3.**

Publish deterministic cross-language contract artifacts without adding a second owner.

### Required implementation

- Produce JSON Schema artifacts for the version-1 snapshot, transactions/operations, results, and
  structured failures from one core-owned source.
- Add a deterministic repository script that writes those artifacts and a drift check that generates
  into temporary state and compares byte-for-byte with the checked-in files.
- Ensure runtime external-input validation and generated schema constraints agree on required fields,
  unions, numeric bounds, additional properties, and version rejection.
- Export the schema assets and the `./core` entry from the built package. Include declarations and
  source maps for executable TypeScript output.
- Update package-boundary and packed-consumer assertions for the new exports without requiring
  Tailwind, repository aliases, or a browser for the headless entry.
- Add valid and malformed conformance fixtures. Go projection and Go round-trip tests are deferred to
  the consuming application plan; this package plan supplies the authoritative inputs.

### Focused proof

- Regeneration is clean and deterministic from a clean checkout.
- Every fixture receives the same accept/reject outcome from the runtime parser and schema contract.
- An unrelated temporary TypeScript consumer can import the root and core entries and load schema
  assets only through declared package exports.
- The root package remains backend-free and React/React DOM remain host-provided peers.

### Phase boundary

The reviewer should verify one structural owner and deterministic artifacts. It should not require a
Go module, choose a schema migration strategy, or request backward-compatible schema readers.

## Phase 5 — semantic editor surface

**Status: blocked on Phase 4.**

Promote the existing private section editor into a backend-neutral public semantic editor surface.

### Public contract

- Export a generic workspace code/text editor primitive or an equivalently narrow contribution API.
- Define package-owned offset ranges, text document identity and version, immutable diagnostics,
  generated/decorated/read-only ranges, cursor/selection state, and reveal intents.
- Define asynchronous completion, hover, and signature requests carrying the current document
  version and `AbortSignal`.
- Define explicit ready, loading, unavailable, and error status. An unavailable provider must not look
  like a successful empty result.
- Keep persistence and transaction choice with the caller: the editor reports authored text changes
  through public callbacks and does not invent backend saves.

### Adapter behavior

- Cancel superseded requests on text/version/cursor changes and unmount.
- Reject late results for stale versions even when a provider ignores cancellation.
- Preserve editor selection, scroll, focus, undo history, Escape behavior, line wrapping, indentation,
  read-only behavior, and current theme behavior across unrelated workspace changes.
- Render text diagnostics and decorated/read-only ranges through private CodeMirror adapters.
- Do not export CodeMirror or LSP types, instances, extensions, decorations, URLs, or protocol values.
- Make the built-in code section use the same public primitive or contribution contract rather than a
  second editor implementation.

### Focused proof and playground proof

- Use a deterministic fake asynchronous provider in the playground to demonstrate completion, hover,
  signature help, text diagnostics, reveal range, generated/read-only ranges, unavailable state,
  cancellation, and stale-response rejection.
- Test only the named request lifecycles and retained editor behavior; do not audit every CodeMirror
  command or language package.
- Prove a consumer can implement the provider without importing package-private modules.

### Phase boundary

The reviewer should verify cancellation/version semantics and the absence of CodeMirror/LSP leakage.
It should not request a real language server, Python virtual documents, source reconciliation, or
backend completion transport.

## Phase 6 — generalized diagnostics and status

**Status: blocked on Phase 5.**

Replace the item-list-only diagnostic seam with one host-scoped ephemeral presentation model.

### Required implementation

- Define stable discriminated targets for section, item, port, edge, and editor text range.
- Generalize severity, message, source, and stable diagnostic identity without adding domain rules.
- Define a small generic status vocabulary that distinguishes idle/ready, loading/running,
  unavailable, and failed states with optional human-readable detail.
- Let the instance host atomically replace a complete diagnostic/status snapshot after validation.
- Tolerate the expected one-render deletion race for previously valid targets without accepting an
  unknown target on first publication.
- Render appropriate section, item, port, edge, and text-range indicators, summaries, quick info, and
  accessible announcements. Preserve color-independent severity communication.
- Remove the superseded item-list-specific ownership path after migrating existing consumers.
- Keep the complete diagnostic/status model outside serialized workspace snapshots and transaction
  history.

### Focused proof and playground proof

- Demonstrate all target kinds, severity ordering, updates, clearing, deletion races, status changes,
  and accessible announcements through public host APIs.
- Prove diagnostic/status replacement neither increments the workspace revision nor emits a
  canonical commit event.
- Reuse existing item diagnostic visual behavior rather than redesigning it.

### Phase boundary

The reviewer should verify ephemeral ownership and target validation. It should not inspect or invent
Python compiler, LSP, reconciliation, or run-state semantics.

## Phase 7 — conformance surface and package closeout

**Status: blocked on Phase 6.**

Ratify the generalized package as a usable independent consumer boundary.

### Public testing surface

- Export an in-memory host constructor or helper, representative immutable fixtures, transaction and
  schema fixtures, registered-section mounting helpers, and a fake semantic provider through
  `@setta/workspace/testing`.
- Provide focused conformance helpers for a host adapter and structural contract without exporting
  internal stores, selectors, DOM hooks, XYFlow, dnd-kit, Tailwind names, or CodeMirror.
- Ensure testing exports do not enter the ordinary root runtime unintentionally.

### Package and documentation closeout

- Update the package root/core/testing export maps, build inputs, declarations, source maps, schema
  assets, public API ratification tests, package README, and unrelated-consumer fixture.
- Remove superseded singleton APIs, old full-document callback language, obsolete test reset helpers,
  and deep imports created only for the old ownership model.
- Confirm the playground uses only public package APIs and demonstrates the host, headless transaction,
  connection, semantic editor, and diagnostic/status seams.
- Keep distribution requirements intact: compiled ESM, declarations, source maps, schema assets, and
  one scoped stylesheet; consumers still require neither Tailwind nor repository configuration.

The repository's project-owned `AGENTS.md` distribution description will need a separate reviewed
control-plane update after these artifacts exist. The plan loop must not edit it from a module-scoped
candidate or treat that external update as permission to alter shared policy.

### Focused proof

- Run new core/host/ports/editor/diagnostic public-boundary tests and directly affected existing
  component tests.
- Run the exact package and playground production builds and package-boundary check because exports
  and build artifacts changed.
- Run `code-policy check --git-changes` and `code-policy test --changed` through the exact locked
  release near completion.
- Do not run recommended, full, supplemental, `verify`, or `gate` inside this focused plan loop.

### Completion report

The final reviewer must bind its report to the exact reviewed commit range and separately address:

1. **Repository contract:** module ownership, public boundaries, backend-free behavior, dependency
   stability, focused evidence, generated artifact drift, and absence of forbidden deep imports.
2. **Requested outcome:** instance isolation, deterministic transactions and inverses, ports/edges,
   schemas, semantic editor services, generalized diagnostics/status, public conformance helpers, and
   explicit non-goals.

Return `PLAN_IMPLEMENTATION_COMPLETE` only when every phase checkbox is complete and no required
repository work inside the allowed modules remains.

## Supervisor response to blockers

When an agent returns a clean committed blocker:

1. report the exact blocker and transcript evidence to the supervising caller;
2. prefer a narrow fix within this plan's architecture and allowed modules;
3. preserve the blocked commit or other exact evidence;
4. restart the loop from the accepted source branch after the fix; and
5. stop for the developer if resolution needs a new dependency, control-plane change, external
   authority, live developer acceptance, or a change to an explicit architecture decision.

Runner failure, quota, timeout, or a dirty disposable worktree is an orchestration problem rather
than a product blocker. Diagnose it from the external receipt, repair or resume when safe, and avoid
asking an implementation agent to compensate with repository workarounds.

## Verification authorization

This plan uses `--verification focused`. Repository guidance already authorizes exact and changed
focused tests during implementation. The loop's selected scope is the complete automated
verification decision for this run; the agents must not pause to ask for or silently run recommended,
full, supplemental, `verify`, or `gate` checks.

Before any later merge decision, the supervising caller will run `code-policy test-levels --base
<merge-target>`, present the exact ordinary choices, and obtain the authorization required by the
checked-in policy.
