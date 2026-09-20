# Workspace and local backend extraction plan

Status: complete

This plan moves repeated, application-neutral presentation behavior into `@setta/workspace` and
introduces a small shared Go module for local application backend infrastructure. Python Canvas,
Realtime, Review, and Experiment Lens retain their product contracts, canonical state, and domain
behavior.

## Outcome

The completed work has two shared foundations:

- `@setta/workspace` owns generic Workspace geometry, projection readiness, and any controlled
  presentation primitives that at least two applications use through the same contract.
- `github.com/setta/local-backend` owns security-sensitive local hosting, confined durable file
  mechanics, latest-value publication, strict transport helpers, and common process containment.

The new backend module is analogous to Workspace in dependency direction, not in breadth. It is a
small infrastructure dependency beneath the four native servers, not a product framework or a
second runtime supervisor.

## Ownership rules

- Workspace owns reusable presentation and interaction behavior. Applications own section
  meaning, product state, persistence, authorization, and transport.
- The shared backend module imports no application package. It does not define product routes,
  snapshots, mutations, identities, coordinators, aggregates, or error documents.
- `setta-runtime` remains the outer application registry, package assembler, live-session
  verifier, and native-server supervisor. It does not absorb the new Go module.
- Extraction requires two current consumers with the same semantic contract. Visual similarity or
  possible future reuse is insufficient.
- Each consumer moves atomically to the shared API. Do not retain compatibility wrappers, parallel
  implementations, fallback paths, or feature flags.
- Application design records remain authoritative. Update them when an extraction changes an
  ownership boundary or invariant.

## Current duplication

### Workspace-facing behavior

- Review and Experiment Lens duplicate the shell-window viewport calculation, closed-pane width,
  fallback dimensions, and `ResizeObserver` lifecycle in `ReviewView.tsx` and
  `ExperimentLensView.tsx`. Workspace already measures the shell and owns its true pane widths.
- Review schedules and retries `fitWorkspaceSections` through animation frames. Experiment Lens
  similarly defers `setWorkspaceSectionAttention` because the current API rejects a known section
  until its shell has mounted and acquired positive bounds.
- Review artifact annotations and Experiment Lens chart annotations both implement normalized SVG
  strokes, pointer capture, draft settlement, cancellation, and Workspace gesture boundaries.
  Their persisted annotation models and selection semantics remain different.
- Review, Experiment Lens, and Realtime separately present admitted images, audio, video, text,
  JSON, and inert download fallbacks. Their admission and artifact identity rules remain different.

### Backend behavior

- All four native servers independently implement IPv4 loopback binding, closed Host admission,
  exact-origin checks, bounded shutdown, production-asset validation, API exclusion from SPA
  fallback, and runtime readiness.
- Review and Experiment Lens have near-parallel `localweb`, command serving, HTTP/SSE, state-store,
  atomic replacement, and cross-platform advisory-lock implementations.
- All four backends publish complete current snapshots through buffer-one subscriptions in which
  slow consumers may skip superseded values.
- Strict JSON decoding differs between applications. Realtime rejects invalid UTF-8 and duplicate
  object keys in addition to unknown fields and trailing values; Experiment Lens currently enforces
  a narrower subset.
- Python Canvas and Realtime document the same platform process-tree containment contract while
  implementing it independently around their runner and worker lifecycles.

## Target dependency structure

```text
application frontends ───────────────▶ @setta/workspace

python-canvas/backend ──┐
realtime/backend ───────┼────────────▶ github.com/setta/local-backend
review/backend ─────────┤
experiment-lens/backend ┘

setta-runtime ───────────────────────▶ packaged application servers and assets
```

Create `packages/local-backend` as its own Go module and declare it as a Code Polishy module. Each
application backend depends on it explicitly. The module has a mapped
`docs/design/local-backend.md` rationale and one quick boundary suite. It should use the standard
library unless a concrete extracted contract requires an already admitted dependency.

The initial package surface is intentionally small:

