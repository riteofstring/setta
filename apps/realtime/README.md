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

The checked-in playground fans each drawing snapshot out to two realtime handlers, then joins their
outputs in a third handler. One branch keeps the standard-library and browser-native SVG neon
effect, the other uses Pillow image operations to produce a warm risograph treatment, and the join
embeds both results in a combined SVG:

```console
pnpm realtime:playground
```

On its first run, this repository-local command installs the frozen workspace dependencies, builds
Workspace and Realtime, installs a complete wheel into the repository-owned local Setta
environment, and opens Neon Sketch. Later runs fingerprint the relevant source, lock, platform, and
toolchain inputs and reuse that validated install when nothing changed. A cache miss rebuilds
Realtime and Workspace while reusing installed Python Canvas assets after the first complete build.
It does not use `uv tool run`'s cached same-version environment. Before launch it seeds
`tmp/realtime-playground/neon-sketch` from the immutable checked-in fixture when that ignored
working project is absent. Later launches preserve drawings and applied callback edits in the
ignored copy; remove that directory to reset it from the fixture.
An existing copy is deliberately not migrated. Back up any callback edits and reset it once to pick
up a newer fixture layout or callback. The launcher synchronizes the working project's exact frozen
dependencies into its ignored `.venv` without building source distributions.
Generated Realtime contracts are checked without being rewritten and Go module resolution is
read-only during this build, so launching the playground does not repair or update tracked inputs.
Use `setta realtime open` for an installed release.

Draw a mark and both intermediate results update while the stroke is active; the combined result
updates after both branches complete. The SVG and Pillow bindings have independent concurrency
groups, so they are admitted and publish without waiting on each other. Their outputs carry one run
lineage into the `combine` handler and can never be paired with results from another drawing
snapshot. The compact drawing toolbar provides Select, Pen, Highlighter, Eraser, and Text tools, a
**Line & shape** menu, image insertion, contextual creation and selection colors, and undo and redo.
Grid controls, canvas sizing and clearing, detailed object appearance, typography, arrangement,
grouping, locking, and deletion live in the right-side Inspector. The example is an ordinary
Realtime project: inside the ignored working copy its authored document is
`.local/realtime/project.json` and its editable entrypoint is `app.py`.
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

Project contract version 2 supports `input`, `output`, `button`, `status`, `drawing`, `handler`, and
`code` sections. Each `handler` section has exactly `{"bindingId":"..."}` and projects one binding
as an executable graph node. The validator enforces a one-to-one relationship between handler
sections and bindings. A project may also contain at most one optional `code` section, whose data is
exactly `{"source":"entrypoint"}`. It is the shared source editor for the declared entrypoint, not a
callback node, and never copies source, drafts, versions, or diagnostics into `project.json`.

A binding has an `event`, `join`, or `disconnected` trigger. Event bindings resolve
`$event.FIELD` and `$sections.SECTION.FIELD` arguments from one frozen event and project snapshot.
An all-input join maps named inputs to logical outputs of upstream bindings. Logical outputs exist
independently of their optional display targets, so intermediate values need no output section.
`disconnected` is a valid authoring state for a handler node with no incoming trigger. A binding
selects `once`, `latest`, or `parallel` scheduling with an explicit concurrency group and limit. The
recommended policy for a continuously changing interactive input is completion paced:

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

### Handler pipelines

Realtime projects handler bindings through Workspace's controlled graph surface:

```text
Drawing ─┬→ [neon_glitch] ──────→ Neon result
         └→ [pillow_risograph] ──→ Riso result

[neon_glitch].image ─────┐
                          ├→ [combine] → Combined result
[pillow_risograph].image ─┘

Code: app.py
```

The join binding in that graph uses structured binding-output references:

```json
{
  "id": "combine-results",
  "trigger": {
    "kind": "join",
    "mode": "all",
    "inputs": {
      "neon": { "bindingId": "stylize-drawing", "output": "image" },
      "riso": { "bindingId": "render-risograph", "output": "image" }
    }
  },
  "handler": "combine",
  "arguments": {},
  "scheduling": {
    "mode": "latest",
    "debounceMilliseconds": 0,
    "concurrencyGroup": "combine-rendering",
    "concurrencyLimit": 1
  },
  "outputs": {
    "image": {
      "target": { "sectionId": "final-result", "field": "contentRef" }
    }
  }
}
```

