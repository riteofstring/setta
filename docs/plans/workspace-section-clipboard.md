# Workspace section clipboard implementation plan

## Outcome

Add adapter-driven section copy, paste, and duplicate to `@setta/workspace`, then integrate Python
Canvas through one typed, revision-checked backend transaction. Workspace owns selection,
clipboard framing, structural validation, placement, focus, and local document mutation. A
downstream application owns domain export, compatibility, canonical identity allocation,
persistence, and acceptance whenever its project state is authoritative outside Workspace.

This plan is temporary implementation guidance. Delete it after the feature, permanent design
rationale, public documentation, and obsolete-code cleanup are complete.

## Authority decisions

1. A paste is a complete proposal until the configured clipboard authority accepts it. No partial
   subtree becomes visible.
2. Clipboard support is host-scoped and opt-in. A host registers exactly one complete authority or
   has no section clipboard commands.
3. The authority is explicitly local or delegated:
   - A local authority opts into JSON-compatible document cloning. Workspace allocates fresh
     section and item identities, remaps package-owned structure, validates the complete candidate,
     publishes once, and records one structural history entry.
   - A delegated authority prepares application-owned clipboard data and accepts paste requests.
     It owns canonical mutation and projection. Workspace never publishes a speculative copied
     document on that path.
4. The browser clipboard contains one versioned JSON envelope. Package-owned structural metadata
   and the authority-owned payload are separate. Opaque section and item data enter the clipboard
   only through the configured authority.
5. Clipboard input is external data. Parse it once, validate the envelope, structural fragment,
   authority id/version, payload shape, registered section kinds, and placement before invoking a
   mutation.
6. Copy and paste yield to native editing and CodeMirror. Copy also yields while the browser has a
   nonempty text selection.
7. Version 1 copies normalized selected section roots and their complete descendant subtrees.
   Paste inserts the copied roots at the top level, preserves descendant order and presentation,
   and places the root block near the last meaningful canvas location or to the right of the
   current selection.
8. Duplicate uses the same prepared payload and authority as paste without reading or replacing
   the operating-system clipboard.
9. Paste-as-reference, item-only clipboard operations, cross-authority conversion, and legacy Setta
   clipboard formats are outside this cutover.

## Public Workspace contract

Add one clipboard module exported from the package root.

### Registration

`registerWorkspaceClipboardAuthority(host, authority)` replaces the host's complete clipboard
authority after validating it. Registration is rejected for a disposed host, blank authority id,
unsupported version, or invalid callbacks.

The public union has these modes:

- `WorkspaceLocalClipboardAuthority`
  - `kind: "local"`
  - stable nonblank `id`
  - optional section-data and item-data clone callbacks that receive detached frozen source values
    plus complete old-to-new section and item id maps
- `WorkspaceDelegatedClipboardAuthority`
  - `kind: "delegated"`
  - stable nonblank `id`
  - positive integer payload version
  - `prepareCopy(request)` returning JSON-compatible authority data
  - `paste(request)` returning the canonical pasted root ids only after the downstream application
    has accepted and projected the mutation

The package exposes headless asynchronous operations:

- `copyWorkspaceSelection(host)`
- `pasteWorkspaceClipboard(host)`
- `duplicateWorkspaceSelection(host)`
- `getWorkspaceClipboardAvailability(host)`

Each operation returns a discriminated result with `copied`, `pasted`, `duplicated`, `declined`, or
`failed` status and a stable reason/error code. Expected environment failures do not throw.
Programmer contract violations continue to throw specifically.

### Envelope and structural fragment

The text clipboard envelope contains:

- schema id and integer version
- authority id and authority payload version
- normalized root ids in canonical selection order
- every descendant section's package-owned fields, excluding opaque `data` and `itemTree`
- relative top-level layouts normalized to the copied block origin
- JSON-compatible authority payload

Validation rejects unknown keys, blank or duplicate ids, duplicate placement, missing descendants,
cycles, unreachable sections, malformed sizes/colors/layouts, non-finite values, unknown registered
kinds, unsupported schema versions, authority mismatches, and non-JSON values. Apply a bounded
clipboard text size before JSON parsing and bounded section/item counts before cloning.

### Local cloning

The local path stores the complete selected source section and item content in its authority
payload, allocates every destination section and item id before cloning any opaque value, and makes
the complete maps available to clone callbacks. Default callbacks deep-clone JSON-compatible data.

The candidate document:

- retains current sections and viewport
- inserts all copied descendants exactly once
- inserts copied roots as new top-level sections
- preserves subtree order, size, chrome, color, lock, minimize, overflow, and item presentation
- offsets the copied root block to the resolved paste origin
- assigns fresh frontmost z-indices in root order
- selects the new root ids

Workspace validates the complete document and node projection, publishes once through the existing
mutation boundary, records one `section-create` history transaction, and focuses the first pasted
root after publication.

### Commands and interaction

Add package commands and configurable bindings:

- `workspace.copy-sections` on `Mod+C`
- `workspace.paste-sections` on `Mod+V`
- `workspace.duplicate-sections` with no default chord

