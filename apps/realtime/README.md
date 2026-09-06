# Setta Realtime

Realtime is a standalone local Setta app for authored React interfaces connected to ordinary
Python handlers. Python Canvas is not part of its runtime or authoring path.

## Commands

```console
setta realtime open --project-root ./my-app --create
setta realtime schema --pretty
setta realtime snapshot --project-root ./my-app --pretty
setta realtime apply --project-root ./my-app --file mutation.json --pretty
setta realtime reload --project-root ./my-app --pretty
setta realtime invoke --project-root ./my-app --handler increment --file input.json --pretty
```

## Drawing playground

The checked-in playground turns each settled drawing into a neon-glitch image using only Python's
standard library and browser-native SVG filters:

```console
pnpm realtime:playground
```

This repository-local command installs the frozen workspace dependencies, rebuilds Workspace and
Realtime, replaces the repository-owned local Setta environment from a complete new wheel, and
opens Neon Sketch. After the first complete build, it reuses the installed Python Canvas assets
instead of rebuilding that unrelated app. It does not reuse `uv tool run`'s cached same-version
environment. Use `setta realtime open` for an installed release.

Draw a mark and the processed result updates beside the pointer while the stroke is active. The
toolbar also provides selection, whole-object erasing, brush color and size, rectangle and ellipse
insertion, undo, redo, selected-object deletion, and clearing. The example is an ordinary Realtime
project: its authored document is under `.local/realtime/project.json`, and its editable handler is
`app.py`. It requires no GPU, model download, or project dependency.

`open` loads the current entrypoint before opening the browser, owns one foreground session, and
stops when its Setta supervisor exits. When that session is running, `snapshot`, `apply`, `reload`,
and `invoke` address its live coordinator. Without a live session, the same commands operate
through a bounded local coordinator. `schema` is offline and is the authoritative description of
commands, operations, results, errors, and generated contracts.

A project uses ordinary files:

```text
my-app/
  .local/realtime/project.json
  app.py
  pyproject.toml
  uv.lock
```

Only `project.json` is Setta-authored project state. The file selected by `runtime.entrypoint`,
currently `app.py`, is the sole source authority. Python metadata and locking remain standard
project choices. Realtime uses the nearest valid `.venv` at or above the project directory,
otherwise the Python interpreter that launched Setta.

## Project mutations

`apply` accepts one closed, revision-checked request. It never silently rebases a stale edit.

```json
{
  "projectId": "project-example",
  "expectedRevision": 3,
  "operations": [
    { "op": "setName", "name": "Counter" },
    { "op": "setViewport", "viewport": { "x": 0, "y": 0, "zoom": 1 } }
  ]
}
```

The operation union is `setName`, `setRuntime`, `upsertSection`, `deleteSection`, `setBinding`,
`deleteBinding`, `setConfiguration`, and `setViewport`. Unknown fields, unknown union members,
invalid section forests, broken binding references, and stale project revisions fail the complete
request without changing the project.

The initial section kinds are `input`, `output`, `button`, `status`, `drawing`, and `code`. A
project may contain at most one `code` section, and its data is exactly
`{"source":"entrypoint"}`. It projects the declared entrypoint without copying source, drafts,
versions, or diagnostics into `project.json`. A binding names one exact event and handler, resolves
`$event.FIELD` and `$sections.SECTION.FIELD` arguments from one canonical snapshot, declares
possible output targets, and selects `once`, `latest`, or `parallel` scheduling with an explicit
concurrency group and limit. The recommended policy for a continuously changing interactive input
is completion paced:

```json
{
  "mode": "latest",
  "debounceMilliseconds": 0,
  "concurrencyGroup": "image-processing",
  "concurrencyLimit": 1
}
```

Zero debounce starts idle work immediately. While it runs, `latest` retains only the newest pending
input and starts that input when capacity returns, so the handler's observed completion rate adapts
the cadence without a guessed timing interval. A nonzero debounce remains an explicit trailing
delay for interactions that should wait for input to become quiet.

## Live source editing

The optional Code section uses Workspace's native editor and header controls. Typing changes only a
browser-local draft. **Apply & reload** and Mod-Enter invoke the same explicit operation; there is
no autosave, reload per keystroke, or browser refresh. The existing global **Reload runtime** action
still reloads the on-disk entrypoint and never writes a dirty browser draft.

The exact-origin `GET /api/v1/runtime/source` response is
`{projectId, entrypoint, version, source}`. `PUT /api/v1/runtime/source` accepts
`{projectId, entrypoint, expectedVersion, source}`. The endpoint exposes only the current normalized
entrypoint, accepts bounded valid UTF-8, and atomically compare-and-swaps the file using its opaque
content version. A stale version, wrong project or entrypoint, invalid source body, or path escape
does not write or reload.