Workflow ports connect section events to handler triggers. Data ports connect handler outputs to
named join inputs or to display sinks. Realtime serializes connect, reconnect, and delete mutations;
the backend validates the complete candidate and remains final authority. It rejects missing
bindings or ports, incompatible port families, self-edges, cycles, orphan joins, and joins whose
producers do not share one root event. Deleting a producer or output removes dependent join inputs
and recursively disconnects joins left without a producer. Reconnecting is one final-state mutation,
so eligible startup policy and unaffected descendants survive the replacement.

### Startup and retained outputs

A binding can independently choose when its initial value is computed and whether its last
successful outputs survive application restarts:

```json
{
  "retention": "lastSuccessful",
  "startup": "whenStale"
}
```

Place this object in the binding's `materialization` field. Omitting it keeps the existing
session-only, interaction-driven behavior. `retention` is either `session` or `lastSuccessful`.
The latter stores one successful materialization, including recursively referenced binary content,
under the runtime-owned `.local/realtime/materializations` directory rather than authored
`project.json` state.

`startup` is `always`, `whenStale`, `ifMissing`, or `manual`. `whenStale` compares the active source
version, handler, and resolved arguments; `ifMissing` computes only when no saved result exists.
Automatic startup is available throughout pipelines rooted in `change` or `snapshot`, whose input
and drawing sections can provide a canonical initial value. Realtime keys an initialization attempt
by the complete upstream binding graph, so an ancestor edit retries an affected downstream join.
Use `manual` for pipelines rooted in `submit` or `press`.

Only successful handler completion replaces a saved materialization. A matching retained result is
adopted into the current startup run before it can satisfy a join; an unrelated or stale displayed
value never does. During an automatic refresh, the output section labels and continues showing the
saved result; a failed refresh leaves it intact. This lets a project retain its last useful result
when recomputation is expensive or an external resource later becomes unavailable.

Every accepted root event receives one run ID and a frozen event payload and project revision. It
may fan out to multiple bindings, and an all-input join waits for every producer in that same run to
complete successfully. Streamed outputs may update display targets immediately, but downstream
handlers are released only after the worker's complete, contiguous update sequence has arrived;
their arguments use the invocation's accumulated outputs. Failure, cancellation, supersession,
source activation, project changes, and shutdown recursively invalidate affected descendants.

Independent work should use distinct concurrency groups so each handler can start and publish
separately. Drawing preview admission waits until every matching root binding is terminal before
emitting the next snapshot, so the slowest matching handler bounds input cadence without blocking
faster outputs from appearing first.

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

Handler nodes, binding ports, and edges are Realtime-owned projections into Workspace's generic
controlled graph APIs. Realtime does not persist Workspace graph types. A handler node shows its
selected function, whether that function was discovered in the active entrypoint, input and output
names, run ID, state, progress, message, error, and a Cancel action when applicable. Its Inspector
edits function name, argument JSON, output names, scheduling, and materialization. The Runtime pane
lists discovered handlers and can create a disconnected binding and its handler section atomically.

Fabric.js owns retained drawing objects, free drawing, erasing, selection, transforms, history,
serialization, and raster export. Realtime persists the vector scene only after a coherent gesture
or command. While a local change is unsettled or awaiting acknowledgement, delayed project
snapshots cannot replace it, and drawing on the inner canvas does not reorder or persist the outer
section. Dragging retained objects, including text and brush strokes, previews the changing raster
and settles one durable position on release. Settled snapshots exclude selection borders, transform
handles, and text cursors.

The compact drawing toolbar provides Select, Pen, translucent Highlighter, Eraser, and Text tools,
a Setta-styled **Line & shape** menu, image insertion, and undo and redo. Images can be chosen from
the toolbar or dropped onto the drawing; a dropped image is placed at the drop point. Text is
placed by clicking its intended origin; lines and arrows use the pointer endpoints, while
rectangles and ellipses use the press and current pointer as opposite corners instead of expanding
around the initial press. A new text box enters editing immediately, and completed placement
returns to Select. Contextual controls expose Pen and Highlighter color and width, text and line
color, and shape fill and stroke beside the active tool. Concrete colors remain available in the
same toolbar controls when a compatible object is selected. The Inspector opens only its
contextual **Selection** card; mixed or disabled paint, opacity, rectangle radius, text properties,
and object actions live there. Secondary **Arrange & align** and document-level **Canvas** cards
stay collapsed until needed. Canvas also holds the undoable, destructive **Clear drawing** action.
Mixed values remain explicit, and locked objects remain selectable for unlocking but
cannot be changed by geometry or destructive commands. A mixed lock selection offers **Unlock
all** directly.

