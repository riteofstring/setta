# Realtime live code authoring implementation plan

Status: in progress

## Outcome

The Realtime playground should let a user edit its Python entrypoint beside the running interface,
apply the draft explicitly, and see the runtime reload without refreshing the browser. The initial
surface is one optional Python Code section backed by the project's declared `runtime.entrypoint`,
currently `app.py`.

The entrypoint file remains the only canonical source. The project document owns the presence,
layout, and presentation of the Code section but never embeds a copy of the Python source. A browser
draft is disposable until the user chooses **Apply & reload** or presses Mod-Enter.

This is a focused playground feature, not a general file browser, IDE, dependency editor, automatic
hot-reload service, or multi-user source collaboration system.

## User experience

The Code section uses Workspace's CodeMirror-based Python editor and ordinary section chrome. Its
header contains one native Workspace-style **Apply & reload** action ahead of the standard window,
lock, minimize, and delete controls.

Realtime owns these source states:

- `loading`: the canonical entrypoint is being read;
- `live`: the editor matches the source version accepted by the running worker;
- `dirty`: the local draft differs from the last source version read or written;
- `applying`: one source write and runtime replacement is in progress; and
- `error`: reading, writing, conflict checking, validation, or reload failed with a visible
  diagnostic.

The action is enabled only for an editable dirty draft with no apply already running. Mod-Enter
invokes the same action. Ordinary typing changes only the browser draft: it neither mutates
`project.json`, writes `app.py`, reloads the worker, nor refreshes the page. Locking the section
makes the editor read-only through the same section-lock convention as other editable sections.

A successful apply updates the canonical source version and returns the editor to `live` only when
the matching runtime replacement reports ready. A failed apply preserves the draft and displays
the structured diagnostic. A stale-write conflict does not overwrite external edits; the user can
reload the canonical source and reconcile deliberately.

The existing **Reload runtime** action remains available in the Runtime pane. It reloads the
current on-disk entrypoint without writing the Code section's draft.

## Source authority and section model

`ProjectV1.runtime.entrypoint` selects the only file exposed by this feature. The backend resolves
that path with the existing normalized project-root rules on every read and write. The source API
does not accept a caller-provided path, directory, glob, URL, or alternate project identity.

The optional Realtime Code section is a projection of that entrypoint. Its authored data contains
only closed presentation metadata needed to render the Python editor; it contains no `code`, file
contents, content hash, draft, diagnostics, or runtime state. It has no event bindings or output
targets. The project validator prevents ambiguous source ownership, including multiple live-source
editors for one project.

Browser source state stays outside the Workspace document projection. Consequently, a canonical
project snapshot, layout edit, rename, or reconnect cannot copy a draft into `project.json` or
silently replace a dirty draft. Reconnection may refresh source only when the local editor is clean;
otherwise it reports that the canonical version changed and requires an explicit reconciliation.

## Source HTTP contract

Add one closed, versioned source-document contract behind a narrow endpoint such as
`/api/v1/runtime/source`:

- `GET` returns the normalized entrypoint, its UTF-8 source, and an opaque version derived from the
  exact canonical file bytes;
- `PUT` accepts only a bounded UTF-8 source and the exact `expectedVersion` returned by `GET` or the
  previous successful `PUT`; and
- a successful `PUT` returns the new canonical source version and the runtime-apply outcome needed
  to correlate subsequent status.

Both methods enforce the local server's exact Origin policy. Unsupported methods, request bodies on
`GET`, unknown fields, oversized source, malformed UTF-8, entrypoint escape, and symlink escape fail
before file access or mutation. A version mismatch returns a structured conflict and performs
neither the write nor reload.

The version is a concurrency token, not a project revision. Project mutations and source writes
remain separate authorities: changing layout must not invalidate a source draft, and writing source
must not increment `ProjectV1.revision`.

An accepted `PUT` writes through a temporary file in the entrypoint directory and atomically
replaces the canonical source before requesting reload. It preserves the repository's expected file
mode and leaves no temporary file after success or failure. The endpoint never writes generated
content, project data, dependencies, or another source file.

## Apply and runtime replacement

The Go coordinator owns the complete Apply-and-reload transaction after HTTP validation. It
serializes source applications, performs the compare-and-write, requests worker replacement, and
publishes the outcome. The browser must not compose an independent file write followed by the
existing reload endpoint because another writer could intervene between those operations.

The preferred runtime behavior is candidate replacement:

1. Keep the currently ready worker serving events.
2. Write the accepted source atomically and start a candidate worker for that exact version.
3. Import and initialize the candidate, collecting bounded structured diagnostics.
4. Swap runtime ownership only after the candidate reports ready.
5. Shut down the previous worker after the swap.
6. If candidate startup fails, clean it up, retain the previous ready worker, and report that the
   saved source version is not live.

