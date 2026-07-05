# Workflow Authoring Runtime Sync And Output Plan

Date: 2026-07-07

## Problem

AI-authored workflows can be saved through the `setta workflow` CLI while the
desktop app is running, but the running UI does not reliably reflect that
mutation. In the observed production recording, the CLI saved a new workflow
definition and returned an ID, but the sidebar continued to show only the
definitions loaded at startup.

The same recording showed clickable command activity rows for
`setta workflow ...` calls with no visible result. The persisted run items had
no captured stdout, stderr, result text, or output artifact, so the UI had
nothing concrete to display.

## Principle

These are runtime guarantees, not prompt or skill responsibilities.

Workflow definition mutations must emit backend-owned domain events after the
durable write succeeds. Any running desktop UI should observe those events and
invalidate or reload its workflow definition list.

Command activity rows must be backed by durable execution artifacts. Setta
should persist the command, cwd, exit status, stdout, stderr, final result
metadata, and an explicit output availability state. A clickable command row
must never silently expand to an empty result when output was not captured.

## Target Flow

```text
setta workflow CLI
  -> workflow backend API
  -> durable workflow definition mutation
  -> workflow definition domain event
  -> desktop event stream
  -> renderer invalidates workflow definition list
  -> sidebar shows the saved workflow
```

```text
Codex app-server command events
  -> chat adapter normalizes command execution state
  -> persisted run item command artifact
  -> transcript command row displays stdout, stderr, result, or unavailable state
```

## Plan: Workflow Definition Sync

1. Define typed workflow definition events:
   - `workflow_definition.created`
   - `workflow_definition.updated`
   - `workflow_definition.deleted`

2. Include the minimum payload needed for UI invalidation and audit:
   - workspace ID
   - definition ID
   - event type
   - definition name when available
   - event timestamp

3. Emit the event from the workflow service after the durable mutation commits.
   The CLI, renderer, and any other caller must get the same behavior because
   they all go through the backend workflow service.

4. Deliver definition events to the desktop renderer through the backend event
   stream used by the running app. Do not rely on renderer-local browser events
   for mutations that can originate from the CLI.

5. Update the sidebar/store to refresh `workflow:list-definitions` when a
   workflow definition event for the current workspace arrives.

6. Keep selection behavior explicit. A newly-created external definition should
   appear in the sidebar without forcing the graph pane to switch away from the
   user's current selection unless the product intentionally chooses that
   behavior.

## Plan: Command Output Capture

1. Treat command execution output as part of the persisted chat/run artifact,
   not as transient transcript UI state.

2. Persist output deltas when the provider emits them:
   - stdout chunks
   - stderr chunks
   - ordering metadata when available

3. On command completion, reconcile the final command payload with the stored
   artifact. If the provider includes final stdout, stderr, result, error, or
   exit metadata only on completion, persist it there.

4. Represent output availability explicitly:
   - `captured`: stdout/stderr/result content is available
   - `empty`: the command completed and produced no output
   - `unavailable`: the provider did not expose command output

5. Update the transcript command row/details UI to render those states
   distinctly. A user should be able to tell whether a command produced no
   output, output was unavailable from the provider, or output capture failed.

6. Fail loudly in tests when expected command output is missing. Do not let fake
   harness tests pass by injecting output paths that production runs do not
   create.

## Verification

- Open a workspace in production Electron, save a workflow through
  `setta workflow definitions save`, and assert the sidebar shows the new
  definition without reloading the app.
- Save a workflow through the renderer UI and assert it uses the same backend
  definition event path.
- Run deterministic Codex app-server protocol tests for command output deltas.
- Add a deterministic command-completion case where output is present only in
  the final command payload.
- Add a deterministic no-output case and assert the UI shows an explicit empty
  state.
- Add a deterministic output-unavailable case and assert the UI says output was
  unavailable instead of displaying a blank result.
- Run the relevant Electron workflow authoring test through production
  main/preload/renderer/backend paths.