After the drawing stage has focus, Mod-Z, Shift-Mod-Z, Ctrl-Y, Mod-C, Mod-V, Mod-D, Mod-A, Mod-G,
Shift-Mod-G, Delete, Backspace, Escape, and arrow-key nudging operate on the drawing when their
actions are available. Shift-arrow nudges ten logical pixels instead of one. Single-key V, P, H,
and E select the Select, Pen, Highlighter, and Eraser tools. Fabric text editing and ordinary form
controls keep their native keyboard behavior, and unavailable drawing actions fall through.

The inner drawing surface has no separate zoom or pan mode. It always contain-fits the logical
canvas, while XYFlow remains the single navigation surface for zooming and panning the workspace.
Grid visibility and grid snapping are local **Canvas view** options in the Inspector. They do not
change the project revision, drawing history, logical canvas, or raster export. The grid follows
logical coordinates, is not exported, and optional snapping rounds moved objects to its
intersections.

The drawing keeps its logical pixel dimensions and object coordinates when its outer section is
resized; it stays centered and uniformly contained, so the freely sized frame may provide deliberate
padding. The section's normal surface continues through that non-drawable frame space, while a subtle
artboard edge separates it from the canvas. The right-side Inspector has explicit **Canvas**
controls. Width and height are proportionally linked by default but can be unlinked. **Apply canvas
size** can preserve artwork size using a nine-point anchor or scale the artwork with the bounds, and
the complete scene and dimensions undo and redo together. **Fit frame to canvas** is a one-shot action
and does not lock the section's aspect ratio. Image content shown by an output section likewise uses
centered contain fitting without changing the source image; there is no separate `image` section kind.
Drawing image insertion accepts one dropped or picked PNG, JPEG, or WebP file up to 20 MB, corrects
source orientation, downscales the longest edge to at most 2048 pixels, and embeds a bounded WebP
representation in the retained scene. The artboard highlights during a file drag; a drop is mapped
through the fitted canvas even when XYFlow has zoomed the section, then centered at that point and
kept inside the logical bounds. Pressure-shaped brush geometry and smart alignment guides are not
exposed.

For a completion-paced binding, the browser captures and uploads the first eligible composited
raster immediately, then retains only one dirty preview or final snapshot while the binding is
occupied. It performs no additional capture or upload until invocation completion restores
capacity. A settled final snapshot takes priority over lossy preview work and remains pending until
it can be sent, without turning pointer movement into durable project mutations.

Waiting join nodes participate in the same scheduling policy as queued, debounced, and running
work. `latest` runs at most one invocation for a binding and retains at most its newest waiting,
queued, or debounced lineage. A new event supersedes only replaced pending work; it does not cancel
work already running in that binding. Invalidating an upstream node does cancel or block any active
or pending descendants. Submitted status and published output use separate sequence watermarks, so
a running invocation may publish while newer work waits, but an older late output can never replace
a newer published output. `once` rejects overlap, and `parallel` remains within declared binding and
group bounds. A Cancel action removes queued work or requests cooperative worker cancellation. A
timeout or crash replaces the whole worker process because arbitrary synchronous Python cannot be
safely interrupted.

Completion itself is the automatic feedback signal; Realtime does not estimate handler time with
an EWMA. It does not add general result caching, cross-session batching, typed preview/final
messages, or a Python scheduling decorator. Expensive models and clients can already load once
through module initialization or the worker `startup` hook.

## Local security and lifecycle

The host binds IPv4 loopback, validates the exact listener authority and browser origin, preflights
all production assets, and keeps every API route outside SPA fallback. User Python intentionally
runs with the current user's permissions; process ownership provides bounded lifetime and
descendant cleanup, not a security sandbox.

The private version 2 language-neutral worker contract is JSON-RPC 2.0 with strict LSP
`Content-Length` framing. Each `runtime/update` has a contiguous `updateSequence`, and the invocation
result reports `updateCount`, so completion cannot race its final streamed output. A later language
adapter must implement the same `initialize`, `runtime/invoke`, `runtime/update`,
`$/cancelRequest`, and `shutdown` lifecycle and pass the existing non-Python conformance fixture.
Registration is compile-time at `openLocalApplication`: the runtime-kind selection constructs an
implementation of the coordinator's `runtime.Worker` interface and its optional artifact and log
sources. Unsupported kinds remain errors. The new adapter may add its own launcher and containment
implementation, but project bindings, scheduling, browser transport, and frontend code do not
change.