| Package              | Shared responsibility                                                                                                    | Application responsibility                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `localweb`           | Loopback listener, authority and origin checks, security headers, static assets, SPA fallback, bounded serving           | Route tree, API versions, readiness identity, response documents            |
| `projectfs`          | Canonical roots, confined regular files, synchronized sibling writes, atomic replacement, directory sync, advisory locks | Project schema, file names, revisions, validation, recovery policy          |
| `latestvalue`        | Initial-current subscription and buffer-one newest-value publication                                                     | Snapshot construction, cloning, revision meaning, subscriber lifetime       |
| `strictjson`         | UTF-8, duplicate-key, unknown-field, depth and trailing-value policy                                                     | Concrete document types and semantic validation                             |
| `httpjson` and `sse` | Bounded request/response mechanics and event framing                                                                     | Routes, event names, product errors, reconnect meaning                      |
| `proctree`           | Platform descendant ownership, bounded termination, wait, and cleanup                                                    | Commands, environments, worker protocols, terminal and runner orchestration |

Dependency decision (2026-09-22): add no external package. The extracted contracts are small
enough for the Go and browser standard libraries, while introducing a router, storage framework,
process supervisor, or component toolkit would duplicate application-owned policy. Existing
application dependencies remain at their current boundaries; in particular, Python Canvas keeps
its ConPTY implementation and its already admitted system bindings outside `local-backend`.

`revisionedjson` and `artifacthttp` are not initial packages. Add either only if the earlier
extractions leave at least two thin application implementations with an identical complete
contract.

## Workstream A: Workspace ownership corrections

### A1. Make the integrated shell own the managed-window viewport

Change integrated windowing so `WorkspaceShell` derives the usable managed-window rectangle from
its measured root and actual occupied shell chrome. Include physical-direction pane placement and
the saved-view tab row instead of exposing a closed-pane pixel constant to consumers.

Keep an explicit viewport input only at the standalone window-space boundary where no shell owns
the geometry. Update Review, Experiment Lens, and the Playground in the same change, and remove
their viewport measurement hooks and inset calculations.

Acceptance criteria:

- No application contains the closed-pane width or a shell `ResizeObserver` solely for windowing.
- Floating and docked windows remain within the usable area while panes open, close, resize, or
  swap physical sides under text direction.
- Window bounds update after shell, viewport, and saved-view-tab resizing without resetting valid
  user geometry.
- Standalone window-space rendering remains measurable without mounting `WorkspaceShell`.

Verification:

- Add focused Workspace tests for shell measurement, insets, text direction, and resize updates.
- Update Review and Experiment Lens component coverage for the package-owned viewport.
- Exercise the existing managed-window Playground browser scenarios at wide and constrained sizes.

### A2. Make section attention projection-aware

Separate semantic validation from layout readiness. Unknown or hidden section IDs remain immediate
errors. A known visible section that has not mounted or measured is a transient package state, not
an application scheduling obligation.

Make `setWorkspaceSectionAttention` accept known visible sections without requiring geometry.
Make `fitWorkspaceSections` return an awaitable operation that waits for positive bounds through a
Workspace-owned measurement signal. Document replacement, hiding, deletion, host disposal, or a
superseding fit terminates the pending operation deterministically.

Update Review and Experiment Lens to call the APIs directly. Remove animation-frame retries and
catch-and-ignore timing paths.

Acceptance criteria:

- A fit requested immediately after a complete projection succeeds once the target shells measure.
- Invalid targets fail for their semantic reason rather than timing out or retrying indefinitely.
- A superseded or invalidated request cannot later move the viewport.
- Attention and fit do not mutate selection or `WorkspaceDocument`.

Verification:

- Cover pre-mount requests, delayed measurement, supersession, hiding, deletion, and document load
  in the Workspace focused suite.
- Cover Review subject framing and Experiment Lens focus attention without application timers.

### A3. Gate a controlled normalized-stroke surface

Gate result (2026-09-22): passed. `WorkspaceNormalizedStrokeSurface` now owns the shared normalized
pointer, capture, cancellation, draft, passive-rendering, and gesture-boundary contract. Review and
Experiment Lens retain their distinct annotation models, settlement collections, selection, and
persistence.

Compare the Review and Experiment Lens gesture contracts after A1 and A2. Proceed only if both can
use one controlled component without product-specific modes in Workspace.

If the gate passes, add a primitive that owns normalized point conversion, pointer capture,
draft-path rendering, non-scaling strokes, Escape and pointer-cancel handling, and Workspace drag
and pan boundaries. Applications provide committed paths, styling, enabled state, and callbacks.
They continue to own annotation IDs, intent, text, artifact anchors, chart context, selected
observations, validation, and persistence. The primitive must not depend on Fabric, ECharts, media
transport, or an application contract.