Implementation discovery must verify whether the current manager can support this without a broad
worker rewrite. If candidate replacement is too large for this slice, the implementation and
durable docs must state the exact achieved failure semantics. They must not claim that the prior
worker remains live unless tests prove it. The file write is not rolled back merely to hide invalid
source; the editor must continue to show the canonical saved source and its reload diagnostic.

Runtime snapshots and WebSocket envelopes remain the authority for replacement lifecycle. Extend
them only as needed to correlate the source version and communicate `starting`, `ready`, and
`failed`. HTTP success alone is not proof that code is live. Reload failure must remain distinct
from transport failure and from total loss of the active worker.

## Frontend and Workspace ownership

Realtime owns:

- loading the current source document and retaining its version;
- the draft, dirty comparison, apply serialization, and stale-conflict recovery;
- mapping backend diagnostics into the editor and section status;
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

Reuse or extract a controlled form of Workspace's built-in Code editor rather than copying its
CodeMirror setup. The controlled value and change callback belong to Realtime, because the existing
authored Code section persists code inside a Workspace document and therefore cannot itself be the
source authority for this feature.

## Backend ownership

The Realtime backend owns the source request and response contracts, strict decoding, path
resolution, version calculation, bounded reads, atomic replacement, coordinator serialization, and
runtime replacement. Go remains the contract owner; regenerate TypeScript declarations, JSON
Schema fixtures, and standalone browser validators from the Go definitions.

The worker protocol continues to own Python import, initialization, diagnostics, shutdown, and
readiness. Python never serves the source endpoint or writes its own entrypoint. The content store
and runtime artifact store are not source stores and must not be reused as one.

## Generated artifacts and repository hygiene

Runtime content and worker staging directories beneath examples are disposable process artifacts:

```text
apps/realtime/examples/*/.local/realtime/.runtime-content-*/
apps/realtime/examples/*/.local/realtime/.setta-realtime-worker-*/
```

Ignore only those exact generated directory families. Continue tracking each example's
`.local/realtime/project.json`, `app.py`, and other authored inputs. Tests create runtime artifacts
in temporary state and verify cleanup; they do not rely on ignored directories already present in a
developer checkout.

## Implementation batches and commits

### Batch 1: current plan and hygiene

1. Replace the completed Realtime foundation and adaptive-scheduling plans with this current plan.
2. Add exact ignore rules for example runtime-content and worker staging directories.
3. Leave authored example project documents and existing local runtime state untouched.

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
2. Implement and test candidate validation and transactional worker replacement if the current
   worker boundary supports it within scope.
3. Publish source-correlated starting, ready, and failed lifecycle state through runtime snapshots
   and WebSocket envelopes.
4. Preserve the external reload command and its current source-of-truth behavior.

Commit the runtime lifecycle independently from frontend integration. If candidate replacement is
deferred after discovery, update this plan and the backend rationale with the exact implemented
semantics in that same milestone.

### Batch 4: controlled editor and native action

1. Expose the smallest controlled Workspace Code editor surface required by Realtime.
2. Add a generic native header-action component only if the current header-control seam lacks one.
3. Register the optional Realtime Python Code section without putting source in project data.
4. Implement source loading, local drafts, dirty/applying/live/error presentation, Apply-and-reload,
   Mod-Enter, diagnostics, and explicit conflict handling.

Keep Workspace and Realtime changes in separate commits when both modules change.

### Batch 5: playground, durable docs, and acceptance

1. Add the optional Code section to the intended Realtime playground layout without changing its
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
- concurrent updates cannot both win with one expected version;
- candidate success swaps workers and cleans up the predecessor; and
- candidate failure cleans up the candidate and retains the prior worker only if that behavior is
  implemented and documented.

Focused frontend and Workspace tests must prove:

- the controlled editor never publishes source into the Workspace or project document;
- typing marks the draft dirty without a request or reload;
- the native header action and Mod-Enter invoke the same single operation;
- applying, clean, locked, and disconnected states enable or disable the action correctly;
- success waits for matching runtime readiness, while conflict and reload diagnostics stay visible;
- project projection preserves a dirty source draft; and
- any new generic header primitive has native styling, focus, accessible naming, and disabled
  behavior in light and dark modes.

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
- Invalid code has the exact tested worker-retention behavior stated in durable documentation.
- External Reload continues to reload the current on-disk source independently of a dirty draft.
- Workspace remains source-agnostic and owns only reusable editor and header presentation.
- Example runtime-content and worker staging directories are ignored while authored project inputs
  remain tracked.
