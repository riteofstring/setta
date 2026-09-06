# Realtime live code authoring implementation plan

Status: implemented

## Outcome

The Realtime playground should let a user edit its Python entrypoint beside the running interface,
apply the draft explicitly, and see the runtime reload without refreshing the browser. The initial
surface is one optional Python Code section backed by the project's declared `runtime.entrypoint`,
currently `app.py`.

The entrypoint file remains the only canonical source. The project document owns the presence,
layout, and presentation of the Code section but never embeds a copy of the Python source. A browser
draft is disposable until the user chooses the labeled **Apply** action or presses Mod-Enter. The
action saves the entrypoint and reloads the runtime as one operation.

This is a focused playground feature, not a general file browser, IDE, dependency editor, automatic
hot-reload service, or multi-user source collaboration system.

## User experience

The Code section uses Workspace's CodeMirror-based Python editor and ordinary section chrome. Its
header contains one native Workspace-style **Apply** action with a play glyph ahead of the standard
window, lock, minimize, and delete controls. Its tooltip names the complete **Apply & reload**
operation and keyboard shortcut; a standalone circular-arrow icon is reserved for reload behavior
that does not also save a draft.

Realtime owns these source states:

- `loading`: the canonical entrypoint is being read;
- `live`: the editor matches the source version accepted by the ready worker;
- `dirty`: the local draft differs from the last source version read or written;
- `applying`: one source write and runtime replacement is in progress; and
- `error`: reading, writing, conflict checking, validation, or reload failed with a visible
  diagnostic.

The action is enabled for an editable dirty draft with no apply already running, and also for a
clean saved draft whose previous activation was rejected so it can be retried. Mod-Enter invokes
the same action. Ordinary typing changes only the browser draft: it neither mutates `project.json`,
writes `app.py`, reloads the worker, nor refreshes the page. Locking the section makes the editor
read-only through the same section-lock convention as other editable sections.

An accepted apply updates the canonical source version. It returns the editor to `live` only when
the matching runtime replacement reports ready. If activation is rejected after the save, the draft
is clean because it matches the accepted bytes, the worker is failed, and the structured diagnostic
remains visible. A stale-write conflict does not overwrite external edits; the user can reload the
canonical source and reconcile deliberately.

The existing **Reload runtime** action remains available in the Runtime pane. It reloads the
current on-disk entrypoint without writing the Code section's draft.

## Source authority and section model

`ProjectV1.runtime.entrypoint` selects the only file exposed by this feature. The backend resolves
that path with the existing normalized project-root rules on every read and write. The source API
does not accept a caller-provided path, directory, glob, URL, or alternate project identity.

The optional Realtime Code section is a projection of that entrypoint. A project contains zero or
one such section, and its closed authored data is exactly `{"source":"entrypoint"}`. It contains no
`code`, file contents, content hash, draft, diagnostics, runtime state, event bindings, or output
targets. The project validator rejects a second Code section and every other data shape.

A disposable local Workspace document may hold the source draft and editor undo state. Realtime
strips those bytes from the authored projection back to Go, so a canonical project snapshot, layout
edit, rename, or reconnect cannot copy a draft into `project.json` or silently replace a dirty
draft. Project SSE reprojection preserves a dirty draft. A source-version conflict reads the
current canonical source as the new baseline, keeps the local draft for comparison, and requires
an explicit reconciliation.

## Source HTTP contract

Add one closed, versioned source-document contract at `/api/v1/runtime/source`:

- same-origin-readable `GET` returns the closed `{projectId, entrypoint, version, source}` document
  and rejects a supplied foreign Origin;
- exact-origin `PUT` accepts the closed `{projectId, entrypoint, expectedVersion, source}` apply
  request with bounded valid UTF-8 and the exact version returned by `GET` or an accepted `PUT`;
  and
- the apply result reports the accepted saved source document separately from the activation
  outcome (`activated` or `rejected`) and diagnostic.

The mutating `PUT` requires the local server's exact Origin. A same-origin browser `GET` may omit
the Origin header, so host enforcement and the browser's same-origin read policy protect that
side-effect-free response; any supplied foreign Origin is rejected. Unsupported methods, request
bodies on `GET`, unknown fields, oversized source, malformed UTF-8, entrypoint escape, and symlink
escape fail before file access or mutation. A version mismatch returns a structured conflict and
performs neither the write nor reload.

The version is a concurrency token, not a project revision. Project mutations and source writes
remain separate authorities: changing layout must not invalidate a source draft, and writing source
must not increment `ProjectV1.revision`.