If either application requires materially different settlement or selection semantics, leave both
components app-owned and share no abstraction beyond a demonstrably identical pure geometry
function.

Acceptance criteria if extracted:

- Review and Experiment Lens use the same controlled gesture and rendering contract.
- Saved paths remain aligned after section resize and do not intercept input while passive.
- No domain annotation shape enters `WorkspaceDocument` or a Workspace public type.

### A4. Gate a passive content preview

Gate result (2026-09-22): no extraction. Review uses an exact admitted-media allowlist and a
non-download file card. Experiment Lens owns media failure state, JSON, text, series, and an
authorized download route. Realtime resolves runtime content references and otherwise formats
arbitrary values. Combining these would move trust or product policy into Workspace or yield a
component dominated by application branches, so the current renderers remain app-owned.

Proceed only if Review, Experiment Lens, and Realtime can supply an already admitted URL or value
to one passive renderer without moving trust decisions into Workspace.

The candidate primitive may own accessible image, audio, video, text, JSON, loading, failure, and
file-fallback presentation. Applications retain MIME admission, same-origin policy, content-size
bounds, artifact identity, fetching, download authority, and domain-specific actions.

Do not add a generic artifact model, remote URL resolver, HTML renderer, or executable-content
path. If those constraints produce mostly application conditionals, keep the existing renderers.

## Workstream B: Shared local backend foundation

### B1. Establish the module boundary

Completion (2026-09-22): `packages/local-backend` is an independently governed Go module with a
mapped design record, pinned toolchain, quick suite, and explicit one-way dependency edges from all
four application backends. The repository-local module is compiled into each native server and is
not a packaged runtime source dependency.

Add `packages/local-backend/go.mod`, the `local-backend` module declaration and dependency edges in
`.code-polishy.json`, and the mapped design rationale. Add the repository-local exact module
dependency to each application backend without introducing a `go.work` file or a third-party
dependency.

The design record defines these invariants:

- The module is unaware of application IDs, project formats, route versions, and product state.
- Callers supply already validated product values and retain all semantic decisions.
- Security checks fail closed and cannot be disabled by caller options.
- File APIs do not use hashes for mutable change detection.
- Public operations are bounded, cancellation-aware where applicable, and safe under repeated
  close or cleanup calls.

Acceptance criteria:

- All four backends build through their ordinary module roots.
- Dependency direction rejects imports from `local-backend` into any application.
- The package quick suite runs independently with temporary state.
- Packaged-runtime staging includes no source-checkout dependency at execution time.

### B2. Extract `localweb`

Completion (2026-09-22): all four native servers use `local-backend/localweb` for preflighted
production assets, rooted regular-file serving, API exclusion from SPA fallback, IPv4 loopback
binding, exact Host and Origin checks, common security headers, readiness-aware startup, and
bounded shutdown. The four replaced hosting implementations and their duplicate tests were
removed; application route trees, readiness documents, and origin-required route decisions remain
in their owning backends.

Start with Review and Experiment Lens because their implementations and server lifecycle are the
closest. Preserve observable routes and readiness documents while moving these mechanics:

- canonical, preflighted production asset roots;
- regular non-symlink asset serving and extensionless SPA fallback;
- hard exclusion of API, content, event, and WebSocket paths from fallback;
- IPv4 loopback listening and canonical listener URL construction;
- exact listener Host plus matching `localhost` alias;
- exact same-origin mutation validation;
- security response headers; and
- bounded graceful shutdown.

After the shared contract passes in both applications, migrate Realtime and then Python Canvas.
Their application muxes, WebSocket upgrades, and route-specific origin rules remain outside the
package.

Acceptance criteria:

- Each migrated server has one hosting implementation and no copied equivalent helpers.
- Foreign Host and Origin values fail before product handlers run.
- API-like paths never receive `index.html`.
- Asset symlinks, directory traversal, irregular files, and post-admission replacement fail closed.
- Shutdown is bounded and reports serving failures without leaking a listener.

Verification:

- Put the complete common matrix in the `localweb` quick suite.
- Retain small application boundary tests proving route classification, origin requirements, and
  readiness identity wiring.
- Use temporary asset roots and loopback listeners; no live-provider or credentialed probe is
  required.

### B3. Extract confined durable file mechanics

