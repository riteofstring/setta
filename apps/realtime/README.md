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

The checked-in playground fans each drawing snapshot out to two realtime handlers. One keeps the
standard-library and browser-native SVG neon effect; the other uses Pillow image operations to
produce a warm risograph treatment:

```console
pnpm realtime:playground
```

This repository-local command installs the frozen workspace dependencies, rebuilds Workspace and
Realtime, replaces the repository-owned local Setta environment from a complete new wheel, and
opens Neon Sketch. After the first complete build, it reuses the installed Python Canvas assets
instead of rebuilding that unrelated app. It does not reuse `uv tool run`'s cached same-version
environment. Before launch it seeds `tmp/realtime-playground/neon-sketch` from the immutable
checked-in fixture when that ignored working project is absent. Later launches preserve drawings
and applied callback edits in the ignored copy; remove that directory to reset it from the fixture.
An existing copy is deliberately not migrated. Back up any callback edits and reset it once to pick
up a newer fixture layout or callback. The launcher synchronizes the working project's exact frozen
dependencies into its ignored `.venv` without building source distributions.
Generated Realtime contracts are checked without being rewritten and Go module resolution is
read-only during this build, so launching the playground does not repair or update tracked inputs.
Use `setta realtime open` for an installed release.

Draw a mark and both processed results update while the stroke is active. The two bindings have
independent concurrency groups, so the SVG and Pillow handlers are admitted and publish without
waiting on each other. The drawing toolbar provides Select, Pen, Highlighter, Eraser, and Hand
tools; text, line, arrow, rectangle, and ellipse insertion; brush styling; undo and redo; zoom,
fit, and actual-size controls; an optional grid and grid snapping; and clearing. Selecting retained
objects exposes appearance, typography, arrangement, grouping, locking, and deletion controls in
the right-side Inspector. The example is an ordinary Realtime project: inside the ignored working
copy its authored document is `.local/realtime/project.json` and its editable handler is `app.py`.
Change the three palette colors in `_pillow_risograph`, or the `MaxFilter` size, then use **Apply &
reload** for an immediate visual variation. The tracked source under
`apps/realtime/examples/neon-sketch/fixture` is only the immutable seed. Playground activity never
modifies that fixture or adds runtime state to Git. It requires no GPU or model download; Pillow is
the example project's sole exact-pinned dependency.

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

One event may fan out to multiple bindings. Independent work should use distinct concurrency groups
so each handler can start and publish separately. Drawing preview admission waits until every
matching completion-paced binding is terminal before emitting the next snapshot, so the slowest
matching handler bounds input cadence without blocking faster outputs from appearing first.

## Live source editing

The optional Code section uses Workspace's native editor and header controls. Typing changes only a
browser-local draft. The labeled **Apply** action (whose tooltip names the complete **Apply &
reload** operation) and Mod-Enter invoke the same explicit operation; there is
no autosave, reload per keystroke, or browser refresh. The existing global **Reload runtime** action
still reloads the on-disk entrypoint and never writes a dirty browser draft.

The same-origin-readable `GET /api/v1/runtime/source` response is
`{projectId, entrypoint, version, source}`; it accepts the absent Origin of a normal same-origin
browser read and rejects a supplied foreign Origin. Exact-origin `PUT /api/v1/runtime/source`
accepts `{projectId, entrypoint, expectedVersion, source}`. The endpoint exposes only the current
normalized entrypoint, accepts bounded valid UTF-8, and atomically compare-and-swaps the file using
its opaque content version. A stale version, wrong project or entrypoint, invalid source body, or
path escape does not write or reload.

On a stale version, Realtime reads the current file as the new comparison baseline while retaining
the browser draft for review. Source Apply remains available when the runtime worker or its socket
is failed, so correcting rejected code does not depend on an already healthy worker.

An accepted PUT saves `app.py` before activation and reports the saved source separately from an
`activated` or `rejected` outcome. Replacement is deliberately non-overlapping: the current worker
and its owned descendants stop before the new worker starts, avoiding doubled model, GPU, device,
memory, and process-lifetime side effects. Runtime state reports `starting`, `ready`, or `failed`.
If startup fails, the accepted bytes remain saved, the worker remains failed, and the interface
displays the diagnostic. Correct the source and Apply again, or correct the file externally and use
global Reload. Each new worker compiles the entrypoint's current source bytes directly rather than
trusting a timestamp-based Python bytecode cache, so rapid same-size callback edits activate the
saved version.

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
serialization, and raster export. Realtime persists the vector scene only after a coherent gesture
or command. While a local change is unsettled or awaiting acknowledgement, delayed project
snapshots cannot replace it, and drawing on the inner canvas does not reorder or persist the outer
section.

The drawing toolbar provides Select, Pen, translucent Highlighter, Eraser, and Hand tools plus text,
line, arrow, rectangle, and ellipse insertion. New objects become the active selection; a new text
box enters editing immediately. The Inspector's contextual **Selection** panel edits compatible
fill, stroke, opacity, rectangle radius, and text properties, represents mixed values explicitly,
and provides stacking, alignment, distribution, duplication, grouping, locking, and deletion.
Locked objects remain selectable for unlocking but cannot be changed by geometry or destructive
commands.

After the drawing stage has focus, Mod-Z, Shift-Mod-Z, Ctrl-Y, Mod-C, Mod-V, Mod-D, Mod-A, Mod-G,
Shift-Mod-G, Delete, Backspace, Escape, and arrow-key nudging operate on the drawing when their
actions are available. Shift-arrow nudges ten logical pixels instead of one. Single-key V, P, H,
and E select the Select, Pen, Highlighter, and Eraser tools. Fabric text editing and ordinary form
controls keep their native keyboard behavior, and unavailable drawing actions fall through.

Zoom, fit, actual size, Hand-tool panning, grid visibility, and grid snapping are local presentation
state. They do not change the project revision, drawing history, logical canvas, or raster export.
The grid follows logical coordinates, is not exported, and optional snapping rounds moved objects
to its intersections. Bare wheel input continues to pan the outer Workspace rather than changing
drawing zoom.

The drawing keeps its logical pixel dimensions and object coordinates when its outer section is
resized; it stays centered and uniformly contained, so the freely sized frame may provide deliberate
padding. The section's normal surface continues through that non-drawable frame space, while a subtle
artboard edge separates it from the canvas. The right-side Inspector has explicit **Drawing canvas**
controls. Width and height are proportionally linked by default but can be unlinked. **Apply canvas
size** can preserve artwork size using a nine-point anchor or scale the artwork with the bounds, and
the complete scene and dimensions undo and redo together. **Fit frame to canvas** is a one-shot action
and does not lock the section's aspect ratio. Image content shown by an output section likewise uses
centered contain fitting without changing the source image; there is no separate `image` section kind.
Drawing-image insertion, pressure-shaped brush geometry, and smart alignment guides are not exposed;
they require durable asset or retained-geometry contracts beyond the current drawing scene.

For a completion-paced binding, the browser captures and uploads the first eligible composited
raster immediately, then retains only one dirty preview or final snapshot while the binding is
occupied. It performs no additional capture or upload until invocation completion restores
capacity. A settled final snapshot takes priority over lossy preview work and remains pending until
it can be sent, without turning pointer movement into durable project mutations.

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