An accepted `PUT` performs an atomic compare-and-swap through a synced temporary sibling in the
entrypoint directory, replacing the canonical source before requesting reload. It preserves the
repository's expected file mode and leaves no temporary file after success or failure. The endpoint
never writes generated content, project data, dependencies, or another source file.

## Apply and runtime replacement

The Go coordinator owns the complete Apply-and-reload transaction after HTTP validation. It
serializes source applications, performs the compare-and-write, requests worker replacement, and
publishes the outcome. The browser must not compose an independent file write followed by the
existing reload endpoint because another writer could intervene between those operations.

Runtime replacement remains deliberately non-overlapping:

1. Write the accepted source atomically and publish that replacement is starting.
2. Stop the current worker and all descendants with the existing bounded cleanup.
3. Start and initialize one worker from the saved source.
4. Publish `ready` and return `activated` when initialization succeeds.
5. Publish `failed` and return `rejected` with the structured diagnostic when initialization fails.

Setta does not keep an old worker alive while initializing a candidate. Arbitrary applications may
hold models, GPU memory, ports, devices, or process-lifetime side effects, so overlap can double
scarce resources or make valid code fail for unrelated ownership reasons. The file write is not
rolled back merely to hide invalid source: the editor remains clean against the accepted canonical
source, reports that it is not live, and allows a corrected Apply or global Reload.

Runtime snapshots and WebSocket envelopes remain the authority for replacement lifecycle. Extend
them only as needed to correlate the source version and communicate `starting`, `ready`, and
`failed`. HTTP success alone is not proof that code is live. Reload failure must remain distinct
from transport failure and from total loss of the active worker.

## Frontend and Workspace ownership

Realtime owns:

- loading the current source document and retaining its version;
- the draft, dirty comparison, apply serialization, and stale-conflict recovery;
- mapping backend diagnostics into visible Realtime feedback and section-action state;
- enabling the header action and Mod-Enter shortcut; and
- deciding when an applied version becomes live from runtime state.

Workspace owns:

- the reusable CodeMirror editor behavior and Python presentation;
- ordinary section chrome, selection, locking, minimization, sizing, and windowing; and
- generic header-action placement, focus, disabled, tooltip, keyboard, light-mode, and dark-mode
  styling.

Use the existing section-kind header-control seam. If callers still have to reproduce a native
header button's structure or classes, add the smallest generic Workspace header-action primitive
and use it in both Workspace-owned and Realtime-owned controls. Do not add Realtime source state,
network behavior, Python terminology, or Apply semantics to Workspace.

Reuse Workspace's built-in Code editor rather than copying its CodeMirror setup. Its local document
may hold the disposable draft and undo history, while Realtime owns source synchronization and the
projection strips editor bytes before producing project operations.

## Backend ownership

The Realtime backend owns the source request and response contracts, strict decoding, path
resolution, version calculation, bounded reads, atomic replacement, coordinator serialization, and
runtime replacement. Go remains the contract owner; regenerate TypeScript declarations, JSON
Schema fixtures, and standalone browser validators from the Go definitions.

The worker protocol continues to own Python import, initialization, diagnostics, shutdown, and
readiness. It compiles the entrypoint's current source bytes without reading or writing that file's
timestamp-based bytecode cache, while imports made by the entrypoint keep ordinary Python behavior.
Python never serves the source endpoint or writes its own entrypoint. The content store and runtime
artifact store are not source stores and must not be reused as one.

## Playground fixture and repository hygiene

The checked-in Neon example is an immutable fixture beneath
`apps/realtime/examples/neon-sketch/fixture`. `pnpm realtime:playground` seeds a persistent working
project at `tmp/realtime-playground/neon-sketch` when it is absent and launches only that copy.
Later launches preserve the working copy, so applied callback edits and drawings remain available
without modifying the fixture. Removing the ignored working directory resets the playground from
the fixture on the next launch.

The repository-wide `tmp/` rule excludes the complete working project, including its mutable
`.local/realtime/project.json`, `app.py`, uploaded content, worker staging, caches, and future
runtime-owned files. Legacy mutable files at the former example root are ignored as well, allowing
an existing developer session to finish without surfacing its state in Git. Tests use temporary
working projects and verify fixture copying and preservation directly. The playground build checks
generated contracts without rewriting them and runs Go with read-only module resolution, so build
setup cannot turn drift into tracked changes.

## Implementation batches and commits

### Batch 1: current plan and hygiene

1. Replace the completed Realtime foundation and adaptive-scheduling plans with this current plan.
2. Keep the checked-in example inputs immutable and launch from a complete ignored working copy.
3. Preserve existing local callback and drawing state while removing those mutable copies from Git
   tracking.