Completion (2026-09-22): `local-backend/projectfs` now owns canonical-root handles, confined
regular-file access, bounded reads, synchronized exclusive creation and sibling replacement,
parent-directory synchronization, and cancellation-aware advisory locks on Unix and Windows.
Review and Experiment Lens use it for admitted project inputs and revisioned state; Realtime uses it
for its project document and staged entrypoint compare-and-swap. Python Canvas retains its
application-owned authored/generated-file transaction because its staged authored commit is
coordinated with generated-file install, provider synchronization, and rollback; replacing that
protocol with a single-file primitive would change its failure semantics.

Move canonical-root validation, relative-path confinement, regular non-symlink file opening,
bounded reads, synchronized sibling staging, atomic replacement, directory synchronization, and
cross-platform advisory locking into `projectfs`.

Migrate Review and Experiment Lens first. Their state stores continue to own identity matching,
monotonic revision checks, full-document validation, cloning, and accepted publication. Then adopt
the same primitives in Realtime and Python Canvas only where their transaction and rollback
semantics remain unchanged.

Acceptance criteria:

- Callers cannot select an absolute path, escape the canonical root, or traverse a symlinked path
  component.
- Replacement occurs on the target filesystem and becomes visible only after complete bytes are
  synchronized.
- A failed write, validation, lock, or rename leaves the prior canonical file readable.
- Platform lock implementations have one shared owner and equivalent contention behavior.
- No digest is introduced to detect mutable local state changes.

Verification:

- Exercise temporary roots, symlink attacks, irregular files, size bounds, partial failure,
  concurrent writers, and replacement durability.
- Retain application store tests for revision conflict, identity conflict, and domain validation.

### B4. Extract latest-value publication

Completion (2026-09-22): `local-backend/latestvalue` now owns detached initial-current delivery,
buffer-one newest-value coalescing, context cancellation, and idempotent close. Review and
Experiment Lens state stores, Realtime's authored-project stream, and Python Canvas snapshot
publication use it. Realtime runtime envelopes remain application-owned because they preserve a
bounded event sequence and replace overflow with a complete resynchronizing snapshot rather than
coalescing every event to one latest value. The `revisionedjson` gate did not pass: the two
remaining state stores would require application callbacks for initialization, identity matching,
revision access, validation, encoding, decoding, cloning, and error policy, increasing indirection
without removing the domain failure modes.

Add a generic publisher whose constructor receives the one required detached-value cloning
operation. A subscription receives the current complete value immediately. Publishing replaces a
subscriber's pending older value rather than blocking the authority, and cancellation removes and
closes the subscriber exactly once.

Adopt it in Review and Experiment Lens, then in Realtime and Python Canvas where the existing
latest-value contract matches. Do not put revisions, persistence, or product snapshot types into
the package.

After adoption, compare the remaining Review and Experiment Lens stores. Introduce a
`revisionedjson` package only if their complete residual algorithms are still identical and the
result has fewer callbacks and failure modes than the two direct stores.

Acceptance criteria:

- Every subscription starts with a detached current snapshot.
- A slow subscriber receives the newest value without blocking publication.
- Closing a store or cancelling a subscriber cannot send on or close a channel twice.
- Application conflict and publication ordering remain unchanged.

### B5. Align strict JSON and HTTP/SSE mechanics

Completion (2026-09-22): `local-backend/strictjson` now supplies the common lexical boundary for
CLI, HTTP, project-file, evidence, interpreter-probe, and worker-protocol inputs across the four
applications. `local-backend/httpjson` owns method and JSON media-type checks, bounded body reads,
and canonical JSON responses; `local-backend/sse` owns support checks, headers, framing, flushing,
and request-lifetime termination. Product validation, status and error selection, routes, event
names, and publication policy remain application-owned. The cutover added no external dependency.

Define one strict JSON baseline: bounded bytes, valid UTF-8, bounded nesting and token sizes,
unique object keys, unknown-field rejection, exactly one value, and application semantic
validation after decoding. Resolve current differences deliberately and update affected public
contract documentation in the same application cutover.

Extract only transport mechanics into `httpjson` and `sse`: method and media-type enforcement,
bounded body reads, JSON response writing, event framing, flush checks, and connection lifetime.
Product routes, status selection, error codes, error documents, and event names stay in each
server.

Acceptance criteria:

- CLI, HTTP, and file boundaries that claim strict JSON use the same lexical rules.
- Duplicate keys, invalid UTF-8, unknown fields, excess depth or size, trailing content, and
  multiple values have explicit tests.
- SSE starts with the current complete snapshot and remains a latest-value stream; it does not add
  replay bookkeeping or polling.

### B6. Extract the common process-tree boundary

Completion (2026-09-22): `local-backend/proctree` now owns kill-on-close Windows Job Objects,
revalidated POSIX process groups, Linux child-subreaper adoption with bounded kill-and-reap
cleanup, and the fixed macOS noninteractive guardian profile. Python Canvas runners and terminals
and the Realtime worker use those primitives while retaining their separate commands, release
barriers, protocols, terminal identity checks, restart policy, and status. Unsupported platforms
fail closed through the shared boundary, and the cutover added no external dependency.

Compare the Python Canvas runner and Realtime worker at the OS containment layer only. Extract
shared platform primitives for descendant ownership, termination, wait, and cleanup where the
documented contract is identical:

- Windows Job Object ownership before user descendants can escape;
- Linux child-subreaper adoption, termination, and reaping;
- the established macOS guardian restrictions; and
- fail-closed behavior on unsupported platforms.

Keep command construction, environment preparation, terminal semantics, worker protocol,
cooperative cancellation, restart policy, and product status in their applications.

Acceptance criteria:

- A helper process that creates descendants is fully cleaned up on normal close, cancellation,
  timeout, and parent failure.
- Cleanup is bounded and idempotent, with platform failures reported rather than hidden.
- Python Canvas terminal ownership and Realtime worker replacement retain their distinct lifecycle
  behavior above the shared primitive.

Verification uses deterministic local helper processes in the existing platform suites. It does
not invoke user projects or live providers.

## Deferred candidates

- A shared TypeScript snapshot client does not belong in Workspace. Review and Experiment Lens
  have similar initial fetch, EventSource, monotonic revision, serialized mutation, and conflict
  refresh flows, but their optimistic projection rules remain product-specific. Reassess a separate
  `@setta/local-client` package only after backend transport alignment leaves an identical client
  contract.
- Artifact HTTP helpers remain deferred until `localweb` and `projectfs` show a common admitted-file
  contract. Artifact identity, inline media allowlists, content disposition, and failure documents
  remain application-owned.
- Contract-generation drivers remain app-owned. Share generation mechanics only if doing so removes
  repeated orchestration without combining product schemas or validators.
- Realtime's Fabric drawing runtime, Experiment Lens charts and tables, Review decision and evidence
  sections, and Python Canvas terminal and generated-code projections remain application-owned.

## Delivery sequence

Workstreams A and B may proceed independently. Within each workstream, preserve this order:

1. Implement A1 and A2 before considering new Workspace primitives. They correct existing package
   ownership rather than adding optional surface area.
2. Establish B1 and migrate Review plus Experiment Lens through B2 to prove the backend module
   boundary on the closest pair.
3. Migrate Realtime and Python Canvas to `localweb`, then complete B3 and B4 from low-level
   mechanics upward.
4. Align strict transport in B5 only after the hosting and file boundaries are stable.
5. Extract process containment in B6 as a separate platform-sensitive change.
6. Evaluate A3, A4, and the deferred candidates from the reduced application implementations.

Each numbered phase is one coherent source boundary. Update its mapped design rationale with the
implementation, remove the replaced application code in the same phase, and run the narrowest
exact tests before moving to the next consumer. Dependency or toolchain changes follow the locked
supply-chain workflow before installation.

## Completion criteria

The plan is complete when:

- Integrated applications no longer calculate Workspace shell window geometry or schedule around
  section measurement.
- Any new Workspace visual primitive has at least two current consumers using one domain-neutral
  controlled contract.
- All four native servers use the shared `localweb` boundary.
- Common confined file, publication, strict transport, and process containment code has one owner
  wherever the application contracts are identical.
- The shared backend module has no application imports or product contract types.
- Application routes, domain stores, coordinators, schemas, and mutation semantics remain in their
  owning modules.
- Replaced implementations, tests, names, and configuration are removed rather than retained as
  compatibility paths.
- Module-level quick suites, affected focused suites, generated-contract drift checks, build checks,
  and packaged-runtime verification pass at their selected delivery checkpoints.