Copy and duplicate appear on section context, Outline, and palette surfaces. Paste appears on pane
context and palette surfaces. Availability re-resolves from the current authority, capability,
selection, editable target, browser clipboard support, and async pending state. Only one clipboard
operation runs per host at a time. Disposal invalidates later completion without publishing.

## Python Canvas contract

### Typed transport

Go owns a closed clipboard V1 payload generated into TypeScript with the rest of the transport
contract. It contains authored, cloneable Python Canvas entities only:

- selected callable, parameter-dictionary, and list roots
- every recursively contained cloneable section
- callable parameters and dictionary entries
- the selected forest and package-owned presentation/layout requested for the clone

It excludes generated Python, diagnostics, provider status, terminal state or tickets, completion
state, pending frontend ids, and other derived/runtime values.

Add read-only `POST /api/v2/project/clipboard/copy` and mutating
`POST /api/v2/project/clipboard/paste` commands:

- copy accepts project id, observed revision, and normalized selected root ids; it resolves the
  canonical subtree and returns the closed clipboard payload without writing
- paste accepts project id, expected revision, the payload, and the Workspace placement proposal;
  it returns the complete accepted project snapshot plus pasted root ids

### Atomic paste mutation

The aggregate validates every resource before allocation or persistence:

- project identity and expected revision
- payload version and exact fields
- supported section kinds and complete forest
- no duplicate, missing, unreachable, or cyclic ids
- valid Python identifiers and collision-free allocated names
- valid parameter/dictionary/list relationships
- finite package presentation and placement

It allocates all canonical ids and names, builds complete old-to-new maps, remaps internal authored
references only through typed fields, constructs one valid aggregate candidate, renders the complete
generated document, and commits through the existing durable coordinator transaction. A failure
leaves the authored project, generated document, provider target, published snapshot, and Workspace
projection unchanged.

Do not implement paste by calling existing single-entity create routes in a loop. Do not retry a
revision conflict against newer state.

### Frontend delegated authority

Python Canvas registers a delegated Workspace clipboard authority after loading its first canonical
snapshot.

- `prepareCopy` serializes through the existing frontend mutation queue, calls the typed copy
  endpoint against the observed revision, and returns the generated clipboard payload.
- `paste` serializes with every other frontend mutation, calls the typed paste endpoint with the
  current project id/revision and Workspace placement proposal, accepts the returned canonical
  snapshot, and resolves only after `commitWorkspaceDocument` has published the projection.
- Pending and error feedback uses application-labelled live regions. A revision conflict follows
  the existing refresh-and-report path and does not replay the paste.
- Python Canvas continues to create `WorkspaceHost` without local structural history.

## Implementation sequence and commits

1. Commit this plan.
2. Add Workspace clipboard types, registry, envelope parser, subtree capture, local clone planner,
   operations, public exports, commands, bindings, menu integration, and focused tests. Commit the
   complete package slice.
3. Add Go clipboard aggregate types, strict transport types, copy preparation, atomic paste,
   coordinator/HTTP routes, generated TypeScript contract, and focused backend tests. Commit the
   complete backend slice.
4. Add the Python Canvas client calls, mutation-queue integration, delegated authority, canonical
   projection handoff, feedback, and focused frontend tests. Commit the complete application slice.
5. Update current design rationale and public README material, remove temporary/obsolete helpers,
   delete this plan, run the permitted non-test verification, and commit the final candidate.

## Required test coverage to add

Tests are part of the implementation even when the caller has asked not to execute them in this
session.

Workspace unit/component coverage:

- selection-root normalization and descendant capture
- strict envelope parsing, bounds, cycles, duplicates, unknown kinds, and authority mismatch
- local complete id allocation and opaque-data remapping
- relative placement, z-index allocation, one publication, selection, and focus
- one local history transaction for a multi-root paste
- delegated success without speculative publication
- rejection, async failure, concurrent invocation, disposal, editable targets, and text selection
- key-binding conflict and context/palette availability
- host isolation across two mounted workspaces

Python Canvas backend coverage:

- canonical copy payload for callable, dictionary, and list subtrees
- exclusion of generated, diagnostic, provider, terminal, and pending state
- complete id/name allocation and internal typed-reference remapping
- same-project and copied-payload paste
- invalid forest, unsupported kind/version, malformed placement, missing entity, and revision conflict
- atomic rollback on render, persistence, and provider failure
- one revision and one complete published snapshot

Python Canvas frontend coverage:

- delegated registration after canonical load
- serialized copy and paste requests with the observed revision
- paste success projects exactly one accepted canonical snapshot and returns canonical root ids
- revision conflict and ordinary failure restore canonical presentation without a speculative clone
- clipboard operations do not create local Workspace history

## Verification and completion

Do not run tests in this session unless the caller changes the standing instruction. Run formatting,
static policy, typechecking/build checks that do not execute tests, and package-boundary checks as
permitted. Record the skipped test and merge-gate verification plainly in the final handoff.

Completion requires:

- one authoritative implementation for each clipboard concept
- no compatibility parser for main's legacy payload
- no sequential Python Canvas paste mutations
- no stale plan, temporary schema, duplicate helper, debug output, or obsolete documentation
- current design documents describe the final authority and transaction boundaries
- public Workspace and Python Canvas READMEs document integration and behavior
- clean worktree after coherent task-owned commits