Commit this documentation-only milestone independently.

### Batch 2: contracts and source store

1. Define the closed source document, update request, outcome, and structured failure contracts.
2. Implement entrypoint-only normalized reads, bounded hashing, stale-write rejection, and atomic
   replacement.
3. Expose the exact-origin `GET` and `PUT` handlers and regenerate all derived contracts.
4. Cover the store and HTTP boundary before connecting worker reload.

Commit the source authority as one runnable backend milestone.

### Batch 3: runtime replacement

1. Route accepted source updates through the coordinator rather than composing browser requests.
2. Preserve the existing bounded non-overlapping worker replacement and descendant cleanup.
3. Publish starting, ready, and failed lifecycle state through runtime snapshots and WebSocket
   envelopes, while the apply result independently reports `activated` or `rejected`.
4. Preserve the external reload command and its current source-of-truth behavior.

Commit the runtime lifecycle independently from frontend integration.

### Batch 4: controlled editor and native action

1. Expose the smallest controlled Workspace Code editor surface required by Realtime.
2. Add a generic native header-action component only if the current header-control seam lacks one.
3. Register the optional Realtime Python Code section without putting source in project data.
4. Implement source loading, local drafts, dirty/applying/live/error presentation, Apply-and-reload,
   Mod-Enter, diagnostics, and explicit conflict handling.

Keep Workspace and Realtime changes in separate commits when both modules change.

### Batch 5: playground, durable docs, and acceptance

1. Add the optional Code section to the intended Realtime playground fixture without changing its
   canonical source ownership.
2. Document source editing, Apply-and-reload, external reload, conflicts, security, and actual
   failure behavior in the Realtime README and mapped frontend/backend rationale.
3. Complete generated-contract drift checks and focused module tests.
4. Run the selected final gate once on the stable committed candidate.

## Verification

Focused backend tests must prove:

- `GET` returns only the normalized declared entrypoint and a stable exact-content version;
- `PUT` rejects wrong origin, unknown fields, oversized or invalid source, path escape, and stale
  versions without mutation or reload;
- a valid update atomically changes `app.py`, returns a new version, and starts exactly one reload;
- rapid equal-size updates with an unchanged filesystem timestamp execute the newest source rather
  than cached entrypoint bytecode;
- concurrent updates cannot both win with one expected version;
- successful activation stops the predecessor and leaves exactly one ready worker; and
- rejected activation keeps the accepted bytes, leaves the runtime failed, returns the diagnostic,
  and permits a later corrected apply.

Focused frontend and Workspace tests must prove:

- the local Workspace draft never becomes source-bearing project data or a project operation;
- typing marks the draft dirty without a request or reload;
- the native header action and Mod-Enter invoke the same single operation;
- applying, clean, locked, unavailable-source, and activation-rejected states enable or disable
  the action correctly, including recovery while the runtime socket is unavailable;
- success waits for matching runtime readiness, while conflict and reload diagnostics stay visible;
- project projection preserves a dirty source draft; and
- any new generic header primitive has native styling, focus, accessible naming, and disabled
  behavior in light and dark modes.

Focused playground-runner tests must prove that a missing ignored workspace is seeded from the
complete immutable fixture, an existing workspace is preserved byte-for-byte, required files must
be regular non-symlinks, and the launched project root is the ignored workspace rather than the
tracked fixture. A failed or interrupted seed must leave no partial final workspace. Build
verification must also prove the tracked fixture, generated contracts, and Go module locks remain
byte-identical.

Browser acceptance must edit the temporary project's `app.py` through the Code section, apply it,
observe starting and ready lifecycle state, and invoke behavior from the new worker without a page
refresh. It must also prove that a malformed edit reports the documented failure outcome and that a
subsequent corrected apply recovers. Existing project editing, drawing, progress, cancellation,
artifact, restart, and shutdown coverage remains intact.

## Completion criteria

- A user can edit the declared Python entrypoint in the Realtime playground and apply it with the
  native header action or Mod-Enter.
- Source exists canonically only in the entrypoint file; `project.json` contains no source copy.
- No source write or reload occurs per keystroke, and Apply requires no browser refresh.
- Stale browser drafts cannot overwrite an externally changed entrypoint.
- Runtime state reports whether the saved version is starting, ready, or failed.
- Invalid code has the exact tested worker-replacement behavior stated in durable documentation.
- External Reload continues to reload the current on-disk source independently of a dirty draft.
- Workspace remains source-agnostic and owns only reusable editor and header presentation.
- The checked-in example fixture remains immutable, while callback edits, project mutations,
  runtime content, worker staging, and caches live only in the ignored playground workspace.