An accepted PUT saves `app.py` before activation and reports the saved source separately from an
`activated` or `rejected` outcome. Replacement is deliberately non-overlapping: the current worker and its owned
descendants stop before the new worker starts, avoiding doubled model, GPU, device, memory, and
process-lifetime side effects. Runtime state reports `starting`, `ready`, or `failed`. If startup
fails, the accepted bytes remain saved, the worker remains failed, and the clean editor displays
the diagnostic. Correct the source and Apply again, or correct the file externally and use global
Reload.

## Python handlers

The entrypoint exports an exact `handlers` dictionary. Optional `startup` and `shutdown` functions
run once per worker lifetime and may be async.

```python
count = 0


def increment(step=1):
    global count
    count += step
    return {"value": count}


def stream(limit=3):
    for value in range(limit):
        yield {"value": value}


handlers = {"increment": increment, "stream": stream}
```

A generator or async generator streams each yielded value. Awaitables are supported. Exceptions
become structured handler errors, while stdout and stderr become bounded runtime logs and never
share the protocol channel. Generator updates remain the single progressive-output mechanism: they
may carry progress, messages, JSON outputs, and artifacts, while handler completion remains the
definitive final boundary.

A content-reference argument remains a dictionary and gains a worker-private absolute `path`.
Handlers read the file at that path; the path never reaches the browser. Large output files are
streamed with an exact update envelope:

```python
def stylize(drawing, strength):
    output_path = create_image(drawing["path"], strength)
    yield {
        "outputs": {},
        "progress": 1,
        "message": "Complete",
        "artifacts": [
            {"name": "image", "mediaType": "image/png", "path": output_path}
        ],
    }
```

Artifact paths may be absolute or project-relative regular files. The worker copies them into its
invocation scope; Go validates and adopts them into the single content store. Browser messages
contain only the resulting content reference. Inputs, artifacts, JSON frames, queues, histories,
and logs all have explicit bounds.

Direct invocation input has the same portable value boundary:

```json
{
  "arguments": { "step": 2 },
  "content": []
}
```

## Browser behavior

Realtime renders one ordinary editable `@setta/workspace` host and shell. Workspace owns section
selection, movement, resizing, locking, minimization, naming, the Inspector, section chrome, and
its upstream XYFlow canvas; Realtime does not add a mode layer or alternate section renderer.
Project snapshots arrive as complete SSE values. Runtime snapshots, events, cancellations,
invocation status, updates, and logs use one WebSocket. Reconnection replaces local state from
current complete snapshots while retaining browser-owned selection and minimized presentation.

Fabric.js owns retained drawing objects, free drawing, erasing, selection, transforms, history,
serialization, and raster export. Realtime persists the vector scene only after a coherent
gesture. For a completion-paced binding, the browser captures and uploads the first eligible
composited raster immediately, then retains only one dirty preview or final snapshot while the
binding is occupied. It performs no additional capture or upload until invocation completion
restores capacity. A settled final snapshot takes priority over lossy preview work and remains
pending until it can be sent, without turning pointer movement into durable project mutations.

`latest` runs at most one invocation for a binding and retains at most its newest queued or
debounced input. A new event supersedes only replaced pending work; it does not cancel or suppress
work that is already running. Submitted status and published output use separate sequence
watermarks, so a running invocation may publish while newer work waits, but an older late output
can never replace a newer published output. `once` rejects overlap, and `parallel` remains within
declared binding and group bounds. A Cancel action removes queued work or requests cooperative
worker cancellation. A timeout or crash replaces the whole worker process because arbitrary
synchronous Python cannot be safely interrupted.

Completion itself is the automatic feedback signal; Realtime does not estimate handler time with
an EWMA. It also does not add automatic cancellation, result caching, cross-session batching,
typed preview/final messages, or a Python scheduling decorator. Expensive models and clients can
already load once through module initialization or the worker `startup` hook.

## Local security and lifecycle

The host binds IPv4 loopback, validates the exact listener authority and browser origin, preflights
all production assets, and keeps every API route outside SPA fallback. User Python intentionally
runs with the current user's permissions; process ownership provides bounded lifetime and
descendant cleanup, not a security sandbox.

The private language-neutral worker contract is JSON-RPC 2.0 with strict LSP `Content-Length`
framing. A later language adapter must implement the same `initialize`, `runtime/invoke`,
`runtime/update`, `$/cancelRequest`, and `shutdown` lifecycle and pass the existing non-Python
conformance fixture. Registration is compile-time at `openLocalApplication`: the runtime-kind
selection constructs an implementation of the coordinator's `runtime.Worker` interface and its
optional artifact and log sources. Unsupported kinds remain errors. The new adapter may add its own
launcher and containment implementation, but project bindings, scheduling, browser transport, and
frontend code do not change.
